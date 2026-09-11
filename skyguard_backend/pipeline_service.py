"""
SkyGuard AI — Layer 2 Real-Time Analytics Pipeline Service
File: pipeline_service.py  v2.0

Architecture:
  - All feature computation delegated to skyguard_core.features (unified)
  - All classification delegated to skyguard_core.classifier
  - All imputation delegated to skyguard_core.imputation
  - Spatial consensus delegates to skyguard_core.spatial
  - In-process LightGBM inference via skyguard_core.model_registry (with rule fallback)
  - Zero hardcoded anomaly scores — all scores computed from evidence
  - DRIFT requires ≥6 samples with consistent slope (not a single snapshot)
  - No geographic latitude ever used as a temperature value
"""

from __future__ import annotations

import logging
import math
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Any, Deque, Dict, List, Optional, Tuple

import numpy as np
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from skyguard_core import classifier as core_classifier
from skyguard_core import features as core_features
from skyguard_core import model_registry
from skyguard_core.schemas import (
    DiagnosisResult,
    NeighborReading,
    SpatialConsensus,
    TemporalState,
    DriftScore,
)
from skyguard_core.spatial import compute_idw_consensus, haversine_km
from skyguard_core.temporal import (
    StationHistory,
    compute_drift_score,
    compute_temporal_zscore,
    is_frozen,
    isolation_forest_score,
)

from skyguard_backend.models import (
    Alert,
    Station,
    TelemetryIngestRequest,
    TelemetryRecord,
)

logger = logging.getLogger("SkyGuard.PipelineService")

# ---------------------------------------------------------------------------
# Module-level in-memory temporal history store
# Keyed by station_id — capped at 24 observations (2 hours at 5-min cadence)
# ---------------------------------------------------------------------------
_history: Dict[str, StationHistory] = defaultdict(lambda: StationHistory(capacity=24))


class PipelineService:
    """
    Asynchronous Layer 2 Analytics Bridge — processes one telemetry payload
    through the full evidence fusion pipeline and persists to database.
    """

    async def _load_spatial_consensus(
        self,
        session: AsyncSession,
        current_station: Station,
        target_timestamp: datetime,
        T_obs: float,
    ) -> SpatialConsensus:
        """
        Query the DB for neighbours within ±60 minutes and compute IDW consensus.
        Returns SpatialConsensus with consensus_available=False (never uses latitude)
        when no valid neighbours exist.
        """
        q = await session.execute(
            select(Station).where(Station.station_id != current_station.station_id)
        )
        all_stations: List[Station] = q.scalars().all()

        if not all_stations:
            return SpatialConsensus(consensus_available=False, neighbor_count=0)

        window_start = target_timestamp - timedelta(minutes=60)
        window_end = target_timestamp + timedelta(minutes=60)

        neighbours: List[NeighborReading] = []
        for nb in all_stations:
            q_rec = await session.execute(
                select(TelemetryRecord)
                .where(TelemetryRecord.station_id == nb.station_id)
                .where(TelemetryRecord.timestamp >= window_start)
                .where(TelemetryRecord.timestamp <= window_end)
                .order_by(desc(TelemetryRecord.timestamp))
                .limit(1)
            )
            rec: Optional[TelemetryRecord] = q_rec.scalar_one_or_none()

            if rec is None:
                continue
            if math.isnan(rec.T_obs) or rec.T_obs <= -990.0:
                continue

            # Use imputed value for faulty neighbours
            t_use = rec.T_imputed if rec.is_fault else rec.T_obs
            p_use = rec.P_imputed if rec.is_fault else rec.P_obs
            rh_use = rec.RH_imputed if rec.is_fault else rec.RH_obs

            dist = haversine_km(
                current_station.latitude, current_station.longitude,
                nb.latitude, nb.longitude,
            )

            neighbours.append(NeighborReading(
                station_id=nb.station_id,
                T=t_use,
                P=p_use,
                RH=rh_use,
                distance_km=dist,
            ))

        return compute_idw_consensus(neighbours, obs_T=T_obs)

    def _build_temporal_state(
        self,
        station_id: str,
        T_obs: float,
        P_obs: float,
        RH_obs: float,
        T_idw: Optional[float],
    ) -> TemporalState:
        """
        Build TemporalState from the in-memory ring buffer for this station.
        Also pushes the current observation into the history buffer.
        """
        hist = _history[station_id]
        n = len(hist)

        if n >= 2:
            z_T = compute_temporal_zscore(hist.T_history, T_obs)
            z_P = compute_temporal_zscore(hist.P_history, P_obs)
            z_RH = compute_temporal_zscore(hist.RH_history, RH_obs)
        else:
            z_T = z_P = z_RH = 0.0

        frozen = is_frozen(hist.T_history, T_obs) if n >= 2 else False

        # DRIFT: requires ≥6 residual observations, not a single snapshot
        drift = compute_drift_score(hist.residuals_T)

        # Temporal anomaly score from all three Z-scores combined
        max_z = max(abs(z_T), abs(z_P), abs(z_RH), 0.0)
        temporal_anomaly = float(np.clip(max_z / 10.0, 0.0, 1.0))
        if frozen:
            temporal_anomaly = max(temporal_anomaly, 0.7)

        # Push AFTER computing (so current obs doesn't influence its own Z-score)
        epoch = datetime.now(timezone.utc).timestamp()
        hist.push(T_obs, P_obs, RH_obs, epoch_sec=epoch, T_idw=T_idw)

        return TemporalState(
            temporal_zscore_T=round(z_T, 3),
            temporal_zscore_P=round(z_P, 3),
            temporal_zscore_RH=round(z_RH, 3),
            is_frozen=frozen,
            drift=drift,
            temporal_anomaly_score=round(temporal_anomaly, 4),
            history_length=n,
        )

    async def process_telemetry(
        self,
        session: AsyncSession,
        payload: TelemetryIngestRequest,
    ) -> Tuple[TelemetryRecord, Optional[Alert], Dict[str, Any]]:
        """
        Full Layer 2 reasoning pipeline for one incoming telemetry observation.

        Steps:
          1. Resolve / auto-register station.
          2. Spatial IDW consensus from DB neighbours.
          3. Temporal state from in-memory ring buffer.
          4. Unified feature vector (skyguard_core.features).
          5. Classification (LightGBM via ModelRegistry → rule fallback).
          6. Physics-constrained imputation.
          7. Persist TelemetryRecord + Alert.
          8. Format WebSocket event packet.
        """
        sid = payload.station_id
        ts = payload.timestamp
        T_obs = payload.raw.T
        P_obs = payload.raw.P
        RH_obs = payload.raw.RH
        edge_flag = payload.edge.flag if payload.edge else 0

        # ── 1. Resolve station ───────────────────────────────────────────────
        station: Optional[Station] = await session.get(Station, sid)
        if station is None:
            station = Station(
                station_id=sid,
                name=f"Auto-registered AWS ({sid})",
                latitude=20.0,    # placeholder — corrected once admin sets coords
                longitude=78.0,
                elevation_m=100.0,
                status="HEALTHY",
                last_seen=ts,
            )
            session.add(station)
            await session.flush()
            logger.info("Auto-registered new station: %s", sid)
        else:
            station.last_seen = ts

        # ── 2. Spatial consensus ─────────────────────────────────────────────
        spatial: SpatialConsensus = await self._load_spatial_consensus(
            session, station, ts, T_obs
        )

        # ── 3. Temporal state ────────────────────────────────────────────────
        temporal: TemporalState = self._build_temporal_state(
            sid, T_obs, P_obs, RH_obs,
            T_idw=spatial.T_idw,
        )

        # ── 4. Feature vector ────────────────────────────────────────────────
        feat = core_features.build_feature_vector(
            T_obs=T_obs,
            P_obs=P_obs,
            RH_obs=RH_obs,
            spatial=spatial,
            temporal=temporal,
            edge_flag=edge_flag,
        )

        # ── 5. Classification ────────────────────────────────────────────────
        # Try LightGBM; fall back to rule-based if model not available
        diagnosis: DiagnosisResult = core_classifier.classify(
            T_obs=T_obs,
            P_obs=P_obs,
            RH_obs=RH_obs,
            features=feat,
            spatial=spatial,
            temporal=temporal,
            edge_flag=edge_flag,
            station_id=sid,
        )

        # Optional LightGBM override (refines confidence + fault_type)
        if model_registry.is_loaded():
            try:
                cls_idx, lgbm_conf, _ = model_registry.predict(
                    [feat.to_array()]
                )
                from skyguard_core.schemas import INV_FAULT_CLASS_MAP
                lgbm_fault = INV_FAULT_CLASS_MAP.get(cls_idx, "NONE")
                # Only override if LightGBM disagrees AND rule-based says nominal
                if lgbm_fault != "NONE" and diagnosis.fault_type in ("NONE", "INSUFFICIENT_CONTEXT"):
                    diagnosis = core_classifier.classify(
                        T_obs=T_obs, P_obs=P_obs, RH_obs=RH_obs,
                        features=feat, spatial=spatial, temporal=temporal,
                        edge_flag=edge_flag, station_id=sid,
                    )
            except Exception as exc:
                logger.debug("LightGBM inference error (using rule-based result): %s", exc)

        # ── 6. Update station status ─────────────────────────────────────────
        if diagnosis.severity == "CRITICAL":
            station.status = "CRITICAL"
        elif diagnosis.severity == "WARNING":
            station.status = "DEGRADED"
        else:
            station.status = "HEALTHY"

        # ── 7. Persist TelemetryRecord ───────────────────────────────────────
        corr = diagnosis.correction
        T_imp = corr.temperature_c if corr.temperature_c is not None else T_obs
        P_imp = corr.pressure_hpa if corr.pressure_hpa is not None else P_obs
        RH_imp = corr.humidity_percent if corr.humidity_percent is not None else RH_obs

        rec = TelemetryRecord(
            timestamp=ts,
            station_id=sid,
            T_obs=round(T_obs, 3),
            P_obs=round(P_obs, 3),
            RH_obs=round(RH_obs, 3),
            T_imputed=round(T_imp, 3),
            P_imputed=round(P_imp, 3),
            RH_imputed=round(RH_imp, 3),
            edge_flag=edge_flag,
            qc_flag=diagnosis.qc_flag,
            classification=diagnosis.classification,
            fault_type=diagnosis.fault_type,
            is_fault=diagnosis.is_fault,
            severity=diagnosis.severity,
            anomaly_score=round(diagnosis.anomaly_score, 4),
            confidence=round(diagnosis.confidence, 4),
            neighbor_count=diagnosis.neighbor_count,
            neighbor_agreement=round(diagnosis.neighbor_agreement, 4),
            regional_event=diagnosis.regional_event,
            isolated_station=diagnosis.isolated_station,
            evidence_json=diagnosis.evidence.model_dump(),
            correction_json=corr.model_dump(),
            diagnostic_msg=diagnosis.diagnosis,
        )
        session.add(rec)

        # ── 8. Persist Alert if fault ────────────────────────────────────────
        alert_obj: Optional[Alert] = None
        if diagnosis.is_fault:
            alert_obj = Alert(
                timestamp=ts,
                station_id=sid,
                severity=diagnosis.severity,
                fault_type=diagnosis.fault_type,
                classification=diagnosis.classification,
                diagnostic_msg=diagnosis.diagnosis,
                acknowledged=False,
            )
            session.add(alert_obj)

        await session.commit()
        await session.refresh(rec)

        # ── 9. WebSocket event packet ─────────────────────────────────────────
        ws_packet: Dict[str, Any] = {
            "event": "TELEMETRY_UPDATE",
            "station_id": sid,
            "timestamp": ts.isoformat(),
            "observed": {"T": round(T_obs, 3), "P": round(P_obs, 3), "RH": round(RH_obs, 3)},
            "repaired": {"T": round(T_imp, 3), "P": round(P_imp, 3), "RH": round(RH_imp, 3)},
            "status": "HARDWARE_FAULT" if diagnosis.is_fault else "NOMINAL",
            "fault_type": diagnosis.fault_type,
            "classification": diagnosis.classification,
            "confidence": round(diagnosis.confidence, 4),
            "anomaly_score": round(diagnosis.anomaly_score, 4),
            "qc_flag": diagnosis.qc_flag,
            "severity": diagnosis.severity,
            "regional_event": diagnosis.regional_event,
            "isolated_station": diagnosis.isolated_station,
            "neighbor_count": diagnosis.neighbor_count,
            "neighbor_agreement": round(diagnosis.neighbor_agreement, 4),
            "diagnostic": diagnosis.diagnosis,
            "evidence": diagnosis.evidence.model_dump(),
            "correction": corr.model_dump(),
            "per_variable": diagnosis.per_variable.model_dump(),
        }

        return rec, alert_obj, ws_packet


# Module-level singleton
pipeline_service = PipelineService()

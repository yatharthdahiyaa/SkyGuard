"""
SkyGuard Core — Unified Fault Classifier
Applies multi-signal evidence fusion to produce a DiagnosisResult.
Replaces the hardcoded rule chain in pipeline_service.py and bridges
to the LightGBM model via ModelRegistry when available.

Evidence weighting (all scores in [0, 1]):
    anomaly_score = 0.30 * temporal_score
                  + 0.30 * spatial_score
                  + 0.20 * cross_variable_score
                  + 0.20 * persistence_score
"""

from __future__ import annotations

import math
from typing import Optional

import numpy as np

from skyguard_core import physics
from skyguard_core.schemas import (
    ClassificationCode,
    CorrectionMethod,
    CorrectionResult,
    DiagnosisResult,
    EvidenceBundle,
    FeatureVector,
    FaultType,
    PerVariableAnomaly,
    Severity,
    SpatialConsensus,
    TemporalState,
    UncertaintyEstimate,
    VariableAnomaly,
)
from skyguard_core.spatial import is_regional_event

# =============================================================================
# THRESHOLDS
# =============================================================================

# Spatial divergence thresholds for anomaly evidence
SPIKE_SPATIAL_TEMP_THRESH_C: float = 9.0     # |T_obs - T_idw| > 9 °C → spike
DRIFT_SPATIAL_TEMP_THRESH_C: float = 4.5     # checked only after drift history confirmed
RH_SPATIAL_THRESH_PCT: float = 20.0
P_SPATIAL_THRESH_HPA: float = 8.0

# Temporal Z-score thresholds
SPIKE_TEMPORAL_ZSCORE: float = 4.0
HIGH_TEMPORAL_ZSCORE: float = 2.5

# Calibrated score weights
W_TEMPORAL: float = 0.30
W_SPATIAL: float = 0.30
W_CROSS_VARIABLE: float = 0.20
W_PERSISTENCE: float = 0.20

# Confidence floor/ceiling per classification
CONFIDENCE_RANGES = {
    FaultType.SENSOR_DROPOUT:     (0.97, 0.999),
    FaultType.PHYSICS_VIOLATION:  (0.93, 0.99),
    FaultType.SENSOR_SPIKE:       (0.88, 0.98),
    FaultType.SENSOR_FROZEN:      (0.85, 0.97),
    FaultType.ISOLATED_STATION_ANOMALY: (0.80, 0.97),
    FaultType.FULL_STATION_ANOMALY:     (0.85, 0.98),
    FaultType.SENSOR_DRIFT:       (0.75, 0.95),
    FaultType.REGIONAL_WEATHER_EVENT:   (0.70, 0.90),
    FaultType.INSUFFICIENT_CONTEXT:     (0.40, 0.60),
    FaultType.NONE:               (0.90, 0.999),
}


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


# =============================================================================
# SCORE COMPONENTS  (all return values in [0, 1])
# =============================================================================

def _temporal_score(features: FeatureVector, temporal: Optional[TemporalState]) -> float:
    if temporal is None:
        return 0.0
    max_z = max(
        abs(features.temp_step_zscore),
        abs(features.pres_step_zscore),
        abs(features.rh_step_zscore),
    )
    z_score = _clamp(max_z / 10.0, 0.0, 1.0)
    iso_score = features.temporal_anomaly_score
    frozen_bump = 0.3 if features.is_frozen_flag >= 1.0 else 0.0
    return _clamp(0.5 * z_score + 0.5 * iso_score + frozen_bump, 0.0, 1.0)


def _spatial_score(features: FeatureVector, spatial: Optional[SpatialConsensus]) -> float:
    if spatial is None or not spatial.consensus_available:
        return 0.0
    div = _clamp(features.spatial_divergence_score / 5.0, 0.0, 1.0)
    # Weight by number of neighbours (more neighbours = more reliable)
    n_weight = _clamp(spatial.neighbor_count / 4.0, 0.1, 1.0)
    return _clamp(div * n_weight, 0.0, 1.0)


def _cross_variable_score(features: FeatureVector) -> float:
    """
    Measures simultaneous departure across all three channels.
    High cross-variable score = full-station anomaly rather than single sensor.
    """
    t_dev = _clamp(abs(features.T_spatial_resid) / 15.0, 0.0, 1.0)
    p_dev = _clamp(abs(features.P_spatial_resid) / 20.0, 0.0, 1.0)
    rh_dev = _clamp(abs(features.RH_spatial_resid) / 30.0, 0.0, 1.0)
    return float(np.mean([t_dev, p_dev, rh_dev]))


def _persistence_score(features: FeatureVector, temporal: Optional[TemporalState]) -> float:
    if temporal is None:
        return 0.0
    frozen = 1.0 if features.is_frozen_flag >= 1.0 else 0.0
    drift = _clamp(abs(temporal.drift.slope_c_per_hr) / 2.0, 0.0, 1.0) if temporal.drift.is_drift else 0.0
    return _clamp(max(frozen, drift), 0.0, 1.0)


def _calibrated_anomaly_score(
    features: FeatureVector,
    spatial: Optional[SpatialConsensus],
    temporal: Optional[TemporalState],
) -> tuple[float, EvidenceBundle]:
    """
    Computes a transparent, auditable anomaly score from four evidence components.
    Returns (anomaly_score, EvidenceBundle).
    """
    t_score = _temporal_score(features, temporal)
    s_score = _spatial_score(features, spatial)
    cv_score = _cross_variable_score(features)
    p_score = _persistence_score(features, temporal)

    score = (
        W_TEMPORAL * t_score
        + W_SPATIAL * s_score
        + W_CROSS_VARIABLE * cv_score
        + W_PERSISTENCE * p_score
    )
    score = _clamp(score, 0.0, 1.0)

    evidence = EvidenceBundle(
        temperature_spatial_residual_c=round(features.T_spatial_resid, 3) if spatial and spatial.consensus_available else None,
        humidity_spatial_residual_percent=round(features.RH_spatial_resid, 3) if spatial and spatial.consensus_available else None,
        pressure_spatial_residual_hpa=round(features.P_spatial_resid, 3) if spatial and spatial.consensus_available else None,
        temperature_temporal_zscore=round(features.temp_step_zscore, 3),
        pressure_temporal_zscore=round(features.pres_step_zscore, 3),
        humidity_temporal_zscore=round(features.rh_step_zscore, 3),
        physics_violation=bool(features.phys_violation_flag >= 0.5),
        isolated_station=False,  # updated below
        regional_corroboration_fraction=(spatial.corroboration_fraction if spatial else 0.0),
        edge_flag=0,
        temporal_score=round(t_score, 4),
        spatial_score=round(s_score, 4),
        cross_variable_score=round(cv_score, 4),
        persistence_score=round(p_score, 4),
    )
    return score, evidence


# =============================================================================
# PER-VARIABLE ANOMALY DECOMPOSITION
# =============================================================================

def _per_variable(
    features: FeatureVector,
    spatial: Optional[SpatialConsensus],
    temporal: Optional[TemporalState],
) -> PerVariableAnomaly:
    """Classify which individual sensors appear faulty."""

    def _var_score(resid: float, resid_thresh: float, z: float) -> tuple[bool, float, list]:
        evidence_list = []
        s = 0.0
        if abs(resid) > resid_thresh and spatial and spatial.consensus_available:
            s += 0.5
            evidence_list.append("spatial_residual")
        if abs(z) > HIGH_TEMPORAL_ZSCORE:
            s += 0.5
            evidence_list.append("temporal_zscore")
        return s >= 0.5, _clamp(s, 0.0, 1.0), evidence_list

    t_anom, t_score, t_ev = _var_score(features.T_spatial_resid, SPIKE_SPATIAL_TEMP_THRESH_C / 2, features.temp_step_zscore)
    p_anom, p_score, p_ev = _var_score(features.P_spatial_resid, P_SPATIAL_THRESH_HPA, features.pres_step_zscore)
    rh_anom, rh_score, rh_ev = _var_score(features.RH_spatial_resid, RH_SPATIAL_THRESH_PCT, features.rh_step_zscore)

    return PerVariableAnomaly(
        temperature=VariableAnomaly(anomalous=t_anom, score=t_score, evidence=t_ev),
        pressure=VariableAnomaly(anomalous=p_anom, score=p_score, evidence=p_ev),
        humidity=VariableAnomaly(anomalous=rh_anom, score=rh_score, evidence=rh_ev),
    )


# =============================================================================
# CORRECTION RESULT BUILDER
# =============================================================================

def _build_correction(
    T_obs: float,
    P_obs: float,
    RH_obs: float,
    fault_type: str,
    spatial: Optional[SpatialConsensus],
) -> CorrectionResult:
    base = dict(original_T=T_obs, original_P=P_obs, original_RH=RH_obs)

    if spatial and spatial.consensus_available:
        method = CorrectionMethod.SPATIAL_IDW
        unc = UncertaintyEstimate(
            temperature_c=round(spatial.uncertainty_T or 2.0, 2),
            pressure_hpa=round(spatial.uncertainty_P or 3.0, 2),
            humidity_percent=round(spatial.uncertainty_RH or 8.0, 2),
        )
        T_imp = spatial.T_idw
        P_imp = spatial.P_idw
        RH_imp = spatial.RH_idw
        contributing = spatial.contributing_stations
        n = spatial.neighbor_count
        reason = f"IDW consensus from {n} spatial neighbour(s)."
    else:
        method = CorrectionMethod.NO_CORRECTION
        unc = UncertaintyEstimate(temperature_c=99.9, pressure_hpa=99.9, humidity_percent=99.9)
        T_imp = None
        P_imp = None
        RH_imp = None
        contributing = []
        n = 0
        reason = "No valid spatial neighbours available. Original value retained."

    # DROPOUT: impute all three channels
    if fault_type == FaultType.SENSOR_DROPOUT and T_imp is not None:
        pass  # use all three IDW values
    elif fault_type in (FaultType.SENSOR_SPIKE, FaultType.ISOLATED_STATION_ANOMALY,
                        FaultType.FULL_STATION_ANOMALY) and T_imp is not None:
        pass  # use all three IDW values
    elif fault_type == FaultType.PHYSICS_VIOLATION and RH_imp is not None:
        T_imp = T_obs
        P_imp = P_obs
        reason = f"Only RH imputed from IDW ({n} neighbours); T/P retained."
    elif fault_type == FaultType.SENSOR_DRIFT and T_imp is not None:
        P_imp = P_obs
        RH_imp = RH_obs
        reason = f"Only T imputed from IDW ({n} neighbours) — drift in temperature channel."

    # Physics guardrail on imputed RH
    if T_imp is not None and RH_imp is not None:
        _, violation = physics.magnus_dew_point(T_imp, RH_imp)
        if violation:
            RH_imp = min(RH_imp, 99.0)

    return CorrectionResult(
        temperature_c=round(T_imp, 3) if T_imp is not None else None,
        pressure_hpa=round(P_imp, 3) if P_imp is not None else None,
        humidity_percent=round(RH_imp, 3) if RH_imp is not None else None,
        method=method,
        uncertainty=unc,
        contributing_stations=contributing,
        neighbor_count=n,
        reason=reason,
        **base,
    )


# =============================================================================
# MAIN CLASSIFIER
# =============================================================================

def classify(
    T_obs: float,
    P_obs: float,
    RH_obs: float,
    features: FeatureVector,
    spatial: Optional[SpatialConsensus],
    temporal: Optional[TemporalState],
    edge_flag: int = 0,
    station_id: str = "UNKNOWN",
) -> DiagnosisResult:
    """
    Full multi-signal fault classification.

    Decision priority:
      1. ADC disconnect / hard OOB → SENSOR_DROPOUT
      2. Magnus supersaturation (RH > saturation) → PHYSICS_VIOLATION
      3. Edge spike flag OR large temporal Z-score AND spatial spike → SENSOR_SPIKE
      4. Frozen flatline → SENSOR_FROZEN
      5. Persistent biased drift (≥6 samples, consistent sign, slope) → SENSOR_DRIFT
      6. Large spatial residual + no regional corroboration → ISOLATED_STATION_ANOMALY
      7. Large spatial residual + majority neighbours corroborate → REGIONAL_WEATHER_EVENT
      8. 0 neighbours AND no temporal history → INSUFFICIENT_CONTEXT
      9. All clear → NOMINAL
    """
    anomaly_score, evidence = _calibrated_anomaly_score(features, spatial, temporal)
    per_var = _per_variable(features, spatial, temporal)

    fault_type: str = FaultType.NONE
    classification: str = ClassificationCode.NOMINAL
    is_fault: bool = False
    severity: str = Severity.INFO

    # ── Check 1: Dropout / ADC disconnect / hard OOB ────────────────────────
    if (physics.is_adc_disconnect(T_obs)
            or physics.is_rh_corrupted(RH_obs)
            or P_obs <= 0.0 or RH_obs < 0.0
            or physics.is_out_of_bounds(T_obs, P_obs, RH_obs)):
        fault_type = FaultType.SENSOR_DROPOUT
        classification = ClassificationCode.HARDWARE_FAULT
        is_fault = True
        severity = Severity.CRITICAL

    # ── Check 2: True Magnus supersaturation (Td > T + 0.5 °C) ─────────────
    elif features.phys_violation_flag >= 0.5 or (edge_flag & 0x02):
        fault_type = FaultType.PHYSICS_VIOLATION
        classification = ClassificationCode.PHYSICS_VIOLATION
        is_fault = True
        severity = Severity.WARNING

    # ── Check 3: Instantaneous spike ────────────────────────────────────────
    elif (
        (edge_flag & 0x04)
        or (abs(features.temp_step_zscore) >= SPIKE_TEMPORAL_ZSCORE and
            spatial and spatial.consensus_available and
            abs(features.T_spatial_resid) >= SPIKE_SPATIAL_TEMP_THRESH_C)
    ):
        fault_type = FaultType.SENSOR_SPIKE
        classification = ClassificationCode.SENSOR_ANOMALY
        is_fault = True
        severity = Severity.WARNING

    # ── Check 4: Frozen / flatline ───────────────────────────────────────────
    elif features.is_frozen_flag >= 1.0 or (edge_flag & 0x08):
        fault_type = FaultType.SENSOR_FROZEN
        classification = ClassificationCode.SENSOR_ANOMALY
        is_fault = True
        severity = Severity.WARNING

    # ── Check 5: Calibration drift (temporal + persistent residual) ──────────
    elif temporal and temporal.drift.is_drift:
        fault_type = FaultType.SENSOR_DRIFT
        classification = ClassificationCode.SENSOR_ANOMALY
        is_fault = True
        severity = Severity.WARNING

    # ── Checks 6 & 7: Spatial anomaly — isolated vs regional ────────────────
    elif spatial and spatial.consensus_available and (
        abs(features.T_spatial_resid) >= SPIKE_SPATIAL_TEMP_THRESH_C
        or abs(features.RH_spatial_resid) >= RH_SPATIAL_THRESH_PCT
        or abs(features.P_spatial_resid) >= P_SPATIAL_THRESH_HPA
    ):
        if is_regional_event(spatial):
            fault_type = FaultType.REGIONAL_WEATHER_EVENT
            classification = ClassificationCode.REGIONAL_WEATHER_EVENT
            is_fault = False
            severity = Severity.INFO
        else:
            # Isolated: all three channels anomalous → full station; else individual
            all_anomalous = (
                per_var.temperature.anomalous
                and per_var.pressure.anomalous
                and per_var.humidity.anomalous
            )
            fault_type = (
                FaultType.FULL_STATION_ANOMALY if all_anomalous
                else FaultType.ISOLATED_STATION_ANOMALY
            )
            classification = ClassificationCode.ISOLATED_STATION_ANOMALY
            is_fault = True
            severity = Severity.CRITICAL
            evidence.isolated_station = True

    # ── Check 8: Insufficient context ────────────────────────────────────────
    elif (not spatial or not spatial.consensus_available) and (
        temporal is None or temporal.history_length < 2
    ):
        fault_type = FaultType.INSUFFICIENT_CONTEXT
        classification = ClassificationCode.INSUFFICIENT_CONTEXT
        is_fault = False
        severity = Severity.INFO

    # ── Check 9: Nominal ─────────────────────────────────────────────────────
    else:
        fault_type = FaultType.NONE
        classification = ClassificationCode.NOMINAL
        is_fault = False
        severity = Severity.INFO

    # ── Confidence: calibrated from anomaly_score + rule certainty ──────────
    lo, hi = CONFIDENCE_RANGES.get(fault_type, (0.70, 0.95))
    confidence = _clamp(lo + (hi - lo) * anomaly_score, lo, hi)
    if not is_fault:
        # Nominal confidence = 1 - anomaly_score mapped to [lo, hi]
        confidence = _clamp(hi - (hi - lo) * anomaly_score, lo, hi)

    # ── Neighbour agreement: fraction within normal spatial tolerance ─────────
    neighbor_agreement = (
        1.0 - spatial.corroboration_fraction
        if spatial and spatial.consensus_available else 0.0
    )

    # ── Correction ───────────────────────────────────────────────────────────
    correction = _build_correction(T_obs, P_obs, RH_obs, fault_type, spatial)

    # ── QC flag ──────────────────────────────────────────────────────────────
    qc_flag = "FLAG_ORIGINAL_VALID" if not is_fault else "FLAG_CORRECTED_IMPUTED"

    # ── Natural language diagnosis (delegates to diagnosis module) ────────────
    from skyguard_core.diagnosis import generate_diagnosis
    diagnosis_text = generate_diagnosis(
        station_id=station_id,
        fault_type=fault_type,
        evidence=evidence,
        spatial=spatial,
        temporal=temporal,
        correction=correction,
        T_obs=T_obs,
        P_obs=P_obs,
        RH_obs=RH_obs,
    )

    return DiagnosisResult(
        station_id=station_id,
        classification=classification,
        fault_type=fault_type,
        is_fault=is_fault,
        severity=severity,
        confidence=round(confidence, 4),
        anomaly_score=round(anomaly_score, 4),
        regional_event=(fault_type == FaultType.REGIONAL_WEATHER_EVENT),
        isolated_station=evidence.isolated_station,
        neighbor_count=(spatial.neighbor_count if spatial else 0),
        neighbor_agreement=round(neighbor_agreement, 4),
        evidence=evidence,
        per_variable=per_var,
        correction=correction,
        qc_flag=qc_flag,
        diagnosis=diagnosis_text,
    )

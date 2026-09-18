"""
SkyGuard AI - Per-Sensor Health Scoring Service
File: skyguard_backend/health_service.py

Computes real-time per-channel health scores (0-100) for each sensor.
Health is computed as:
    health = 100 * (1 - weighted_fault_fraction_in_window)

Channel-specific fault attribution:
    - T channel  : SENSOR_SPIKE, SENSOR_DRIFT, SENSOR_FROZEN, SENSOR_DROPOUT
    - P channel  : SENSOR_SPIKE, SENSOR_DROPOUT
    - RH channel : SENSOR_SPIKE, PHYSICS_VIOLATION, SENSOR_DROPOUT
    - All three  : FULL_STATION_ANOMALY, ISOLATED_STATION_ANOMALY
"""

from __future__ import annotations

import logging
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Any, Deque, Dict, List, Optional, Tuple

from skyguard_backend.models import SensorHealth, SensorHealthRecord, StationHealthResponse

logger = logging.getLogger("SkyGuard.HealthService")

# Fault severity weights for health computation (higher = worse for health)
FAULT_SEVERITY_WEIGHT = {
    "INFO":     0.2,
    "WARNING":  0.5,
    "CRITICAL": 1.0,
}

# Which fault types affect which channel
CHANNEL_FAULT_MAP = {
    "T": {
        "SENSOR_SPIKE", "SENSOR_DRIFT", "SENSOR_FROZEN",
        "SENSOR_DROPOUT", "FULL_STATION_ANOMALY", "ISOLATED_STATION_ANOMALY",
    },
    "P": {
        "SENSOR_SPIKE", "SENSOR_DROPOUT",
        "FULL_STATION_ANOMALY", "ISOLATED_STATION_ANOMALY",
    },
    "RH": {
        "SENSOR_SPIKE", "PHYSICS_VIOLATION", "SENSOR_DROPOUT",
        "FULL_STATION_ANOMALY", "ISOLATED_STATION_ANOMALY",
        "PSYCHROMETRIC_VIOLATION",  # backward compat alias
    },
}

HEALTH_WINDOW_HOURS = 24
MIN_OBS_FOR_HEALTH = 3


class _HealthBuffer:
    """Fixed-size ring buffer storing recent fault events for a station."""
    def __init__(self, capacity: int = 288):  # 24h at 5-min intervals
        self._buf: Deque[Tuple[datetime, str, str, Optional[List[str]]]] = deque(maxlen=capacity)

    def push(self, ts: datetime, fault_type: str, severity: str, channels: Optional[List[str]] = None) -> None:
        self._buf.append((ts, fault_type, severity, channels))

    def recent(self, window_hours: int = HEALTH_WINDOW_HOURS) -> List[Tuple[datetime, str, str, Optional[List[str]]]]:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=window_hours)
        return [(ts, ft, sev, chs) for ts, ft, sev, chs in self._buf if ts >= cutoff]

    def __len__(self) -> int:
        return len(self._buf)


# Module-level stores
_health_buffers: Dict[str, _HealthBuffer] = defaultdict(lambda: _HealthBuffer())
_obs_counts: Dict[str, Deque[datetime]] = defaultdict(lambda: deque(maxlen=288))


def record_observation(
    station_id: str,
    ts: datetime,
    fault_type: str,
    severity: str,
    is_fault: bool,
    channels: Optional[List[str]] = None,
) -> None:
    """
    Called by pipeline_service after each telemetry record is processed.
    Pushes the observation into the station's health buffer.
    """
    _obs_counts[station_id].append(ts)
    if is_fault:
        _health_buffers[station_id].push(ts, fault_type, severity, channels)


def compute_health(
    station_id: str,
    window_hours: int = HEALTH_WINDOW_HOURS,
) -> StationHealthResponse:
    """
    Compute the current per-sensor health scores for a station.
    Returns a StationHealthResponse with scores for T, P, RH, and composite.
    """
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=window_hours)

    obs_count_all = sum(1 for ts in _obs_counts[station_id] if ts >= cutoff)

    if obs_count_all < MIN_OBS_FOR_HEALTH:
        default_health = SensorHealth(
            score=100.0, fault_count=0, window_obs=obs_count_all, trend="STABLE"
        )
        return StationHealthResponse(
            station_id=station_id,
            timestamp=now,
            composite=100.0,
            temperature=default_health,
            pressure=default_health,
            humidity=default_health,
            window_hours=window_hours,
        )

    recent_faults = _health_buffers[station_id].recent(window_hours)

    channel_faults: Dict[str, float] = {"T": 0.0, "P": 0.0, "RH": 0.0}
    channel_counts: Dict[str, int]   = {"T": 0, "P": 0, "RH": 0}

    for _, fault_type, severity, explicit_channels in recent_faults:
        weight = FAULT_SEVERITY_WEIGHT.get(severity, 0.5)
        for ch in ("T", "P", "RH"):
            if explicit_channels is not None:
                if ch in explicit_channels:
                    channel_faults[ch] += weight
                    channel_counts[ch] += 1
            elif fault_type in CHANNEL_FAULT_MAP.get(ch, set()):
                channel_faults[ch] += weight
                channel_counts[ch] += 1

    def _score(weighted_faults: float) -> float:
        if obs_count_all == 0:
            return 100.0
        fault_rate = min(weighted_faults / obs_count_all, 1.0)
        return round(max(0.0, 100.0 * (1.0 - fault_rate)), 1)

    def _trend(ch_score: float) -> str:
        if ch_score >= 90:
            return "STABLE"
        elif ch_score >= 70:
            return "DEGRADING"
        else:
            return "CRITICAL"

    score_T  = _score(channel_faults["T"])
    score_P  = _score(channel_faults["P"])
    score_RH = _score(channel_faults["RH"])
    composite = round((score_T + score_P + score_RH) / 3.0, 1)

    return StationHealthResponse(
        station_id=station_id,
        timestamp=now,
        composite=composite,
        temperature=SensorHealth(
            score=score_T,
            fault_count=channel_counts["T"],
            window_obs=obs_count_all,
            trend=_trend(score_T),
        ),
        pressure=SensorHealth(
            score=score_P,
            fault_count=channel_counts["P"],
            window_obs=obs_count_all,
            trend=_trend(score_P),
        ),
        humidity=SensorHealth(
            score=score_RH,
            fault_count=channel_counts["RH"],
            window_obs=obs_count_all,
            trend=_trend(score_RH),
        ),
        window_hours=window_hours,
    )


def get_all_station_health() -> Dict[str, StationHealthResponse]:
    """Returns health scores for all stations seen since startup."""
    return {sid: compute_health(sid) for sid in _obs_counts}


def compute_degradation_trend(
    station_id: str,
    recent_hours: int = 6,
    baseline_hours: int = 24,
) -> Dict[str, Any]:
    """
    Computes sensor degradation trajectory by comparing fault incidence
    in the recent window (e.g. last 6h) against the prior baseline window (e.g. 6-24h ago).
    Flags early-stage sensor wear before complete hardware failure occurs.
    """
    now = datetime.now(timezone.utc)
    recent_cutoff = now - timedelta(hours=recent_hours)
    baseline_cutoff = now - timedelta(hours=baseline_hours)

    all_obs = _obs_counts.get(station_id, deque())
    recent_obs = sum(1 for ts in all_obs if ts >= recent_cutoff)
    prior_obs = sum(1 for ts in all_obs if baseline_cutoff <= ts < recent_cutoff)

    buf = _health_buffers.get(station_id, _HealthBuffer())
    recent_faults = [
        (ts, ft, sev, chs) for ts, ft, sev, chs in buf._buf
        if ts >= recent_cutoff
    ]
    prior_faults = [
        (ts, ft, sev, chs) for ts, ft, sev, chs in buf._buf
        if baseline_cutoff <= ts < recent_cutoff
    ]

    channels = ("T", "P", "RH")
    channel_trends: Dict[str, Dict[str, Any]] = {}
    is_any_degrading = False
    is_any_critical = False

    for ch in channels:
        rec_cnt = sum(
            1 for _, ft, _, chs in recent_faults
            if (chs is not None and ch in chs) or (chs is None and ft in CHANNEL_FAULT_MAP.get(ch, set()))
        )
        pri_cnt = sum(
            1 for _, ft, _, chs in prior_faults
            if (chs is not None and ch in chs) or (chs is None and ft in CHANNEL_FAULT_MAP.get(ch, set()))
        )

        rec_rate = (rec_cnt / recent_obs) if recent_obs > 0 else 0.0
        pri_rate = (pri_cnt / prior_obs) if prior_obs > 0 else 0.0
        delta = round(rec_rate - pri_rate, 4)

        if rec_rate >= 0.4:
            ch_status = "CRITICAL"
            is_any_critical = True
        elif delta > 0.10 or rec_rate >= 0.15:
            ch_status = "DEGRADING"
            is_any_degrading = True
        elif delta < -0.05:
            ch_status = "IMPROVING"
        else:
            ch_status = "STABLE"

        channel_trends[ch] = {
            "channel": ch,
            "recent_fault_count": rec_cnt,
            "prior_fault_count": pri_cnt,
            "recent_fault_rate": round(rec_rate, 4),
            "prior_fault_rate": round(pri_rate, 4),
            "rate_delta": delta,
            "status": ch_status,
        }

    if is_any_critical:
        system_status = "CRITICAL"
        urgency = "IMMEDIATE_FIELD_DISPATCH"
        estimated_rul_days = 1.0
    elif is_any_degrading:
        system_status = "DEGRADING"
        urgency = "SCHEDULE_CALIBRATION_WITHIN_7_DAYS"
        estimated_rul_days = 7.0
    else:
        system_status = "NOMINAL"
        urgency = "ROUTINE_MONITORING"
        estimated_rul_days = 90.0

    return {
        "station_id": station_id,
        "timestamp": now.isoformat(),
        "recent_window_hours": recent_hours,
        "baseline_window_hours": baseline_hours,
        "system_status": system_status,
        "maintenance_urgency": urgency,
        "estimated_rul_days": estimated_rul_days,
        "channels": channel_trends,
    }


# Circular buffer of periodic health snapshots for history queries
_health_snapshots: Dict[str, Deque[Dict[str, Any]]] = defaultdict(lambda: deque(maxlen=100))


def record_health_snapshot(station_id: str) -> None:
    """Takes and stores a point-in-time health snapshot."""
    h = compute_health(station_id)
    _health_snapshots[station_id].append({
        "timestamp": h.timestamp.isoformat(),
        "composite": h.composite,
        "temperature": h.temperature.score,
        "pressure": h.pressure.score,
        "humidity": h.humidity.score,
        "window_hours": h.window_hours,
    })


def get_station_health_history(station_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    """Returns recent health snapshots for trend charting."""
    snaps = list(_health_snapshots.get(station_id, []))
    if not snaps:
        # If no snapshots stored yet, generate current one
        h = compute_health(station_id)
        snaps = [{
            "timestamp": h.timestamp.isoformat(),
            "composite": h.composite,
            "temperature": h.temperature.score,
            "pressure": h.pressure.score,
            "humidity": h.humidity.score,
            "window_hours": h.window_hours,
        }]
    return snaps[-limit:]


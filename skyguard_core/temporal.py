"""
SkyGuard Core — Temporal Anomaly Analysis Engine
Shared temporal analysis used by both real-time backend and offline ML pipeline.
"""

from __future__ import annotations

import math
from collections import deque
from typing import Deque, List, Optional, Tuple

import numpy as np

from skyguard_core.schemas import DriftScore, TemporalState

# =============================================================================
# CONSTANTS
# =============================================================================

STEP_WINDOW: int = 6          # rolling window for Z-score (30 min at 5-min cadence)
PERSIST_WINDOW: int = 3       # consecutive identical readings to flag frozen
EPSILON: float = 1e-9

# Drift classification thresholds
DRIFT_MIN_VALID_SAMPLES: int = 6          # minimum history entries for drift judgement
DRIFT_MEDIAN_RESIDUAL_THRESHOLD: float = 2.0    # °C median offset from IDW
DRIFT_SLOPE_THRESHOLD_C_PER_HR: float = 0.05   # minimum detectable calibration creep
DRIFT_VARIANCE_MIN: float = 1e-5          # frozen sensor variance threshold


# =============================================================================
# RING-BUFFER HISTORY  (real-time path)
# =============================================================================

class StationHistory:
    """
    Fixed-capacity circular buffer tracking recent observations for one station.
    Thread-unsafe — call sites must manage locking if needed.
    """

    def __init__(self, capacity: int = 24):
        self._T: Deque[float] = deque(maxlen=capacity)
        self._P: Deque[float] = deque(maxlen=capacity)
        self._RH: Deque[float] = deque(maxlen=capacity)
        self._residuals_T: Deque[float] = deque(maxlen=capacity)
        self._timestamps_sec: Deque[float] = deque(maxlen=capacity)

    def push(
        self,
        T: float,
        P: float,
        RH: float,
        epoch_sec: float = 0.0,
        T_idw: Optional[float] = None,
    ) -> None:
        self._T.append(T)
        self._P.append(P)
        self._RH.append(RH)
        self._timestamps_sec.append(epoch_sec)
        if T_idw is not None and not math.isnan(T_idw):
            self._residuals_T.append(T - T_idw)

    def __len__(self) -> int:
        return len(self._T)

    @property
    def T_history(self) -> List[float]:
        return list(self._T)

    @property
    def P_history(self) -> List[float]:
        return list(self._P)

    @property
    def RH_history(self) -> List[float]:
        return list(self._RH)

    @property
    def residuals_T(self) -> List[float]:
        return list(self._residuals_T)

    @property
    def timestamps_sec(self) -> List[float]:
        return list(self._timestamps_sec)


# =============================================================================
# SCALAR / REAL-TIME ANALYSIS
# =============================================================================

def compute_temporal_zscore(
    history: List[float],
    current: float,
    window: int = STEP_WINDOW,
) -> float:
    """
    Rolling step Z-score of ``current`` relative to recent ``history``.
    Z = (Δx - μ_Δx) / σ_Δx  over the last ``window`` steps.
    Returns 0.0 if history is insufficient.
    """
    if len(history) < 2:
        return 0.0

    recent = history[-window:] if len(history) >= window else history
    deltas = [recent[i + 1] - recent[i] for i in range(len(recent) - 1)]
    current_delta = current - history[-1]

    if not deltas:
        return 0.0

    mu = float(np.mean(deltas))
    sigma = float(np.std(deltas, ddof=0)) + EPSILON
    return float((current_delta - mu) / sigma)


def is_frozen(
    history: List[float],
    current: float,
    window: int = PERSIST_WINDOW,
    variance_threshold: float = DRIFT_VARIANCE_MIN,
) -> bool:
    """
    True if the sensor appears stuck.
    Uses variance over the last ``window`` + current observation.
    """
    sample = (history[-(window - 1):] if len(history) >= window - 1 else history)
    sample = list(sample) + [current]
    if len(sample) < window:
        return False
    return float(np.var(sample)) <= variance_threshold


# =============================================================================
# DRIFT DETECTION  (requires persistent residual history)
# =============================================================================

def compute_drift_score(
    residual_history: List[float],
    timestamps_sec: Optional[List[float]] = None,
) -> DriftScore:
    """
    Classifies calibration drift from a history of (T_obs - T_idw) residuals.

    DRIFT requires ALL of:
      1. At least DRIFT_MIN_VALID_SAMPLES residual observations.
      2. Median absolute residual >= DRIFT_MEDIAN_RESIDUAL_THRESHOLD.
      3. Residuals show a consistent sign (all positive or all negative).
      4. Linear slope >= DRIFT_SLOPE_THRESHOLD_C_PER_HR.

    A single large residual does NOT qualify as drift — that is a spike.
    """
    valid = [r for r in residual_history if not math.isnan(r)]
    n = len(valid)

    if n < DRIFT_MIN_VALID_SAMPLES:
        return DriftScore(is_drift=False, valid_count=n)

    arr = np.array(valid, dtype=float)
    median_abs = float(np.median(np.abs(arr)))
    median_val = float(np.median(arr))

    # Consistent sign: at least 80% of residuals share the sign of the median
    if median_val >= 0:
        consistent_sign = float(np.sum(arr >= 0)) / n >= 0.80
    else:
        consistent_sign = float(np.sum(arr <= 0)) / n >= 0.80

    # Linear slope (units: residual-units / observation-index or per hour)
    slope = 0.0
    if timestamps_sec and len(timestamps_sec) >= n:
        ts = np.array(timestamps_sec[-n:], dtype=float)
        ts_hr = (ts - ts[0]) / 3600.0
        if ts_hr[-1] > 0:
            coeffs = np.polyfit(ts_hr, arr, deg=1)
            slope = float(coeffs[0])   # °C / hour
        else:
            # Fall back to index-based slope
            indices = np.arange(n, dtype=float)
            coeffs = np.polyfit(indices, arr, deg=1)
            slope = float(coeffs[0])
    else:
        # Use sample index as proxy for time
        indices = np.arange(n, dtype=float)
        coeffs = np.polyfit(indices, arr, deg=1)
        slope = float(coeffs[0])

    is_drift = (
        median_abs >= DRIFT_MEDIAN_RESIDUAL_THRESHOLD
        and consistent_sign
        and abs(slope) >= DRIFT_SLOPE_THRESHOLD_C_PER_HR
    )

    return DriftScore(
        is_drift=is_drift,
        median_residual=round(median_val, 3),
        slope_c_per_hr=round(slope, 4),
        consistent_sign=consistent_sign,
        valid_count=n,
    )


# =============================================================================
# ISOLATION FOREST ANOMALY SCORE  (offline batch path)
# =============================================================================

def isolation_forest_score(
    features: np.ndarray,
    contamination: float = 0.05,
    n_estimators: int = 150,
    random_state: int = 42,
) -> np.ndarray:
    """
    Fits an IsolationForest and returns a [0, 1] anomaly score.
    Higher = more anomalous.  Uses the same hyperparameters as the offline ML pipeline.
    """
    from sklearn.ensemble import IsolationForest

    iso = IsolationForest(
        n_estimators=n_estimators,
        contamination=contamination,
        random_state=random_state,
        n_jobs=-1,
    )
    iso.fit(features)
    raw = iso.decision_function(features)
    ptp = raw.max() - raw.min()            # fix: np.ptp removed in NumPy 2.0
    score_01 = 1.0 - (raw - raw.min()) / (ptp + EPSILON)
    return score_01


# =============================================================================
# BATCH TEMPORAL DETECTION  (offline ML pipeline helper)
# =============================================================================

def batch_rolling_zscore(series: "pd.Series", window: int) -> "pd.Series":  # noqa: F821
    """
    Pandas vectorised rolling-step Z-score.  Used by ml_analytics_pipeline.
    Import pandas only when called (not a hard dependency of the core module).
    """
    delta = series.diff().fillna(0.0)
    roll = delta.rolling(window=window, min_periods=2)
    mu = roll.mean().fillna(0.0)
    sigma = roll.std(ddof=0).fillna(0.0).replace(0.0, EPSILON)
    return (delta - mu) / sigma


def batch_persistence_flag(series: "pd.Series", window: int) -> "pd.Series":  # noqa: F821
    """Pandas vectorised flatline / frozen-sensor detection."""
    not_changed = (series.diff().abs() < 1e-7).astype(int)
    rolling_sum = not_changed.rolling(window=window, min_periods=window).sum()
    return (rolling_sum >= window).astype(float)

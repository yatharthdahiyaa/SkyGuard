"""
SkyGuard Core — Authoritative Atmospheric Physics Module
Single source of truth for all thermodynamic calculations.
Replaces duplicated implementations in:
  - pipeline_service.py
  - ml_analytics_pipeline.py (PhysicsValidator)
  - edge_station_node.py (EdgeScreener.check_thermodynamic_invariants)
  - evaluate_harness.py (compute_dew_point)
"""

from __future__ import annotations

import math
from typing import Tuple

import numpy as np

# =============================================================================
# CONSTANTS
# =============================================================================

# August-Roche-Magnus psychrometric constants
MAGNUS_A: float = 17.67
MAGNUS_B: float = 243.5   # °C
MAGNUS_C: float = 6.112   # hPa

# Supersaturation threshold: T_d > T + SUPERSAT_THRESHOLD_C is physically impossible
# at equilibrium. 0.5°C accounts for instrument rounding.
SUPERSAT_THRESHOLD_C: float = 0.5

# Climatological bounds for Indian AWS network (WMO-No.8 / IMD guidelines)
CLIM_BOUNDS: dict = {
    "T":  {"min": -20.0, "max":  60.0},   # °C  (covers Himalayan to Thar extremes)
    "P":  {"min": 800.0, "max": 1100.0},  # hPa
    "RH": {"min":   0.0, "max":  100.0},  # %
}

# ADC sentinel / disconnect detection
ADC_DISCONNECT_TEMP: float = -990.0   # anything <= this is a hardware null
ADC_CORRUPT_RH: float = 105.0         # anything > this is ADC saturation


# =============================================================================
# SCALAR FUNCTIONS  (safe for MCU / hot-path code)
# =============================================================================

def sat_vapor_pressure(T_c: float) -> float:
    """Saturation vapor pressure e_s(T) in hPa via August-Roche-Magnus."""
    denom = T_c + MAGNUS_B
    if abs(denom) < 1e-6:
        return 0.0
    return MAGNUS_C * math.exp((MAGNUS_A * T_c) / denom)


def magnus_dew_point(T_c: float, RH_pct: float) -> Tuple[float, bool]:
    """
    Compute dew point T_d and detect thermodynamic supersaturation.

    Returns
    -------
    (T_d, is_violation) where:
        T_d          : dew point in °C, or -999.0 on error
        is_violation : True iff T_d > T + SUPERSAT_THRESHOLD_C

    NOTE: The rule ``T > 40 AND RH > 90`` is NOT a Magnus violation.
    Only the dew-point invariant is tested here. Extreme-but-legal
    observations (e.g. 55 °C, 96 % RH over desert) must not be flagged
    by this function unless the Magnus relationship is actually broken.
    """
    if math.isnan(T_c) or math.isnan(RH_pct):
        return -999.0, True
    if RH_pct <= 0.0 or T_c < -80.0 or T_c > 100.0:
        return -999.0, True

    try:
        e_s = sat_vapor_pressure(T_c)
        rh_c = max(RH_pct, 0.01)
        e = e_s * (rh_c / 100.0)
        ratio = max(e / MAGNUS_C, 1e-9)
        log_val = math.log(ratio)
        denom = MAGNUS_A - log_val
        if abs(denom) < 1e-6:
            return -999.0, True
        T_d = (MAGNUS_B * log_val) / denom
        is_violation = T_d > (T_c + SUPERSAT_THRESHOLD_C)
        return round(T_d, 3), is_violation
    except Exception:
        return -999.0, True


def is_supersaturated(T_c: float, RH_pct: float) -> bool:
    """Convenience wrapper — returns True iff the Magnus invariant is broken."""
    _, violation = magnus_dew_point(T_c, RH_pct)
    return violation


def is_adc_disconnect(T_c: float) -> bool:
    """True if temperature looks like an ADC null-pull (-999.0 sentinel)."""
    return T_c <= ADC_DISCONNECT_TEMP


def is_rh_corrupted(RH_pct: float) -> bool:
    """True if RH exceeds physical / ADC saturation threshold (>105%)."""
    return RH_pct > ADC_CORRUPT_RH


def is_out_of_bounds(T_c: float, P_hpa: float, RH_pct: float) -> bool:
    """
    True if any variable is outside the climatic operational bounds.
    Does NOT include ADC-disconnect check — call is_adc_disconnect() separately.
    """
    if not (CLIM_BOUNDS["T"]["min"] <= T_c <= CLIM_BOUNDS["T"]["max"]):
        return True
    if not (CLIM_BOUNDS["P"]["min"] <= P_hpa <= CLIM_BOUNDS["P"]["max"]):
        return True
    if not (CLIM_BOUNDS["RH"]["min"] <= RH_pct <= CLIM_BOUNDS["RH"]["max"]):
        return True
    return False


def rh_supersat_excess(RH_pct: float) -> float:
    """Amount by which RH exceeds 100%.  Zero if within bounds."""
    return max(0.0, RH_pct - 100.0)


# =============================================================================
# VECTORIZED FUNCTIONS  (pandas / numpy — for batch ML pipeline)
# =============================================================================

def vec_sat_vapor_pressure(T: np.ndarray) -> np.ndarray:
    """Vectorized e_s(T). T in °C, returns hPa array."""
    denom = T + MAGNUS_B
    denom = np.where(np.abs(denom) < 1e-6, 1e-6, denom)
    return MAGNUS_C * np.exp((MAGNUS_A * T) / denom)


def vec_dew_point(T: np.ndarray, RH: np.ndarray) -> np.ndarray:
    """Vectorized T_d. T in °C, RH in %, returns T_d array in °C."""
    e_s = vec_sat_vapor_pressure(T)
    rh_c = np.clip(RH, 0.01, None)
    e = e_s * rh_c / 100.0
    ratio = np.clip(e / MAGNUS_C, 1e-9, None)
    log_val = np.log(ratio)
    denom = np.where(np.abs(MAGNUS_A - log_val) < 1e-6, 1e-6, MAGNUS_A - log_val)
    return (MAGNUS_B * log_val) / denom


def vec_is_physics_violation(T: np.ndarray, RH: np.ndarray) -> np.ndarray:
    """
    Vectorized supersaturation check.
    Returns boolean array: True only where T_d > T + SUPERSAT_THRESHOLD_C.
    Does NOT flag extreme-but-legal T/RH combinations.
    """
    T_d = vec_dew_point(T, RH)
    return T_d > (T + SUPERSAT_THRESHOLD_C)


def vec_rh_supersat_excess(RH: np.ndarray) -> np.ndarray:
    """Vectorized excess RH above 100%."""
    return np.clip(RH - 100.0, 0.0, None)


def vec_dew_point_spread(T: np.ndarray, RH: np.ndarray) -> np.ndarray:
    """T - T_d spread.  Positive = unsaturated; negative = supersaturation violation."""
    T_d = vec_dew_point(T, RH)
    return T - T_d


def vec_is_out_of_bounds(T: np.ndarray, P: np.ndarray, RH: np.ndarray) -> np.ndarray:
    """Vectorized climatic bounds check."""
    T_oob = (T < CLIM_BOUNDS["T"]["min"]) | (T > CLIM_BOUNDS["T"]["max"])
    P_oob = (P < CLIM_BOUNDS["P"]["min"]) | (P > CLIM_BOUNDS["P"]["max"])
    RH_oob = (RH < CLIM_BOUNDS["RH"]["min"]) | (RH > CLIM_BOUNDS["RH"]["max"])
    return T_oob | P_oob | RH_oob

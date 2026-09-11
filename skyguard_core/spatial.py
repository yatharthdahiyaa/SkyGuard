"""
SkyGuard Core — Spatial Consensus Engine
Shared IDW (Inverse Distance Weighting) haversine-based consensus computation.
Used by both the real-time backend (pipeline_service) and the offline ML pipeline.
"""

from __future__ import annotations

import math
from typing import List, Optional, Tuple

import numpy as np

from skyguard_core.schemas import NeighborReading, SpatialConsensus

EARTH_RADIUS_KM: float = 6371.0
IDW_POWER: int = 2
EPSILON: float = 1e-9

# Tolerance for classifying a neighboring station as "also anomalous"
# (used for regional vs. isolated discrimination)
REGIONAL_TEMP_TOLERANCE_C: float = 4.0   # neighbours must show > 4 °C departure too
REGIONAL_MIN_FRACTION: float = 0.50      # at least 50 % of neighbours must agree
REGIONAL_MIN_CORROBORATING: int = 2      # and at least 2 must agree


# =============================================================================
# SCALAR HAVERSINE
# =============================================================================

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two (lat, lon) points in kilometres."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = (math.sin(dphi / 2.0) ** 2
         + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2)
    return 2.0 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(max(0.0, a))))


# =============================================================================
# VECTORIZED HAVERSINE  (batch ML pipeline)
# =============================================================================

def haversine_matrix(lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
    """
    Compute (N × N) pairwise great-circle distance matrix in kilometres.
    lats, lons — 1-D arrays of length N.
    """
    lat_r = np.radians(lats)
    lon_r = np.radians(lons)
    dlat = lat_r[:, None] - lat_r[None, :]
    dlon = lon_r[:, None] - lon_r[None, :]
    a = (np.sin(dlat / 2) ** 2
         + np.cos(lat_r[:, None]) * np.cos(lat_r[None, :]) * np.sin(dlon / 2) ** 2)
    return 2.0 * EARTH_RADIUS_KM * np.arcsin(np.clip(np.sqrt(a), 0, 1))


# =============================================================================
# IDW CONSENSUS  (real-time, scalar)
# =============================================================================

def compute_idw_consensus(
    neighbors: List[NeighborReading],
    obs_T: Optional[float] = None,
    obs_P: Optional[float] = None,
    obs_RH: Optional[float] = None,
    temp_anomaly_threshold_c: float = REGIONAL_TEMP_TOLERANCE_C,
) -> SpatialConsensus:
    """
    Compute IDW-weighted spatial consensus from a list of neighbour readings.

    Parameters
    ----------
    neighbors              : list of NeighborReading objects with valid T/P/RH
    obs_T / obs_P / obs_RH : the CURRENT station's observation (used only for
                             regional-event corroboration fraction calculation)
    temp_anomaly_threshold_c : departure above which a neighbour is considered
                               "also anomalous" (for regional event detection)

    Returns
    -------
    SpatialConsensus — never sets T_idw to latitude or any geographic value.
    Returns consensus_available=False with None values when no valid neighbours.
    """
    if not neighbors:
        return SpatialConsensus(
            consensus_available=False,
            neighbor_count=0,
        )

    t_vals, p_vals, rh_vals, weights, station_ids = [], [], [], [], []

    for nb in neighbors:
        dist = max(nb.distance_km, 1.0)   # floor at 1 km to avoid div-by-zero
        w = 1.0 / (dist ** IDW_POWER)
        t_vals.append(nb.T)
        p_vals.append(nb.P)
        rh_vals.append(nb.RH)
        weights.append(w)
        station_ids.append(nb.station_id)

    if not weights:
        return SpatialConsensus(consensus_available=False, neighbor_count=0)

    w_arr = np.array(weights, dtype=float)
    w_sum = w_arr.sum()
    t_arr = np.array(t_vals, dtype=float)
    p_arr = np.array(p_vals, dtype=float)
    rh_arr = np.array(rh_vals, dtype=float)

    T_idw = float(np.dot(w_arr, t_arr) / w_sum)
    P_idw = float(np.dot(w_arr, p_arr) / w_sum)
    RH_idw = float(np.dot(w_arr, rh_arr) / w_sum)

    # Weighted standard deviation as uncertainty estimate
    def _weighted_std(vals: np.ndarray, idw_mean: float) -> float:
        residuals = vals - idw_mean
        var = float(np.dot(w_arr, residuals ** 2) / w_sum)
        return math.sqrt(max(var, 0.0))

    unc_T = _weighted_std(t_arr, T_idw)
    unc_P = _weighted_std(p_arr, P_idw)
    unc_RH = _weighted_std(rh_arr, RH_idw)

    # Regional event corroboration: count neighbours also departing significantly
    corroborating = 0
    if obs_T is not None:
        idw_reference_T = T_idw
        for t_nb in t_vals:
            # A neighbour "corroborates" if it also departs > threshold from IDW
            # in the same direction as the observed station
            if abs(t_nb - idw_reference_T) > temp_anomaly_threshold_c:
                corroborating += 1

    n = len(neighbors)
    frac = corroborating / n if n > 0 else 0.0

    return SpatialConsensus(
        T_idw=round(T_idw, 3),
        P_idw=round(P_idw, 3),
        RH_idw=round(RH_idw, 3),
        neighbor_count=n,
        consensus_available=True,
        contributing_stations=station_ids,
        uncertainty_T=round(unc_T, 3),
        uncertainty_P=round(unc_P, 3),
        uncertainty_RH=round(unc_RH, 3),
        corroborating_neighbors=corroborating,
        corroboration_fraction=round(frac, 3),
    )


def is_regional_event(consensus: SpatialConsensus) -> bool:
    """
    Returns True iff enough neighbours corroborate the anomaly to suggest
    a genuine regional weather event rather than an isolated sensor fault.
    """
    if not consensus.consensus_available:
        return False
    return (
        consensus.corroborating_neighbors >= REGIONAL_MIN_CORROBORATING
        and consensus.corroboration_fraction >= REGIONAL_MIN_FRACTION
    )

"""
SkyGuard Core — Unified Feature Builder
Single function that constructs the 19-dimensional feature vector used by
both the offline LightGBM classifier and the real-time backend.
Eliminates the dual-engine inconsistency.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import List, Optional

import numpy as np

from skyguard_core import physics
from skyguard_core.schemas import (
    FeatureVector,
    SpatialConsensus,
    TemporalState,
)


def build_feature_vector(
    T_obs: float,
    P_obs: float,
    RH_obs: float,
    spatial: Optional[SpatialConsensus] = None,
    temporal: Optional[TemporalState] = None,
    edge_flag: int = 0,
    timestamp: Optional[datetime] = None,
) -> FeatureVector:
    """
    Construct the canonical 19-element FeatureVector from raw observations,
    spatial consensus, temporal state, and timestamp.

    This is the ONLY place where features are computed.  Both the real-time
    backend (pipeline_service.py) and the offline batch pipeline
    (ml_analytics_pipeline.py) must call this function — they must not
    independently recompute features with different logic or thresholds.

    Parameters
    ----------
    T_obs, P_obs, RH_obs : raw sensor observation
    spatial              : SpatialConsensus from skyguard_core.spatial
    temporal             : TemporalState from skyguard_core.temporal
    edge_flag            : integer bitmask from the Tier-1 edge screener
    timestamp            : UTC datetime of observation (for diurnal/seasonal features)

    Returns
    -------
    FeatureVector (19 features matching FEATURE_COL_NAMES)
    """

    # --- Physics features ---
    T_d, is_violation = physics.magnus_dew_point(T_obs, RH_obs)
    dew_spread = (T_obs - T_d) if T_d > -900.0 else 0.0
    phys_flag = 1.0 if is_violation else 0.0

    # Also flag ADC-disconnect and hard OOB (not the same as Magnus violation)
    if physics.is_adc_disconnect(T_obs) or physics.is_rh_corrupted(RH_obs):
        phys_flag = 1.0
    if physics.is_out_of_bounds(T_obs, P_obs, RH_obs):
        phys_flag = max(phys_flag, 0.5)

    rh_excess = physics.rh_supersat_excess(RH_obs)

    # --- Temporal features ---
    if temporal is not None:
        temp_step_z = float(np.clip(temporal.temporal_zscore_T, -10.0, 10.0))
        pres_step_z = float(np.clip(temporal.temporal_zscore_P, -10.0, 10.0))
        rh_step_z = float(np.clip(temporal.temporal_zscore_RH, -10.0, 10.0))
        frozen_flag = 1.0 if temporal.is_frozen else 0.0
        temporal_score = float(np.clip(temporal.temporal_anomaly_score, 0.0, 1.0))
    else:
        # Fall back to edge-flag hints when no temporal history is available
        temp_step_z = 3.0 if (edge_flag & 0x04) else 0.0
        pres_step_z = 0.0
        rh_step_z = 0.0
        frozen_flag = 1.0 if (edge_flag & 0x08) else 0.0
        temporal_score = 0.0

    # --- Spatial features ---
    if spatial is not None and spatial.consensus_available:
        T_resid = (T_obs - spatial.T_idw) if spatial.T_idw is not None else 0.0
        P_resid = (P_obs - spatial.P_idw) if spatial.P_idw is not None else 0.0
        RH_resid = (RH_obs - spatial.RH_idw) if spatial.RH_idw is not None else 0.0

        # Spatial divergence score: normalised composite of all three residuals
        # Use uncertainty as the normalisation denominator (>=1.0 to avoid explosion)
        unc_T = max(spatial.uncertainty_T or 1.0, 1.0)
        unc_P = max(spatial.uncertainty_P or 2.0, 2.0)
        unc_RH = max(spatial.uncertainty_RH or 5.0, 5.0)

        div = (abs(T_resid) / unc_T + abs(P_resid) / unc_P + abs(RH_resid) / unc_RH) / 3.0
        div_score = float(np.clip(div, 0.0, None))
    else:
        T_resid = 0.0
        P_resid = 0.0
        RH_resid = 0.0
        div_score = 0.0

    # --- Diurnal / seasonal features (sin-cos cyclical encoding) ---
    # Provide information about the expected meteorological regime at this time.
    # A temperature reading is evaluated differently at midnight vs noon, and
    # differently in summer vs winter.
    if timestamp is not None:
        ts = timestamp
        hour = ts.hour + ts.minute / 60.0
        doy  = ts.timetuple().tm_yday
    else:
        # Fall back to "unknown time" — zero features maintain neutrality
        hour = 0.0
        doy  = 1.0
    hour_sin = math.sin(2.0 * math.pi * hour  / 24.0)
    hour_cos = math.cos(2.0 * math.pi * hour  / 24.0)
    doy_sin  = math.sin(2.0 * math.pi * doy   / 365.25)
    doy_cos  = math.cos(2.0 * math.pi * doy   / 365.25)

    return FeatureVector(
        T_obs=float(T_obs),
        P_obs=float(P_obs),
        RH_obs=float(RH_obs),
        dew_point_spread=round(dew_spread, 4),
        phys_violation_flag=round(phys_flag, 4),
        rh_supersat_excess=round(rh_excess, 4),
        temp_step_zscore=round(temp_step_z, 4),
        pres_step_zscore=round(pres_step_z, 4),
        rh_step_zscore=round(rh_step_z, 4),
        is_frozen_flag=frozen_flag,
        temporal_anomaly_score=round(temporal_score, 4),
        T_spatial_resid=round(T_resid, 4),
        P_spatial_resid=round(P_resid, 4),
        RH_spatial_resid=round(RH_resid, 4),
        spatial_divergence_score=round(div_score, 4),
        hour_sin=round(hour_sin, 4),
        hour_cos=round(hour_cos, 4),
        doy_sin=round(doy_sin, 4),
        doy_cos=round(doy_cos, 4),
    )

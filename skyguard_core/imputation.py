"""
SkyGuard Core — Physics-Constrained Virtual Sensor Imputer
Shared imputation logic for both real-time backend and offline ML pipeline.
"""

from __future__ import annotations

from typing import Optional

import numpy as np

from skyguard_core import physics
from skyguard_core.schemas import (
    CLIM_BOUNDS,
    CorrectionMethod,
    CorrectionResult,
    FaultType,
    SpatialConsensus,
    UncertaintyEstimate,
)


# Confidence uncertainty when no spatial neighbours are available
NO_NEIGHBOUR_UNCERTAINTY = UncertaintyEstimate(
    temperature_c=99.9, pressure_hpa=99.9, humidity_percent=99.9
)


def impute(
    T_obs: float,
    P_obs: float,
    RH_obs: float,
    fault_type: str,
    spatial: Optional[SpatialConsensus] = None,
) -> tuple[float, float, float, CorrectionResult]:
    """
    Apply physics-constrained self-healing imputation.

    Returns
    -------
    (T_imp, P_imp, RH_imp, CorrectionResult)

    Strategy priority:
      1. Spatial IDW from neighbours           → SPATIAL_IDW
      2. No neighbours available               → NO_CORRECTION  (original retained)

    A CLIMATOLOGICAL_FALLBACK constant (25 °C, 1013 hPa, 65%) is never used.
    If no spatial context is available, the original value is retained and
    the correction result clearly signals low confidence.
    """
    T_imp, P_imp, RH_imp = T_obs, P_obs, RH_obs

    if spatial and spatial.consensus_available:
        method = CorrectionMethod.SPATIAL_IDW
        T_idw = spatial.T_idw if spatial.T_idw is not None else T_obs
        P_idw = spatial.P_idw if spatial.P_idw is not None else P_obs
        RH_idw = spatial.RH_idw if spatial.RH_idw is not None else RH_obs
        contributing = spatial.contributing_stations
        n = spatial.neighbor_count
        unc = UncertaintyEstimate(
            temperature_c=round(spatial.uncertainty_T or 2.0, 2),
            pressure_hpa=round(spatial.uncertainty_P or 3.0, 2),
            humidity_percent=round(spatial.uncertainty_RH or 8.0, 2),
        )

        if fault_type in (FaultType.SENSOR_DROPOUT, "SENSOR_DROPOUT", "DROPOUT"):
            T_imp, P_imp, RH_imp = T_idw, P_idw, RH_idw
            reason = f"Full state imputed from IDW ({n} neighbours)."

        elif fault_type in (FaultType.PHYSICS_VIOLATION, "PHYSICS_VIOLATION",
                            "PSYCHROMETRIC_VIOLATION"):
            RH_imp = RH_idw
            reason = f"RH imputed from IDW ({n} neighbours); T/P retained."

        elif fault_type in (FaultType.SENSOR_DRIFT, "SENSOR_DRIFT", "DRIFT"):
            T_imp = T_idw
            reason = f"T imputed from IDW ({n} neighbours) — temperature drift."

        elif fault_type in (FaultType.SENSOR_SPIKE, "SENSOR_SPIKE", "SPIKE"):
            T_imp = T_idw
            reason = f"T imputed from IDW ({n} neighbours) — spike correction."

        elif fault_type in (FaultType.SENSOR_FROZEN, "SENSOR_FROZEN", "FROZEN"):
            T_imp = T_idw
            reason = f"T imputed from IDW ({n} neighbours) — frozen sensor."

        elif fault_type in (FaultType.ISOLATED_STATION_ANOMALY, "ISOLATED_STATION_ANOMALY",
                            FaultType.FULL_STATION_ANOMALY, "FULL_STATION_ANOMALY"):
            T_imp, P_imp, RH_imp = T_idw, P_idw, RH_idw
            reason = f"Full state imputed from IDW ({n} neighbours) — isolated anomaly."

        else:
            reason = "No imputation applied."

    else:
        method = CorrectionMethod.NO_CORRECTION
        unc = NO_NEIGHBOUR_UNCERTAINTY
        contributing = []
        n = 0
        reason = (
            "No valid spatial neighbours available. "
            "Original value retained with no correction confidence."
        )

    # Apply climatological hard-clip (not a fallback default, just a guardrail)
    T_imp = float(np.clip(T_imp, CLIM_BOUNDS["T"]["min"], CLIM_BOUNDS["T"]["max"]))
    P_imp = float(np.clip(P_imp, CLIM_BOUNDS["P"]["min"], CLIM_BOUNDS["P"]["max"]))
    RH_imp = float(np.clip(RH_imp, CLIM_BOUNDS["RH"]["min"], CLIM_BOUNDS["RH"]["max"]))

    # Physics guardrail: if imputed (T, RH) still violates Magnus, clamp RH
    _, violated = physics.magnus_dew_point(T_imp, RH_imp)
    if violated:
        RH_imp = min(RH_imp, 99.0)

    correction = CorrectionResult(
        temperature_c=round(T_imp, 3),
        pressure_hpa=round(P_imp, 3),
        humidity_percent=round(RH_imp, 3),
        method=method,
        uncertainty=unc,
        contributing_stations=contributing,
        neighbor_count=n,
        original_T=T_obs,
        original_P=P_obs,
        original_RH=RH_obs,
        reason=reason,
    )

    return T_imp, P_imp, RH_imp, correction

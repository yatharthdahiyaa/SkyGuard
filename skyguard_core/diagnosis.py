"""
SkyGuard Core — Natural Language Diagnosis Generator
Generates human-readable, evidence-backed diagnostic messages for all fault classes.
"""

from __future__ import annotations

from typing import Optional

from skyguard_core.schemas import (
    CorrectionResult,
    EvidenceBundle,
    FaultType,
    SpatialConsensus,
    TemporalState,
)


def generate_diagnosis(
    station_id: str,
    fault_type: str,
    evidence: EvidenceBundle,
    spatial: Optional[SpatialConsensus],
    temporal: Optional[TemporalState],
    correction: CorrectionResult,
    T_obs: float,
    P_obs: float,
    RH_obs: float,
) -> str:
    """
    Generate a concise natural-language diagnostic string.
    Always mentions: neighbour count, spatial residuals, temporal Z-score,
    correction method, and uncertainty where applicable.
    """
    n = spatial.neighbor_count if spatial else 0
    neighbour_str = f"{n} spatial neighbour(s)" if n > 0 else "no spatial neighbours"
    t_resid = evidence.temperature_spatial_residual_c
    rh_resid = evidence.humidity_spatial_residual_percent
    p_resid = evidence.pressure_spatial_residual_hpa
    t_z = evidence.temperature_temporal_zscore

    # --- Nominal ---
    if fault_type in (FaultType.NONE, "NONE"):
        parts = [f"{station_id} reports a nominal observation."]
        if n > 0:
            parts.append(f"Verified against thermodynamic invariants and {neighbour_str}.")
        return " ".join(parts)

    # --- Dropout ---
    if fault_type in (FaultType.SENSOR_DROPOUT, "SENSOR_DROPOUT", "DROPOUT"):
        return (
            f"{station_id} reports a hardware dropout / ADC disconnect "
            f"(T={T_obs:.1f}°C, P={P_obs:.1f} hPa, RH={RH_obs:.1f}%). "
            f"Full state synthesised from {neighbour_str}."
        )

    # --- Physics violation ---
    if fault_type in (FaultType.PHYSICS_VIOLATION, "PHYSICS_VIOLATION", "PSYCHROMETRIC_VIOLATION"):
        td_str = f" (Td={T_obs - (t_resid or 0.0):.1f}°C)" if t_resid is not None else ""
        rh_corr = (
            f" {n} neighbours corroborate RH≈{spatial.RH_idw:.1f}%."
            if spatial and spatial.consensus_available else ""
        )
        return (
            f"{station_id} reports RH={RH_obs:.1f}% which violates the "
            f"August-Roche-Magnus thermodynamic invariant at T={T_obs:.1f}°C{td_str}.{rh_corr} "
            f"RH imputed from IDW (uncertainty ±{correction.uncertainty.humidity_percent if correction.uncertainty else 'N/A'}%)."
        )

    # --- Spike ---
    if fault_type in (FaultType.SENSOR_SPIKE, "SENSOR_SPIKE", "SPIKE"):
        idw_str = f"{spatial.T_idw:.1f}°C" if spatial and spatial.consensus_available and spatial.T_idw else "N/A"
        z_str = f"temporal Z-score={t_z:.1f}" if t_z is not None else ""
        return (
            f"{station_id} reports T={T_obs:.1f}°C — an instantaneous step-change "
            f"({z_str}) not observed by {neighbour_str} (IDW consensus={idw_str}). "
            f"Isolated spike; temperature imputed to {correction.temperature_c:.1f}°C "
            f"(±{correction.uncertainty.temperature_c if correction.uncertainty else 'N/A'}°C)."
        )

    # --- Frozen ---
    if fault_type in (FaultType.SENSOR_FROZEN, "SENSOR_FROZEN", "FROZEN"):
        return (
            f"{station_id} sensor flatline detected — T={T_obs:.1f}°C has not varied "
            f"beyond measurement noise over multiple consecutive observations. "
            f"Temperature imputed from {neighbour_str} "
            f"(IDW={correction.temperature_c:.1f}°C ±{correction.uncertainty.temperature_c if correction.uncertainty else 'N/A'}°C)."
        )

    # --- Drift ---
    if fault_type in (FaultType.SENSOR_DRIFT, "SENSOR_DRIFT", "DRIFT"):
        slope = temporal.drift.slope_c_per_hr if temporal else 0.0
        return (
            f"{station_id} exhibits systematic calibration drift: T_obs diverging "
            f"from {neighbour_str} at {slope:+.2f}°C/hr "
            f"(cumulative residual={t_resid:+.1f}°C). "
            f"Temperature corrected via IDW to {correction.temperature_c:.1f}°C "
            f"(±{correction.uncertainty.temperature_c if correction.uncertainty else 'N/A'}°C)."
        ) if correction.temperature_c else (
            f"{station_id} exhibits systematic drift; no spatial correction available."
        )

    # --- Isolated station anomaly ---
    if fault_type in (FaultType.ISOLATED_STATION_ANOMALY, "ISOLATED_STATION_ANOMALY"):
        resid_parts = []
        if t_resid is not None:
            resid_parts.append(f"ΔT={t_resid:+.1f}°C")
        if p_resid is not None:
            resid_parts.append(f"ΔP={p_resid:+.1f} hPa")
        if rh_resid is not None:
            resid_parts.append(f"ΔRH={rh_resid:+.1f}%")
        resid_str = ", ".join(resid_parts) if resid_parts else "large departures"
        corr_t = f"{correction.temperature_c:.1f}°C" if correction.temperature_c else "N/A"
        unc_t = f"±{correction.uncertainty.temperature_c:.1f}°C" if correction.uncertainty else ""
        return (
            f"{station_id} reports an extreme departure ({resid_str}) not observed "
            f"by {neighbour_str}. The signal is isolated and is most consistent "
            f"with a sensor anomaly rather than a regional weather event. "
            f"Corrected via {correction.method} to T={corr_t} {unc_t}."
        )

    # --- Full station anomaly ---
    if fault_type in (FaultType.FULL_STATION_ANOMALY, "FULL_STATION_ANOMALY"):
        corr_t = f"{correction.temperature_c:.1f}°C" if correction.temperature_c else "N/A"
        return (
            f"{station_id} reports extreme departures across all three channels "
            f"(T, P, RH) that are not corroborated by {neighbour_str}. "
            f"Full station anomaly suspected. Imputed from IDW: T≈{corr_t}."
        )

    # --- Regional weather event ---
    if fault_type in (FaultType.REGIONAL_WEATHER_EVENT, "REGIONAL_WEATHER_EVENT"):
        frac_pct = int((spatial.corroboration_fraction if spatial else 0.0) * 100)
        return (
            f"{station_id} reports a large departure verified by {frac_pct}% of "
            f"{neighbour_str}. Classified as a genuine regional atmospheric event — "
            f"not a sensor fault. Original values retained."
        )

    # --- Insufficient context ---
    if fault_type in (FaultType.INSUFFICIENT_CONTEXT, "INSUFFICIENT_CONTEXT"):
        return (
            f"{station_id}: insufficient context to classify observation. "
            f"No valid spatial neighbours and fewer than 2 historical readings available. "
            f"Original values retained with low confidence."
        )

    # Fallback
    return (
        f"{station_id}: observation classified as {fault_type}. "
        f"Evidence: {neighbour_str} consulted."
    )

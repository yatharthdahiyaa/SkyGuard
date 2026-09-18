"""
SkyGuard AI - Per-Sensor Health API Router
File: routers/health.py

Exposes computed per-channel sensor health scores via REST API.
"""

from typing import Any, Dict, Optional
from fastapi import APIRouter, Query
from skyguard_backend import health_service
from skyguard_backend.models import StationHealthResponse

router = APIRouter(prefix="/health", tags=["Sensor Health"])


@router.get(
    "/station/{station_id}",
    response_model=StationHealthResponse,
    summary="Get per-sensor health scores for a station",
)
async def get_station_health(
    station_id: str,
    window_hours: int = Query(default=24, ge=1, le=168, description="Rolling window in hours (1-168)"),
):
    """
    Returns per-channel health scores (T / P / RH) and composite station health
    computed from fault frequency over the requested rolling time window.

    Health score interpretation:
    - 90-100 : STABLE (normal operation)
    - 70-89  : DEGRADING (elevated fault rate)
    - 0-69   : CRITICAL (high fault rate, maintenance required)
    """
    return health_service.compute_health(station_id, window_hours=window_hours)


@router.get(
    "/network",
    summary="Get health scores for all active stations",
)
async def get_network_health() -> Dict[str, Any]:
    """
    Returns health scores for every station that has sent at least one
    telemetry observation since backend startup.
    """
    all_health = health_service.get_all_station_health()
    return {
        sid: {
            "composite": h.composite,
            "temperature": h.temperature.model_dump(),
            "pressure": h.pressure.model_dump(),
            "humidity": h.humidity.model_dump(),
            "window_hours": h.window_hours,
            "timestamp": h.timestamp.isoformat(),
        }
        for sid, h in all_health.items()
    }


@router.get(
    "/trend/{station_id}",
    summary="Get sensor degradation trajectory and predictive maintenance urgency",
)
async def get_sensor_degradation_trend(
    station_id: str,
    recent_hours: int = Query(default=6, ge=1, le=48, description="Recent evaluation window (hours)"),
    baseline_hours: int = Query(default=24, ge=2, le=168, description="Prior baseline window (hours)"),
) -> Dict[str, Any]:
    """
    Evaluates rate-of-change in per-channel fault frequency.
    Detects accelerating sensor degradation and estimates Remaining Useful Life (RUL)
    to support predictive field maintenance.
    """
    return health_service.compute_degradation_trend(
        station_id=station_id,
        recent_hours=recent_hours,
        baseline_hours=baseline_hours,
    )


@router.get(
    "/history/{station_id}",
    summary="Get historical health snapshots for trend charting",
)
async def get_station_health_history(
    station_id: str,
    limit: int = Query(default=50, ge=1, le=200, description="Max historical snapshots"),
) -> Dict[str, Any]:
    """
    Returns time-series health snapshots for charting sensor degradation over time.
    """
    history = health_service.get_station_health_history(station_id, limit=limit)
    return {
        "station_id": station_id,
        "history": history,
        "count": len(history),
    }


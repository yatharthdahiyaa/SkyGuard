"""
SkyGuard AI - Telemetry Ingestion Router
File: routers/telemetry.py
"""

import logging
from datetime import datetime, timezone
from fastapi import APIRouter, BackgroundTasks, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from skyguard_backend.models import (
    TelemetryIngestRequest,
    TelemetryIngestResponse,
    TelemetryRecord,
)
from skyguard_backend.database import AsyncSessionLocal, get_db
from skyguard_backend.pipeline_service import pipeline_service
from skyguard_backend.websocket_manager import manager

router = APIRouter(prefix="/telemetry", tags=["Telemetry"])
logger = logging.getLogger("SkyGuard.TelemetryRouter")


async def execute_background_inference(payload: TelemetryIngestRequest):
    """
    Background worker task executing Layer 2 ML analytics, database persistence,
    and WebSocket live event broadcasting.
    """
    try:
        async with AsyncSessionLocal() as session:
            _, _, ws_packet = await pipeline_service.process_telemetry(session, payload)
            # Broadcast to live dashboard subscribers
            await manager.broadcast(ws_packet)
    except Exception as e:
        logger.error("Background telemetry processing failed for station %s: %s",
                     payload.station_id, e, exc_info=True)


@router.post(
    "/ingest",
    response_model=TelemetryIngestResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Asynchronous AWS Telemetry Ingestion Gateway"
)
async def ingest_telemetry(
    payload: TelemetryIngestRequest,
    background_tasks: BackgroundTasks
):
    """
    Ultra-low latency non-blocking endpoint (< 5 ms response time).
    Accepts raw observations from ESP32 edge stations or MQTT gateway,
    queues background inference, and returns 202 Accepted.
    """
    received_at = datetime.now(timezone.utc)

    # Offload processing to asynchronous background task
    background_tasks.add_task(execute_background_inference, payload)

    return TelemetryIngestResponse(
        status="queued",
        station_id=payload.station_id,
        received_at=received_at
    )


@router.get(
    "/{station_id}",
    summary="Get recent historical telemetry records for a station"
)
async def get_station_telemetry(
    station_id: str,
    limit: int = 60,
    db = Depends(get_db)
):
    stmt = (
        select(TelemetryRecord)
        .where(TelemetryRecord.station_id == station_id)
        .order_by(TelemetryRecord.timestamp.desc())
        .limit(min(limit, 500))
    )
    res = await db.execute(stmt)
    records = res.scalars().all()

    return [
        {
            "id": r.id,
            "timestamp": r.timestamp.isoformat(),
            "station_id": r.station_id,
            "T_obs": r.T_obs,
            "P_obs": r.P_obs,
            "RH_obs": r.RH_obs,
            "T_imputed": r.T_imputed,
            "P_imputed": r.P_imputed,
            "RH_imputed": r.RH_imputed,
            "is_fault": r.is_fault,
            "fault_class": r.fault_type,
            "qc_flag": r.qc_flag,
            "anomaly_score": r.anomaly_score,
        }
        for r in records
    ]

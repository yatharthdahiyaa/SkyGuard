"""
SkyGuard AI - Operational Alerts & Incident Response Router
File: routers/alerts.py
"""

from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from skyguard_backend.database import get_db
from skyguard_backend.models import Alert, AlertResponse

router = APIRouter(prefix="/alerts", tags=["Alerts"])


@router.get("", response_model=List[AlertResponse], summary="List Meteorological Anomaly Alerts")
@router.get("/", response_model=List[AlertResponse], include_in_schema=False)
async def list_alerts(
    station_id: Optional[str] = Query(None, description="Filter by Station ID"),
    severity: Optional[str] = Query(None, description="Filter by severity: INFO, WARNING, CRITICAL"),
    unacknowledged_only: bool = Query(False, description="Filter only active unacknowledged alerts"),
    limit: int = Query(100, ge=1, le=1000, description="Max alerts to return"),
    db: AsyncSession = Depends(get_db)
):
    """Returns operational incident alerts with natural language SHAP diagnostic justifications."""
    query = select(Alert)

    if station_id:
        query = query.where(Alert.station_id == station_id)
    if severity:
        query = query.where(Alert.severity == severity.upper())
    if unacknowledged_only:
        query = query.where(Alert.acknowledged == False)

    query = query.order_by(desc(Alert.timestamp)).limit(limit)

    result = await db.execute(query)
    alerts = result.scalars().all()
    return alerts


@router.post("/{alert_id}/acknowledge", response_model=AlertResponse, summary="Acknowledge Operational Alert")
async def acknowledge_alert(alert_id: str, db: AsyncSession = Depends(get_db)):
    """Allows field engineers and meteorologists to acknowledge an anomaly alert."""
    alert = await db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Alert {alert_id} not found")

    alert.acknowledged = True
    alert.resolved_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(alert)
    return alert

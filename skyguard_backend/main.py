"""
SkyGuard AI - Main FastAPI Application Service
File: main.py
"""

import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import FastAPI, Depends, status, Request, Response
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from skyguard_backend.config import settings
from skyguard_backend.database import init_db, get_db
from skyguard_backend.websocket_manager import manager
from skyguard_backend.routers import telemetry, stations, alerts, websocket, evaluation
from skyguard_backend.routers import health as health_router
from skyguard_backend.mqtt_listener import start_mqtt_listener, stop_mqtt_listener

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] (%(name)s) %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("SkyGuard.Main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan event handler for startup and shutdown procedures."""
    logger.info("Starting up %s (v%s)...", settings.PROJECT_NAME, settings.VERSION)
    # Initialize database schema and seed baseline stations
    await init_db()
    # Start MQTT telemetry listener if broker configured
    start_mqtt_listener()
    logger.info("System startup complete. Ready to ingest real-time AWS telemetry.")
    yield
    stop_mqtt_listener()
    logger.info("Shutting down %s...", settings.PROJECT_NAME)


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Operational AWS Telemetry Ingestion, Layer 2 ML Analytics, and Real-time Streaming Service",
    lifespan=lifespan
)

# CORS Middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API Routers
app.include_router(telemetry.router, prefix=settings.API_V1_STR)
app.include_router(stations.router, prefix=settings.API_V1_STR)
app.include_router(alerts.router, prefix=settings.API_V1_STR)
app.include_router(evaluation.router, prefix=settings.API_V1_STR)
app.include_router(health_router.router, prefix=settings.API_V1_STR)
app.include_router(websocket.router)  # Mounted at /ws/live


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def get_service_catalog():
    return {
        "status": "ONLINE",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": "Operational Production",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "dashboard_ui": "http://localhost:5186",
        "docs_url": "/docs",
        "redoc_url": "/redoc",
        "openapi_url": "/openapi.json",
        "endpoints": {
            "health": f"{settings.API_V1_STR}/health",
            "stations": f"{settings.API_V1_STR}/stations",
            "alerts": f"{settings.API_V1_STR}/alerts",
            "telemetry_ingest": f"{settings.API_V1_STR}/telemetry/ingest",
            "telemetry_history": f"{settings.API_V1_STR}/telemetry/{{station_id}}",
            "sensor_health_station": f"{settings.API_V1_STR}/health/station/{{station_id}}",
            "sensor_health_network": f"{settings.API_V1_STR}/health/network",
            "evaluation_report": f"{settings.API_V1_STR}/evaluation/report",
            "websocket_live": "/ws/live"
        },
        "description": "SkyGuard AI Meteorological Operations Service is running. Ingesting live AWS telemetry, executing Layer 2 ML anomaly detection & self-healing imputation, and streaming to UI."
    }


@app.get("/", tags=["Root"], summary="SkyGuard Meteorological Operations Root Endpoint")
@app.get("/backend", tags=["Root"], include_in_schema=False)
@app.get("/api", tags=["Root"], include_in_schema=False)
@app.get(settings.API_V1_STR, tags=["Root"], include_in_schema=False)
async def root_service_info(request: Request):
    """Provides operational discovery status, documentation links, and active endpoint catalog."""
    accept = request.headers.get("accept", "")
    catalog = get_service_catalog()

    if "text/html" in accept:
        html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{settings.PROJECT_NAME} - Backend Gateway</title>
    <style>
        * {{ box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }}
        body {{ background-color: #0b1120; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }}
        .card {{ background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 32px; max-width: 680px; width: 100%; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }}
        .badge {{ display: inline-flex; align-items: center; gap: 8px; background: rgba(34, 197, 94, 0.15); border: 1px solid rgba(34, 197, 94, 0.4); color: #4ade80; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 4px 12px; border-radius: 9999px; margin-bottom: 16px; }}
        .dot {{ width: 8px; height: 8px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 10px #22c55e; }}
        h1 {{ font-size: 24px; font-weight: 700; margin-bottom: 8px; color: #ffffff; }}
        p.subtitle {{ font-size: 14px; color: #94a3b8; line-height: 1.5; margin-bottom: 24px; }}
        .btn-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 24px; }}
        .btn {{ display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 16px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600; transition: all 0.15s ease; }}
        .btn-primary {{ background: #3b82f6; color: white; }}
        .btn-primary:hover {{ background: #2563eb; }}
        .btn-emerald {{ background: #059669; color: white; }}
        .btn-emerald:hover {{ background: #047857; }}
        .btn-secondary {{ background: #334155; color: #e2e8f0; border: 1px solid #475569; }}
        .btn-secondary:hover {{ background: #475569; }}
        pre {{ background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 16px; overflow-x: auto; font-size: 12px; color: #38bdf8; }}
    </style>
</head>
<body>
    <div class="card">
        <div class="badge"><span class="dot"></span>SYSTEM OPERATIONAL · 16 STATIONS SEEDED</div>
        <h1>{settings.PROJECT_NAME}</h1>
        <p class="subtitle">Operational AWS Telemetry Ingestion, Layer 2 ML Analytics, Self-Healing Imputation, and Real-Time WebSocket Streaming Engine.</p>
        
        <div class="btn-grid">
            <a href="/docs" class="btn btn-primary" target="_blank">📘 Swagger API Docs</a>
            <a href="http://localhost:5186" class="btn btn-emerald" target="_blank">🖥️ Frontend Dashboard</a>
            <a href="/api/v1/health" class="btn btn-secondary" target="_blank">🔍 Healthcheck</a>
            <a href="/api/v1/stations" class="btn btn-secondary" target="_blank">📡 Stations Catalog</a>
            <a href="/api/v1/alerts" class="btn btn-secondary" target="_blank">⚠️ Active Alerts</a>
            <a href="/api/v1/evaluation/report" class="btn btn-secondary" target="_blank">📊 Evaluation Report</a>
        </div>

        <pre><code>{json.dumps(catalog, indent=2)}</code></pre>
    </div>
</body>
</html>"""
        return HTMLResponse(content=html_content)

    return catalog


@app.get(f"{settings.API_V1_STR}/health", tags=["Health"], summary="System Readiness & Diagnostic Healthcheck")
async def health_check(db: AsyncSession = Depends(get_db)):
    """Validates database connectivity, active WebSocket connections, and operational readiness."""
    db_status = "HEALTHY"
    try:
        await db.execute(text("SELECT 1"))
    except Exception as e:
        logger.error("Healthcheck database failure: %s", e)
        db_status = "DEGRADED"

    return {
        "status": "OK" if db_status == "HEALTHY" else "DEGRADED",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "database": db_status,
        "active_ws_subscribers": manager.count()
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "skyguard_backend.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=False
    )

"""
SkyGuard AI - Real-time WebSocket Live Stream Router
File: routers/websocket.py
"""

import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from skyguard_backend.websocket_manager import manager

router = APIRouter(tags=["WebSocket"])
logger = logging.getLogger("SkyGuard.WebSocketRouter")


@router.websocket("/ws/live")
async def websocket_live_stream(websocket: WebSocket):
    """
    Persistent WebSocket endpoint for frontend dashboards.
    Pushes real-time TELEMETRY_UPDATE events containing observed values,
    imputed replacements, and meteorological diagnostics as soon as processed.
    """
    await manager.connect(websocket)
    try:
        while True:
            # Receive client ping/pong or client subscription messages
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        await manager.disconnect(websocket)
    except Exception as e:
        logger.debug("WebSocket error: %s", e)
        await manager.disconnect(websocket)

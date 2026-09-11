"""
SkyGuard AI - Real-time WebSocket Connection Manager
File: websocket_manager.py
"""

import logging
import asyncio
from typing import List, Dict, Any
from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger("SkyGuard.WebSocketManager")


class ConnectionManager:
    """
    Central thread-safe WebSocket connection manager handling live telemetry broadcasts
    to active monitoring dashboards with automatic dead-socket eviction.
    """
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        """Accepts and registers a new WebSocket client."""
        await websocket.accept()
        async with self._lock:
            self.active_connections.append(websocket)
        logger.info("WebSocket client connected. Total active subscribers: %d", len(self.active_connections))

    async def disconnect(self, websocket: WebSocket) -> None:
        """Unregisters a disconnected WebSocket client."""
        async with self._lock:
            if websocket in self.active_connections:
                self.active_connections.remove(websocket)
        logger.info("WebSocket client disconnected. Total active subscribers: %d", len(self.active_connections))

    async def broadcast(self, message: Dict[str, Any]) -> None:
        """Broadcasts JSON payload to all connected clients."""
        async with self._lock:
            targets = list(self.active_connections)

        if not targets:
            return

        dead_connections = []
        for connection in targets:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.debug("Error sending to WebSocket client: %s", e)
                dead_connections.append(connection)

        if dead_connections:
            async with self._lock:
                for dead in dead_connections:
                    if dead in self.active_connections:
                        self.active_connections.remove(dead)
            logger.info("Evicted %d dead WebSocket connections.", len(dead_connections))

    def count(self) -> int:
        return len(self.active_connections)


manager = ConnectionManager()

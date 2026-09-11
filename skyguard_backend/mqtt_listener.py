"""
SkyGuard AI - MQTT Telemetry Subscriber Service
File: mqtt_listener.py  v2.0
Fixes: paho-mqtt 2.0 API (CallbackAPIVersion), MQTT credentials.
"""

import json
import logging
import asyncio
from datetime import datetime, timezone
from typing import Optional

from skyguard_backend.config import settings
from skyguard_backend.database import AsyncSessionLocal
from skyguard_backend.pipeline_service import pipeline_service
from skyguard_backend.websocket_manager import manager
from skyguard_backend.models import (
    TelemetryIngestRequest,
    RawTelemetryPayload,
    EdgeTelemetryMetadata,
)

logger = logging.getLogger("SkyGuard.MQTTListener")

_mqtt_client = None
_loop: Optional[asyncio.AbstractEventLoop] = None


def parse_and_schedule_ingest(topic: str, payload_str: str) -> None:
    """Parses incoming MQTT payload and schedules database inference."""
    global _loop
    if not _loop or _loop.is_closed():
        return

    try:
        data = json.loads(payload_str)
    except Exception as exc:
        logger.warning("Invalid JSON on topic %s: %s", topic, exc)
        return

    # Extract station_id from payload or topic pattern aws/{station_id}/telemetry
    station_id = data.get("station_id") or data.get("sid")
    if not station_id:
        parts = topic.split("/")
        if len(parts) >= 2 and parts[0] == "aws":
            station_id = parts[1]
        else:
            station_id = "AWS_UNKNOWN"

    try:
        raw_dict = data.get("raw", {})
        if not raw_dict:
            raw_dict = {
                "T": data.get("T", data.get("T_obs", 25.0)),
                "P": data.get("P", data.get("P_obs", 1013.25)),
                "RH": data.get("RH", data.get("RH_obs", 60.0)),
            }

        edge_dict = data.get("edge", None)
        edge_obj: Optional[EdgeTelemetryMetadata] = None
        if edge_dict:
            edge_obj = EdgeTelemetryMetadata(**edge_dict)
        elif "flag" in data:
            edge_obj = EdgeTelemetryMetadata(
                flag=data.get("flag", 0),
                desc=data.get("desc", "EDGE_PASS"),
                td=data.get("td"),
                t_step=data.get("t_step"),
                p_step=data.get("p_step"),
                rh_step=data.get("rh_step"),
            )

        ts_raw = data.get("timestamp") or data.get("ts")
        if ts_raw:
            if isinstance(ts_raw, (int, float)):
                ts = datetime.fromtimestamp(ts_raw, tz=timezone.utc)
            else:
                try:
                    ts = datetime.fromisoformat(str(ts_raw).replace("Z", "+00:00"))
                except Exception:
                    ts = datetime.now(timezone.utc)
        else:
            ts = datetime.now(timezone.utc)

        req = TelemetryIngestRequest(
            station_id=station_id,
            timestamp=ts,
            raw=RawTelemetryPayload(
                T=float(raw_dict.get("T", 25.0)),
                P=float(raw_dict.get("P", 1013.25)),
                RH=float(raw_dict.get("RH", 60.0)),
            ),
            edge=edge_obj,
        )

        async def _process():
            try:
                async with AsyncSessionLocal() as session:
                    _, _, ws_packet = await pipeline_service.process_telemetry(session, req)
                    await manager.broadcast(ws_packet)
            except Exception as ex:
                logger.error("Error processing MQTT telemetry for %s: %s", station_id, ex)

        asyncio.run_coroutine_threadsafe(_process(), _loop)

    except Exception as exc:
        logger.error("Failed to parse MQTT message on %s: %s", topic, exc)


def _on_connect(client, userdata, flags, rc):
    if rc == 0:
        logger.info(
            "Connected to MQTT broker (%s:%d). Subscribing to %s",
            settings.MQTT_BROKER_HOST, settings.MQTT_BROKER_PORT, settings.MQTT_TOPIC,
        )
        client.subscribe([(settings.MQTT_TOPIC, 1), ("aws/+/telemetry", 1), ("skyguard/#", 1)])
    else:
        logger.warning("MQTT connection failed (rc=%d)", rc)


def _on_message(client, userdata, msg):
    try:
        payload_str = msg.payload.decode("utf-8")
        parse_and_schedule_ingest(msg.topic, payload_str)
    except Exception as exc:
        logger.error("Error in MQTT on_message: %s", exc)


def start_mqtt_listener() -> None:
    """Initialise and start background MQTT client with credential support."""
    global _mqtt_client, _loop
    if not settings.MQTT_BROKER_HOST:
        logger.info("MQTT_BROKER_HOST not configured — MQTT subscriber disabled.")
        return

    try:
        import paho.mqtt.client as mqtt
    except ImportError:
        logger.warning("paho-mqtt not installed — MQTT ingestion disabled.")
        return

    try:
        _loop = asyncio.get_running_loop()

        # paho-mqtt 2.0+ requires CallbackAPIVersion; fall back for older versions
        try:
            client = mqtt.Client(
                mqtt.CallbackAPIVersion.VERSION1,
                client_id=f"skyguard_backend_{int(datetime.now().timestamp())}",
            )
        except AttributeError:
            # paho-mqtt < 2.0
            client = mqtt.Client(
                client_id=f"skyguard_backend_{int(datetime.now().timestamp())}"
            )

        # Attach credentials if configured
        if settings.MQTT_USERNAME and settings.MQTT_PASSWORD:
            client.username_pw_set(settings.MQTT_USERNAME, settings.MQTT_PASSWORD)
            logger.info("MQTT authentication configured for user '%s'", settings.MQTT_USERNAME)

        client.on_connect = _on_connect
        client.on_message = _on_message
        client.connect_async(settings.MQTT_BROKER_HOST, settings.MQTT_BROKER_PORT, keepalive=60)
        client.loop_start()

        _mqtt_client = client
        logger.info(
            "MQTT listener started — broker %s:%d",
            settings.MQTT_BROKER_HOST, settings.MQTT_BROKER_PORT,
        )
    except Exception as exc:
        logger.error("Failed to initialise MQTT listener: %s", exc)


def stop_mqtt_listener() -> None:
    """Gracefully disconnect MQTT client."""
    global _mqtt_client
    if _mqtt_client:
        try:
            _mqtt_client.loop_stop()
            _mqtt_client.disconnect()
            logger.info("MQTT listener stopped.")
        except Exception:
            pass
        _mqtt_client = None

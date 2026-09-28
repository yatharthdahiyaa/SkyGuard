"""
SkyGuard AI - Embedded Autonomous Telemetry Streamer
File: skyguard_backend/embedded_simulator.py

Enables fully autonomous, zero-dependency cloud deployment (e.g. Render, Railway,
Hugging Face, Docker). Automatically streams realistic AWS weather observations
and synthetic sensor anomalies directly through the Layer 2 ML analytics pipeline
without requiring an external simulator process or MQTT broker.
"""

from __future__ import annotations

import asyncio
import logging
import math
import os
import random
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from skyguard_backend.config import settings
from skyguard_backend.database import AsyncSessionLocal
from skyguard_backend.models import (
    EdgeTelemetryMetadata,
    RawTelemetryPayload,
    TelemetryIngestRequest,
)
from skyguard_backend.pipeline_service import pipeline_service
from skyguard_backend.websocket_manager import manager

logger = logging.getLogger("SkyGuard.EmbeddedSimulator")

# Background task handle
_simulator_task: Optional[asyncio.Task] = None
_stop_event = asyncio.Event()

# Edge test thresholds
MAGNUS_A = 17.67
MAGNUS_B = 243.5
MAGNUS_C = 6.112


def compute_edge_metadata(
    T: float, P: float, RH: float, prev_sample: Optional[Dict[str, float]] = None
) -> EdgeTelemetryMetadata:
    """Microsecond edge sanity check calculating edge bitmask and step deltas."""
    flag = 0
    t_step = p_step = rh_step = 0.0

    if not (-40.0 <= T <= 60.0):
        flag |= 0x01
    if not (800.0 <= P <= 1100.0):
        flag |= 0x01
    if not (0.0 <= RH <= 100.0):
        flag |= 0x01

    try:
        alpha = ((MAGNUS_A * T) / (MAGNUS_B + T)) + math.log(max(RH, 0.01) / 100.0)
        td = (MAGNUS_B * alpha) / (MAGNUS_A - alpha)
        if td > T + 0.1:
            flag |= 0x02
    except Exception:
        td = None

    if prev_sample:
        t_step = round(T - prev_sample.get("T", T), 2)
        p_step = round(P - prev_sample.get("P", P), 2)
        rh_step = round(RH - prev_sample.get("RH", RH), 2)

        if abs(t_step) > 8.0 or abs(p_step) > 6.0 or abs(rh_step) > 30.0:
            flag |= 0x04
        if abs(t_step) < 1e-4 and abs(p_step) < 1e-4 and abs(rh_step) < 1e-4:
            flag |= 0x08

    desc = "EDGE_PASS" if flag == 0 else f"EDGE_FLAG_0x{flag:02X}"
    return EdgeTelemetryMetadata(
        flag=flag,
        desc=desc,
        td=td,
        t_step=t_step,
        p_step=p_step,
        rh_step=rh_step,
    )


class EmbeddedSimulator:
    def __init__(self):
        self.prev_samples: Dict[str, Dict[str, float]] = {}
        self.dataset_df: Optional[pd.DataFrame] = None
        self.station_ids: List[str] = []
        self._row_idx: int = 0

    def load_dataset(self) -> bool:
        """Attempt to load benchmark dataset for realistic ground-truth replay."""
        candidates = [
            Path(settings.BENCHMARK_PATH),
            Path(__file__).resolve().parent.parent / "DATA" / "skyguard_groundtruth_benchmark.parquet",
            Path("/app/DATA/skyguard_groundtruth_benchmark.parquet"),
        ]

        for p in candidates:
            if p.exists():
                try:
                    df = pd.read_parquet(p)
                    # Sort chronologically if timestamp exists
                    if "timestamp" in df.columns:
                        df = df.sort_values("timestamp").reset_index(drop=True)
                    self.dataset_df = df
                    self.station_ids = [str(s) for s in df["station_id"].unique()]
                    logger.info(
                        "Embedded simulator loaded %d records across %d stations from %s",
                        len(df),
                        len(self.station_ids),
                        p,
                    )
                    return True
                except Exception as e:
                    logger.warning("Could not read parquet at %s: %s", p, e)

        logger.info("No benchmark parquet found; running in autonomous physics synthesis mode.")
        return False

    def generate_synthetic_observation(self, station_id: str) -> Dict[str, Any]:
        """Generates physically consistent real-time weather readings if no dataset is present."""
        now = datetime.now(timezone.utc)
        hour = now.hour + now.minute / 60.0

        # Diurnal temperature cycle
        base_temp = 25.0 + 8.0 * math.sin((hour - 9) * math.pi / 12.0)
        temp = base_temp + random.gauss(0, 0.4)

        # Barometric pressure (diurnal tidal oscillation ~ 1012 hPa)
        press = 1012.0 - 2.5 * math.sin((hour - 3) * math.pi / 12.0) + random.gauss(0, 0.2)

        # Relative humidity anti-correlated with temperature
        rh = max(15.0, min(98.0, 75.0 - (temp - 20.0) * 2.2 + random.gauss(0, 1.5)))

        # 2% chance of injecting a subtle transient anomaly to demonstrate real-time AI triage
        fault_dice = random.random()
        if fault_dice < 0.008:
            temp += random.choice([12.5, -15.0])  # Step spike
        elif fault_dice < 0.014:
            rh = 99.5
            temp = 42.0  # Psychrometric invariant breach

        return {
            "station_id": station_id,
            "T": round(temp, 2),
            "P": round(press, 2),
            "RH": round(rh, 2),
        }

    async def run_loop(self):
        """Infinite loop ingesting observations at configured rate."""
        delay = max(0.1, 1.0 / max(0.1, settings.EMBEDDED_SIMULATOR_RATE_HZ))
        logger.info("Embedded telemetry streamer started (rate: %.1f Hz, delay: %.2fs)",
                    settings.EMBEDDED_SIMULATOR_RATE_HZ, delay)

        # Default fallback station IDs
        fallback_stations = [
            f"AWS_{i:05d}" for i in [
                43003, 43014, 43057, 43086, 43110, 43128, 43150, 43185,
                43201, 43220, 43245, 43279, 43311, 43333, 43350, 43371
            ]
        ]

        while not _stop_event.is_set():
            t_start = time.perf_counter()

            try:
                if self.dataset_df is not None and len(self.dataset_df) > 0:
                    row = self.dataset_df.iloc[self._row_idx]
                    self._row_idx = (self._row_idx + 1) % len(self.dataset_df)

                    sid = str(row["station_id"])
                    t_obs = float(row["T_obs"])
                    p_obs = float(row["P_obs"])
                    rh_obs = float(row["RH_obs"])
                else:
                    sid = random.choice(fallback_stations)
                    synth = self.generate_synthetic_observation(sid)
                    t_obs = synth["T"]
                    p_obs = synth["P"]
                    rh_obs = synth["RH"]

                prev = self.prev_samples.get(sid)
                edge_meta = compute_edge_metadata(t_obs, p_obs, rh_obs, prev)
                self.prev_samples[sid] = {"T": t_obs, "P": p_obs, "RH": rh_obs}

                payload = TelemetryIngestRequest(
                    station_id=sid,
                    timestamp=datetime.now(timezone.utc),
                    raw=RawTelemetryPayload(T=t_obs, P=p_obs, RH=rh_obs),
                    edge=edge_meta,
                )

                # Process through Layer 2 ML analytics pipeline & broadcast
                async with AsyncSessionLocal() as session:
                    _, _, ws_packet = await pipeline_service.process_telemetry(session, payload)
                    await session.commit()
                    # Broadcast live WebSocket event to all connected dashboard users
                    await manager.broadcast(ws_packet)

            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("Embedded simulator iteration error: %s", exc)

            elapsed = time.perf_counter() - t_start
            sleep_time = max(0.01, delay - elapsed)
            try:
                await asyncio.sleep(sleep_time)
            except asyncio.CancelledError:
                break


def start_embedded_simulator():
    """Starts the embedded telemetry streamer background task."""
    global _simulator_task, _stop_event
    if not settings.ENABLE_EMBEDDED_SIMULATOR:
        logger.info("Embedded simulator disabled by configuration.")
        return

    _stop_event.clear()
    sim = EmbeddedSimulator()
    sim.load_dataset()
    _simulator_task = asyncio.create_task(sim.run_loop())
    logger.info("Embedded autonomous telemetry streamer task spawned.")


def stop_embedded_simulator():
    """Stops the embedded telemetry streamer cleanly."""
    global _simulator_task, _stop_event
    _stop_event.set()
    if _simulator_task and not _simulator_task.done():
        _simulator_task.cancel()
        logger.info("Embedded simulator task cancelled.")

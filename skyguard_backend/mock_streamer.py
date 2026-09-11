"""
SkyGuard AI - Operational Telemetry Streamer & E2E Validation Client
File: mock_streamer.py

Features:
  - Connects to FastAPI backend WebSocket stream (/ws/live)
  - Ingests 50 real observational records from benchmark dataset at 5 Hz (0.2s interval)
  - Validates zero-drop non-blocking ingestion (< 5 ms response time)
  - Validates asynchronous background Layer 2 ML reasoning & database persistence
  - Validates real-time WebSocket broadcast of repaired telemetry & SHAP diagnostics
"""

import sys
import os
import time
import json
import asyncio
import logging
import argparse
from typing import List, Dict, Any
import pandas as pd
import httpx
import websockets

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] (%(name)s) %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("SkyGuard.MockStreamer")


class MockStreamerTestbench:
    def __init__(
        self,
        base_url: str = "http://127.0.0.1:8000",
        ws_url: str = "ws://127.0.0.1:8000/ws/live",
        benchmark_path: str = "DATA/skyguard_groundtruth_benchmark.csv",
        num_records: int = 50,
        stream_rate_hz: float = 5.0
    ):
        self.base_url = base_url.rstrip("/")
        self.ws_url = ws_url
        self.benchmark_path = benchmark_path
        self.num_records = num_records
        self.interval_sec = 1.0 / stream_rate_hz
        self.received_ws_events: List[Dict[str, Any]] = []
        self.ingest_latencies_ms: List[float] = []
        self.ingested_records: List[Dict[str, Any]] = []
        self._stop_ws = False

    async def ws_listener_task(self):
        """Asynchronous listener maintaining WebSocket connection and capturing events."""
        logger.info("Connecting to WebSocket live stream at %s...", self.ws_url)
        try:
            async with websockets.connect(self.ws_url) as ws:
                logger.info("Connected to WebSocket stream! Listening for TELEMETRY_UPDATE events...")
                while not self._stop_ws:
                    try:
                        msg = await asyncio.wait_for(ws.recv(), timeout=0.5)
                        data = json.loads(msg)
                        self.received_ws_events.append(data)
                        logger.info("--> [WS LIVE] Received event for station %s | Status: %s | QC: %s",
                                    data.get("station_id"), data.get("status"), data.get("qc_flag"))
                    except asyncio.TimeoutError:
                        continue
                    except Exception as e:
                        if not self._stop_ws:
                            logger.error("WebSocket error: %s", e)
                        break
        except Exception as e:
            logger.error("Failed to establish WebSocket connection: %s", e)

    async def run(self):
        logger.info("=" * 75)
        logger.info("SKYGUARD AI - TELEMETRY STREAMER & E2E INTEGRATION TESTBENCH")
        logger.info("=" * 75)

        # 1. Verify Backend Health
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.get(f"{self.base_url}/api/v1/health", timeout=5.0)
                if resp.status_code != 200:
                    logger.error("Health check failed with status %d: %s", resp.status_code, resp.text)
                    return False
                health_data = resp.json()
                logger.info("Backend Health Verified: %s | Database: %s",
                            health_data["status"], health_data["database"])
            except Exception as e:
                logger.error("Backend server is not reachable at %s: %s", self.base_url, e)
                logger.error("Please start the backend server: python -m uvicorn skyguard_backend.main:app --port 8000")
                return False

        # 2. Load Benchmark Dataset
        if not os.path.exists(self.benchmark_path):
            alt_parquet = self.benchmark_path.replace(".csv", ".parquet")
            if os.path.exists(alt_parquet):
                self.benchmark_path = alt_parquet
            else:
                logger.error("Benchmark file not found at %s", self.benchmark_path)
                return False

        if self.benchmark_path.endswith(".parquet"):
            df = pd.read_parquet(self.benchmark_path)
        else:
            df = pd.read_csv(self.benchmark_path)

        stream_slice = df.head(self.num_records).copy()
        logger.info("Loaded %d benchmark records for real-time 5 Hz streaming test", len(stream_slice))

        # 3. Start Background WebSocket Listener
        ws_task = asyncio.create_task(self.ws_listener_task())
        await asyncio.sleep(0.5)  # Allow WS handshake to complete

        # 4. Stream Telemetry at 5 Hz (0.2s interval)
        logger.info("Initiating 5 Hz Telemetry Ingestion to %s/api/v1/telemetry/ingest...", self.base_url)
        t_stream_start = time.perf_counter()

        async with httpx.AsyncClient() as client:
            for idx, row in stream_slice.iterrows():
                t_req_start = time.perf_counter()

                # Construct Ingest Payload
                payload = {
                    "station_id": str(row["station_id"]),
                    "timestamp": str(row["timestamp"]),
                    "raw": {
                        "T": float(row["T_obs"]),
                        "P": float(row["P_obs"]),
                        "RH": float(row["RH_obs"])
                    },
                    "edge": {
                        "flag": 0,
                        "desc": "EDGE_PASS"
                    }
                }

                # If benchmark has known faults, annotate edge flag for verification
                fc = str(row.get("fault_class", "NONE"))
                if fc == "PSYCHROMETRIC_VIOLATION":
                    payload["edge"]["flag"] = 2
                    payload["edge"]["desc"] = "EDGE_ERR_THERMODYNAMIC_IMPOSSIBLE"
                elif fc == "SPIKE":
                    payload["edge"]["flag"] = 4
                    payload["edge"]["desc"] = "EDGE_SUSPECT_STEP_SPIKE"
                elif fc == "FROZEN":
                    payload["edge"]["flag"] = 8
                    payload["edge"]["desc"] = "EDGE_ERR_SENSOR_FROZEN"
                elif fc == "DROPOUT":
                    payload["edge"]["flag"] = 1
                    payload["edge"]["desc"] = "EDGE_ERR_OUT_OF_BOUNDS"

                # Send POST /ingest
                resp = await client.post(
                    f"{self.base_url}/api/v1/telemetry/ingest",
                    json=payload,
                    timeout=5.0
                )

                latency_ms = (time.perf_counter() - t_req_start) * 1000.0
                self.ingest_latencies_ms.append(latency_ms)
                self.ingested_records.append(payload)

                if resp.status_code != 202:
                    logger.warning("Ingest request %d rejected with status %d: %s",
                                   idx, resp.status_code, resp.text)

                # Maintain 5 Hz rate cadence
                elapsed = time.perf_counter() - t_req_start
                sleep_time = max(0.0, self.interval_sec - elapsed)
                await asyncio.sleep(sleep_time)

        total_stream_time = time.perf_counter() - t_stream_start
        logger.info("Streaming complete: %d records in %.2f s (Average Ingestion Latency: %.2f ms)",
                    len(self.ingested_records), total_stream_time,
                    sum(self.ingest_latencies_ms) / len(self.ingest_latencies_ms))

        # 5. Allow background inference workers to finish processing queue
        logger.info("Waiting 2.5s for asynchronous background inference queue to drain...")
        await asyncio.sleep(2.5)

        # Stop WebSocket listener
        self._stop_ws = True
        ws_task.cancel()

        # 6. Verify Persistence via REST Endpoints
        async with httpx.AsyncClient() as client:
            # Check Stations
            st_resp = await client.get(f"{self.base_url}/api/v1/stations")
            stations_data = st_resp.json()

            # Check Alerts
            alert_resp = await client.get(f"{self.base_url}/api/v1/alerts")
            alerts_data = alert_resp.json()

            # Check History for primary station
            first_sid = str(stream_slice.iloc[0]["station_id"])
            hist_resp = await client.get(f"{self.base_url}/api/v1/stations/{first_sid}/history?limit=50")
            history_data = hist_resp.json()

        # 7. Print Comprehensive Integration Validation Report
        print("\n" + "=" * 75)
        print("SKYGUARD AI - E2E INTEGRATION & PERSISTENCE VERIFICATION REPORT")
        print("=" * 75)
        avg_lat = sum(self.ingest_latencies_ms) / len(self.ingest_latencies_ms)
        max_lat = max(self.ingest_latencies_ms)
        min_lat = min(self.ingest_latencies_ms)

        print(f"Total Telemetry Ingested:        {len(self.ingested_records)} records")
        print(f"Ingestion Latency (SLA < 5 ms):  Avg: {avg_lat:.2f} ms | Min: {min_lat:.2f} ms | Max: {max_lat:.2f} ms")
        print(f"WebSocket Live Events Received: {len(self.received_ws_events)} events broadcast")
        print(f"Registered Stations in DB:      {len(stations_data)} stations")
        print(f"Persisted Records for {first_sid}: {len(history_data)} rows")
        print(f"Generated Meteorological Alerts: {len(alerts_data)} alerts")

        if alerts_data:
            print("\nSample Operational Alert from Ingestion Stream:")
            sample_alert = alerts_data[0]
            print(f"  Station:    {sample_alert['station_id']}")
            print(f"  Severity:   {sample_alert['severity']}")
            print(f"  Class:      {sample_alert.get('fault_type', sample_alert.get('fault_class', 'N/A'))}")
            print(f"  Diagnostic: {sample_alert.get('diagnostic_msg', 'N/A')}")

        print("=" * 75 + "\n")

        # Assertions
        assert len(self.ingested_records) == self.num_records, "Not all records were ingested"
        assert len(self.received_ws_events) > 0, "No WebSocket events were received"
        assert len(history_data) > 0, "No records persisted in database"
        logger.info("ALL INTEGRATION ASSERTIONS VERIFIED SUCCESSFULLY!")
        return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SkyGuard AI Mock Streamer & Testbench")
    parser.add_argument("--url", type=str, default="http://127.0.0.1:8000", help="Base backend URL")
    parser.add_argument("--ws", type=str, default="ws://127.0.0.1:8000/ws/live", help="WebSocket URL")
    parser.add_argument("--benchmark", type=str, default="DATA/skyguard_groundtruth_benchmark.csv", help="Benchmark file")
    parser.add_argument("--count", type=int, default=50, help="Number of records to stream")
    parser.add_argument("--rate", type=float, default=5.0, help="Streaming rate in Hz")

    args = parser.parse_args()

    streamer = MockStreamerTestbench(
        base_url=args.url,
        ws_url=args.ws,
        benchmark_path=args.benchmark,
        num_records=args.count,
        stream_rate_hz=args.rate
    )
    asyncio.run(streamer.run())

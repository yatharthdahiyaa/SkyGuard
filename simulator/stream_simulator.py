"""
SkyGuard AI - High-Speed Telemetry Stream Simulator
File: simulator/stream_simulator.py
Replays benchmark observations across MQTT and REST at configurable rates.
"""

import os
import sys
import time
import math
import json
import logging
import argparse
from datetime import datetime, timezone
from typing import Optional, Dict, Any

import pandas as pd
import requests

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] (%(name)s) %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("SkyGuard.Simulator")

# Magnus parameters for edge screening
MAGNUS_A = 17.67
MAGNUS_B = 243.5
MAGNUS_C = 6.112


def compute_edge_metadata(T: float, P: float, RH: float, prev_sample: Optional[Dict[str, float]] = None) -> Dict[str, Any]:
    """Microsecond edge sanity check calculating edge bitmask and deltas."""
    flag = 0x00
    td = None

    # Static bounds / Disconnect check
    if math.isnan(T) or math.isnan(P) or math.isnan(RH) or T <= -990.0 or RH > 105.0 or RH < -5.0:
        flag |= 0x01 | 0x10
    elif not (-20.0 <= T <= 60.0 and 800.0 <= P <= 1100.0 and 0.0 <= RH <= 100.0):
        flag |= 0x01

    # Dew point & supersaturation check
    if not (flag & 0x01):
        try:
            t_denom = T + MAGNUS_B
            if abs(t_denom) > 1e-4:
                es = MAGNUS_C * math.exp((MAGNUS_A * T) / t_denom)
                rh_c = min(max(RH, 0.01), 100.0)
                e = es * (rh_c / 100.0)
                ratio = max(e / MAGNUS_C, 1e-5)
                denom = MAGNUS_A - math.log(ratio)
                if abs(denom) > 1e-4:
                    td = round((MAGNUS_B * math.log(ratio)) / denom, 2)
                    if td > (T + 0.5):
                        flag |= 0x02
        except Exception:
            pass

    # Temporal jump / flatline check against previous sample
    t_step = 0.0
    p_step = 0.0
    rh_step = 0.0
    if prev_sample and not (flag & 0x01):
        t_step = round(T - prev_sample.get("T", T), 2)
        p_step = round(P - prev_sample.get("P", P), 2)
        rh_step = round(RH - prev_sample.get("RH", RH), 2)

        if abs(t_step) > 8.0 or abs(p_step) > 6.0 or abs(rh_step) > 30.0:
            flag |= 0x04
        if abs(t_step) < 1e-4 and abs(p_step) < 1e-4 and abs(rh_step) < 1e-4:
            flag |= 0x08

    desc = "EDGE_PASS" if flag == 0 else f"EDGE_FLAG_0x{flag:02X}"
    return {
        "flag": flag,
        "desc": desc,
        "td": td,
        "t_step": t_step,
        "p_step": p_step,
        "rh_step": rh_step
    }


class TelemetrySimulator:
    def __init__(
        self,
        dataset_path: str,
        backend_url: str = "http://backend:8000",
        mqtt_host: Optional[str] = "mosquitto",
        mqtt_port: int = 1883,
        rate_hz: float = 5.0,
        loop: bool = True,
        max_records: Optional[int] = None
    ):
        self.dataset_path = dataset_path
        self.backend_url = backend_url.rstrip("/")
        self.mqtt_host = mqtt_host
        self.mqtt_port = mqtt_port
        self.rate_hz = max(rate_hz, 0.1)
        self.loop = loop
        self.max_records = max_records

        self.mqtt_client = None
        self.http_session = requests.Session()
        self.prev_samples: Dict[str, Dict[str, float]] = {}

    def init_mqtt(self):
        if not self.mqtt_host:
            logger.info("MQTT disabled; streaming via REST gateway only.")
            return

        try:
            import paho.mqtt.client as mqtt
            self.mqtt_client = mqtt.Client(client_id=f"skyguard_sim_{int(time.time())}")
            self.mqtt_client.connect(self.mqtt_host, self.mqtt_port, keepalive=60)
            self.mqtt_client.loop_start()
            logger.info("Simulator connected to MQTT Broker @ %s:%d", self.mqtt_host, self.mqtt_port)
        except Exception as e:
            logger.warning("Could not connect to MQTT (%s); fallback to REST: %s", self.mqtt_host, e)
            self.mqtt_client = None

    def load_dataset(self) -> pd.DataFrame:
        candidates = [
            self.dataset_path,
            "DATA/skyguard_groundtruth_benchmark.parquet",
            "DATA/skyguard_groundtruth_benchmark.csv",
            "/app/DATA/skyguard_groundtruth_benchmark.parquet",
            "/app/DATA/skyguard_groundtruth_benchmark.csv",
            "../DATA/skyguard_groundtruth_benchmark.parquet",
            "../DATA/skyguard_groundtruth_benchmark.csv",
        ]

        for path in candidates:
            if path and os.path.exists(path):
                logger.info("Loading benchmark dataset from: %s", path)
                if path.endswith(".parquet"):
                    return pd.read_parquet(path)
                else:
                    return pd.read_csv(path)

        raise FileNotFoundError(f"Benchmark dataset not found in candidates: {candidates}")

    def run(self):
        self.init_mqtt()
        df = self.load_dataset()
        logger.info("Loaded %d benchmark records for simulation.", len(df))

        # Check required columns
        req_cols = ["station_id", "T_obs", "P_obs", "RH_obs"]
        for col in req_cols:
            if col not in df.columns:
                raise ValueError(f"Dataset missing required column: {col}")

        period = 1.0 / self.rate_hz
        total_streamed = 0
        cycle = 0

        while True:
            cycle += 1
            logger.info("Starting simulation iteration cycle %d...", cycle)
            
            for idx, row in df.iterrows():
                t_start = time.perf_counter()

                sid = str(row["station_id"])
                t_obs = float(row["T_obs"])
                p_obs = float(row["P_obs"])
                rh_obs = float(row["RH_obs"])

                prev = self.prev_samples.get(sid)
                edge_meta = compute_edge_metadata(t_obs, p_obs, rh_obs, prev)
                self.prev_samples[sid] = {"T": t_obs, "P": p_obs, "RH": rh_obs}

                # Construct RFC 3339 timestamp
                ts_val = row.get("timestamp")
                if pd.isna(ts_val) or not ts_val:
                    ts_str = datetime.now(timezone.utc).isoformat()
                elif isinstance(ts_val, pd.Timestamp):
                    ts_str = ts_val.isoformat()
                else:
                    ts_str = str(ts_val)

                payload = {
                    "station_id": sid,
                    "timestamp": ts_str,
                    "raw": {
                        "T": t_obs,
                        "P": p_obs,
                        "RH": rh_obs
                    },
                    "edge": edge_meta
                }

                # 1. Dispatch over MQTT if connected
                if self.mqtt_client:
                    topic = f"aws/{sid}/telemetry"
                    self.mqtt_client.publish(topic, json.dumps(payload), qos=0)

                # 2. Dispatch over REST Gateway
                try:
                    self.http_session.post(
                        f"{self.backend_url}/api/v1/telemetry/ingest",
                        json=payload,
                        timeout=0.8
                    )
                except Exception:
                    pass

                total_streamed += 1

                if total_streamed % 50 == 0:
                    logger.info("Streamed %d records | Last: %s T=%.1f°C P=%.1f RH=%.1f | Edge: %s",
                                total_streamed, sid, t_obs, p_obs, rh_obs, edge_meta["desc"])

                if self.max_records and total_streamed >= self.max_records:
                    logger.info("Reached maximum records limit (%d). Terminating.", self.max_records)
                    return

                elapsed = time.perf_counter() - t_start
                sleep_time = max(0.0, period - elapsed)
                if sleep_time > 0:
                    time.sleep(sleep_time)

            if not self.loop:
                logger.info("Simulation completed single pass over dataset.")
                break


def main():
    parser = argparse.ArgumentParser(description="SkyGuard AI Real-time Telemetry Simulator")
    parser.add_argument("--dataset", default=os.getenv("DATASET_PATH", "DATA/skyguard_groundtruth_benchmark.parquet"))
    parser.add_argument("--backend-url", default=os.getenv("BACKEND_URL", "http://127.0.0.1:8000"))
    parser.add_argument("--mqtt-host", default=os.getenv("MQTT_HOST", None))
    parser.add_argument("--mqtt-port", type=int, default=int(os.getenv("MQTT_PORT", "1883")))
    parser.add_argument("--rate-hz", type=float, default=float(os.getenv("RATE_HZ", "5.0")))
    parser.add_argument("--loop", action="store_true", default=os.getenv("LOOP", "false").lower() == "true")
    parser.add_argument("--max-records", type=int, default=None)

    args = parser.parse_args()

    simulator = TelemetrySimulator(
        dataset_path=args.dataset,
        backend_url=args.backend_url,
        mqtt_host=args.mqtt_host,
        mqtt_port=args.mqtt_port,
        rate_hz=args.rate_hz,
        loop=args.loop,
        max_records=args.max_records
    )
    simulator.run()


if __name__ == "__main__":
    main()

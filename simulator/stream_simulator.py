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

# Ensure parent directory is in sys.path for backend imports
_parent_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _parent_dir not in sys.path:
    sys.path.insert(0, _parent_dir)

try:
    from skyguard_backend.database import INITIAL_STATIONS
except ImportError:
    INITIAL_STATIONS = []

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
        max_records: Optional[int] = None,
        live_time: bool = True,
    ):
        self.dataset_path = dataset_path
        self.backend_url = backend_url.rstrip("/")
        self.mqtt_host = mqtt_host
        self.mqtt_port = mqtt_port
        self.rate_hz = max(rate_hz, 0.1)
        self.loop = loop
        self.max_records = max_records
        self.live_time = live_time

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

    def expand_to_full_network(self, df_base: pd.DataFrame) -> pd.DataFrame:
        """
        Synthesizes realistic, physically consistent mesoscale telemetry for all 46 IMD AWS stations
        (23 North India + 23 South/Western India) across the entire benchmark time range.
        Uses atmospheric lapse rates (-6.5°C/1000m), barometric hypsometric formulas, and
        regional microclimatic gradients so that spatial IDW consensus reflects 20-22 true neighbors.
        """
        if not INITIAL_STATIONS:
            return df_base

        base_sids = set(df_base["station_id"].astype(str).unique())
        extra_stations = [s for s in INITIAL_STATIONS if str(s["station_id"]) not in base_sids]

        if not extra_stations:
            return df_base

        logger.info(
            "Expanding simulation dataset: synthesizing mesoscale telemetry for %d additional stations across 46-station network...",
            len(extra_stations),
        )

        timestamps = df_base["timestamp"].unique()
        # Find anchor reference for South: Mumbai Airport 43003099999 or first available
        mumbai_subset = df_base[df_base["station_id"].astype(str) == "43003099999"]
        if mumbai_subset.empty:
            mumbai_subset = df_base[df_base["station_id"].astype(str) == str(df_base["station_id"].iloc[0])]
        mumbai_indexed = mumbai_subset.set_index("timestamp")

        extra_rows = []
        for ts in timestamps:
            if ts not in mumbai_indexed.index:
                continue
            ref_row = mumbai_indexed.loc[ts]
            ref_t = float(ref_row.get("T_clean", ref_row.get("T_obs", 31.0)))
            ref_p = float(ref_row.get("P_clean", ref_row.get("P_obs", 1008.0)))
            ref_rh = float(ref_row.get("RH_clean", ref_row.get("RH_obs", 70.0)))
            ref_h = 11.3  # Mumbai Airport baseline elevation

            for st in extra_stations:
                sid = str(st["station_id"])
                s_name = st["name"]
                lat = float(st["latitude"])
                lon = float(st["longitude"])
                h = float(st["elevation_m"])
                dh = h - ref_h

                # Microscale hash perturbation for sensor individuality
                hash_seed = (int(sid[-5:]) * 17 + int(h)) % 100
                micro_t = ((hash_seed % 11) - 5) * 0.04
                micro_p = ((hash_seed % 7) - 3) * 0.08
                micro_rh = ((hash_seed % 13) - 6) * 0.15

                if lat > 25.0:
                    # ── North India Cluster (Delhi-NCR / Haryana / Punjab / UP / Rajasthan) ──
                    # May pre-monsoon: ~4.5°C to 6.5°C warmer continental air mass, dry plains (20-45% RH)
                    lapse_dh = h - 215.0  # Elevation delta from Delhi plains (~215m)
                    t_north_base = ref_t + 5.2 - (0.0065 * lapse_dh) + micro_t
                    p_north_base = 991.0 * ((1.0 - 0.0065 * lapse_dh / 305.0) ** 5.255) + micro_p
                    rh_north_base = max(16.0, min(65.0, (ref_rh * 0.52) + micro_rh))

                    t_val = round(t_north_base, 2)
                    p_val = round(p_north_base, 2)
                    rh_val = round(rh_north_base, 2)
                else:
                    # ── South & Western Peninsular Cluster (Konkan / Mumbai / Pune / Ghats) ──
                    t_val = round(ref_t - (0.0065 * dh) + micro_t, 2)
                    p_val = round(ref_p * ((1.0 - 0.0065 * dh / (ref_t + 273.15)) ** 5.255) + micro_p, 2)
                    rh_val = round(max(20.0, min(98.0, ref_rh - (dh * 0.005) + micro_rh)), 2)

                extra_rows.append({
                    "timestamp": ts,
                    "station_id": sid,
                    "station_name": s_name,
                    "latitude": lat,
                    "longitude": lon,
                    "elevation_m": h,
                    "T_clean": t_val,
                    "P_clean": p_val,
                    "RH_clean": rh_val,
                    "T_obs": t_val,
                    "P_obs": p_val,
                    "RH_obs": rh_val,
                    "is_fault": False,
                    "fault_class": "NONE",
                    "affected_channel": "NONE",
                    "event_context": "MESOSCALE_SPATIAL_CLUSTER",
                    "severity": "INFO"
                })

        df_extra = pd.DataFrame(extra_rows)
        df_full = pd.concat([df_base, df_extra], ignore_index=True)
        df_full.sort_values(by=["timestamp", "station_id"], inplace=True)
        logger.info(
            "Expanded dataset ready: %d total observations across %d stations (23 North + 23 South/West).",
            len(df_full),
            df_full["station_id"].nunique(),
        )
        return df_full

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
                    df = pd.read_parquet(path)
                else:
                    df = pd.read_csv(path)
                return self.expand_to_full_network(df)

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
                if self.live_time:
                    ts_str = datetime.now(timezone.utc).isoformat()
                else:
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
                    logger.info("Streamed %d records | Last: %s (%s) T=%.1f°C P=%.1f RH=%.1f | Edge: %s",
                                total_streamed, sid, row.get("station_name", "AWS"), t_obs, p_obs, rh_obs, edge_meta["desc"])

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
    parser.add_argument("--rate-hz", type=float, default=float(os.getenv("RATE_HZ", "10.0")))
    parser.add_argument("--loop", action="store_true", default=os.getenv("LOOP", "false").lower() == "true")
    parser.add_argument("--max-records", type=int, default=None)
    parser.add_argument("--live-time", action="store_true", default=True, help="Emit current UTC timestamps")
    parser.add_argument("--no-live-time", dest="live_time", action="store_false", help="Preserve historical dataset timestamps")

    args = parser.parse_args()

    simulator = TelemetrySimulator(
        dataset_path=args.dataset,
        backend_url=args.backend_url,
        mqtt_host=args.mqtt_host,
        mqtt_port=args.mqtt_port,
        rate_hz=args.rate_hz,
        loop=args.loop,
        max_records=args.max_records,
        live_time=args.live_time,
    )
    simulator.run()


if __name__ == "__main__":
    main()

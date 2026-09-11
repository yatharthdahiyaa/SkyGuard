"""
===============================================================================
SkyGuard AI - Tier 1: The Station Edge Engine
Production-Grade Python Simulation & ESP32 Firmware Equivalent
File: edge_station_node.py

Hardware Constraints & Operational Context:
  - Target Profile: ESP32 / ARM Cortex-M4 class microcontroller.
  - Usable RAM for analytics: <= 30 KB (zero dynamic heap allocation).
  - Compute budget: <= 10 ms per sample cycle at 160 MHz.
  - Telemetry: MQTT over TLS/TCP with QoS 1 ("aws/{station_id}/telemetry").
  - Resilience: Local circular storage spooling (flash/SPIFFS simulation)
    to survive hours of radio outage without data loss.

Edge Processing Layers:
  - Module A: Static Boundaries & ADC Corruption Filter (<0.1 ms)
  - Module B: Fast Fixed-Point Thermodynamic Invariant Check (<1.0 ms)
  - Module C: Micro-Temporal Ring Buffer Analysis (<2.0 ms)
  - Module D: Local Status Encoding (Bitmask: 0x00 - 0x10)
===============================================================================
"""

import sys
import os
import time
import math
import json
import logging
import argparse
from typing import Dict, Any, List, Optional, Tuple
from collections import deque
import pandas as pd
import numpy as np

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] (%(name)s) %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("SkyGuard.EdgeNode")

# =============================================================================
# 1. CONSTANTS, BOUNDS & STATUS ENCODING
# =============================================================================

# Static Physical Operational Boundaries
EDGE_TEMP_MIN_C = -20.0
EDGE_TEMP_MAX_C = 60.0
EDGE_PRESS_MIN_HPA = 800.0
EDGE_PRESS_MAX_HPA = 1100.0
EDGE_HUMID_MIN_PCT = 0.0
EDGE_HUMID_MAX_PCT = 100.0

# ADC Rail / Disconnect Detection Thresholds
EDGE_ADC_DISCONNECT_TEMP = -990.0
EDGE_ADC_CORRUPT_HUMID = 105.0

# Temporal Jump Thresholds (per 5-min observation tick)
EDGE_SPIKE_DELTA_T_MAX = 8.0     # deg C
EDGE_SPIKE_DELTA_P_MAX = 6.0     # hPa
EDGE_SPIKE_DELTA_RH_MAX = 30.0   # %
EDGE_FROZEN_VARIANCE_MIN = 1e-5  # Flatline variance threshold

# August-Roche-Magnus Constants
MAGNUS_A = 17.67
MAGNUS_B = 243.5
MAGNUS_C = 6.112
SUPERSAT_THRESHOLD_C = 0.5       # Dew point > T + 0.5C indicates physical supersaturation

# System Capacities
EDGE_RING_BUFFER_SIZE = 12       # W = 12 samples (1 hour at 5-minute ticks)
EDGE_MAX_SPOOL_RECORDS = 500     # Spool queue capacity in non-volatile flash

# Edge Status Bitmasks
EDGE_PASS = 0x00
EDGE_ERR_OUT_OF_BOUNDS = 0x01
EDGE_ERR_THERMODYNAMIC_IMPOSSIBLE = 0x02
EDGE_SUSPECT_STEP_SPIKE = 0x04
EDGE_ERR_SENSOR_FROZEN = 0x08
EDGE_ERR_TELEMETRY_CORRUPT = 0x10

FLAG_NAMES = {
    EDGE_PASS: "EDGE_PASS",
    EDGE_ERR_OUT_OF_BOUNDS: "EDGE_ERR_OUT_OF_BOUNDS",
    EDGE_ERR_THERMODYNAMIC_IMPOSSIBLE: "EDGE_ERR_THERMODYNAMIC_IMPOSSIBLE",
    EDGE_SUSPECT_STEP_SPIKE: "EDGE_SUSPECT_STEP_SPIKE",
    EDGE_ERR_SENSOR_FROZEN: "EDGE_ERR_SENSOR_FROZEN",
    EDGE_ERR_TELEMETRY_CORRUPT: "EDGE_ERR_TELEMETRY_CORRUPT"
}


def decode_edge_flag(flag: int) -> str:
    """Decode integer bitmask into pipe-delimited descriptive string."""
    if flag == EDGE_PASS:
        return "EDGE_PASS"
    parts = []
    for mask in [EDGE_ERR_OUT_OF_BOUNDS, EDGE_ERR_THERMODYNAMIC_IMPOSSIBLE,
                 EDGE_SUSPECT_STEP_SPIKE, EDGE_ERR_SENSOR_FROZEN,
                 EDGE_ERR_TELEMETRY_CORRUPT]:
        if flag & mask:
            parts.append(FLAG_NAMES[mask])
    return "|".join(parts) if parts else "UNKNOWN"


# =============================================================================
# 2. MICRO-TEMPORAL RING BUFFER
# =============================================================================

class StaticRingBuffer:
    """
    Fixed-size FIFO circular buffer simulating MCU static memory allocation.
    Zero dynamic heap allocation during runtime.
    """
    def __init__(self, capacity: int = EDGE_RING_BUFFER_SIZE):
        self.capacity = capacity
        self.buffer = [None] * capacity
        self.head = 0
        self.count = 0

    def push(self, sample: Dict[str, float]) -> None:
        """Insert a sample into the circular buffer."""
        self.buffer[self.head] = sample
        self.head = (self.head + 1) % self.capacity
        if self.count < self.capacity:
            self.count += 1

    def get_latest(self) -> Optional[Dict[str, float]]:
        """Return the most recently pushed sample."""
        if self.count == 0:
            return None
        idx = (self.head - 1 + self.capacity) % self.capacity
        return self.buffer[idx]

    def get_previous(self) -> Optional[Dict[str, float]]:
        """Return the second most recently pushed sample."""
        if self.count < 2:
            return None
        idx = (self.head - 2 + self.capacity) % self.capacity
        return self.buffer[idx]

    def is_full(self) -> bool:
        return self.count == self.capacity

    def get_all_samples(self) -> List[Dict[str, float]]:
        """Return all valid samples currently in buffer in FIFO order."""
        if self.count < self.capacity:
            return [self.buffer[i] for i in range(self.count)]
        # When full, oldest item is at self.head
        return [self.buffer[(self.head + i) % self.capacity] for i in range(self.capacity)]


# =============================================================================
# 3. EDGE SCREENER ENGINE (Modules A, B, C, D)
# =============================================================================

class EdgeScreener:
    """
    Ultra-lightweight layered edge anomaly screener designed for sub-millisecond execution.
    """
    def __init__(self):
        pass

    @staticmethod
    def check_static_bounds(T: float, P: float, RH: float) -> int:
        """
        Module A: Static Boundaries & ADC Corruption Filter (< 0.1 ms).
        Flags NaN, Inf, bitflips, disconnected ADC rail pulls, or out of range.
        """
        # Check non-numeric, NaN, or Inf
        for val in [T, P, RH]:
            if val is None or math.isnan(val) or math.isinf(val):
                return EDGE_ERR_OUT_OF_BOUNDS | EDGE_ERR_TELEMETRY_CORRUPT

        # ADC Disconnected rail pulls (-999.0C) or hardware saturation (>105% RH)
        if T <= EDGE_ADC_DISCONNECT_TEMP or RH > EDGE_ADC_CORRUPT_HUMID or RH < -5.0:
            return EDGE_ERR_OUT_OF_BOUNDS

        # Physical operational bounds
        if not (EDGE_TEMP_MIN_C <= T <= EDGE_TEMP_MAX_C):
            return EDGE_ERR_OUT_OF_BOUNDS
        if not (EDGE_PRESS_MIN_HPA <= P <= EDGE_PRESS_MAX_HPA):
            return EDGE_ERR_OUT_OF_BOUNDS
        if not (EDGE_HUMID_MIN_PCT <= RH <= EDGE_HUMID_MAX_PCT):
            return EDGE_ERR_OUT_OF_BOUNDS

        return EDGE_PASS

    @staticmethod
    def check_thermodynamic_invariants(T: float, P: float, RH: float) -> Tuple[int, float]:
        """
        Module B: Fast Fixed-Point / Integer-Safe Thermodynamic Invariant Check (< 1.0 ms).
        Calculates saturation vapor pressure e_s(T), vapor pressure e, and dew point T_d
        using August-Roche-Magnus approximation.
        Rules:
          1. T_d > T + 0.5C (supersaturation beyond physical threshold)
          2. T > 40C and RH > 90% simultaneously without barometric depression (P >= 1000 hPa).
        """
        if any(v is None or math.isnan(v) for v in [T, P, RH]):
            return EDGE_ERR_THERMODYNAMIC_IMPOSSIBLE, -999.0
        if RH <= 0.0 or T < -80.0 or T > 100.0:
            return EDGE_ERR_THERMODYNAMIC_IMPOSSIBLE, -999.0

        try:
            # 1. Saturation vapor pressure (hPa)
            t_denom = T + MAGNUS_B
            if abs(t_denom) < 1e-4:
                return EDGE_ERR_THERMODYNAMIC_IMPOSSIBLE, -999.0
            es = MAGNUS_C * math.exp((MAGNUS_A * T) / t_denom)

            # 2. Actual vapor pressure (hPa)
            rh_clamped = min(max(RH, 0.01), 100.0)
            e = es * (rh_clamped / 100.0)

            # 3. Dew Point T_d (deg C)
            ratio = e / MAGNUS_C
            if ratio <= 1e-5:
                ratio = 1e-5
            log_val = math.log(ratio)
            denom = MAGNUS_A - log_val
            if abs(denom) < 1e-4:
                return EDGE_ERR_THERMODYNAMIC_IMPOSSIBLE, -999.0

            td = (MAGNUS_B * log_val) / denom
        except Exception:
            return EDGE_ERR_THERMODYNAMIC_IMPOSSIBLE, -999.0

        flag = EDGE_PASS
        # Rule 1: Supersaturation check
        if td > (T + SUPERSAT_THRESHOLD_C):
            flag |= EDGE_ERR_THERMODYNAMIC_IMPOSSIBLE

        # Rule 2: Extreme heat + high humidity without barometric depression
        if T > 40.0 and RH > 90.0 and P >= 1000.0:
            flag |= EDGE_ERR_THERMODYNAMIC_IMPOSSIBLE

        return flag, td

    @staticmethod
    def check_temporal_invariants(
        T: float, P: float, RH: float,
        ring_buffer: StaticRingBuffer
    ) -> Tuple[int, float, float, float]:
        """
        Module C: Micro-Temporal Ring Buffer Analysis (< 2.0 ms).
        Evaluates step change spikes against previous reading, and deadband / flatline
        variance over window W=12.
        """
        flag = EDGE_PASS
        t_step, p_step, rh_step = 0.0, 0.0, 0.0

        # Step jump check
        prev = ring_buffer.get_latest()
        if prev is not None:
            t_step = T - prev["T"]
            p_step = P - prev["P"]
            rh_step = RH - prev["RH"]

            if (abs(t_step) > EDGE_SPIKE_DELTA_T_MAX or
                abs(p_step) > EDGE_SPIKE_DELTA_P_MAX or
                abs(rh_step) > EDGE_SPIKE_DELTA_RH_MAX):
                flag |= EDGE_SUSPECT_STEP_SPIKE

        # Deadband / Flatline Check (variance over W=12)
        if ring_buffer.is_full():
            samples = ring_buffer.get_all_samples()
            ts = [s["T"] for s in samples]
            ps = [s["P"] for s in samples]
            rhs = [s["RH"] for s in samples]

            var_t = float(np.var(ts))
            var_p = float(np.var(ps))
            var_rh = float(np.var(rhs))

            if (var_t <= EDGE_FROZEN_VARIANCE_MIN or
                var_p <= EDGE_FROZEN_VARIANCE_MIN or
                var_rh <= EDGE_FROZEN_VARIANCE_MIN):
                flag |= EDGE_ERR_SENSOR_FROZEN

        return flag, t_step, p_step, rh_step

    def screen_observation(
        self,
        T: float, P: float, RH: float,
        ring_buffer: StaticRingBuffer
    ) -> Dict[str, Any]:
        """
        Executes full screener pipeline: Module A -> Module B -> Module C -> Aggregation.
        Returns edge analysis result dictionary.
        """
        t_start = time.perf_counter()

        # Module A: Static Bounds & ADC check
        flag_a = self.check_static_bounds(T, P, RH)

        # Module B: Thermodynamic Invariant
        flag_b, td = self.check_thermodynamic_invariants(T, P, RH)

        # Module C: Micro-temporal Ring Buffer Analysis
        flag_c, t_step, p_step, rh_step = self.check_temporal_invariants(T, P, RH, ring_buffer)

        # Aggregate bitmask
        aggregate_flag = flag_a | flag_b | flag_c
        desc = decode_edge_flag(aggregate_flag)

        # Update ring buffer if numeric
        if not (math.isnan(T) or math.isnan(P) or math.isnan(RH)):
            ring_buffer.push({"T": T, "P": P, "RH": RH})

        duration_us = (time.perf_counter() - t_start) * 1e6

        return {
            "flag": aggregate_flag,
            "desc": desc,
            "td": round(td, 2),
            "t_step": round(t_step, 2),
            "p_step": round(p_step, 2),
            "rh_step": round(rh_step, 2),
            "duration_us": round(duration_us, 2)
        }


# =============================================================================
# 4. RESILIENT FLASH SPOOL STORAGE (SPIFFS/Flash Simulation)
# =============================================================================

class CircularSpoolStorage:
    """
    Circular non-volatile storage spooler simulating SPIFFS / LittleFS on ESP32 flash.
    Enables weather stations to survive hours/days of cellular or LoRa network outages.
    """
    def __init__(self, capacity: int = EDGE_MAX_SPOOL_RECORDS, persist_path: Optional[str] = None):
        self.capacity = capacity
        self.persist_path = persist_path
        self.spool_deque: deque = deque(maxlen=capacity)
        self.total_queued = 0
        self.total_drained = 0
        self.total_dropped_overflow = 0

    def push(self, payload: Dict[str, Any]) -> None:
        """Enqueue payload when network is offline. Discards oldest if full."""
        if len(self.spool_deque) >= self.capacity:
            self.total_dropped_overflow += 1
        self.spool_deque.append(payload)
        self.total_queued += 1

    def pop(self) -> Optional[Dict[str, Any]]:
        """Pop oldest spooled payload (FIFO order) for telemetry catchup."""
        if self.spool_deque:
            self.total_drained += 1
            return self.spool_deque.popleft()
        return None

    def peek(self) -> Optional[Dict[str, Any]]:
        return self.spool_deque[0] if self.spool_deque else None

    def __len__(self) -> int:
        return len(self.spool_deque)

    def is_empty(self) -> bool:
        return len(self.spool_deque) == 0

    def save_checkpoint(self) -> None:
        """Persist in-flight spool to disk simulating flash persistence."""
        if not self.persist_path:
            return
        try:
            with open(self.persist_path, "w", encoding="utf-8") as f:
                for item in self.spool_deque:
                    f.write(json.dumps(item) + "\n")
        except Exception as e:
            logger.error("Failed to save flash spool checkpoint: %s", e)

    def load_checkpoint(self) -> None:
        """Restore un-transmitted spool from flash across reboot."""
        if not self.persist_path or not os.path.exists(self.persist_path):
            return
        try:
            with open(self.persist_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        self.spool_deque.append(json.loads(line))
            logger.info("Restored %d spooled records from flash storage", len(self.spool_deque))
        except Exception as e:
            logger.error("Failed to load flash spool checkpoint: %s", e)


# =============================================================================
# 5. RESILIENT MQTT TELEMETRY CLIENT
# =============================================================================

class ResilientMQTTClient:
    """
    Production IoT Telemetry Transport with network blackout resilience.
    Uses MQTT QoS 1. Automatically spools to Flash when network drops and
    drains queued data upon reconnection with rate-limiting.
    """
    def __init__(
        self,
        station_id: str,
        broker_host: Optional[str] = None,
        broker_port: int = 1883,
        use_mock: bool = True
    ):
        self.station_id = station_id
        self.broker_host = broker_host
        self.broker_port = broker_port
        self.use_mock = use_mock
        self.is_connected = False
        self.published_messages: List[Dict[str, Any]] = []
        self.topic = f"aws/{station_id}/telemetry"

        # Paho MQTT Client handle
        self._client = None
        if not self.use_mock and self.broker_host:
            try:
                import paho.mqtt.client as mqtt
                self._client = mqtt.Client(client_id=f"station_{station_id}_{int(time.time())}")
                self._client.on_connect = self._on_connect
                self._client.on_disconnect = self._on_disconnect
            except ImportError:
                logger.warning("paho-mqtt not available; falling back to mock transport.")
                self.use_mock = True

    def _on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            self.is_connected = True
            logger.info("MQTT Connected successfully to %s:%d", self.broker_host, self.broker_port)
        else:
            logger.warning("MQTT Connection refused with code %d", rc)

    def _on_disconnect(self, client, userdata, rc):
        self.is_connected = False
        logger.warning("MQTT Disconnected from broker (rc=%d)", rc)

    def connect(self) -> bool:
        if self.use_mock:
            self.is_connected = True
            return True
        if self._client and self.broker_host:
            try:
                self._client.connect(self.broker_host, self.broker_port, keepalive=60)
                self._client.loop_start()
                self.is_connected = True
                return True
            except Exception as e:
                logger.error("Failed to connect to MQTT broker: %s", e)
                self.is_connected = False
                return False
        return False

    def disconnect(self) -> None:
        self.is_connected = False
        if self._client:
            try:
                self._client.loop_stop()
                self._client.disconnect()
            except Exception:
                pass

    def publish_payload(self, payload: Dict[str, Any]) -> bool:
        """
        Attempts to publish telemetry payload. Returns True on success, False on network drop.
        """
        if not self.is_connected:
            return False

        if self.use_mock:
            self.published_messages.append(payload)
            return True
        else:
            try:
                msg_json = json.dumps(payload)
                info = self._client.publish(self.topic, msg_json, qos=1)
                return info.is_published()
            except Exception as e:
                logger.error("MQTT publish failed: %s", e)
                return False

    def drain_spool(self, spool: CircularSpoolStorage, max_burst: int = 50) -> int:
        """
        Drains spooled messages in FIFO sequence upon network restoration.
        """
        if not self.is_connected or spool.is_empty():
            return 0

        drained_count = 0
        while not spool.is_empty() and drained_count < max_burst:
            payload = spool.peek()
            if payload and self.publish_payload(payload):
                spool.pop()
                drained_count += 1
            else:
                # Still failing or publish failed
                break

        if drained_count > 0:
            logger.info("Successfully drained %d spooled records (Remaining: %d)",
                        drained_count, len(spool))
        return drained_count


# =============================================================================
# 6. EDGE STATION NODE ORCHESTRATOR
# =============================================================================

class EdgeStationNode:
    """
    Tier 1 Weather Station Edge Engine Runtime Node.
    Encapsulates sensor reading ingestion, layered screening, battery/RSSI simulation,
    local storage spooling, and resilient MQTT transmission.
    """
    def __init__(
        self,
        station_id: str,
        spool_path: Optional[str] = "EDGE/spool_storage.jsonl",
        use_mock_transport: bool = True,
        broker_host: Optional[str] = None
    ):
        self.station_id = station_id
        self.ring_buffer = StaticRingBuffer(EDGE_RING_BUFFER_SIZE)
        self.screener = EdgeScreener()
        self.spool = CircularSpoolStorage(capacity=EDGE_MAX_SPOOL_RECORDS, persist_path=spool_path)
        self.mqtt = ResilientMQTTClient(
            station_id=station_id,
            broker_host=broker_host,
            use_mock=use_mock_transport
        )
        self.vbat = 3.85   # Initial nominal battery voltage (3.60V - 4.20V LiFePO4 / Li-ion)
        self.rssi = -74    # Initial nominal cellular RSSI (-115 dBm to -60 dBm)
        self.cycle_count = 0

    def start(self) -> None:
        self.mqtt.connect()
        self.spool.load_checkpoint()
        logger.info("Station Node %s started (Spool queue: %d)", self.station_id, len(self.spool))

    def stop(self) -> None:
        self.spool.save_checkpoint()
        self.mqtt.disconnect()
        logger.info("Station Node %s stopped", self.station_id)

    def update_diagnostics(self) -> Tuple[float, int]:
        """Simulate realistic solar/battery diurnal drift and cellular RSSI fluctuation."""
        # Vbat small random walk within 3.65V to 4.15V
        noise_vbat = np.random.uniform(-0.01, 0.01)
        self.vbat = float(np.clip(self.vbat + noise_vbat, 3.65, 4.18))

        # RSSI cellular fluctuation within -105 dBm to -65 dBm
        noise_rssi = int(np.random.randint(-2, 3))
        self.rssi = int(np.clip(self.rssi + noise_rssi, -105, -65))

        return round(self.vbat, 2), self.rssi

    def process_sample(
        self,
        timestamp_iso: str,
        T: float,
        P: float,
        RH: float,
        force_blackout: bool = False
    ) -> Dict[str, Any]:
        """
        Full observation processing cycle:
          1. Update hardware diagnostics (vbat, rssi).
          2. Execute layered edge screening (< 3 ms).
          3. Format compact edge telemetry JSON.
          4. Publish to MQTT or enqueue to circular flash spool.
        """
        self.cycle_count += 1
        vbat, rssi = self.update_diagnostics()

        # Handle network connectivity simulation
        if force_blackout:
            if self.mqtt.is_connected:
                self.mqtt.is_connected = False
                logger.warning("[%s] Cell blackout started at cycle %d", self.station_id, self.cycle_count)
        else:
            if not self.mqtt.is_connected:
                self.mqtt.is_connected = True
                logger.info("[%s] Cell network restored at cycle %d! Draining spool...",
                            self.station_id, self.cycle_count)
                self.mqtt.drain_spool(self.spool, max_burst=100)

        # Execute Tier 1 Layered Screener
        edge_res = self.screener.screen_observation(T, P, RH, self.ring_buffer)

        # Build Compact Edge Telemetry Payload conforming to specification schema
        payload = {
            "sid": self.station_id,
            "ts": timestamp_iso,
            "raw": {
                "T": round(T, 2) if not math.isnan(T) else -999.0,
                "P": round(P, 2) if not math.isnan(P) else -999.0,
                "RH": round(RH, 2) if not math.isnan(RH) else -999.0
            },
            "edge": {
                "flag": int(edge_res["flag"]),
                "desc": edge_res["desc"],
                "td": edge_res["td"],
                "t_step": edge_res["t_step"],
                "p_step": edge_res["p_step"],
                "rh_step": edge_res["rh_step"]
            },
            "diag": {
                "vbat": vbat,
                "rssi": rssi,
                "spool_len": len(self.spool)
            }
        }

        # Resilient Telemetry Transmission: Publish or Spool
        if self.mqtt.is_connected:
            pub_ok = self.mqtt.publish_payload(payload)
            if not pub_ok:
                self.spool.push(payload)
        else:
            self.spool.push(payload)

        # Update diagnostic spool_len in returned record
        payload["diag"]["spool_len"] = len(self.spool)
        payload["edge"]["duration_us"] = edge_res["duration_us"]

        return payload


# =============================================================================
# 7. BENCHMARK STREAM REPLAY & VALIDATION
# =============================================================================

def run_simulation(
    benchmark_path: str,
    output_csv: str = "EDGE/edge_telemetry_log.csv",
    simulate_blackout: bool = True,
    sample_limit: Optional[int] = None
) -> pd.DataFrame:
    """
    Replays the real benchmark observation stream through Tier 1 Edge Nodes.
    Simulates cellular dropouts and verifies spooling without telemetry loss.
    """
    logger.info("Loading benchmark dataset: %s", benchmark_path)
    if benchmark_path.endswith(".parquet"):
        df = pd.read_parquet(benchmark_path)
    else:
        df = pd.read_csv(benchmark_path)

    if sample_limit:
        df = df.iloc[:sample_limit].copy()

    logger.info("Replaying %d observations across stations: %s", len(df), df["station_id"].unique())

    # Instantiate edge node per station
    stations: Dict[str, EdgeStationNode] = {}
    for sid in df["station_id"].unique():
        sid_str = str(sid)
        node = EdgeStationNode(
            station_id=f"AWS_{sid_str[:5]}",
            spool_path=f"EDGE/spool_{sid_str[:5]}.jsonl",
            use_mock_transport=True
        )
        node.start()
        stations[sid] = node

    results = []
    t_start_all = time.perf_counter()

    # Replay row by row — use enumerate counter (not DataFrame index) for blackout logic
    for row_counter, (_, row) in enumerate(df.iterrows()):
        sid = row["station_id"]
        node = stations[sid]

        ts_iso = str(row["timestamp"])
        t_val = float(row["T_obs"])
        p_val = float(row["P_obs"])
        rh_val = float(row["RH_obs"])

        # Inject simulated 15-minute cellular blackout every 120 samples
        # Outage duration: 3 consecutive 5-minute ticks
        in_blackout = False
        if simulate_blackout and (row_counter % 120 >= 30 and row_counter % 120 < 35):
            in_blackout = True

        payload = node.process_sample(
            timestamp_iso=ts_iso,
            T=t_val,
            P=p_val,
            RH=rh_val,
            force_blackout=in_blackout
        )

        results.append({
            "index": i,
            "station_id": sid,
            "station_name": row.get("station_name", "UNKNOWN"),
            "timestamp": ts_iso,
            "T_obs": t_val,
            "P_obs": p_val,
            "RH_obs": rh_val,
            "fault_class_groundtruth": row.get("fault_class", "NONE"),
            "edge_flag": payload["edge"]["flag"],
            "edge_desc": payload["edge"]["desc"],
            "edge_td": payload["edge"]["td"],
            "t_step": payload["edge"]["t_step"],
            "p_step": payload["edge"]["p_step"],
            "rh_step": payload["edge"]["rh_step"],
            "vbat": payload["diag"]["vbat"],
            "rssi": payload["diag"]["rssi"],
            "spool_len": payload["diag"]["spool_len"],
            "duration_us": payload["edge"]["duration_us"]
        })

    # Graceful stop
    for node in stations.values():
        node.stop()

    total_time = time.perf_counter() - t_start_all
    avg_us = (total_time / len(df)) * 1e6

    res_df = pd.DataFrame(results)
    out_dir = os.path.dirname(output_csv)
    if out_dir:  # handles case where output_csv has no directory component
        os.makedirs(out_dir, exist_ok=True)
    res_df.to_csv(output_csv, index=False)

    logger.info("Saved Edge Telemetry Log to %s (%d records)", output_csv, len(res_df))
    logger.info("Processing Performance: Total time = %.3f s | Avg per sample = %.2f us (%.4f ms)",
                total_time, avg_us, avg_us / 1000.0)

    # Summarize detection vs groundtruth
    print("\n" + "=" * 70)
    print("SKYGUARD AI - TIER 1 STATION EDGE ENGINE SUMMARY")
    print("=" * 70)
    print(f"Total Observations Screened: {len(res_df):,}")
    print(f"Average Screener Latency:    {avg_us:.2f} us (Limit: 10,000 us / 10 ms)")
    print("\n--- Edge Flag Distribution ---")
    print(res_df["edge_desc"].value_counts().to_string())

    print("\n--- Detection Alignment with Ground Truth Faults ---")
    cross_tab = pd.crosstab(res_df["fault_class_groundtruth"], res_df["edge_desc"])
    print(cross_tab.to_string())
    print("=" * 70 + "\n")

    return res_df


# =============================================================================
# 8. MAIN CLI DISPATCHER
# =============================================================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SkyGuard AI - Tier 1 Edge Station Node Simulator")
    parser.add_argument("--benchmark", type=str, default="DATA/skyguard_groundtruth_benchmark.parquet",
                        help="Path to benchmark dataset (.parquet or .csv)")
    parser.add_argument("--output-csv", type=str, default="EDGE/edge_telemetry_log.csv",
                        help="Output path for edge telemetry logs")
    parser.add_argument("--simulate-blackout", action="store_true", default=True,
                        help="Simulate periodic cellular network outages to test flash spooling")
    parser.add_argument("--samples", type=int, default=None,
                        help="Limit number of samples to process (for rapid debugging)")

    args = parser.parse_args()

    run_simulation(
        benchmark_path=args.benchmark,
        output_csv=args.output_csv,
        simulate_blackout=args.simulate_blackout,
        sample_limit=args.samples
    )

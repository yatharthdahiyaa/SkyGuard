"""
===============================================================================
SkyGuard AI - Tier 1: The Station Edge Engine
MicroPython Embedded Firmware Module
File: firmware_micropython_core.py

Compatible with MicroPython v1.19+ on ESP32 / RP2040 / STM32.
Zero third-party dependencies (only math, time, ujson/json).
Strictly bounded memory allocations for low-SRAM MCUs (<30 KB).
===============================================================================
"""

import math
import time
try:
    import ujson as json
except ImportError:
    import json

# Operational Invariant Bounds
EDGE_TEMP_MIN_C = -20.0
EDGE_TEMP_MAX_C = 60.0
EDGE_PRESS_MIN_HPA = 800.0
EDGE_PRESS_MAX_HPA = 1100.0
EDGE_HUMID_MIN_PCT = 0.0
EDGE_HUMID_MAX_PCT = 100.0

EDGE_ADC_DISCONNECT_TEMP = -990.0
EDGE_ADC_CORRUPT_HUMID = 105.0

EDGE_SPIKE_DELTA_T_MAX = 8.0
EDGE_SPIKE_DELTA_P_MAX = 6.0
EDGE_SPIKE_DELTA_RH_MAX = 30.0
EDGE_FROZEN_VARIANCE_MIN = 1e-5

MAGNUS_A = 17.67
MAGNUS_B = 243.5
MAGNUS_C = 6.112
SUPERSAT_THRESHOLD_C = 0.5

EDGE_PASS = 0x00
EDGE_ERR_OUT_OF_BOUNDS = 0x01
EDGE_ERR_THERMODYNAMIC_IMPOSSIBLE = 0x02
EDGE_SUSPECT_STEP_SPIKE = 0x04
EDGE_ERR_SENSOR_FROZEN = 0x08
EDGE_ERR_TELEMETRY_CORRUPT = 0x10


class MicroRingBuffer:
    """Fixed static ring buffer of size W=12 in MicroPython."""
    def __init__(self, size=12):
        self.size = size
        self.buf = [None] * size
        self.head = 0
        self.count = 0

    def push(self, t, p, rh):
        self.buf[self.head] = (t, p, rh)
        self.head = (self.head + 1) % self.size
        if self.count < self.size:
            self.count += 1

    def get_latest(self):
        if self.count == 0:
            return None
        idx = (self.head - 1 + self.size) % self.size
        return self.buf[idx]

    def variance(self):
        """Calculates variance over buffer for T, P, RH."""
        if self.count < self.size:
            return 1.0, 1.0, 1.0
        sum_t, sum_p, sum_rh = 0.0, 0.0, 0.0
        for i in range(self.size):
            sum_t += self.buf[i][0]
            sum_p += self.buf[i][1]
            sum_rh += self.buf[i][2]
        m_t = sum_t / self.size
        m_p = sum_p / self.size
        m_rh = sum_rh / self.size

        v_t, v_p, v_rh = 0.0, 0.0, 0.0
        for i in range(self.size):
            dt = self.buf[i][0] - m_t
            dp = self.buf[i][1] - m_p
            drh = self.buf[i][2] - m_rh
            v_t += dt * dt
            v_p += dp * dp
            v_rh += drh * drh
        return v_t / self.size, v_p / self.size, v_rh / self.size


class MicroEdgeEngine:
    """MicroPython Tier 1 Screener (< 2 ms on ESP32 160MHz)."""
    def __init__(self):
        self.rb = MicroRingBuffer(12)

    def process_sample(self, T, P, RH):
        flag = EDGE_PASS

        # 1. Bounds & Disconnect
        if T is None or P is None or RH is None or math.isnan(T) or math.isnan(P) or math.isnan(RH):
            flag |= (EDGE_ERR_OUT_OF_BOUNDS | EDGE_ERR_TELEMETRY_CORRUPT)
        elif T <= EDGE_ADC_DISCONNECT_TEMP or RH > EDGE_ADC_CORRUPT_HUMID or RH < -5.0:
            flag |= EDGE_ERR_OUT_OF_BOUNDS
        elif not (EDGE_TEMP_MIN_C <= T <= EDGE_TEMP_MAX_C and
                  EDGE_PRESS_MIN_HPA <= P <= EDGE_PRESS_MAX_HPA and
                  EDGE_HUMID_MIN_PCT <= RH <= EDGE_HUMID_MAX_PCT):
            flag |= EDGE_ERR_OUT_OF_BOUNDS

        # 2. Thermodynamic August-Roche-Magnus
        td = -999.0
        if not (flag & EDGE_ERR_OUT_OF_BOUNDS):
            try:
                rh_c = min(max(RH, 0.01), 100.0)
                es = MAGNUS_C * math.exp((MAGNUS_A * T) / (T + MAGNUS_B))
                e = es * (rh_c / 100.0)
                log_v = math.log(max(e / MAGNUS_C, 1e-5))
                td = (MAGNUS_B * log_v) / (MAGNUS_A - log_v)

                if td > (T + SUPERSAT_THRESHOLD_C):
                    flag |= EDGE_ERR_THERMODYNAMIC_IMPOSSIBLE
                if T > 40.0 and RH > 90.0 and P >= 1000.0:
                    flag |= EDGE_ERR_THERMODYNAMIC_IMPOSSIBLE
            except Exception:
                flag |= EDGE_ERR_THERMODYNAMIC_IMPOSSIBLE

        # 3. Temporal Ring Buffer
        t_step, p_step, rh_step = 0.0, 0.0, 0.0
        prev = self.rb.get_latest()
        if prev:
            t_step = T - prev[0]
            p_step = P - prev[1]
            rh_step = RH - prev[2]
            if (abs(t_step) > EDGE_SPIKE_DELTA_T_MAX or
                abs(p_step) > EDGE_SPIKE_DELTA_P_MAX or
                abs(rh_step) > EDGE_SPIKE_DELTA_RH_MAX):
                flag |= EDGE_SUSPECT_STEP_SPIKE

        if self.rb.count == self.rb.size:
            vt, vp, vrh = self.rb.variance()
            if (vt <= EDGE_FROZEN_VARIANCE_MIN or
                vp <= EDGE_FROZEN_VARIANCE_MIN or
                vrh <= EDGE_FROZEN_VARIANCE_MIN):
                flag |= EDGE_ERR_SENSOR_FROZEN

        if not (flag & EDGE_ERR_TELEMETRY_CORRUPT):
            self.rb.push(T, P, RH)

        desc = "EDGE_PASS" if flag == 0 else f"FLAG_{flag:#04x}"

        return {
            "flag": flag,
            "desc": desc,
            "td": round(td, 2),
            "t_step": round(t_step, 2),
            "p_step": round(p_step, 2),
            "rh_step": round(rh_step, 2)
        }


def format_telemetry_payload(station_id, ts, T, P, RH, edge_res, vbat=3.82, rssi=-74, spool_len=0):
    return json.dumps({
        "sid": station_id,
        "ts": ts,
        "raw": {"T": round(T, 2), "P": round(P, 2), "RH": round(RH, 2)},
        "edge": edge_res,
        "diag": {"vbat": vbat, "rssi": rssi, "spool_len": spool_len}
    })

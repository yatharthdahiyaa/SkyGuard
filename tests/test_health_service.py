"""
Unit tests for Per-Sensor Health Scoring and Degradation Trend Service
File: tests/test_health_service.py
"""

from datetime import datetime, timedelta, timezone
import pytest
from skyguard_backend import health_service


def test_nominal_station_health():
    sid = "TEST_STATION_NOMINAL"
    now = datetime.now(timezone.utc)
    
    # Record 10 healthy observations
    for i in range(10):
        ts = now - timedelta(minutes=10 * (10 - i))
        health_service.record_observation(
            station_id=sid,
            ts=ts,
            fault_type="NONE",
            severity="INFO",
            is_fault=False,
        )

    res = health_service.compute_health(sid, window_hours=24)
    assert res.composite == 100.0
    assert res.temperature.score == 100.0
    assert res.pressure.score == 100.0
    assert res.humidity.score == 100.0
    assert res.temperature.trend == "STABLE"


def test_temperature_fault_affects_only_temp_channel():
    sid = "TEST_STATION_TEMP_FAULT"
    now = datetime.now(timezone.utc)
    
    # 8 normal, 2 critical temp spike observations
    for i in range(8):
        health_service.record_observation(
            station_id=sid,
            ts=now - timedelta(minutes=15 * (10 - i)),
            fault_type="NONE",
            severity="INFO",
            is_fault=False,
        )
    for i in range(2):
        health_service.record_observation(
            station_id=sid,
            ts=now - timedelta(minutes=5 * (2 - i)),
            fault_type="SENSOR_SPIKE",
            severity="CRITICAL",
            is_fault=True,
            channels=["T"],
        )

    res = health_service.compute_health(sid, window_hours=24)
    # Temperature health should be degraded
    assert res.temperature.score < 100.0
    assert res.temperature.fault_count == 2
    # Pressure should remain 100% since SENSOR_SPIKE on temp didn't trigger pressure fault
    assert res.pressure.score == 100.0
    assert res.pressure.fault_count == 0


def test_degradation_trend_computation():
    sid = "TEST_STATION_DEGRADING"
    now = datetime.now(timezone.utc)
    
    # Baseline period (6h - 24h ago): 10 observations, 0 faults
    for i in range(10):
        health_service.record_observation(
            station_id=sid,
            ts=now - timedelta(hours=12) - timedelta(minutes=30 * i),
            fault_type="NONE",
            severity="INFO",
            is_fault=False,
        )

    # Recent period (last 6h): 6 observations, 3 faults (accelerating failure)
    for i in range(3):
        health_service.record_observation(
            station_id=sid,
            ts=now - timedelta(hours=2) - timedelta(minutes=30 * i),
            fault_type="SENSOR_DRIFT",
            severity="WARNING",
            is_fault=True,
        )
    for i in range(3):
        health_service.record_observation(
            station_id=sid,
            ts=now - timedelta(hours=4) - timedelta(minutes=30 * i),
            fault_type="NONE",
            severity="INFO",
            is_fault=False,
        )

    trend = health_service.compute_degradation_trend(sid, recent_hours=6, baseline_hours=24)
    assert trend["station_id"] == sid
    assert trend["system_status"] in ("DEGRADING", "CRITICAL")
    assert trend["channels"]["T"]["status"] in ("DEGRADING", "CRITICAL")
    assert trend["estimated_rul_days"] < 90.0


def test_health_history_tracking():
    sid = "TEST_STATION_HISTORY"
    now = datetime.now(timezone.utc)
    health_service.record_observation(
        station_id=sid,
        ts=now,
        fault_type="NONE",
        severity="INFO",
        is_fault=False,
    )
    health_service.record_health_snapshot(sid)
    history = health_service.get_station_health_history(sid)
    assert len(history) >= 1
    assert "composite" in history[0]
    assert "temperature" in history[0]

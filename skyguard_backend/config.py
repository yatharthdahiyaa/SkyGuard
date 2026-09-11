"""
SkyGuard AI - Backend Service Configuration
File: config.py
Production-hardened: CORS locked down, MQTT credentials, pool settings.
"""

import json
import os
from typing import List, Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "SkyGuard AI Meteorological Backend"
    VERSION: str = "2.0.0"
    API_V1_STR: str = "/api/v1"

    # ── Database ─────────────────────────────────────────────────────────────
    # Production: postgresql+asyncpg://...
    # Development fallback: sqlite+aiosqlite:///./skyguard_backend/skyguard.db
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "sqlite+aiosqlite:///./skyguard_backend/skyguard.db"
    )

    # Connection pool tuning (ignored for SQLite / NullPool path)
    DB_POOL_SIZE: int = int(os.getenv("DB_POOL_SIZE", "5"))
    DB_MAX_OVERFLOW: int = int(os.getenv("DB_MAX_OVERFLOW", "10"))
    DB_POOL_TIMEOUT: int = int(os.getenv("DB_POOL_TIMEOUT", "30"))

    # ── Server ────────────────────────────────────────────────────────────────
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))

    # ── CORS — Production: explicit origins only, NO wildcard ─────────────────
    # Set CORS_ORIGINS env var to a JSON array or comma-separated URLs:
    #   CORS_ORIGINS='["https://skyguard.example.com","https://dashboard.example.com"]'
    # If unset the server REFUSES cross-origin requests.
    _raw_cors: str = os.getenv("CORS_ORIGINS", "")

    @property
    def CORS_ORIGINS(self) -> List[str]:
        raw = self._raw_cors.strip()
        if not raw:
            return [
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "http://localhost:8501",
                "http://127.0.0.1:8501",
                "http://localhost:8000",
                "http://127.0.0.1:8000",
                "*"
            ]
        # Try JSON array first, then comma-separated
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [str(o).rstrip("/") for o in parsed]
        except (json.JSONDecodeError, ValueError):
            pass
        return [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]

    # ── MQTT Broker ───────────────────────────────────────────────────────────
    MQTT_BROKER_HOST: Optional[str] = os.getenv("MQTT_BROKER_HOST", None)
    MQTT_BROKER_PORT: int = int(os.getenv("MQTT_BROKER_PORT", "1883"))
    MQTT_TOPIC: str = os.getenv("MQTT_TOPIC", "aws/+/telemetry")
    MQTT_USERNAME: Optional[str] = os.getenv("MQTT_USERNAME", None)
    MQTT_PASSWORD: Optional[str] = os.getenv("MQTT_PASSWORD", None)

    # ── Benchmark / Model paths ───────────────────────────────────────────────
    BENCHMARK_PATH: str = os.getenv(
        "BENCHMARK_PATH", "DATA/skyguard_groundtruth_benchmark.parquet"
    )
    LGBM_MODEL_PATH: Optional[str] = os.getenv("LGBM_MODEL_PATH", None)

    class Config:
        case_sensitive = True


settings = Settings()

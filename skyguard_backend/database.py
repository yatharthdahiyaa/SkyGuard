"""
SkyGuard AI - Async Database Engine & Session Management
File: database.py
v2.0: Production AsyncAdaptedQueuePool for TimescaleDB; all 8 stations seeded.
"""

import logging
from datetime import datetime, timezone
from typing import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from skyguard_backend.config import settings
from skyguard_backend.models import Base, Station

logger = logging.getLogger("SkyGuard.Database")

# ---------------------------------------------------------------------------
# Engine — NullPool for SQLite (no persistent connection), proper pool for PG
# ---------------------------------------------------------------------------
_is_sqlite = settings.DATABASE_URL.startswith("sqlite")

_connect_args: dict = {}
if _is_sqlite:
    _connect_args["check_same_thread"] = False

if _is_sqlite:
    engine = create_async_engine(
        settings.DATABASE_URL,
        echo=False,
        connect_args=_connect_args,
        poolclass=NullPool,
    )
else:
    from sqlalchemy.pool import AsyncAdaptedQueuePool
    engine = create_async_engine(
        settings.DATABASE_URL,
        echo=False,
        connect_args=_connect_args,
        poolclass=AsyncAdaptedQueuePool,
        pool_size=settings.DB_POOL_SIZE,
        max_overflow=settings.DB_MAX_OVERFLOW,
        pool_timeout=settings.DB_POOL_TIMEOUT,
        pool_pre_ping=True,
    )

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency: provides an async database session per request."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ---------------------------------------------------------------------------
# Station seed data — both Maharashtra (south) and North India clusters
# ---------------------------------------------------------------------------
INITIAL_STATIONS = [
    # ── Maharashtra / West coast ──────────────────────────────────────────────
    {
        "station_id": "AWS_42921",
        "name": "Nasik Agro-Meteorological AWS",
        "latitude": 19.9975, "longitude": 73.7898, "elevation_m": 565.0,
    },
    {
        "station_id": "AWS_43003",
        "name": "CSMI Mumbai International Airport AWS",
        "latitude": 19.0897, "longitude": 72.8657, "elevation_m": 14.0,
    },
    {
        "station_id": "AWS_43057",
        "name": "Bombay Colaba Coastal Observatory",
        "latitude": 18.9067, "longitude": 72.8147, "elevation_m": 11.0,
    },
    {
        "station_id": "AWS_43063",
        "name": "Pune Shivajinagar Weather Station",
        "latitude": 18.5204, "longitude": 73.8567, "elevation_m": 560.0,
    },
    # Numeric IMD aliases (same coordinates — used by the benchmark dataset)
    {
        "station_id": "42921099999",
        "name": "Nasik City AWS (IMD-42921)",
        "latitude": 19.9667, "longitude": 73.8167, "elevation_m": 598.0,
    },
    {
        "station_id": "43003099999",
        "name": "CSMI Mumbai Airport AWS (IMD-43003)",
        "latitude": 19.0887, "longitude": 72.8679, "elevation_m": 11.27,
    },
    {
        "station_id": "43057099999",
        "name": "Bombay Colaba AWS (IMD-43057)",
        "latitude": 18.9000, "longitude": 72.8167, "elevation_m": 11.0,
    },
    {
        "station_id": "43063099999",
        "name": "Pune AWS (IMD-43063)",
        "latitude": 18.5333, "longitude": 73.8500, "elevation_m": 558.0,
    },

    # ── North India ───────────────────────────────────────────────────────────
    {
        "station_id": "AWS_42182",
        "name": "Delhi Safdarjung Weather Observatory",
        "latitude": 28.5845, "longitude": 77.2058, "elevation_m": 214.88,
    },
    {
        "station_id": "AWS_42139",
        "name": "Meerut Meteorological Station",
        "latitude": 29.0167, "longitude": 77.7167, "elevation_m": 222.0,
    },
    {
        "station_id": "AWS_42170",
        "name": "Churu Arid Zone AWS",
        "latitude": 28.2500, "longitude": 74.9167, "elevation_m": 291.0,
    },
    {
        "station_id": "AWS_42260",
        "name": "Agra Taj Mahal Weather Station",
        "latitude": 27.1558, "longitude": 77.9609, "elevation_m": 167.94,
    },
    # Numeric aliases for north India
    {
        "station_id": "42182099999",
        "name": "Delhi Safdarjung AWS (IMD-42182)",
        "latitude": 28.5845, "longitude": 77.2058, "elevation_m": 214.88,
    },
    {
        "station_id": "42139099999",
        "name": "Meerut AWS (IMD-42139)",
        "latitude": 29.0167, "longitude": 77.7167, "elevation_m": 222.0,
    },
    {
        "station_id": "42170099999",
        "name": "Churu AWS (IMD-42170)",
        "latitude": 28.2500, "longitude": 74.9167, "elevation_m": 291.0,
    },
    {
        "station_id": "42260099999",
        "name": "Agra AWS (IMD-42260)",
        "latitude": 27.1558, "longitude": 77.9609, "elevation_m": 167.94,
    },
]


async def init_db() -> None:
    """Initialise schema and seed all baseline AWS stations."""
    logger.info("Initialising database schema at %s ...", settings.DATABASE_URL)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        if "postgresql" in settings.DATABASE_URL:
            try:
                await conn.execute(
                    text(
                        "SELECT create_hypertable("
                        "'telemetry_records', 'timestamp', if_not_exists => TRUE);"
                    )
                )
                logger.info("TimescaleDB hypertable ready on 'telemetry_records'")
            except Exception as exc:
                logger.warning("TimescaleDB hypertable (may already exist): %s", exc)

    async with AsyncSessionLocal() as session:
        for data in INITIAL_STATIONS:
            existing = await session.get(Station, data["station_id"])
            if not existing:
                session.add(
                    Station(
                        station_id=data["station_id"],
                        name=data["name"],
                        latitude=data["latitude"],
                        longitude=data["longitude"],
                        elevation_m=data["elevation_m"],
                        status="HEALTHY",
                        last_seen=datetime.now(timezone.utc),
                    )
                )
        await session.commit()

    logger.info(
        "Database ready — %d stations registered (north + south India).",
        len(INITIAL_STATIONS),
    )

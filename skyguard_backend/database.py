"""
SkyGuard AI - Async Database Engine & Session Management
File: database.py
v2.0: Production AsyncAdaptedQueuePool for TimescaleDB; all 8 stations seeded.
"""

import logging
from datetime import datetime, timezone
from typing import AsyncGenerator

from sqlalchemy import text, event
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
    _connect_args["timeout"] = 30

if _is_sqlite:
    engine = create_async_engine(
        settings.DATABASE_URL,
        echo=False,
        connect_args=_connect_args,
        poolclass=NullPool,
    )

    @event.listens_for(engine.sync_engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA synchronous=NORMAL")
            cursor.execute("PRAGMA busy_timeout=30000")
        finally:
            cursor.close()
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
# Station seed data — 46 IMD AWS Stations (23 North India + 23 South/Western India)
# Providing 20-25 true local neighbours per mesoscale cluster for IDW consensus
# ---------------------------------------------------------------------------
INITIAL_STATIONS = [
    # ── 1. South & Western Peninsular Cluster (23 Stations) ───────────────────
    {
        "station_id": "43003099999",
        "name": "CSMI Mumbai International Airport AWS",
        "latitude": 19.0887, "longitude": 72.8679, "elevation_m": 11.3,
    },
    {
        "station_id": "43057099999",
        "name": "Bombay Colaba Coastal Observatory",
        "latitude": 18.9000, "longitude": 72.8167, "elevation_m": 11.0,
    },
    {
        "station_id": "43004099999",
        "name": "Santacruz IMD Regional AWS",
        "latitude": 19.0760, "longitude": 72.8777, "elevation_m": 14.0,
    },
    {
        "station_id": "43005099999",
        "name": "Thane Ram Maruti AWS",
        "latitude": 19.2183, "longitude": 72.9781, "elevation_m": 18.0,
    },
    {
        "station_id": "43006099999",
        "name": "Navi Mumbai Vashi AWS",
        "latitude": 19.0771, "longitude": 72.9986, "elevation_m": 9.0,
    },
    {
        "station_id": "43007099999",
        "name": "Kalyan Dombivli Agro-Urban AWS",
        "latitude": 19.2403, "longitude": 73.1305, "elevation_m": 16.0,
    },
    {
        "station_id": "43058099999",
        "name": "Alibag Geomagnetic Coastal AWS",
        "latitude": 18.6414, "longitude": 72.8722, "elevation_m": 8.0,
    },
    {
        "station_id": "43059099999",
        "name": "Dahanu North Konkan Marine Station",
        "latitude": 19.9700, "longitude": 72.7300, "elevation_m": 5.0,
    },
    {
        "station_id": "43060099999",
        "name": "Ratnagiri South Konkan Observatory",
        "latitude": 16.9944, "longitude": 73.3000, "elevation_m": 35.0,
    },
    {
        "station_id": "43063099999",
        "name": "Pune Shivajinagar Weather Station",
        "latitude": 18.5333, "longitude": 73.8500, "elevation_m": 558.0,
    },
    {
        "station_id": "43064099999",
        "name": "Pune Pashan IITM Atmospheric AWS",
        "latitude": 18.5393, "longitude": 73.8055, "elevation_m": 570.0,
    },
    {
        "station_id": "43065099999",
        "name": "Baramati Agro-Climatic Station",
        "latitude": 18.1519, "longitude": 74.5772, "elevation_m": 538.0,
    },
    {
        "station_id": "42921099999",
        "name": "Nasik City Agro-Meteorological AWS",
        "latitude": 19.9667, "longitude": 73.8167, "elevation_m": 598.0,
    },
    {
        "station_id": "42922099999",
        "name": "Ozar Airport HAL Weather Station",
        "latitude": 20.1192, "longitude": 73.9136, "elevation_m": 580.0,
    },
    {
        "station_id": "42923099999",
        "name": "Igatpuri Western Ghats Gateway AWS",
        "latitude": 19.6978, "longitude": 73.5592, "elevation_m": 600.0,
    },
    {
        "station_id": "43066099999",
        "name": "Mahabaleshwar Highland Observatory",
        "latitude": 17.9237, "longitude": 73.6586, "elevation_m": 1372.0,
    },
    {
        "station_id": "43067099999",
        "name": "Satara Krishna Valley AWS",
        "latitude": 17.6805, "longitude": 73.9934, "elevation_m": 742.0,
    },
    {
        "station_id": "43068099999",
        "name": "Kolhapur Shivaji University AWS",
        "latitude": 16.7050, "longitude": 74.2433, "elevation_m": 569.0,
    },
    {
        "station_id": "43069099999",
        "name": "Solapur Semi-Arid Plateau AWS",
        "latitude": 17.6599, "longitude": 75.9064, "elevation_m": 458.0,
    },
    {
        "station_id": "43070099999",
        "name": "Ahmednagar Drought-Prone Area AWS",
        "latitude": 19.0952, "longitude": 74.7496, "elevation_m": 649.0,
    },
    {
        "station_id": "43071099999",
        "name": "Chhatrapati Sambhajinagar Regional AWS",
        "latitude": 19.8762, "longitude": 75.3433, "elevation_m": 568.0,
    },
    {
        "station_id": "43072099999",
        "name": "Belgaum Sambra Peninsular AWS",
        "latitude": 15.8597, "longitude": 74.6186, "elevation_m": 762.0,
    },
    {
        "station_id": "43073099999",
        "name": "Panaji Goa Coastal Marine AWS",
        "latitude": 15.4909, "longitude": 73.8278, "elevation_m": 15.0,
    },

    # ── 2. North India Regional Cluster (23 Stations) ─────────────────────────
    {
        "station_id": "42182099999",
        "name": "Delhi Safdarjung Regional Observatory",
        "latitude": 28.5845, "longitude": 77.2058, "elevation_m": 214.9,
    },
    {
        "station_id": "42181099999",
        "name": "New Delhi Palam Airport AWS",
        "latitude": 28.5667, "longitude": 77.1000, "elevation_m": 233.0,
    },
    {
        "station_id": "42183099999",
        "name": "Lodhi Road IMD Headquarters AWS",
        "latitude": 28.5892, "longitude": 77.2215, "elevation_m": 211.0,
    },
    {
        "station_id": "42184099999",
        "name": "Delhi University Northern Ridge AWS",
        "latitude": 28.6942, "longitude": 77.2106, "elevation_m": 230.0,
    },
    {
        "station_id": "42185099999",
        "name": "Aya Nagar South Delhi AWS",
        "latitude": 28.4720, "longitude": 77.1280, "elevation_m": 260.0,
    },
    {
        "station_id": "42186099999",
        "name": "Noida Sector 62 Urban AWS",
        "latitude": 28.6250, "longitude": 77.3650, "elevation_m": 200.0,
    },
    {
        "station_id": "42187099999",
        "name": "Ghaziabad Industrial Zone AWS",
        "latitude": 28.6692, "longitude": 77.4538, "elevation_m": 214.0,
    },
    {
        "station_id": "42188099999",
        "name": "Gurugram Cyber City AWS",
        "latitude": 28.4595, "longitude": 77.0266, "elevation_m": 225.0,
    },
    {
        "station_id": "42189099999",
        "name": "Faridabad Badkhal Lake AWS",
        "latitude": 28.4089, "longitude": 77.3178, "elevation_m": 205.0,
    },
    {
        "station_id": "42139099999",
        "name": "Meerut Western UP Meteorological AWS",
        "latitude": 29.0167, "longitude": 77.7167, "elevation_m": 222.0,
    },
    {
        "station_id": "42260099999",
        "name": "Agra Taj Weather Observatory",
        "latitude": 27.1558, "longitude": 77.9609, "elevation_m": 168.0,
    },
    {
        "station_id": "42261099999",
        "name": "Aligarh Muslim University AWS",
        "latitude": 27.8974, "longitude": 78.0880, "elevation_m": 178.0,
    },
    {
        "station_id": "42262099999",
        "name": "Mathura Refinery Environmental AWS",
        "latitude": 27.4924, "longitude": 77.6737, "elevation_m": 174.0,
    },
    {
        "station_id": "42140099999",
        "name": "Muzaffarnagar Doab Agromet AWS",
        "latitude": 29.4700, "longitude": 77.7000, "elevation_m": 232.0,
    },
    {
        "station_id": "42141099999",
        "name": "Moradabad Ramganga Basin AWS",
        "latitude": 28.8386, "longitude": 78.7733, "elevation_m": 193.0,
    },
    {
        "station_id": "42137099999",
        "name": "Karnal ICAR National Dairy AWS",
        "latitude": 29.6857, "longitude": 76.9905, "elevation_m": 253.0,
    },
    {
        "station_id": "42138099999",
        "name": "Ambala Cantonment Synoptic AWS",
        "latitude": 30.3782, "longitude": 76.7767, "elevation_m": 264.0,
    },
    {
        "station_id": "42142099999",
        "name": "Rohtak Agro-Climatic Station",
        "latitude": 28.8955, "longitude": 76.6066, "elevation_m": 220.0,
    },
    {
        "station_id": "42143099999",
        "name": "Hisar HAU Arid Agromet AWS",
        "latitude": 29.1492, "longitude": 75.7217, "elevation_m": 215.0,
    },
    {
        "station_id": "42135099999",
        "name": "Patiala Aviation & Agro AWS",
        "latitude": 30.3398, "longitude": 76.3869, "elevation_m": 251.0,
    },
    {
        "station_id": "42136099999",
        "name": "Chandigarh Sub-Himalayan Airbase AWS",
        "latitude": 30.7333, "longitude": 76.7794, "elevation_m": 321.0,
    },
    {
        "station_id": "42170099999",
        "name": "Churu Thar Desert Boundary AWS",
        "latitude": 28.2500, "longitude": 74.9167, "elevation_m": 291.0,
    },
    {
        "station_id": "42171099999",
        "name": "Alwar Sariska Foothills AWS",
        "latitude": 27.5530, "longitude": 76.6346, "elevation_m": 271.0,
    },
]


async def init_db() -> None:
    """Initialise schema and seed all baseline AWS stations."""
    logger.info("Initialising database schema at %s ...", settings.DATABASE_URL)

    async with engine.begin() as conn:
        if _is_sqlite:
            try:
                await conn.execute(text("PRAGMA journal_mode=WAL;"))
                await conn.execute(text("PRAGMA synchronous=NORMAL;"))
                logger.info("SQLite WAL journal mode enabled.")
            except Exception as exc:
                logger.warning("Could not set SQLite WAL mode: %s", exc)

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
            else:
                existing.name = data["name"]
                existing.latitude = data["latitude"]
                existing.longitude = data["longitude"]
                existing.elevation_m = data["elevation_m"]
        await session.commit()

    logger.info(
        "Database ready — %d stations registered (north + south India).",
        len(INITIAL_STATIONS),
    )

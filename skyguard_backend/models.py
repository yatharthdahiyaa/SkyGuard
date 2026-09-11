"""
SkyGuard AI - Database Models & Pydantic Schemas
File: models.py
v2.0: BigInteger PK, new taxonomy columns, Pydantic v2 ConfigDict.
"""

from datetime import datetime, timezone
import uuid
from typing import Any, Dict, List, Optional

from sqlalchemy import (
    BigInteger, Boolean, Column, DateTime, Float,
    ForeignKey, Index, Integer, JSON, String, Text,
)
from sqlalchemy.orm import declarative_base, relationship
from pydantic import BaseModel, ConfigDict, Field

Base = declarative_base()


# =============================================================================
# 1. SQLALCHEMY ORM MODELS
# =============================================================================

class Station(Base):
    __tablename__ = "stations"

    station_id  = Column(String(32), primary_key=True, index=True)
    name        = Column(String(128), nullable=False)
    latitude    = Column(Float, nullable=False)
    longitude   = Column(Float, nullable=False)
    elevation_m = Column(Float, default=0.0)
    status      = Column(String(24), default="HEALTHY")   # HEALTHY | DEGRADED | CRITICAL | OFFLINE
    last_seen   = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    telemetry = relationship("TelemetryRecord", back_populates="station", cascade="all, delete-orphan")
    alerts    = relationship("Alert",           back_populates="station", cascade="all, delete-orphan")


class TelemetryRecord(Base):
    __tablename__ = "telemetry_records"

    # BigInteger PK with SQLite Integer variant for proper AUTOINCREMENT
    id          = Column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    timestamp   = Column(DateTime(timezone=True), nullable=False, index=True)
    station_id  = Column(String(32), ForeignKey("stations.station_id"), nullable=False, index=True)

    # Raw observations
    T_obs  = Column(Float, nullable=False)
    P_obs  = Column(Float, nullable=False)
    RH_obs = Column(Float, nullable=False)

    # Imputed / repaired values
    T_imputed  = Column(Float, nullable=False)
    P_imputed  = Column(Float, nullable=False)
    RH_imputed = Column(Float, nullable=False)

    # Edge screener output
    edge_flag = Column(Integer, default=0)

    # QC & classification (v2 taxonomy)
    qc_flag        = Column(String(48), default="FLAG_ORIGINAL_VALID")
    classification = Column(String(48), default="NOMINAL")        # new
    fault_type     = Column(String(48), default="NONE")
    is_fault       = Column(Boolean, default=False)
    severity       = Column(String(16), default="INFO")

    # Calibrated scores
    anomaly_score          = Column(Float, default=0.0)
    confidence             = Column(Float, default=1.0)
    neighbor_count         = Column(Integer, default=0)
    neighbor_agreement     = Column(Float, default=0.0)

    # Regional / isolated flags
    regional_event  = Column(Boolean, default=False)
    isolated_station = Column(Boolean, default=False)

    # JSON blob for per-variable evidence and correction detail
    evidence_json   = Column(JSON, nullable=True)
    correction_json = Column(JSON, nullable=True)

    # Natural language diagnostic
    diagnostic_msg = Column(Text, default="")

    station = relationship("Station", back_populates="telemetry")

    @property
    def fault_class(self) -> str:
        return self.fault_type

    __table_args__ = (
        Index("ix_station_timestamp", "station_id", "timestamp"),
    )


class Alert(Base):
    __tablename__ = "alerts"

    alert_id       = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    timestamp      = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    station_id     = Column(String(32), ForeignKey("stations.station_id"), nullable=False, index=True)
    severity       = Column(String(16), default="WARNING")   # INFO | WARNING | CRITICAL
    fault_type     = Column(String(48), nullable=False)
    classification = Column(String(48), default="NOMINAL")
    diagnostic_msg = Column(Text, nullable=False)
    acknowledged   = Column(Boolean, default=False)
    resolved_at    = Column(DateTime(timezone=True), nullable=True)

    station = relationship("Station", back_populates="alerts")


# =============================================================================
# 2. PYDANTIC V2 SCHEMAS  (ConfigDict replaces deprecated inner Config class)
# =============================================================================

class RawTelemetryPayload(BaseModel):
    T:  float = Field(..., description="Observed dry-bulb temperature in °C")
    P:  float = Field(..., description="Observed atmospheric pressure in hPa")
    RH: float = Field(..., description="Observed relative humidity in %")


class EdgeTelemetryMetadata(BaseModel):
    flag:    int            = Field(default=0,           description="Integer bitmask from edge screener")
    desc:    Optional[str]  = Field(default="EDGE_PASS", description="Edge status description")
    td:      Optional[float] = Field(default=None,       description="Edge-computed dew point °C")
    t_step:  Optional[float] = Field(default=None,       description="Step change ΔT")
    p_step:  Optional[float] = Field(default=None,       description="Step change ΔP")
    rh_step: Optional[float] = Field(default=None,       description="Step change ΔRH")


class TelemetryIngestRequest(BaseModel):
    station_id: str      = Field(..., description="Weather station ID, e.g. AWS_43003")
    timestamp:  datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="Observation UTC timestamp",
    )
    raw:  RawTelemetryPayload
    edge: Optional[EdgeTelemetryMetadata] = None


class TelemetryIngestResponse(BaseModel):
    status:      str
    station_id:  str
    received_at: datetime
    # Expose diagnosis summary immediately for REST callers
    fault_type:     Optional[str] = None
    classification: Optional[str] = None
    is_fault:       Optional[bool] = None


class StationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    station_id:     str
    name:           str
    latitude:       float
    longitude:      float
    elevation_m:    float
    status:         str
    last_seen:      Optional[datetime] = None
    latest_reading: Optional[Dict[str, Any]] = None


class TelemetryHistoryItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:               int
    timestamp:        datetime
    station_id:       str
    T_obs:            float
    P_obs:            float
    RH_obs:           float
    T_imputed:        float
    P_imputed:        float
    RH_imputed:       float
    is_fault:         bool
    fault_type:       str
    classification:   str
    qc_flag:          str
    anomaly_score:    float
    confidence:       float
    severity:         str
    regional_event:   bool
    isolated_station: bool
    neighbor_count:   int
    neighbor_agreement: float
    diagnostic_msg:   str


class AlertResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    alert_id:       str
    timestamp:      datetime
    station_id:     str
    severity:       str
    fault_type:     str
    classification: str
    diagnostic_msg: str
    acknowledged:   bool
    resolved_at:    Optional[datetime] = None


class WebSocketEvent(BaseModel):
    event:          str = "TELEMETRY_UPDATE"
    station_id:     str
    timestamp:      str
    observed:       Dict[str, float]
    repaired:       Dict[str, float]
    status:         str
    fault_type:     str
    classification: str
    confidence:     float
    anomaly_score:  float
    qc_flag:        str
    severity:       str
    regional_event: bool
    isolated_station: bool
    neighbor_count: int
    neighbor_agreement: float
    diagnostic:     str
    evidence:       Optional[Dict[str, Any]] = None
    correction:     Optional[Dict[str, Any]] = None
    per_variable:   Optional[Dict[str, Any]] = None

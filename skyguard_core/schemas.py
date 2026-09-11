"""
SkyGuard Core — Canonical Data Schemas
All Pydantic models shared across online backend, offline ML pipeline, and test suite.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

EPSILON: float = 1e-9


# =============================================================================
# ENUMERATIONS
# =============================================================================

class FaultType(str, Enum):
    """Complete fault taxonomy.  Replaces the old 5-class schema."""
    NONE = "NONE"
    SENSOR_SPIKE = "SENSOR_SPIKE"
    SENSOR_FROZEN = "SENSOR_FROZEN"
    SENSOR_DRIFT = "SENSOR_DRIFT"
    SENSOR_DROPOUT = "SENSOR_DROPOUT"
    PHYSICS_VIOLATION = "PHYSICS_VIOLATION"
    ISOLATED_STATION_ANOMALY = "ISOLATED_STATION_ANOMALY"
    FULL_STATION_ANOMALY = "FULL_STATION_ANOMALY"
    REGIONAL_WEATHER_EVENT = "REGIONAL_WEATHER_EVENT"
    INSUFFICIENT_CONTEXT = "INSUFFICIENT_CONTEXT"

    # Backwards compatibility aliases kept for ML pipeline label map
    SPIKE = "SENSOR_SPIKE"
    FROZEN = "SENSOR_FROZEN"
    DRIFT = "SENSOR_DRIFT"
    DROPOUT = "SENSOR_DROPOUT"
    PSYCHROMETRIC_VIOLATION = "PHYSICS_VIOLATION"


class ClassificationCode(str, Enum):
    NOMINAL = "NOMINAL"
    HARDWARE_FAULT = "HARDWARE_FAULT"
    SENSOR_ANOMALY = "SENSOR_ANOMALY"
    ISOLATED_STATION_ANOMALY = "ISOLATED_STATION_ANOMALY"
    REGIONAL_WEATHER_EVENT = "REGIONAL_WEATHER_EVENT"
    PHYSICS_VIOLATION = "PHYSICS_VIOLATION"
    INSUFFICIENT_CONTEXT = "INSUFFICIENT_CONTEXT"


class CorrectionMethod(str, Enum):
    SPATIAL_IDW = "SPATIAL_IDW"
    TEMPORAL_FORECAST = "TEMPORAL_FORECAST"
    STATION_MEDIAN = "STATION_MEDIAN"
    CLIMATOLOGICAL_FALLBACK = "CLIMATOLOGICAL_FALLBACK"
    NO_CORRECTION = "NO_CORRECTION"


class Severity(str, Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


# =============================================================================
# FEATURE VECTOR
# =============================================================================

#: Ordered list of feature column names — must stay in sync with FEATURE_COLS
#: in ml_analytics_pipeline.py and build_feature_vector().
FEATURE_COL_NAMES: List[str] = [
    "T_obs", "P_obs", "RH_obs",
    "dew_point_spread", "phys_violation_flag", "rh_supersat_excess",
    "temp_step_zscore", "pres_step_zscore", "rh_step_zscore",
    "is_frozen_flag", "temporal_anomaly_score",
    "T_spatial_resid", "P_spatial_resid", "RH_spatial_resid",
    "spatial_divergence_score",
]

FAULT_CLASS_MAP: Dict[str, int] = {
    "NONE": 0, "SPIKE": 1, "FROZEN": 2,
    "DRIFT": 3, "DROPOUT": 4, "PSYCHROMETRIC_VIOLATION": 5,
    # New aliases map to same integers for backward compat
    "SENSOR_SPIKE": 1, "SENSOR_FROZEN": 2, "SENSOR_DRIFT": 3,
    "SENSOR_DROPOUT": 4, "PHYSICS_VIOLATION": 5,
}
INV_FAULT_CLASS_MAP: Dict[int, str] = {
    0: "NONE", 1: "SENSOR_SPIKE", 2: "SENSOR_FROZEN",
    3: "SENSOR_DRIFT", 4: "SENSOR_DROPOUT", 5: "PHYSICS_VIOLATION",
}


class FeatureVector(BaseModel):
    """15-dimensional feature vector consumed by the LightGBM classifier."""
    model_config = ConfigDict(from_attributes=True)

    T_obs: float
    P_obs: float
    RH_obs: float
    dew_point_spread: float
    phys_violation_flag: float
    rh_supersat_excess: float
    temp_step_zscore: float
    pres_step_zscore: float
    rh_step_zscore: float
    is_frozen_flag: float
    temporal_anomaly_score: float
    T_spatial_resid: float
    P_spatial_resid: float
    RH_spatial_resid: float
    spatial_divergence_score: float

    def to_array(self) -> list:
        """Return feature values in canonical FEATURE_COL_NAMES order."""
        return [getattr(self, col) for col in FEATURE_COL_NAMES]


# =============================================================================
# SPATIAL CONSENSUS
# =============================================================================

class NeighborReading(BaseModel):
    """Single neighbor station reading used for IDW consensus."""
    station_id: str
    T: float
    P: float
    RH: float
    distance_km: float


class SpatialConsensus(BaseModel):
    """IDW-weighted consensus across neighboring stations."""
    model_config = ConfigDict(from_attributes=True)

    T_idw: Optional[float] = None
    P_idw: Optional[float] = None
    RH_idw: Optional[float] = None
    neighbor_count: int = 0
    consensus_available: bool = False
    contributing_stations: List[str] = Field(default_factory=list)
    # Uncertainty = weighted std-dev of neighbor values
    uncertainty_T: Optional[float] = None
    uncertainty_P: Optional[float] = None
    uncertainty_RH: Optional[float] = None
    # Regional event signal: fraction of neighbors that ALSO show a large departure
    corroborating_neighbors: int = 0
    corroboration_fraction: float = 0.0


# =============================================================================
# TEMPORAL STATE
# =============================================================================

class DriftScore(BaseModel):
    is_drift: bool = False
    median_residual: float = 0.0
    slope_c_per_hr: float = 0.0
    consistent_sign: bool = False
    valid_count: int = 0


class TemporalState(BaseModel):
    """Summarises temporal history of one station for the classifier."""
    model_config = ConfigDict(from_attributes=True)

    temporal_zscore_T: float = 0.0
    temporal_zscore_P: float = 0.0
    temporal_zscore_RH: float = 0.0
    is_frozen: bool = False
    drift: DriftScore = Field(default_factory=DriftScore)
    temporal_anomaly_score: float = 0.0
    history_length: int = 0


# =============================================================================
# EVIDENCE & CORRECTION
# =============================================================================

class VariableAnomaly(BaseModel):
    anomalous: bool
    score: float = Field(ge=0.0, le=1.0)
    evidence: List[str] = Field(default_factory=list)


class PerVariableAnomaly(BaseModel):
    temperature: VariableAnomaly
    pressure: VariableAnomaly
    humidity: VariableAnomaly


class EvidenceBundle(BaseModel):
    temperature_spatial_residual_c: Optional[float] = None
    humidity_spatial_residual_percent: Optional[float] = None
    pressure_spatial_residual_hpa: Optional[float] = None
    temperature_temporal_zscore: Optional[float] = None
    pressure_temporal_zscore: Optional[float] = None
    humidity_temporal_zscore: Optional[float] = None
    physics_violation: bool = False
    isolated_station: bool = False
    regional_corroboration_fraction: float = 0.0
    edge_flag: int = 0
    # Calibrated score components (transparent, auditable)
    temporal_score: float = 0.0
    spatial_score: float = 0.0
    cross_variable_score: float = 0.0
    persistence_score: float = 0.0


class UncertaintyEstimate(BaseModel):
    temperature_c: float
    pressure_hpa: float
    humidity_percent: float


class CorrectionResult(BaseModel):
    temperature_c: Optional[float] = None
    pressure_hpa: Optional[float] = None
    humidity_percent: Optional[float] = None
    method: CorrectionMethod = CorrectionMethod.NO_CORRECTION
    uncertainty: Optional[UncertaintyEstimate] = None
    contributing_stations: List[str] = Field(default_factory=list)
    neighbor_count: int = 0
    original_T: float
    original_P: float
    original_RH: float
    reason: str = ""


# =============================================================================
# TOP-LEVEL DIAGNOSIS RESULT
# =============================================================================

class DiagnosisResult(BaseModel):
    """
    Complete output produced by the classifier for one telemetry observation.
    This is the canonical response payload for both online and offline paths.
    """
    model_config = ConfigDict(from_attributes=True)

    station_id: str
    timestamp: Optional[datetime] = None

    # Top-level verdict
    classification: str          # ClassificationCode string
    fault_type: str              # FaultType string
    is_fault: bool
    severity: str                # Severity string
    confidence: float = Field(ge=0.0, le=1.0)
    anomaly_score: float = Field(ge=0.0, le=1.0)

    # Spatial context
    regional_event: bool = False
    isolated_station: bool = False
    neighbor_count: int = 0
    neighbor_agreement: float = Field(default=0.0, ge=0.0, le=1.0)

    # Detailed evidence breakdown
    evidence: EvidenceBundle
    per_variable: PerVariableAnomaly
    correction: CorrectionResult

    # Natural language diagnostic
    diagnosis: str

    # QC flag for legacy compatibility
    qc_flag: str = "FLAG_ORIGINAL_VALID"

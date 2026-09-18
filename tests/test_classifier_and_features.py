"""
Tests: skyguard_core.features, skyguard_core.classifier, skyguard_core.temporal
Covers feature vector construction, classification decision hierarchy,
temporal Z-score, frozen detection, and drift detection.
"""
import math
import pytest
from datetime import datetime, timezone
from skyguard_core.features import build_feature_vector
from skyguard_core.schemas import FeatureVector, FEATURE_COL_NAMES, SpatialConsensus, TemporalState, DriftScore


# =============================================================================
# FEATURE VECTOR TESTS
# =============================================================================

class TestBuildFeatureVector:
    def test_basic_nominal_returns_19_features(self):
        fv = build_feature_vector(25.0, 1013.0, 60.0)
        assert len(fv.to_array()) == 19

    def test_feature_col_names_count(self):
        assert len(FEATURE_COL_NAMES) == 19

    def test_diurnal_features_computed_from_timestamp(self):
        ts = datetime(2026, 6, 15, 12, 0, tzinfo=timezone.utc)  # noon
        fv = build_feature_vector(25.0, 1013.0, 60.0, timestamp=ts)
        # sin(2*pi*12/24) = sin(pi) ~= 0 (within floating point)
        assert abs(fv.hour_sin) < 0.001
        # cos(2*pi*12/24) = cos(pi) = -1
        assert abs(fv.hour_cos - (-1.0)) < 0.001

    def test_midnight_diurnal_features(self):
        ts = datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc)
        fv = build_feature_vector(25.0, 1013.0, 60.0, timestamp=ts)
        assert abs(fv.hour_sin) < 0.001  # sin(0) = 0
        assert abs(fv.hour_cos - 1.0) < 0.001  # cos(0) = 1

    def test_no_timestamp_uses_defaults(self):
        fv = build_feature_vector(25.0, 1013.0, 60.0)
        # Default is hour=0 (midnight), doy=1
        assert fv.hour_sin == 0.0
        assert fv.hour_cos == 1.0

    def test_physics_violation_flag_set_on_supersaturation(self):
        fv = build_feature_vector(25.0, 1013.0, 110.0)  # RH > 105%
        assert fv.phys_violation_flag >= 0.5

    def test_nominal_physics_flag_is_zero(self):
        fv = build_feature_vector(25.0, 1013.0, 60.0)
        assert fv.phys_violation_flag == 0.0

    def test_to_array_length_matches_feature_col_names(self):
        fv = build_feature_vector(30.0, 1010.0, 75.0)
        assert len(fv.to_array()) == len(FEATURE_COL_NAMES)

    def test_spatial_residuals_computed_when_consensus_available(self):
        spatial = SpatialConsensus(
            T_idw=27.0, P_idw=1012.0, RH_idw=65.0,
            neighbor_count=3, consensus_available=True,
            uncertainty_T=1.0, uncertainty_P=2.0, uncertainty_RH=5.0,
        )
        fv = build_feature_vector(32.0, 1013.0, 70.0, spatial=spatial)
        assert abs(fv.T_spatial_resid - 5.0) < 0.01  # 32.0 - 27.0

    def test_spatial_residuals_zero_when_no_consensus(self):
        fv = build_feature_vector(25.0, 1013.0, 60.0, spatial=None)
        assert fv.T_spatial_resid == 0.0
        assert fv.P_spatial_resid == 0.0
        assert fv.RH_spatial_resid == 0.0


# =============================================================================
# TEMPORAL MODULE TESTS
# =============================================================================

class TestTemporalZscore:
    def test_zscore_zero_with_no_history(self):
        from skyguard_core.temporal import compute_temporal_zscore
        assert compute_temporal_zscore([], 25.0) == 0.0
        assert compute_temporal_zscore([25.0], 25.0) == 0.0

    def test_zscore_spike_detected(self):
        from skyguard_core.temporal import compute_temporal_zscore
        history = [25.0, 25.1, 24.9, 25.0, 25.1]
        z = compute_temporal_zscore(history, 35.0)  # big jump
        assert z > 3.0

    def test_zscore_stable_readings_near_zero(self):
        from skyguard_core.temporal import compute_temporal_zscore
        history = [25.0, 25.0, 25.0, 25.0, 25.0]
        z = compute_temporal_zscore(history, 25.0)
        assert abs(z) < 0.1


class TestFrozenDetection:
    def test_frozen_on_flatline(self):
        from skyguard_core.temporal import is_frozen
        history = [25.0, 25.0, 25.0, 25.0]
        assert is_frozen(history, 25.0, window=5) == True

    def test_not_frozen_on_variable_data(self):
        from skyguard_core.temporal import is_frozen
        history = [24.0, 25.5, 23.8, 26.1]
        assert is_frozen(history, 25.0) == False


# =============================================================================
# CLASSIFIER DECISION HIERARCHY TESTS
# =============================================================================

class TestClassifier:
    def _fv(self, **kwargs):
        defaults = dict(
            T_obs=25.0, P_obs=1013.0, RH_obs=60.0,
            dew_point_spread=8.0, phys_violation_flag=0.0, rh_supersat_excess=0.0,
            temp_step_zscore=0.0, pres_step_zscore=0.0, rh_step_zscore=0.0,
            is_frozen_flag=0.0, temporal_anomaly_score=0.0,
            T_spatial_resid=0.0, P_spatial_resid=0.0, RH_spatial_resid=0.0,
            spatial_divergence_score=0.0,
        )
        defaults.update(kwargs)
        return FeatureVector(**defaults)

    def test_adc_disconnect_classified_as_dropout(self):
        from skyguard_core.classifier import classify
        fv = self._fv(T_obs=-999.0)
        result = classify(-999.0, 1013.0, 60.0, features=fv, spatial=None, temporal=None)
        assert result.fault_type == "SENSOR_DROPOUT"
        assert result.is_fault == True
        assert result.severity == "CRITICAL"

    def test_physics_violation_classified(self):
        # Magnus violation: phys_violation_flag=1.0 with valid raw values
        # (RH within bounds but Td > T — a genuine thermodynamic inconsistency)
        # The feature vector is pre-computed (as batch ML pipeline would do).
        # OOB raw RH (>100) triggers DROPOUT, so we use a valid RH here.
        from skyguard_core.classifier import classify
        fv = self._fv(phys_violation_flag=1.0, rh_supersat_excess=5.0)
        # Use valid raw values: T=25, P=1013, RH=99 — feature says violation via Td
        result = classify(25.0, 1013.0, 99.0, features=fv, spatial=None, temporal=None)
        assert result.fault_type == "PHYSICS_VIOLATION"
        assert result.is_fault == True

    def test_nominal_returns_none_fault(self):
        from skyguard_core.classifier import classify
        fv = self._fv()
        # Provide temporal state to avoid INSUFFICIENT_CONTEXT
        drift = DriftScore(is_drift=False)
        temporal = TemporalState(
            temporal_zscore_T=0.0, temporal_zscore_P=0.0, temporal_zscore_RH=0.0,
            is_frozen=False, drift=drift, temporal_anomaly_score=0.0, history_length=10,
        )
        result = classify(25.0, 1013.0, 60.0, features=fv, spatial=None, temporal=temporal)
        assert result.fault_type == "NONE"
        assert result.is_fault == False

    def test_frozen_flag_classified_as_frozen(self):
        from skyguard_core.classifier import classify
        # Trigger via is_frozen_flag in FeatureVector (batch ML path)
        fv = self._fv(is_frozen_flag=1.0, temporal_anomaly_score=0.7)
        drift = DriftScore(is_drift=False)
        temporal = TemporalState(
            temporal_zscore_T=0.0, temporal_zscore_P=0.0, temporal_zscore_RH=0.0,
            is_frozen=True, drift=drift, temporal_anomaly_score=0.7, history_length=10,
        )
        # Use valid raw values so dropout is NOT triggered
        result = classify(25.0, 1013.0, 60.0, features=fv, spatial=None, temporal=temporal)
        assert result.fault_type == "SENSOR_FROZEN"
        assert result.is_fault == True

    def test_confidence_within_0_1(self):
        from skyguard_core.classifier import classify
        fv = self._fv(phys_violation_flag=1.0)
        result = classify(25.0, 1013.0, 110.0, features=fv, spatial=None, temporal=None)
        assert 0.0 <= result.confidence <= 1.0

    def test_anomaly_score_within_0_1(self):
        from skyguard_core.classifier import classify
        fv = self._fv()
        result = classify(25.0, 1013.0, 60.0, features=fv, spatial=None, temporal=None)
        assert 0.0 <= result.anomaly_score <= 1.0

    def test_dropout_priority_over_physics(self):
        # ADC disconnect (priority 1) must win over physics violation (priority 2).
        from skyguard_core.classifier import classify
        fv = self._fv(T_obs=-999.0, phys_violation_flag=1.0)
        result = classify(-999.0, 1013.0, 110.0, features=fv, spatial=None, temporal=None)
        assert result.fault_type == "SENSOR_DROPOUT"


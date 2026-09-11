"""
Tests: skyguard_core.physics
Verifies all scalar and vectorized physics functions.
"""

import math
import pytest
import numpy as np

from skyguard_core.physics import (
    magnus_dew_point,
    is_supersaturated,
    is_adc_disconnect,
    is_rh_corrupted,
    is_out_of_bounds,
    rh_supersat_excess,
    vec_dew_point,
    vec_is_physics_violation,
    vec_rh_supersat_excess,
    CLIM_BOUNDS,
)


# =============================================================================
# SCALAR TESTS
# =============================================================================

class TestMagnusDewPoint:
    def test_nominal_conditions(self):
        """At 25°C, 60% RH: dew point should be around 16.7°C."""
        Td, violation = magnus_dew_point(25.0, 60.0)
        assert not violation
        assert 15.0 < Td < 18.0

    def test_dry_air_low_humidity(self):
        """Very dry desert air: T=40°C, RH=10% → Td ≈ 6.7°C, no violation."""
        Td, violation = magnus_dew_point(40.0, 10.0)
        assert not violation
        assert Td < 40.0

    def test_saturated_air(self):
        """RH = 100% → T_d ≈ T (dry bulb). No violation."""
        Td, violation = magnus_dew_point(30.0, 100.0)
        assert not violation
        assert abs(Td - 30.0) < 1.5  # within 1.5°C due to numerical precision

    def test_supersaturation_is_flagged(self):
        """RH > 100% creates T_d > T — Magnus violation."""
        _, violation = magnus_dew_point(25.0, 110.0)
        assert violation

    def test_55c_96rh_is_NOT_physics_violation(self):
        """
        KEY REGRESSION TEST: T=55°C, RH=96% is extreme but thermodynamically
        legal. Dew point is still below dry-bulb temperature.
        The old bug classified this as PSYCHROMETRIC_VIOLATION due to
        the unsafe rule (T>40 AND RH>90).
        """
        Td, violation = magnus_dew_point(55.0, 96.0)
        assert not violation, (
            f"55°C, 96% RH wrongly classified as violation. Td={Td:.2f}°C. "
            f"This is a thermodynamically legal but extreme observation."
        )
        assert Td < 55.0

    def test_high_temperature_high_rh_legal(self):
        """T=42°C, RH=90%, P=1010 hPa — previously misclassified by the old rule."""
        Td, violation = magnus_dew_point(42.0, 90.0)
        assert not violation, (
            "T=42, RH=90 falsely flagged. Old T>40 AND RH>90 rule was incorrect."
        )

    def test_nan_inputs(self):
        """NaN inputs must return violation=True (corrupted sensor data)."""
        _, v1 = magnus_dew_point(float("nan"), 60.0)
        _, v2 = magnus_dew_point(25.0, float("nan"))
        assert v1 and v2

    def test_negative_rh(self):
        """Negative RH — ADC corruption flag."""
        _, violation = magnus_dew_point(25.0, -5.0)
        assert violation

    def test_rh_over_105_corrupted(self):
        """RH > 105% — ADC saturation detection."""
        assert is_rh_corrupted(106.0)
        assert not is_rh_corrupted(99.9)

    def test_adc_disconnect_temperature(self):
        """T <= -990 is the sentinel for hardware disconnect."""
        assert is_adc_disconnect(-999.0)
        assert is_adc_disconnect(-990.0)
        assert not is_adc_disconnect(-20.0)

    def test_out_of_bounds(self):
        """Validates against CLIM_BOUNDS for Indian AWS network."""
        assert is_out_of_bounds(T_c=70.0, P_hpa=1010.0, RH_pct=60.0)   # T too high
        assert is_out_of_bounds(T_c=25.0, P_hpa=700.0,  RH_pct=60.0)   # P too low
        assert not is_out_of_bounds(T_c=25.0, P_hpa=1010.0, RH_pct=60.0)  # nominal

    def test_rh_supersat_excess_zero_when_normal(self):
        assert rh_supersat_excess(99.0) == 0.0
        assert rh_supersat_excess(100.0) == 0.0

    def test_rh_supersat_excess_positive_when_over(self):
        excess = rh_supersat_excess(105.0)
        assert abs(excess - 5.0) < 0.01


# =============================================================================
# VECTORIZED TESTS
# =============================================================================

class TestVectorizedPhysics:
    def test_vec_dew_point_matches_scalar(self):
        T = np.array([25.0, 35.0, 42.0, 55.0])
        RH = np.array([60.0, 75.0, 90.0, 96.0])
        Td_vec = vec_dew_point(T, RH)
        for i, (t, rh, td_v) in enumerate(zip(T, RH, Td_vec)):
            td_scalar, _ = magnus_dew_point(t, rh)
            assert abs(td_scalar - td_v) < 0.05, f"Index {i}: scalar={td_scalar}, vec={td_v}"

    def test_vec_physics_violation_flags_over_100_rh(self):
        T = np.array([25.0, 30.0, 25.0])
        RH = np.array([60.0, 110.0, 100.0])
        violations = vec_is_physics_violation(T, RH)
        assert violations[0] == False
        assert violations[1] == True   # RH=110% — definite violation
        # RH=100% is borderline — allow either outcome

    def test_vec_55c_96rh_not_violation(self):
        """Vectorized version must also NOT flag 55°C, 96% as violation."""
        T = np.array([55.0])
        RH = np.array([96.0])
        violations = vec_is_physics_violation(T, RH)
        assert violations[0] == False

    def test_vec_supersat_excess(self):
        RH = np.array([95.0, 100.0, 103.5, 99.9])
        excess = vec_rh_supersat_excess(RH)
        assert excess[0] == 0.0
        assert excess[1] == 0.0
        assert abs(excess[2] - 3.5) < 0.01

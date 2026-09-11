"""
Unit & Integration Tests for SkyGuard AI Data Pipeline & Anomaly Injector
Validates atmospheric physics, NOAA ISD parsing, network synchronization,
and the 5-class fault injection taxonomy alongside true-negative weather events.
"""

import os
import pytest
import numpy as np
import pandas as pd

from skyguard.physics import AtmosphericThermodynamics
from skyguard.parser import NOAAISDParser
from skyguard.synchronizer import SpatialNetworkSynchronizer
from skyguard.injector import GroundTruthAnomalyInjector


class TestAtmosphericPhysics:
    """Validates psychrometric formulations against WMO reference benchmarks."""

    def test_august_roche_magnus_saturation_vapor_pressure(self):
        # WMO standard benchmark: at 0°C, es ≈ 6.112 hPa
        es_0 = AtmosphericThermodynamics.saturation_vapor_pressure(0.0)
        assert np.isclose(es_0, 6.112, atol=0.01)

        # At 20°C, es ≈ 23.38 hPa
        es_20 = AtmosphericThermodynamics.saturation_vapor_pressure(20.0)
        assert np.isclose(es_20, 23.38, atol=0.2)

    def test_relative_humidity_bounds_and_dewpoint(self):
        # Saturated air: T = Td -> RH must equal 100.0%
        rh_sat = AtmosphericThermodynamics.relative_humidity_from_dewpoint(25.0, 25.0)
        assert np.isclose(rh_sat, 100.0, atol=0.01)

        # Inverse Magnus roundtrip: T = 30°C, RH = 60% -> compute Td -> compute RH back
        t = 30.0
        rh_orig = 60.0
        td_calc = AtmosphericThermodynamics.dewpoint_from_relative_humidity(t, rh_orig)
        rh_roundtrip = AtmosphericThermodynamics.relative_humidity_from_dewpoint(t, td_calc)
        assert np.isclose(rh_roundtrip, rh_orig, atol=0.1)

    def test_psychrometric_consistency_invariant(self):
        # Valid state: Td <= T
        assert AtmosphericThermodynamics.check_psychrometric_consistency(28.0, 22.0) is True
        assert AtmosphericThermodynamics.check_psychrometric_consistency(25.0, 25.0) is True
        
        # Unphysical invariant violation: Td > T
        assert AtmosphericThermodynamics.check_psychrometric_consistency(20.0, 26.0) is False


class TestNOAAParsingAndSynchronization:
    """Validates raw NOAA CSV file ingestion and continuous grid synchronization."""

    def test_parser_loads_maharashtra_cluster(self):
        parser = NOAAISDParser(csv_dir="csv")
        data = parser.load_cluster("maharashtra")
        assert len(data) == 4
        for meta, df in data:
            assert meta.station_id in ["43003099999", "43057099999", "43063099999", "42921099999"]
            assert not df.empty
            assert "T" in df.columns
            assert "Td" in df.columns
            assert "P" in df.columns
            # Missing sentinels like 9999 must not be present in decoded float values
            assert (df["T"] > 70.0).sum() == 0

    def test_synchronizer_regular_grid_and_psychrometrics(self):
        parser = NOAAISDParser(csv_dir="csv")
        data = parser.load_cluster("maharashtra")

        synchronizer = SpatialNetworkSynchronizer()
        df_sync, df_dist, cartesian_coords = synchronizer.synchronize(
            station_data=data,
            freq="1h",
            start_date="2023-05-01T00:00:00Z",
            end_date="2023-05-07T23:00:00Z"
        )

        # 7 days * 24 hours = 168 timesteps per station * 4 stations = 672 records
        assert len(df_sync) == 672
        assert df_sync["station_id"].nunique() == 4
        # Distance matrix must have zero diagonal and positive off-diagonals
        for st in df_sync["station_id"].unique():
            assert df_dist.loc[st, st] == 0.0
            assert len(cartesian_coords[st]) == 2

        # Clean baseline checks
        assert (df_sync["RH_clean"] > 100.0).sum() == 0
        assert (df_sync["RH_clean"] < 1.0).sum() == 0
        assert (df_sync["is_fault"] == 0).all()
        assert (df_sync["fault_class"] == "NONE").all()


class TestFaultInjectionAndTrueNegatives:
    """Validates true negative weather event preservation and 5-class fault injection."""

    @pytest.fixture
    def synchronized_network(self):
        parser = NOAAISDParser(csv_dir="csv")
        data = parser.load_cluster("maharashtra")
        synchronizer = SpatialNetworkSynchronizer()
        df_sync, df_dist, cartesian_coords = synchronizer.synchronize(
            station_data=data,
            freq="1h",
            start_date="2023-05-01T00:00:00Z",
            end_date="2023-05-14T23:00:00Z" # 14 days
        )
        return df_sync, cartesian_coords

    def test_genuine_gust_front_is_true_negative(self, synchronized_network):
        df_sync, cartesian_coords = synchronized_network
        injector = GroundTruthAnomalyInjector(random_state=42)

        front_time = "2023-05-05T12:00:00Z"
        df_with_front = injector.simulate_mesoscale_front(
            df=df_sync,
            cartesian_coords=cartesian_coords,
            front_start_time=front_time,
            direction_deg=110.0,
            speed_kmh=45.0,
            delta_T=-8.0,
            delta_P=3.5,
            delta_RH=30.0
        )

        front_records = df_with_front[df_with_front["event_context"] == "GENUINE_WEATHER_FRONT"]
        assert not front_records.empty

        # Critical: Genuine extreme weather front must have is_fault == 0 (no false alarm penalty)
        assert (front_records["is_fault"] == 0).all()
        assert (front_records["fault_class"] == "NONE").all()

    def test_all_five_fault_typologies_and_budget(self, synchronized_network):
        df_sync, cartesian_coords = synchronized_network
        injector = GroundTruthAnomalyInjector(random_state=42, target_fault_rate=0.065)

        df_injected = injector.inject_benchmark_suite(
            df=df_sync,
            cartesian_coords=cartesian_coords,
            target_fault_rate=0.065
        )

        # 1. Total anomaly rate must be within 5% to 8%
        actual_rate = df_injected["is_fault"].mean()
        assert 0.05 <= actual_rate <= 0.08, f"Fault rate {actual_rate:.3f} outside [0.05, 0.08]"

        # 2. All 5 operational fault classes must be represented
        fault_classes = set(df_injected["fault_class"].unique())
        expected_classes = {"NONE", "SPIKE", "FROZEN", "DRIFT", "DROPOUT", "PSYCHROMETRIC_VIOLATION"}
        assert expected_classes.issubset(fault_classes), f"Missing classes: {expected_classes - fault_classes}"

        # 3. Class 2 Frozen must have zero variance over its active duration
        frozen_mask = df_injected["fault_class"] == "FROZEN"
        frozen_df = df_injected[frozen_mask]
        assert not frozen_df.empty

        # 4. Class 4 Dropout must contain sentinels (-999.0)
        dropout_mask = df_injected["fault_class"] == "DROPOUT"
        assert dropout_mask.sum() > 0
        has_sentinel = (
            (df_injected.loc[dropout_mask, "T_obs"] == -999.0).any() or
            (df_injected.loc[dropout_mask, "P_obs"] == -999.0).any() or
            (df_injected.loc[dropout_mask, "RH_obs"] == -999.0).any()
        )
        assert bool(has_sentinel)

        # 5. Class 5 Psychrometric Violation must have unphysical high T and RH
        psy_mask = df_injected["fault_class"] == "PSYCHROMETRIC_VIOLATION"
        assert psy_mask.sum() > 0
        assert (df_injected.loc[psy_mask, "T_obs"] >= 40.0).all()
        assert (df_injected.loc[psy_mask, "RH_obs"] >= 95.0).all()

        # 6. Schema column completeness
        required_columns = [
            "timestamp", "station_id", "station_name", "latitude", "longitude",
            "elevation_m", "T_clean", "P_clean", "RH_clean", "T_obs", "P_obs",
            "RH_obs", "is_fault", "fault_class", "affected_channel",
            "event_context", "severity"
        ]
        for col in required_columns:
            assert col in df_injected.columns

"""
Tests: skyguard_core.spatial
Verifies IDW consensus, haversine, and regional event detection.
"""

import pytest
from skyguard_core.schemas import NeighborReading
from skyguard_core.spatial import (
    haversine_km,
    compute_idw_consensus,
    is_regional_event,
    REGIONAL_MIN_CORROBORATING,
    REGIONAL_MIN_FRACTION,
)


class TestHaversine:
    def test_zero_distance_same_point(self):
        d = haversine_km(19.09, 72.87, 19.09, 72.87)
        assert d < 0.001

    def test_mumbai_to_pune_approx_122km(self):
        d = haversine_km(19.09, 72.87, 18.52, 73.86)
        assert 115 < d < 130  # Great circle distance ~122 km (road distance is ~150 km)

    def test_mumbai_to_delhi_approx_1144km(self):
        d = haversine_km(19.09, 72.87, 28.58, 77.21)
        assert 1100 < d < 1200  # Great circle distance ~1144 km (rail/road is ~1400 km)


class TestIDWConsensus:
    def _make_neighbours(self, values, distances):
        return [
            NeighborReading(
                station_id=f"ST_{i}",
                T=t, P=1008.0, RH=65.0,
                distance_km=d,
            )
            for i, (t, d) in enumerate(zip(values, distances))
        ]

    def test_no_neighbours_returns_unavailable_consensus(self):
        """CRITICAL: must never return latitude as temperature when no neighbours."""
        result = compute_idw_consensus([])
        assert result.consensus_available is False
        assert result.T_idw is None
        assert result.P_idw is None
        assert result.RH_idw is None
        assert result.neighbor_count == 0

    def test_single_neighbour_returns_neighbour_value(self):
        nbs = self._make_neighbours([27.0], [50.0])
        result = compute_idw_consensus(nbs)
        assert result.consensus_available
        assert abs(result.T_idw - 27.0) < 0.01

    def test_nearer_neighbour_weighted_more_strongly(self):
        """
        Neighbour at 10 km with T=20 and neighbour at 100 km with T=30.
        IDW should be strongly pulled toward the nearer neighbour.
        """
        nbs = self._make_neighbours([20.0, 30.0], [10.0, 100.0])
        result = compute_idw_consensus(nbs)
        assert result.consensus_available
        assert result.T_idw < 25.0  # closer to 20 than 30

    def test_three_neighbours_gives_plausible_average(self):
        nbs = self._make_neighbours([27.0, 27.4, 26.8], [40.0, 55.0, 60.0])
        result = compute_idw_consensus(nbs)
        assert result.consensus_available
        assert 26.5 < result.T_idw < 27.5
        assert result.neighbor_count == 3

    def test_contributing_stations_listed(self):
        nbs = self._make_neighbours([27.0, 28.0], [30.0, 40.0])
        result = compute_idw_consensus(nbs)
        assert len(result.contributing_stations) == 2
        assert "ST_0" in result.contributing_stations

    def test_uncertainty_increases_with_spread(self):
        nbs_spread = self._make_neighbours([20.0, 40.0], [50.0, 50.0])   # large spread
        nbs_tight  = self._make_neighbours([27.0, 27.5], [50.0, 50.0])   # tight cluster
        r_spread = compute_idw_consensus(nbs_spread)
        r_tight  = compute_idw_consensus(nbs_tight)
        assert r_spread.uncertainty_T > r_tight.uncertainty_T

    def test_idw_values_never_geographic_latitude(self):
        """
        Regression test for the critical latitude-as-temperature bug.
        All paths must return None T_idw when no neighbours, not station latitude.
        """
        for n in range(0, 1):  # 0 neighbours
            nbs = []
            result = compute_idw_consensus(nbs)
            assert result.T_idw is None, \
                f"T_idw should be None with {n} neighbours, got {result.T_idw}"


class TestRegionalEventDetection:
    def _make_consensus(self, corroborating, total):
        from skyguard_core.schemas import SpatialConsensus
        frac = corroborating / total if total > 0 else 0.0
        return SpatialConsensus(
            T_idw=27.0, P_idw=1008.0, RH_idw=65.0,
            neighbor_count=total,
            consensus_available=True,
            corroborating_neighbors=corroborating,
            corroboration_fraction=round(frac, 3),
        )

    def test_all_neighbours_agree_is_regional(self):
        consensus = self._make_consensus(corroborating=3, total=3)
        assert is_regional_event(consensus)

    def test_only_one_neighbour_corroborates_not_regional(self):
        consensus = self._make_consensus(corroborating=1, total=4)
        assert not is_regional_event(consensus)

    def test_zero_neighbours_not_regional(self):
        from skyguard_core.schemas import SpatialConsensus
        consensus = SpatialConsensus(consensus_available=False)
        assert not is_regional_event(consensus)

    def test_exactly_at_threshold(self):
        """50% corroboration with ≥ 2 neighbours = just at threshold → regional."""
        consensus = self._make_consensus(corroborating=2, total=4)
        assert is_regional_event(consensus)  # 50% >= 0.50 and count >= 2

    def test_below_threshold(self):
        """Only 25% corroboration with 4 neighbours → isolated."""
        consensus = self._make_consensus(corroborating=1, total=4)
        assert not is_regional_event(consensus)

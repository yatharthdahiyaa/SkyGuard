"""
Spatial Network Synchronizer for SkyGuard AI
Resamples multi-station meteorological time series onto a regular spatial-temporal grid,
handles missing intervals via time-weighted interpolation, derives psychrometric variables,
and produces a baseline clean multi-station dataset adhering to WMO standards.
"""

from typing import List, Optional, Tuple, Dict
import numpy as np
import pandas as pd
from scipy.interpolate import CubicSpline

from skyguard.parser import AWSStationMetadata
from skyguard.physics import AtmosphericThermodynamics


class SpatialNetworkSynchronizer:
    """
    Synchronizes multi-station weather observations onto a unified continuous temporal grid.
    """

    def __init__(self, earth_radius_km: float = 6371.0):
        self.earth_radius_km = earth_radius_km

    def calculate_distance_matrix(self, stations: List[AWSStationMetadata]) -> Tuple[pd.DataFrame, Dict[str, Tuple[float, float]]]:
        """
        Computes pairwise Haversine distances in kilometers between all stations.
        Also returns local Cartesian planar offsets (dx_km, dy_km) relative to network centroid.
        """
        n = len(stations)
        st_ids = [s.station_id for s in stations]
        dist_matrix = np.zeros((n, n), dtype=float)

        lats = np.array([s.latitude for s in stations])
        lons = np.array([s.longitude for s in stations])

        # Centroid coordinates
        lat0 = np.mean(lats)
        lon0 = np.mean(lons)
        lat0_rad = np.radians(lat0)

        # Planar offsets (x = East, y = North) in km
        cartesian_coords: Dict[str, Tuple[float, float]] = {}
        for s in stations:
            dx = (s.longitude - lon0) * (111.320 * np.cos(lat0_rad))
            dy = (s.latitude - lat0) * 110.574
            cartesian_coords[s.station_id] = (dx, dy)

        # Pairwise Haversine
        for i in range(n):
            for j in range(n):
                if i == j:
                    dist_matrix[i, j] = 0.0
                else:
                    phi1, phi2 = np.radians(lats[i]), np.radians(lats[j])
                    delta_phi = np.radians(lats[j] - lats[i])
                    delta_lambda = np.radians(lons[j] - lons[i])
                    a = np.sin(delta_phi / 2.0)**2 + np.cos(phi1) * np.cos(phi2) * np.sin(delta_lambda / 2.0)**2
                    c = 2.0 * np.arctan2(np.sqrt(a), np.sqrt(1.0 - a))
                    dist_matrix[i, j] = self.earth_radius_km * c

        df_dist = pd.DataFrame(dist_matrix, index=st_ids, columns=st_ids)
        return df_dist, cartesian_coords

    def synchronize(
        self,
        station_data: List[Tuple[AWSStationMetadata, pd.DataFrame]],
        freq: str = "1h",
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        use_cubic_spline: bool = False
    ) -> Tuple[pd.DataFrame, pd.DataFrame, Dict[str, Tuple[float, float]]]:
        """
        Resamples and synchronizes all stations onto a continuous temporal grid.
        Derives psychrometric RH_clean, Td_clean, and initializes ground-truth baseline schema.
        
        Returns:
            df_synchronized: Unified multi-station DataFrame
            df_distances: Pairwise distance matrix (km)
            cartesian_coords: Dictionary of station (x_km, y_km) relative coordinates
        """
        if not station_data:
            raise ValueError("No station data provided to synchronizer")

        stations = [meta for meta, _ in station_data]
        df_dist, cartesian_coords = self.calculate_distance_matrix(stations)

        # Determine temporal grid bounds
        if start_date is not None:
            t_start = pd.to_datetime(start_date, utc=True)
        else:
            # Overlap start
            t_start = max(df["timestamp"].min() for _, df in station_data)

        if end_date is not None:
            t_end = pd.to_datetime(end_date, utc=True)
        else:
            # Overlap end
            t_end = min(df["timestamp"].max() for _, df in station_data)

        if t_start >= t_end:
            raise ValueError(f"Invalid temporal interval: start {t_start} >= end {t_end}")

        grid = pd.date_range(start=t_start, end=t_end, freq=freq, tz="UTC")
        print(f"[SYNCHRONIZE] Building grid from {t_start} to {t_end} at freq '{freq}' ({len(grid)} timesteps per station)")

        station_dfs = []

        for meta, raw_df in station_data:
            sub = raw_df.set_index("timestamp").sort_index()

            # Align with grid
            union_idx = sub.index.union(grid).sort_values()
            reindexed = sub.reindex(union_idx)

            # Interpolate small gaps
            if use_cubic_spline and len(sub) > 10:
                # Cubic spline interpolation for high frequency
                t_numeric = (reindexed.index - t_start).total_seconds()
                valid_mask = reindexed["T"].notna()
                if valid_mask.sum() > 4:
                    cs_t = CubicSpline(t_numeric[valid_mask], reindexed.loc[valid_mask, "T"], extrapolate=True)
                    reindexed["T"] = cs_t(t_numeric)
                valid_mask_td = reindexed["Td"].notna()
                if valid_mask_td.sum() > 4:
                    cs_td = CubicSpline(t_numeric[valid_mask_td], reindexed.loc[valid_mask_td, "Td"], extrapolate=True)
                    reindexed["Td"] = cs_td(t_numeric)
                valid_mask_p = reindexed["P"].notna()
                if valid_mask_p.sum() > 4:
                    cs_p = CubicSpline(t_numeric[valid_mask_p], reindexed.loc[valid_mask_p, "P"], extrapolate=True)
                    reindexed["P"] = cs_p(t_numeric)
            else:
                # Standard time-weighted linear interpolation
                reindexed[["T", "Td", "P"]] = reindexed[["T", "Td", "P"]].interpolate(
                    method="time", limit_direction="both"
                )

            # Sample back to target grid
            aligned = reindexed.reindex(grid).copy()

            # Ensure clean physical boundaries
            aligned["T"] = aligned["T"].ffill().bfill()
            aligned["Td"] = aligned["Td"].ffill().bfill()
            aligned["P"] = aligned["P"].ffill().bfill()

            # Enforce psychrometric physical consistency for clean baseline (Td <= T)
            # In clean baseline, physical atmosphere cannot sustain supersaturation in clear air
            aligned["Td"] = np.minimum(aligned["Td"], aligned["T"])

            # Derive psychrometric clean Relative Humidity
            rh_clean = AtmosphericThermodynamics.relative_humidity_from_dewpoint(
                aligned["T"].values, aligned["Td"].values
            )

            aligned["T_clean"] = np.round(aligned["T"].values, 2)
            aligned["P_clean"] = np.round(aligned["P"].values, 2)
            aligned["RH_clean"] = np.round(rh_clean, 2)
            aligned["Td_clean"] = np.round(aligned["Td"].values, 2)

            # Initialize observation channels (clean copy before injection)
            aligned["T_obs"] = aligned["T_clean"].copy()
            aligned["P_obs"] = aligned["P_clean"].copy()
            aligned["RH_obs"] = aligned["RH_clean"].copy()

            # Initialize Ground Truth Labels
            aligned["is_fault"] = 0
            aligned["fault_class"] = "NONE"
            aligned["affected_channel"] = "NONE"
            aligned["event_context"] = "NORMAL"
            aligned["severity"] = 0.0

            # Station metadata columns
            aligned["station_id"] = str(meta.station_id)
            aligned["station_name"] = str(meta.station_name)
            aligned["latitude"] = float(meta.latitude)
            aligned["longitude"] = float(meta.longitude)
            aligned["elevation_m"] = float(meta.elevation_m)

            # Reset index and format ISO timestamp string
            aligned = aligned.reset_index().rename(columns={"index": "timestamp_dt"})
            aligned["timestamp"] = aligned["timestamp_dt"].dt.strftime("%Y-%m-%dT%H:%M:%SZ")

            station_dfs.append(aligned)

        # Concatenate all stations
        unified_df = pd.concat(station_dfs, ignore_index=True)
        # Sort chronologically, then by station
        unified_df = unified_df.sort_values(by=["timestamp_dt", "station_id"]).reset_index(drop=True)
        
        print(f"[SYNCHRONIZED] Total records: {len(unified_df)} ({len(station_data)} stations x {len(grid)} timesteps)")
        return unified_df, df_dist, cartesian_coords

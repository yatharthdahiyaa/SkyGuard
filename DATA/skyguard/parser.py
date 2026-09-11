"""
NOAA ISD (Integrated Surface Database) CSV Ingestion Engine for SkyGuard AI
Parses raw NOAA ISD / IMD format CSVs, handles meteorological quality codes,
normalizes temperature/dewpoint/pressure, and organizes multi-station spatial metadata.
"""

import os
import glob
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple
import numpy as np
import pandas as pd


@dataclass
class AWSStationMetadata:
    """Station metadata and spatial coordinates."""
    station_id: str
    station_name: str
    latitude: float
    longitude: float
    elevation_m: float
    filepath: str


class NOAAISDParser:
    """
    Parser for NOAA Integrated Surface Database (ISD) hourly and synoptic CSV files.
    """

    # Pre-configured station clusters
    CLUSTERS = {
        "maharashtra": {
            "43003099999": {
                "name": "MUMBAI_CSMI_AIRPORT",
                "filename_patterns": ["*CSMI*", "*43003099999*"],
                "lat": 19.088686,
                "lon": 72.867919,
                "elev": 11.27
            },
            "43057099999": {
                "name": "MUMBAI_COLABA",
                "filename_patterns": ["*Colaba*", "*43057099999*"],
                "lat": 18.900000,
                "lon": 72.816667,
                "elev": 11.00
            },
            "43063099999": {
                "name": "PUNE",
                "filename_patterns": ["*Pune*", "*43063099999*"],
                "lat": 18.533333,
                "lon": 73.850000,
                "elev": 558.00
            },
            "42921099999": {
                "name": "NASIK_CITY",
                "filename_patterns": ["*Nasik*", "*42921099999*"],
                "lat": 19.966667,
                "lon": 73.816667,
                "elev": 598.00
            }
        },
        "north_india": {
            "42182099999": {
                "name": "DELHI_SAFDARJUNG",
                "filename_patterns": ["*Safdarjung*", "*42182099999*"],
                "lat": 28.584511,
                "lon": 77.205783,
                "elev": 214.88
            },
            "42139099999": {
                "name": "MEERUT",
                "filename_patterns": ["*Meerut*", "*42139099999*"],
                "lat": 29.016667,
                "lon": 77.716667,
                "elev": 222.00
            },
            "42170099999": {
                "name": "CHURU",
                "filename_patterns": ["*Churu*", "*42170099999*"],
                "lat": 28.250000,
                "lon": 74.916667,
                "elev": 291.00
            },
            "42260099999": {
                "name": "AGRA",
                "filename_patterns": ["*Agra*", "*42260099999*"],
                "lat": 27.155831,
                "lon": 77.960892,
                "elev": 167.94
            }
        }
    }

    def __init__(self, csv_dir: str = "csv"):
        self.csv_dir = csv_dir

    def discover_files(self, cluster_name: str = "maharashtra") -> List[Tuple[str, str]]:
        """
        Locates CSV files matching the specified station cluster.
        Returns list of (station_id, file_path).
        """
        cluster_info = self.CLUSTERS.get(cluster_name.lower())
        if not cluster_info:
            raise ValueError(f"Unknown cluster '{cluster_name}'. Available: {list(self.CLUSTERS.keys())}")

        discovered = []
        # Search in csv_dir and current working directory
        search_dirs = [self.csv_dir, ".", os.path.join(self.csv_dir, "..")]
        
        for st_id, meta in cluster_info.items():
            matched_path = None
            for s_dir in search_dirs:
                if not os.path.isdir(s_dir):
                    continue
                for pattern in meta["filename_patterns"]:
                    candidates = glob.glob(os.path.join(s_dir, pattern))
                    if candidates:
                        matched_path = candidates[0]
                        break
                if matched_path:
                    break
            
            if matched_path:
                discovered.append((st_id, matched_path))
            else:
                # Direct check by st_id.csv
                direct_check = os.path.join(self.csv_dir, f"{st_id}.csv")
                if os.path.exists(direct_check):
                    discovered.append((st_id, direct_check))
                else:
                    print(f"[WARN] Station {st_id} ({meta['name']}) not found in {self.csv_dir}")

        return discovered

    def parse_file(self, filepath: str, station_id_hint: Optional[str] = None) -> Tuple[AWSStationMetadata, pd.DataFrame]:
        """
        Parses a single NOAA ISD CSV file.
        Decodes TMP, DEW, SLP, applies quality checks, and handles missing sentinels.
        """
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"CSV file not found: {filepath}")

        # Read only required columns if present
        df = pd.read_csv(filepath, low_memory=False)

        # Station Metadata
        raw_st_id = str(df["STATION"].iloc[0]).strip() if "STATION" in df.columns else station_id_hint or "UNKNOWN"
        raw_name = str(df["NAME"].iloc[0]).strip() if "NAME" in df.columns else os.path.splitext(os.path.basename(filepath))[0]
        lat = float(df["LATITUDE"].iloc[0]) if "LATITUDE" in df.columns else 0.0
        lon = float(df["LONGITUDE"].iloc[0]) if "LONGITUDE" in df.columns else 0.0
        elev = float(df["ELEVATION"].iloc[0]) if "ELEVATION" in df.columns else 0.0

        metadata = AWSStationMetadata(
            station_id=raw_st_id,
            station_name=raw_name,
            latitude=lat,
            longitude=lon,
            elevation_m=elev,
            filepath=filepath
        )

        # Parse Datetime
        if "DATE" not in df.columns:
            raise KeyError(f"'DATE' column missing in {filepath}")
        df["timestamp"] = pd.to_datetime(df["DATE"], utc=True, errors="coerce")
        df = df.dropna(subset=["timestamp"]).copy()

        # Parse TMP: [val, qc] -> float / 10.0. Missing: +9999, -9999
        if "TMP" in df.columns:
            tmp_raw = df["TMP"].astype(str).str.split(",").str[0]
            tmp_val = pd.to_numeric(tmp_raw, errors="coerce")
            # Replace missing sentinels (+9999, -9999, 9999) with NaN
            df["T"] = tmp_val.where(~tmp_val.isin([9999, -9999, 999, -999])) / 10.0
        else:
            df["T"] = np.nan

        # Parse DEW: [val, qc] -> float / 10.0. Missing: +9999, -9999
        if "DEW" in df.columns:
            dew_raw = df["DEW"].astype(str).str.split(",").str[0]
            dew_val = pd.to_numeric(dew_raw, errors="coerce")
            df["Td"] = dew_val.where(~dew_val.isin([9999, -9999, 999, -999])) / 10.0
        else:
            df["Td"] = np.nan

        # Parse SLP: [val, qc] -> float / 10.0. Missing: 99999, -99999
        # Fallback to MA1 (altimeter setting / station pressure) if SLP is missing
        if "SLP" in df.columns:
            slp_raw = df["SLP"].astype(str).str.split(",").str[0]
            slp_val = pd.to_numeric(slp_raw, errors="coerce")
            slp_clean = slp_val.where(~slp_val.isin([99999, -99999, 9999, -9999]))
            
            if "MA1" in df.columns:
                ma1_raw = df["MA1"].astype(str).str.split(",").str[0]
                ma1_val = pd.to_numeric(ma1_raw, errors="coerce")
                ma1_clean = ma1_val.where(~ma1_val.isin([99999, -99999, 9999, -9999]))
                slp_clean = slp_clean.fillna(ma1_clean)
            
            df["P"] = slp_clean / 10.0
        else:
            df["P"] = np.nan

        clean_cols = ["timestamp", "T", "Td", "P"]
        res = df[clean_cols].sort_values("timestamp")
        # Deduplicate same-second records (e.g. FM-12 synop + FM-15 metar reported simultaneously)
        res = res.groupby("timestamp", as_index=False).first()

        return metadata, res

    def load_cluster(self, cluster_name: str = "maharashtra") -> List[Tuple[AWSStationMetadata, pd.DataFrame]]:
        """
        Discovers and parses all stations in the specified cluster.
        """
        discovered = self.discover_files(cluster_name)
        if not discovered:
            raise FileNotFoundError(f"No station files found for cluster '{cluster_name}' in '{self.csv_dir}'")

        results = []
        for st_id, fpath in discovered:
            meta, data = self.parse_file(fpath, station_id_hint=st_id)
            results.append((meta, data))
            print(f"[LOADED] Station {meta.station_id} ({meta.station_name}): {len(data)} observations from {data['timestamp'].min()} to {data['timestamp'].max()}")

        return results

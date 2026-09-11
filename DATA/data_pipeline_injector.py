#!/usr/bin/env python3
"""
================================================================================
SkyGuard AI Data & Simulation Layer: Data Pipeline & Sensor Anomaly Injector
================================================================================
Specialized for India Meteorological Department (IMD) / WMO-No. 8 Standards.

Ingests raw NOAA ISD / IMD weather station CSV files, resamples & synchronizes
multi-station spatial networks, derives psychrometric invariants (August-Roche-Magnus),
and injects labeled sensor faults alongside genuine extreme weather events
for anomaly detection benchmarking.

Author: SkyGuard AI Core Engineering Team
License: Apache-2.0 / IMD-MoES Research Benchmark
================================================================================
"""

import os
import sys
import argparse
from typing import Dict, List, Optional, Tuple, Union
import numpy as np
import pandas as pd

# Add workspace directory to path for package imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from skyguard.physics import AtmosphericThermodynamics
from skyguard.parser import NOAAISDParser, AWSStationMetadata
from skyguard.synchronizer import SpatialNetworkSynchronizer
from skyguard.injector import GroundTruthAnomalyInjector
from skyguard.plotting import SkyGuardVisualizer

__all__ = [
    "NOAAISDParser",
    "AWSStationMetadata",
    "AtmosphericThermodynamics",
    "SpatialNetworkSynchronizer",
    "GroundTruthAnomalyInjector",
    "SkyGuardVisualizer",
    "build_pipeline",
    "main"
]


def print_banner():
    banner = """
================================================================================
               SKYGUARD AI: DATA PIPELINE & ANOMALY INJECTOR
         Multi-Station Atmospheric Physics & Sensor QC Benchmark
================================================================================
    """
    print(banner)


def print_summary_table(df: pd.DataFrame):
    """
    Prints a rich, formatted validation summary table of the benchmark dataset.
    """
    total_records = len(df)
    n_stations = df["station_id"].nunique()
    start_time = df["timestamp"].min()
    end_time = df["timestamp"].max()

    print("\n" + "=" * 80)
    print("                      DATASET SPECIFICATION SUMMARY")
    print("=" * 80)
    print(f"  Total Observations:        {total_records:,}")
    print(f"  Active Stations:           {n_stations}")
    print(f"  Temporal Horizon:          {start_time}  -->  {end_time}")
    print(f"  Sampling Frequency:        {pd.infer_freq(pd.to_datetime(df['timestamp'].unique()[:10])) or 'Synchronized Regular'}")
    
    # Fault Distribution Table
    print("\n" + "-" * 80)
    print("  GROUND-TRUTH FAULT CLASS DISTRIBUTION (TRUE POSITIVES)")
    print("-" * 80)
    print(f"  {'Fault Class':<28} | {'Count':<10} | {'Percentage':<12} | {'Status'}")
    print("  " + "-" * 76)

    fault_counts = df["fault_class"].value_counts()
    for f_class, count in fault_counts.items():
        pct = (count / total_records) * 100.0
        status = "Clean Baseline / Weather" if f_class == "NONE" else "Injected Hardware Fault"
        print(f"  {f_class:<28} | {count:<10,} | {pct:>9.2f}% | {status}")

    overall_fault_count = (df["is_fault"] == 1).sum()
    overall_fault_pct = (overall_fault_count / total_records) * 100.0
    print("  " + "-" * 76)
    print(f"  {'TOTAL ANOMALY LOAD':<28} | {overall_fault_count:<10,} | {overall_fault_pct:>9.2f}% | Target: 5.0% - 8.0%")

    # Channel Distribution Table
    print("\n" + "-" * 80)
    print("  AFFECTED CHANNEL DISTRIBUTION")
    print("-" * 80)
    print(f"  {'Channel':<28} | {'Count':<10} | {'Percentage':<12}")
    print("  " + "-" * 76)
    channel_counts = df["affected_channel"].value_counts()
    for ch, count in channel_counts.items():
        pct = (count / total_records) * 100.0
        print(f"  {ch:<28} | {count:<10,} | {pct:>9.2f}%")

    # Event Context Table (True Negatives Check)
    print("\n" + "-" * 80)
    print("  ATMOSPHERIC EVENT CONTEXT (TRUE NEGATIVE FALSE-ALARM CHECKS)")
    print("-" * 80)
    print(f"  {'Event Context':<28} | {'Count':<10} | {'Percentage':<12} | {'is_fault == 1 Rate'}")
    print("  " + "-" * 76)
    event_counts = df["event_context"].value_counts()
    for evt, count in event_counts.items():
        pct = (count / total_records) * 100.0
        evt_mask = df["event_context"] == evt
        fault_in_evt_rate = df.loc[evt_mask, "is_fault"].mean() * 100.0
        print(f"  {evt:<28} | {count:<10,} | {pct:>9.2f}% | {fault_in_evt_rate:>6.2f}% (Expected: 0.0%)")

    # Physical Boundary Checks
    print("\n" + "-" * 80)
    print("  PHYSICAL & PSYCHROMETRIC BOUNDARY INTEGRITY")
    print("-" * 80)
    clean_mask = df["is_fault"] == 0
    t_clean = df.loc[clean_mask, "T_clean"]
    p_clean = df.loc[clean_mask, "P_clean"]
    rh_clean = df.loc[clean_mask, "RH_clean"]

    print(f"  T Clean Range:             {t_clean.min():.1f}°C to {t_clean.max():.1f}°C")
    print(f"  P Clean Range:             {p_clean.min():.1f} hPa to {p_clean.max():.1f} hPa")
    print(f"  RH Clean Range:            {rh_clean.min():.1f}% to {rh_clean.max():.1f}%")
    print(f"  Clean Supersaturation:     {(rh_clean > 100.0).sum()} records (Strictly 0)")
    
    # Psychrometric Violation Check
    psy_mask = df["fault_class"] == "PSYCHROMETRIC_VIOLATION"
    print(f"  Psychrometric Violations:  {psy_mask.sum()} records (T > 40°C & RH > 95% unbacked)")
    print("=" * 80 + "\n")


def build_pipeline(
    cluster: str = "maharashtra",
    csv_dir: str = "csv",
    freq: str = "1h",
    days: int = 30,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    use_spline: bool = False,
    target_fault_rate: float = 0.065,
    random_state: int = 42,
    output_parquet: str = "skyguard_groundtruth_benchmark.parquet",
    output_csv: str = "skyguard_groundtruth_benchmark.csv",
    plot_path: str = "injection_validation_plot.png"
) -> pd.DataFrame:
    """
    Executes the complete end-to-end ingestion, synchronization, and fault injection pipeline.
    """
    print_banner()

    # 1. Parse NOAA CSV files
    print(f"[STEP 1/5] Ingesting NOAA ISD weather station files for cluster '{cluster}' from '{csv_dir}'...")
    parser = NOAAISDParser(csv_dir=csv_dir)
    station_data = parser.load_cluster(cluster_name=cluster)

    # Auto-determine date range if days is specified and start_date is not
    if start_date is None and end_date is None:
        # Default to high-convective pre-monsoon May window for Maharashtra, or first N days
        overlap_min = max(df["timestamp"].min() for _, df in station_data)
        if cluster.lower() == "maharashtra":
            # 2023 pre-monsoon month: May 1 to May 31
            start_date = "2023-05-01T00:00:00Z"
            end_date = f"2023-05-{min(days, 31):02d}T23:00:00Z"
        else:
            # First N days of overlap
            start_date = overlap_min.strftime("%Y-%m-%dT%H:%M:%SZ")
            end_dt = overlap_min + pd.Timedelta(days=days)
            end_date = end_dt.strftime("%Y-%m-%dT%H:%M:%SZ")

    # 2. Resample & Synchronize
    print(f"\n[STEP 2/5] Synchronizing multi-station network onto continuous temporal grid ({freq})...")
    synchronizer = SpatialNetworkSynchronizer()
    df_sync, df_dist, cartesian_coords = synchronizer.synchronize(
        station_data=station_data,
        freq=freq,
        start_date=start_date,
        end_date=end_date,
        use_cubic_spline=use_spline
    )

    print("\n[SPATIAL NETWORK] Pairwise Geodesic Distance Matrix (km):")
    print(df_dist.round(1).to_string())

    # 3. Inject Genuine Events & Faults
    print(f"\n[STEP 3/5] Injecting genuine mesoscale events & multi-class sensor faults (Target rate: {target_fault_rate*100:.1f}%)...")
    injector = GroundTruthAnomalyInjector(
        random_state=random_state,
        sentinel_value=-999.0,
        use_sentinel_for_dropout=True
    )
    df_final = injector.inject_benchmark_suite(
        df=df_sync,
        cartesian_coords=cartesian_coords,
        target_fault_rate=target_fault_rate
    )

    # 4. Strict Schema Formatting
    print("\n[STEP 4/5] Enforcing strict output schema...")
    output_columns = [
        "timestamp",
        "station_id",
        "station_name",
        "latitude",
        "longitude",
        "elevation_m",
        "T_clean",
        "P_clean",
        "RH_clean",
        "T_obs",
        "P_obs",
        "RH_obs",
        "is_fault",
        "fault_class",
        "affected_channel",
        "event_context",
        "severity"
    ]
    # Keep timestamp_dt internally for plotting, export required columns
    export_df = df_final[output_columns].copy()

    # Save to Parquet and CSV
    print(f"[EXPORT] Saving Parquet to '{output_parquet}'...")
    export_df.to_parquet(output_parquet, index=False)
    print(f"[EXPORT] Saving CSV to '{output_csv}'...")
    export_df.to_csv(output_csv, index=False)

    # 5. Validation Summary & Diagnostics Plot
    print("\n[STEP 5/5] Generating validation diagnostics and inspection visualization...")
    print_summary_table(export_df)

    SkyGuardVisualizer.plot_inspection_dashboard(
        df=df_final,
        output_path=plot_path,
        dpi=200
    )

    print(f"[COMPLETE] SkyGuard AI Data Pipeline finished successfully!")
    print(f"  Benchmark Parquet:  {os.path.abspath(output_parquet)}")
    print(f"  Benchmark CSV:      {os.path.abspath(output_csv)}")
    print(f"  Inspection Figure:  {os.path.abspath(plot_path)}\n")
    return export_df


def main():
    parser = argparse.ArgumentParser(
        description="SkyGuard AI: Multi-Station Weather Data Ingestion & Sensor Fault Injection Pipeline"
    )
    parser.add_argument(
        "--cluster",
        type=str,
        default="maharashtra",
        choices=["maharashtra", "north_india"],
        help="Station cluster to ingest: 'maharashtra' (2023) or 'north_india' (2025). Default: 'maharashtra'"
    )
    parser.add_argument(
        "--csv-dir",
        type=str,
        default="csv",
        help="Directory containing NOAA ISD station CSV files. Default: 'csv'"
    )
    parser.add_argument(
        "--freq",
        type=str,
        default="1h",
        help="Temporal resampling frequency ('1h', '30min', '15min'). Default: '1h'"
    )
    parser.add_argument(
        "--days",
        type=int,
        default=30,
        help="Duration horizon in days. Default: 30"
    )
    parser.add_argument(
        "--start-date",
        type=str,
        default=None,
        help="Start timestamp ISO string (e.g. '2023-05-01T00:00:00Z'). Default: None (auto)"
    )
    parser.add_argument(
        "--end-date",
        type=str,
        default=None,
        help="End timestamp ISO string. Default: None (auto)"
    )
    parser.add_argument(
        "--spline",
        action="store_true",
        help="Use cubic spline interpolation instead of time-weighted linear"
    )
    parser.add_argument(
        "--fault-rate",
        type=float,
        default=0.065,
        help="Target overall sensor fault injection rate (0.05 to 0.08). Default: 0.065 (6.5%)"
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for reproducibility. Default: 42"
    )
    parser.add_argument(
        "--output-parquet",
        type=str,
        default="skyguard_groundtruth_benchmark.parquet",
        help="Output filepath for benchmark Parquet. Default: 'skyguard_groundtruth_benchmark.parquet'"
    )
    parser.add_argument(
        "--output-csv",
        type=str,
        default="skyguard_groundtruth_benchmark.csv",
        help="Output filepath for benchmark CSV. Default: 'skyguard_groundtruth_benchmark.csv'"
    )
    parser.add_argument(
        "--plot-path",
        type=str,
        default="injection_validation_plot.png",
        help="Output filepath for diagnostic plot. Default: 'injection_validation_plot.png'"
    )

    args = parser.parse_args()

    build_pipeline(
        cluster=args.cluster,
        csv_dir=args.csv_dir,
        freq=args.freq,
        days=args.days,
        start_date=args.start_date,
        end_date=args.end_date,
        use_spline=args.spline,
        target_fault_rate=args.fault_rate,
        random_state=args.seed,
        output_parquet=args.output_parquet,
        output_csv=args.output_csv,
        plot_path=args.plot_path
    )


if __name__ == "__main__":
    main()

"""
Visualization and Diagnostics for SkyGuard AI
Generates publication-grade multi-panel diagnostic plots comparing clean vs. observed traces,
highlighting genuine mesoscale weather fronts (true negatives) vs. injected sensor faults (true positives).
"""

import os
from typing import Optional
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from matplotlib.lines import Line2D
from matplotlib.patches import Patch


class SkyGuardVisualizer:
    """
    Produces publication-grade figures showing time series traces,
    fault injections, and spatial mesoscale front propagation.
    """

    @staticmethod
    def plot_inspection_dashboard(
        df: pd.DataFrame,
        output_path: str = "injection_validation_plot.png",
        target_station_id: Optional[str] = None,
        dpi: int = 200
    ) -> str:
        """
        Creates a comprehensive 5-panel validation figure.
        """
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

        station_ids = list(df["station_id"].unique())
        if target_station_id is None or target_station_id not in station_ids:
            # Pick station with the most interesting mix of events
            fault_counts = df.groupby("station_id")["is_fault"].sum()
            target_station_id = fault_counts.idxmax() if not fault_counts.empty else station_ids[0]

        st_df = df[df["station_id"] == target_station_id].sort_values("timestamp_dt").copy()
        st_name = st_df["station_name"].iloc[0]

        # Use clean, modern aesthetic
        plt.style.use("seaborn-v0_8-whitegrid" if "seaborn-v0_8-whitegrid" in plt.style.available else "default")
        fig = plt.figure(figsize=(16, 14), dpi=dpi)
        gs = fig.add_gridspec(5, 1, height_ratios=[2.2, 2.2, 2.2, 1.2, 2.2], hspace=0.35)

        # -----------------------------------------------------------------
        # Panel 1: Temperature (Clean vs Obs + Fault Markers)
        # -----------------------------------------------------------------
        ax1 = fig.add_subplot(gs[0])
        ax1.plot(st_df["timestamp_dt"], st_df["T_clean"], label="T Clean (Physical Ground Truth)", color="#2563eb", lw=1.8, alpha=0.85)
        
        # Plot corrupted values where is_fault == 1 and T was affected
        t_fault_mask = (st_df["is_fault"] == 1) & (st_df["affected_channel"].isin(["T", "MULTIPLE"]))
        if t_fault_mask.any():
            # Replace -999 sentinels with NaN for line continuity, plot markers
            t_obs_plot = st_df["T_obs"].copy()
            sentinel_mask = t_obs_plot < -50
            t_obs_plot[sentinel_mask] = np.nan
            ax1.plot(st_df.loc[t_fault_mask, "timestamp_dt"], t_obs_plot[t_fault_mask],
                     color="#dc2626", lw=2.2, linestyle="--", marker="x", markersize=6, label="T Observed (Injected Fault)")
            if sentinel_mask.any():
                ax1.scatter(st_df.loc[sentinel_mask, "timestamp_dt"], [st_df["T_clean"].min() - 2]*sentinel_mask.sum(),
                            color="#9333ea", marker="v", s=60, label="Dropout Sentinel (-999.0)")

        # Highlight Genuine Weather Front
        front_mask = st_df["event_context"] == "GENUINE_WEATHER_FRONT"
        if front_mask.any():
            f_times = st_df.loc[front_mask, "timestamp_dt"]
            ax1.axvspan(f_times.min(), f_times.max(), color="#0ea5e9", alpha=0.22, label="Genuine Gust Front (True Negative, is_fault=0)")

        # Highlight Heatburst
        hb_mask = st_df["event_context"] == "HEATBURST"
        if hb_mask.any():
            hb_times = st_df.loc[hb_mask, "timestamp_dt"]
            ax1.axvspan(hb_times.min(), hb_times.max(), color="#f59e0b", alpha=0.25, label="Genuine Heatburst (True Negative, is_fault=0)")

        ax1.set_title(f"SkyGuard AI Ground-Truth Benchmark | Station: {st_name} ({target_station_id})\nTemperature (°C) [Clean vs Observed]", fontsize=12, fontweight="bold")
        ax1.set_ylabel("Temperature (°C)", fontsize=10, fontweight="bold")
        ax1.legend(loc="upper right", frameon=True, fontsize=8, ncol=3)
        ax1.grid(True, linestyle=":", alpha=0.6)

        # -----------------------------------------------------------------
        # Panel 2: Pressure (Clean vs Obs + Tides + Mesohigh)
        # -----------------------------------------------------------------
        ax2 = fig.add_subplot(gs[1], sharex=ax1)
        ax2.plot(st_df["timestamp_dt"], st_df["P_clean"], label="P Clean (Physical Ground Truth)", color="#059669", lw=1.8, alpha=0.85)

        p_fault_mask = (st_df["is_fault"] == 1) & (st_df["affected_channel"].isin(["P", "MULTIPLE"]))
        if p_fault_mask.any():
            p_obs_plot = st_df["P_obs"].copy()
            sentinel_p = p_obs_plot < -50
            p_obs_plot[sentinel_p] = np.nan
            ax2.plot(st_df.loc[p_fault_mask, "timestamp_dt"], p_obs_plot[p_fault_mask],
                     color="#dc2626", lw=2.2, linestyle="--", marker="o", markersize=4, label="P Observed (Injected Fault)")

        if front_mask.any():
            ax2.axvspan(f_times.min(), f_times.max(), color="#0ea5e9", alpha=0.22)
        if hb_mask.any():
            ax2.axvspan(hb_times.min(), hb_times.max(), color="#f59e0b", alpha=0.25)

        ax2.set_ylabel("Atm Pressure (hPa)", fontsize=10, fontweight="bold")
        ax2.legend(loc="upper right", frameon=True, fontsize=8, ncol=2)
        ax2.grid(True, linestyle=":", alpha=0.6)

        # -----------------------------------------------------------------
        # Panel 3: Relative Humidity (Clean vs Obs + Psychrometric Surge)
        # -----------------------------------------------------------------
        ax3 = fig.add_subplot(gs[2], sharex=ax1)
        ax3.plot(st_df["timestamp_dt"], st_df["RH_clean"], label="RH Clean (Physical Ground Truth)", color="#0284c7", lw=1.8, alpha=0.85)

        rh_fault_mask = (st_df["is_fault"] == 1) & (st_df["affected_channel"].isin(["RH", "MULTIPLE"]))
        if rh_fault_mask.any():
            rh_obs_plot = st_df["RH_obs"].copy()
            sentinel_rh = rh_obs_plot < -50
            rh_obs_plot[sentinel_rh] = np.nan
            ax3.plot(st_df.loc[rh_fault_mask, "timestamp_dt"], rh_obs_plot[rh_fault_mask],
                     color="#dc2626", lw=2.2, linestyle="--", marker="s", markersize=4, label="RH Observed (Injected Fault/Drift)")

        if front_mask.any():
            ax3.axvspan(f_times.min(), f_times.max(), color="#0ea5e9", alpha=0.22)
        if hb_mask.any():
            ax3.axvspan(hb_times.min(), hb_times.max(), color="#f59e0b", alpha=0.25)

        ax3.set_ylabel("Relative Humidity (%)", fontsize=10, fontweight="bold")
        ax3.legend(loc="upper right", frameon=True, fontsize=8, ncol=2)
        ax3.set_ylim(-5, 105)
        ax3.grid(True, linestyle=":", alpha=0.6)

        # -----------------------------------------------------------------
        # Panel 4: Injected Fault Typology & Event Context Bar
        # -----------------------------------------------------------------
        ax4 = fig.add_subplot(gs[3], sharex=ax1)
        class_colors = {
            "NONE": "#e2e8f0",
            "SPIKE": "#ef4444",
            "FROZEN": "#f97316",
            "DRIFT": "#eab308",
            "DROPOUT": "#8b5cf6",
            "PSYCHROMETRIC_VIOLATION": "#ec4899"
        }

        for f_class, col in class_colors.items():
            if f_class == "NONE":
                continue
            f_mask = st_df["fault_class"] == f_class
            if f_mask.any():
                ax4.scatter(st_df.loc[f_mask, "timestamp_dt"], [1.0] * f_mask.sum(),
                            color=col, marker="|", s=400, lw=3, label=f_class)

        # Plot front bar
        if front_mask.any():
            ax4.axvspan(f_times.min(), f_times.max(), color="#0ea5e9", alpha=0.4, label="WEATHER FRONT")

        ax4.set_yticks([])
        ax4.set_ylim(0.5, 1.5)
        ax4.set_ylabel("Faults", fontsize=10, fontweight="bold")
        ax4.legend(loc="upper right", frameon=True, fontsize=7.5, ncol=6)
        ax4.grid(False)

        # -----------------------------------------------------------------
        # Panel 5: Spatial Mesoscale Propagation Lag across All Stations
        # -----------------------------------------------------------------
        ax5 = fig.add_subplot(gs[4])
        station_colors = ["#2563eb", "#7c3aed", "#059669", "#d97706", "#dc2626", "#0891b2"]

        # Find front window across all stations
        all_front = df[df["event_context"] == "GENUINE_WEATHER_FRONT"]
        if not all_front.empty:
            t_front_min = all_front["timestamp_dt"].min() - pd.Timedelta(hours=4)
            t_front_max = all_front["timestamp_dt"].max() + pd.Timedelta(hours=6)
            sub_window = df[(df["timestamp_dt"] >= t_front_min) & (df["timestamp_dt"] <= t_front_max)]

            for i, st in enumerate(station_ids):
                col = station_colors[i % len(station_colors)]
                st_sub = sub_window[sub_window["station_id"] == st].sort_values("timestamp_dt")
                if not st_sub.empty:
                    s_name = st_sub["station_name"].iloc[0].split(",")[0]
                    # Plot temperature drop for each station demonstrating spatial lag
                    ax5.plot(st_sub["timestamp_dt"], st_sub["T_clean"], lw=2.0, color=col,
                             label=f"{s_name} ({st})")

            ax5.set_title("Multi-Station Spatial Lag: Convective Gust Front Propagation (Coordinated Thermodynamic Drop)", fontsize=11, fontweight="bold")
            ax5.set_ylabel("Temp (°C)", fontsize=10, fontweight="bold")
            ax5.legend(loc="upper right", frameon=True, fontsize=8, ncol=len(station_ids))
            ax5.xaxis.set_major_formatter(mdates.DateFormatter("%b %d %H:%M"))
            ax5.grid(True, linestyle=":", alpha=0.6)
        else:
            ax5.text(0.5, 0.5, "No mesoscale front detected in dataset window", ha="center", va="center")

        # Format x-axes
        for ax in [ax1, ax2, ax3, ax4]:
            ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))
            plt.setp(ax.get_xticklabels(), visible=False)

        ax5.set_xlabel("Timestamp (UTC)", fontsize=10, fontweight="bold")
        fig.autofmt_xdate()

        plt.savefig(output_path, dpi=dpi, bbox_inches="tight")
        plt.close(fig)
        print(f"[VISUALIZATION] Dashboard saved to {output_path}")
        return output_path

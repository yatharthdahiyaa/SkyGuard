"""
Ground-Truth Anomaly & Fault Injector for SkyGuard AI
Implements the 5 operational fault classes targeted by MoES / IMD:
  1. SPIKE: Impulse burst / ADC bit-flip on isolated channel
  2. FROZEN: Zero-variance deadband / flatline sustained float repetition
  3. DRIFT: Calibration creep (e.g. capacitive hygrometer salt/dust drift)
  4. DROPOUT: Comms packet loss / sentinel token (-999.0) / NaN
  5. PSYCHROMETRIC_VIOLATION: Thermodynamic invariant violation (Td > T)

Also injects genuine mesoscale atmospheric events (convective gust front, heatburst)
as TRUE NEGATIVES (is_fault = 0) with physical spatial lag and coupled thermodynamic shifts.
"""

from typing import Dict, List, Optional, Tuple, Union
import numpy as np
import pandas as pd
from datetime import timedelta

from skyguard.physics import AtmosphericThermodynamics


class GroundTruthAnomalyInjector:
    """
    Injects labeled sensor faults and genuine mesoscale weather events into multi-station AWS data.
    """

    def __init__(
        self,
        random_state: int = 42,
        target_fault_rate: float = 0.065,
        sentinel_value: float = -999.0,
        use_sentinel_for_dropout: bool = True
    ):
        self.random_state = random_state
        self.target_fault_rate = target_fault_rate
        self.rng = np.random.RandomState(random_state)
        self.sentinel_value = sentinel_value
        self.use_sentinel_for_dropout = use_sentinel_for_dropout

    def simulate_mesoscale_front(
        self,
        df: pd.DataFrame,
        cartesian_coords: Dict[str, Tuple[float, float]],
        front_start_time: Union[str, pd.Timestamp],
        direction_deg: float = 110.0,
        speed_kmh: float = 45.0,
        delta_T: float = -8.0,
        delta_P: float = 3.5,
        delta_RH: float = 35.0,
        ramp_hours: float = 0.35,
        decay_hours: float = 3.0
    ) -> pd.DataFrame:
        """
        Simulates a propagating convective cold pool / gust front across the station network.
        Calculates spatial lag from station coordinates and front propagation vector.
        Modifies BOTH clean and observed channels (true physical weather event),
        and labels records with event_context = 'GENUINE_WEATHER_FRONT' and is_fault = 0.
        """
        df = df.copy()
        t0 = pd.to_datetime(front_start_time, utc=True)
        station_ids = df["station_id"].unique()

        # Front normal unit vector (traveling towards direction_deg, where 0=East, 90=North)
        rad = np.radians(direction_deg)
        u_x = np.cos(rad)
        u_y = np.sin(rad)

        # Compute projection distance along propagation axis for each station
        proj_distances = {}
        for st in station_ids:
            if st in cartesian_coords:
                x_km, y_km = cartesian_coords[st]
                proj_distances[st] = x_km * u_x + y_km * u_y
            else:
                proj_distances[st] = 0.0

        min_proj = min(proj_distances.values())

        # Station arrival lags
        station_lags_hours = {}
        for st in station_ids:
            dist_from_leading_edge = proj_distances[st] - min_proj
            lag_h = dist_from_leading_edge / max(speed_kmh, 5.0)
            station_lags_hours[st] = lag_h
            arr_t = t0 + timedelta(hours=lag_h)
            print(f"[GUST FRONT] Station {st}: distance offset = {dist_from_leading_edge:.1f} km, arrival lag = {lag_h:.2f} h ({arr_t.strftime('%Y-%m-%d %H:%M:%S UTC')})")

        # Apply front waveform to each station
        for st in station_ids:
            mask = df["station_id"] == st
            st_dt = df.loc[mask, "timestamp_dt"]
            lag_h = station_lags_hours[st]
            t_arr = t0 + timedelta(hours=lag_h)

            dt_hours = (st_dt - t_arr).dt.total_seconds() / 3600.0

            # Waveform: Sigmoidal onset * exponential decay
            # onset = 1 / (1 + exp(-dt / ramp_hours))
            # decay = exp(-max(0, dt) / decay_hours)
            onset = 1.0 / (1.0 + np.exp(-np.clip(dt_hours / ramp_hours, -20.0, 20.0)))
            decay = np.exp(-np.maximum(0.0, dt_hours) / decay_hours)
            envelope = onset * decay

            active_mask = (envelope > 0.05) & mask
            if not active_mask.any():
                continue

            env_vals = envelope[active_mask].values

            # Thermodynamic coupled signature
            # Temperature drops
            t_orig = df.loc[active_mask, "T_clean"].values
            t_new = t_orig + delta_T * env_vals
            df.loc[active_mask, "T_clean"] = np.round(t_new, 2)
            df.loc[active_mask, "T_obs"] = np.round(t_new, 2)

            # Pressure mesohigh jump
            p_orig = df.loc[active_mask, "P_clean"].values
            p_new = p_orig + delta_P * env_vals
            df.loc[active_mask, "P_clean"] = np.round(p_new, 2)
            df.loc[active_mask, "P_obs"] = np.round(p_new, 2)

            # Humidity surges
            rh_orig = df.loc[active_mask, "RH_clean"].values
            rh_new = np.clip(rh_orig + delta_RH * env_vals, 5.0, 100.0)
            df.loc[active_mask, "RH_clean"] = np.round(rh_new, 2)
            df.loc[active_mask, "RH_obs"] = np.round(rh_new, 2)

            # Ground truth labeling: TRUE NEGATIVE (not a fault)
            df.loc[active_mask, "event_context"] = "GENUINE_WEATHER_FRONT"
            # Only set fault labels to NONE if no hardware fault was injected there
            fault_free = active_mask & (df["is_fault"] == 0)
            df.loc[fault_free, "is_fault"] = 0
            df.loc[fault_free, "fault_class"] = "NONE"
            df.loc[fault_free, "affected_channel"] = "NONE"
            df.loc[fault_free, "severity"] = 0.0

        return df

    def simulate_heatburst(
        self,
        df: pd.DataFrame,
        station_id: str,
        burst_start_time: Union[str, pd.Timestamp],
        duration_hours: float = 2.5,
        delta_T: float = 6.5,
        delta_P: float = -2.5,
        delta_RH: float = -35.0
    ) -> pd.DataFrame:
        """
        Simulates a nocturnal heatburst on a single station:
        Sudden temperature rise, catastrophic RH plunge, and wake low pressure drop.
        Labeled with event_context = 'HEATBURST', is_fault = 0 (true negative).
        """
        df = df.copy()
        t0 = pd.to_datetime(burst_start_time, utc=True)
        t_end = t0 + timedelta(hours=duration_hours)

        mask = (df["station_id"] == station_id) & (df["timestamp_dt"] >= t0) & (df["timestamp_dt"] <= t_end)
        if not mask.any():
            return df

        st_dt = df.loc[mask, "timestamp_dt"]
        progress = (st_dt - t0).dt.total_seconds() / (duration_hours * 3600.0)
        # Bell curve envelope
        envelope = np.sin(np.pi * progress)

        t_orig = df.loc[mask, "T_clean"].values
        p_orig = df.loc[mask, "P_clean"].values
        rh_orig = df.loc[mask, "RH_clean"].values

        df.loc[mask, "T_clean"] = np.round(t_orig + delta_T * envelope, 2)
        df.loc[mask, "T_obs"] = np.round(t_orig + delta_T * envelope, 2)
        df.loc[mask, "P_clean"] = np.round(p_orig + delta_P * envelope, 2)
        df.loc[mask, "P_obs"] = np.round(p_orig + delta_P * envelope, 2)
        df.loc[mask, "RH_clean"] = np.round(np.clip(rh_orig + delta_RH * envelope, 5.0, 100.0), 2)
        df.loc[mask, "RH_obs"] = np.round(np.clip(rh_orig + delta_RH * envelope, 5.0, 100.0), 2)

        df.loc[mask, "event_context"] = "HEATBURST"
        return df

    def inject_spike(
        self,
        df: pd.DataFrame,
        station_id: str,
        start_time: Union[str, pd.Timestamp],
        channel: str = "T",
        num_points: int = 1,
        magnitude: Optional[float] = None
    ) -> pd.DataFrame:
        """
        Class 1: Spike / ADC Bit-Flip.
        Single or short-burst non-physical impulse on one isolated channel.
        """
        t0 = pd.to_datetime(start_time, utc=True)
        st_mask = df["station_id"] == station_id
        dt_series = df.loc[st_mask, "timestamp_dt"]

        # Find closest index
        closest_idx = (dt_series - t0).abs().idxmin()
        st_indices = df.index[st_mask]
        st_pos = st_indices.get_loc(closest_idx)
        target_indices = st_indices[st_pos : min(len(st_indices), st_pos + num_points)]

        sign = self.rng.choice([-1.0, 1.0])
        if channel == "T":
            mag = magnitude if magnitude is not None else sign * self.rng.uniform(8.0, 18.0)
            df.loc[target_indices, "T_obs"] = np.round(df.loc[target_indices, "T_clean"] + mag, 2)
            sev = float(np.clip(abs(mag) / 20.0, 0.4, 1.0))
        elif channel == "P":
            mag = magnitude if magnitude is not None else sign * self.rng.uniform(12.0, 28.0)
            df.loc[target_indices, "P_obs"] = np.round(df.loc[target_indices, "P_clean"] + mag, 2)
            sev = float(np.clip(abs(mag) / 30.0, 0.4, 1.0))
        elif channel == "RH":
            mag = magnitude if magnitude is not None else sign * self.rng.uniform(35.0, 60.0)
            df.loc[target_indices, "RH_obs"] = np.round(np.clip(df.loc[target_indices, "RH_clean"] + mag, 0.0, 100.0), 2)
            sev = float(np.clip(abs(mag) / 60.0, 0.4, 1.0))
        else:
            raise ValueError(f"Unknown channel {channel}")

        df.loc[target_indices, "is_fault"] = 1
        df.loc[target_indices, "fault_class"] = "SPIKE"
        df.loc[target_indices, "affected_channel"] = channel
        df.loc[target_indices, "severity"] = np.round(sev, 2)

        return df

    def inject_frozen(
        self,
        df: pd.DataFrame,
        station_id: str,
        start_time: Union[str, pd.Timestamp],
        duration_hours: float = 6.0,
        channel: str = "T"
    ) -> pd.DataFrame:
        """
        Class 2: Sensor Freeze / Flatline / Deadband.
        Sensor reading variance drops strictly to 0.0 for duration_hours.
        """
        t0 = pd.to_datetime(start_time, utc=True)
        t_end = t0 + timedelta(hours=duration_hours)

        mask = (df["station_id"] == station_id) & (df["timestamp_dt"] >= t0) & (df["timestamp_dt"] <= t_end)
        indices = df.index[mask]
        if len(indices) == 0:
            return df

        first_idx = indices[0]
        if channel in ["T", "ALL"]:
            freeze_val = df.loc[first_idx, "T_clean"]
            df.loc[indices, "T_obs"] = freeze_val
        if channel in ["P", "ALL"]:
            freeze_val = df.loc[first_idx, "P_clean"]
            df.loc[indices, "P_obs"] = freeze_val
        if channel in ["RH", "ALL"]:
            freeze_val = df.loc[first_idx, "RH_clean"]
            df.loc[indices, "RH_obs"] = freeze_val

        df.loc[indices, "is_fault"] = 1
        df.loc[indices, "fault_class"] = "FROZEN"
        df.loc[indices, "affected_channel"] = channel if channel != "ALL" else "MULTIPLE"
        df.loc[indices, "severity"] = 1.0

        return df

    def inject_drift(
        self,
        df: pd.DataFrame,
        station_id: str,
        start_time: Union[str, pd.Timestamp],
        duration_hours: float = 36.0,
        channel: str = "RH",
        drift_rate_per_hour: float = 0.4,
        max_drift: float = 28.0
    ) -> pd.DataFrame:
        """
        Class 3: Calibration Drift.
        Gradual unidirectional creep over hours (e.g. hygrometer salt/dust contamination).
        """
        t0 = pd.to_datetime(start_time, utc=True)
        t_end = t0 + timedelta(hours=duration_hours)

        mask = (df["station_id"] == station_id) & (df["timestamp_dt"] >= t0) & (df["timestamp_dt"] <= t_end)
        indices = df.index[mask]
        if len(indices) == 0:
            return df

        elapsed_hours = (df.loc[indices, "timestamp_dt"] - t0).dt.total_seconds() / 3600.0
        drift_amounts = np.minimum(elapsed_hours * drift_rate_per_hour, max_drift)
        severities = np.clip(drift_amounts / max(max_drift, 1e-3), 0.1, 1.0)

        if channel == "RH":
            df.loc[indices, "RH_obs"] = np.round(np.clip(df.loc[indices, "RH_clean"] + drift_amounts, 1.0, 100.0), 2)
        elif channel == "T":
            df.loc[indices, "T_obs"] = np.round(df.loc[indices, "T_clean"] + drift_amounts, 2)
        elif channel == "P":
            df.loc[indices, "P_obs"] = np.round(df.loc[indices, "P_clean"] + drift_amounts, 2)
        else:
            raise ValueError(f"Unknown drift channel: {channel}")

        df.loc[indices, "is_fault"] = 1
        df.loc[indices, "fault_class"] = "DRIFT"
        df.loc[indices, "affected_channel"] = channel
        df.loc[indices, "severity"] = np.round(severities, 2)

        return df

    def inject_dropout(
        self,
        df: pd.DataFrame,
        station_id: str,
        start_time: Union[str, pd.Timestamp],
        duration_hours: float = 4.0,
        channel: str = "MULTIPLE"
    ) -> pd.DataFrame:
        """
        Class 4: Comms Dropout / Packet Corruption.
        Transmission drop: values set to sentinel (-999.0) or NaN.
        """
        t0 = pd.to_datetime(start_time, utc=True)
        t_end = t0 + timedelta(hours=duration_hours)

        mask = (df["station_id"] == station_id) & (df["timestamp_dt"] >= t0) & (df["timestamp_dt"] <= t_end)
        indices = df.index[mask]
        if len(indices) == 0:
            return df

        fill_val = self.sentinel_value if self.use_sentinel_for_dropout else np.nan

        channels_to_corrupt = ["T", "P", "RH"] if channel == "MULTIPLE" else [channel]
        for ch in channels_to_corrupt:
            df.loc[indices, f"{ch}_obs"] = fill_val

        df.loc[indices, "is_fault"] = 1
        df.loc[indices, "fault_class"] = "DROPOUT"
        df.loc[indices, "affected_channel"] = channel
        df.loc[indices, "severity"] = 1.0

        return df

    def inject_psychrometric_violation(
        self,
        df: pd.DataFrame,
        station_id: str,
        start_time: Union[str, pd.Timestamp],
        duration_hours: float = 4.0
    ) -> pd.DataFrame:
        """
        Class 5: Psychrometric Invariant Violation.
        T surges to >40°C while RH surges to >95% without pressure drop,
        violating the physical Td <= T constraint on an isolated station.
        """
        t0 = pd.to_datetime(start_time, utc=True)
        t_end = t0 + timedelta(hours=duration_hours)

        mask = (df["station_id"] == station_id) & (df["timestamp_dt"] >= t0) & (df["timestamp_dt"] <= t_end)
        indices = df.index[mask]
        if len(indices) == 0:
            return df

        # In unphysical fault state: T observed rises to ~42-44°C and RH rises to 97%
        df.loc[indices, "T_obs"] = np.round(np.maximum(df.loc[indices, "T_clean"] + 12.0, 42.0), 2)
        df.loc[indices, "RH_obs"] = 98.5
        # Pressure remains normal (no storm backing)

        df.loc[indices, "is_fault"] = 1
        df.loc[indices, "fault_class"] = "PSYCHROMETRIC_VIOLATION"
        df.loc[indices, "affected_channel"] = "MULTIPLE"
        df.loc[indices, "severity"] = 1.0

        return df

    def inject_benchmark_suite(
        self,
        df: pd.DataFrame,
        cartesian_coords: Dict[str, Tuple[float, float]],
        target_fault_rate: Optional[float] = None
    ) -> pd.DataFrame:
        """
        Schedules a realistic, calibrated benchmark suite across the network:
        1. Injects 1 convective gust front propagating across stations with spatial lag.
        2. Injects 1 localized nocturnal heatburst.
        3. Injects instances of all 5 fault typologies scaled to achieve target_fault_rate (5% to 8%).
        """
        if target_fault_rate is None:
            target_fault_rate = self.target_fault_rate
        df = df.copy()
        station_ids = list(df["station_id"].unique())
        t_min = df["timestamp_dt"].min()
        t_max = df["timestamp_dt"].max()
        total_duration_days = (t_max - t_min).total_seconds() / 86400.0

        print(f"[BENCHMARK SUITE] Horizon: {t_min} to {t_max} ({total_duration_days:.1f} days, {len(df)} total observations)")

        # -------------------------------------------------------------
        # 1. Genuine Mesoscale Weather Front (True Negative)
        # -------------------------------------------------------------
        # Schedule front at ~30% through the time series
        front_time = t_min + timedelta(days=max(2.0, total_duration_days * 0.28))
        print(f"[BENCHMARK] Scheduling genuine convective gust front at {front_time}")
        df = self.simulate_mesoscale_front(
            df=df,
            cartesian_coords=cartesian_coords,
            front_start_time=front_time,
            direction_deg=110.0,
            speed_kmh=42.0,
            delta_T=-8.5,
            delta_P=3.8,
            delta_RH=35.0,
            ramp_hours=0.35,
            decay_hours=3.5
        )

        # -------------------------------------------------------------
        # 2. Genuine Heatburst (True Negative)
        # -------------------------------------------------------------
        # Schedule nocturnal heatburst at ~70% on station 0
        heatburst_time = t_min + timedelta(days=max(4.0, total_duration_days * 0.72), hours=2.0)
        target_hb_st = station_ids[0]
        print(f"[BENCHMARK] Scheduling genuine heatburst at {heatburst_time} on station {target_hb_st}")
        df = self.simulate_heatburst(
            df=df,
            station_id=target_hb_st,
            burst_start_time=heatburst_time,
            duration_hours=2.5,
            delta_T=6.5,
            delta_P=-2.2,
            delta_RH=-30.0
        )

        # -------------------------------------------------------------
        # 3. Hardware / Transmission Faults (True Positives)
        # Scaled campaign across stations to achieve 5% to 8% fault budget
        # -------------------------------------------------------------
        total_obs = len(df)
        clamped_rate = np.clip(target_fault_rate, 0.05, 0.08)
        target_fault_count = int(total_obs * clamped_rate)
        n_st = len(station_ids)

        # Compute sampling interval in hours per station
        st0_df = df[df["station_id"] == station_ids[0]].sort_values("timestamp_dt")
        if len(st0_df) > 1:
            step_hours = (st0_df["timestamp_dt"].iloc[1] - st0_df["timestamp_dt"].iloc[0]).total_seconds() / 3600.0
        else:
            step_hours = 1.0
        step_hours = max(0.01, step_hours)

        st0 = station_ids[0]
        st1 = station_ids[1 % n_st]
        st2 = station_ids[2 % n_st]
        st3 = station_ids[3 % n_st]

        # 1. Spikes (impulses of 1 to 2 timesteps across channels)
        spike_schedule = [
            (st0, t_min + timedelta(days=total_duration_days * 0.12, hours=3.0), "T", 1, 16.5),
            (st1, t_min + timedelta(days=total_duration_days * 0.22, hours=14.0), "P", 2, -24.0),
            (st2, t_min + timedelta(days=total_duration_days * 0.44, hours=8.0), "RH", 1, -55.0),
            (st3, t_min + timedelta(days=total_duration_days * 0.65, hours=19.0), "T", 2, -18.0),
            (st0, t_min + timedelta(days=total_duration_days * 0.82, hours=5.0), "P", 1, 26.0),
            (st2, t_min + timedelta(days=total_duration_days * 0.92, hours=11.0), "RH", 2, 45.0),
        ]
        for s_id, s_time, ch, n_pts, mag in spike_schedule:
            df = self.inject_spike(df, station_id=s_id, start_time=s_time, channel=ch, num_points=n_pts, magnitude=mag)

        # 2. Frozen (duration scaled to roughly 24% of budget across 3 episodes)
        freeze_budget_hours = ((target_fault_count * 0.24) / 3.0) * step_hours
        dur_f1 = max(step_hours * 2.0, freeze_budget_hours * 0.8)
        dur_f2 = max(step_hours * 2.0, freeze_budget_hours * 1.2)
        dur_f3 = max(step_hours * 2.0, freeze_budget_hours * 1.0)

        df = self.inject_frozen(df, station_id=st2, start_time=t_min + timedelta(days=total_duration_days * 0.16, hours=4.0), duration_hours=dur_f1, channel="T")
        df = self.inject_frozen(df, station_id=st3, start_time=t_min + timedelta(days=total_duration_days * 0.52, hours=8.0), duration_hours=dur_f2, channel="RH")
        df = self.inject_frozen(df, station_id=st0, start_time=t_min + timedelta(days=total_duration_days * 0.76, hours=2.0), duration_hours=dur_f3, channel="P")

        # 3. Calibration Drift (duration scaled to roughly 36% of budget across 2 episodes)
        drift_budget_hours = ((target_fault_count * 0.36) / 2.0) * step_hours
        dur_d1 = max(step_hours * 6.0, drift_budget_hours * 1.1)
        dur_d2 = max(step_hours * 6.0, drift_budget_hours * 0.9)

        df = self.inject_drift(df, station_id=st1, start_time=t_min + timedelta(days=total_duration_days * 0.35), duration_hours=dur_d1, channel="RH", drift_rate_per_hour=0.45, max_drift=28.0)
        df = self.inject_drift(df, station_id=st2, start_time=t_min + timedelta(days=total_duration_days * 0.62), duration_hours=dur_d2, channel="T", drift_rate_per_hour=0.15, max_drift=5.5)

        # 4. Comms Dropout (duration scaled to roughly 18% of budget across 3 bursts)
        drop_budget_hours = ((target_fault_count * 0.18) / 3.0) * step_hours
        dur_drop1 = max(step_hours * 2.0, drop_budget_hours * 0.9)
        dur_drop2 = max(step_hours * 2.0, drop_budget_hours * 1.1)
        dur_drop3 = max(step_hours * 2.0, drop_budget_hours * 1.0)

        df = self.inject_dropout(df, station_id=st0, start_time=t_min + timedelta(days=total_duration_days * 0.48, hours=1.0), duration_hours=dur_drop1, channel="MULTIPLE")
        df = self.inject_dropout(df, station_id=st3, start_time=t_min + timedelta(days=total_duration_days * 0.70, hours=15.0), duration_hours=dur_drop2, channel="P")
        df = self.inject_dropout(df, station_id=st1, start_time=t_min + timedelta(days=total_duration_days * 0.88, hours=6.0), duration_hours=dur_drop3, channel="T")

        # 5. Psychrometric Invariant Violation (duration scaled to roughly 14% of budget across 2 episodes)
        psy_budget_hours = ((target_fault_count * 0.14) / 2.0) * step_hours
        dur_p1 = max(step_hours * 2.0, psy_budget_hours * 1.1)
        dur_p2 = max(step_hours * 2.0, psy_budget_hours * 0.9)

        df = self.inject_psychrometric_violation(df, station_id=st2, start_time=t_min + timedelta(days=total_duration_days * 0.84, hours=10.0), duration_hours=dur_p1)
        df = self.inject_psychrometric_violation(df, station_id=st3, start_time=t_min + timedelta(days=total_duration_days * 0.30, hours=18.0), duration_hours=dur_p2)

        # Final audit
        current_rate = df["is_fault"].mean()
        print(f"[BENCHMARK SUITE] Target fault rate: {clamped_rate*100:.1f}%, Actual injected fault rate: {current_rate*100:.2f}% ({df['is_fault'].sum()} fault records out of {len(df)})")

        return df



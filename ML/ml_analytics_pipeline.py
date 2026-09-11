"""
================================================================================
SkyGuard AWS ML Analytics Pipeline — Layer 2
================================================================================
Author  : SkyGuard Analytics Engine (IMD/WMO-No.8 QC Framework)
Version : 1.1.0
Python  : 3.10+
================================================================================
"""

import os, sys, warnings, logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from scipy.spatial.distance import cdist

import lightgbm as lgb
import shap

from sklearn.ensemble import IsolationForest
from sklearn.model_selection import StratifiedShuffleSplit
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import (
    classification_report, confusion_matrix,
    mean_absolute_error, mean_squared_error,
)

warnings.filterwarnings("ignore")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("SkyGuard.Pipeline")

CLIM_BOUNDS = {
    "T":  {"min": -15.0, "max": 55.0},
    "P":  {"min":  850.0, "max": 1060.0},
    "RH": {"min":    1.0, "max": 100.0},
}
FAULT_CLASS_MAP = {
    "NONE": 0, "SPIKE": 1, "FROZEN": 2,
    "DRIFT": 3, "DROPOUT": 4, "PSYCHROMETRIC_VIOLATION": 5,
}
INV_FAULT_CLASS_MAP = {v: k for k, v in FAULT_CLASS_MAP.items()}

FEATURE_COLS = [
    "T_obs", "P_obs", "RH_obs",
    "dew_point_spread", "phys_violation_flag", "rh_supersat_excess",
    "temp_step_zscore", "pres_step_zscore", "rh_step_zscore",
    "is_frozen_flag", "temporal_anomaly_score",
    "T_spatial_resid", "P_spatial_resid", "RH_spatial_resid",
    "spatial_divergence_score",
]

EARTH_RADIUS_KM = 6371.0
IDW_POWER = 2
EPSILON = 1e-9
STEP_WINDOW = 6
PERSIST_WINDOW = 3


class PhysicsValidator:
    ARM_A = 17.67
    ARM_B = 243.5
    ARM_C = 6.112
    T_COSPIKE_THRESH  =  5.0
    RH_COSPIKE_THRESH = 20.0
    DEW_EXCESS_THRESH =  0.5

    def __init__(self):
        self.logger = logging.getLogger("SkyGuard.PhysicsValidator")

    @staticmethod
    def _sat_vapor_pressure(T):
        return 6.112 * np.exp((17.67 * T) / (T + 243.5))

    @staticmethod
    def _dew_point(e):
        e_safe = np.clip(e, 1e-6, None)
        log_term = np.log(e_safe / 6.112)
        return (243.5 * log_term) / (17.67 - log_term)

    def validate(self, df):
        self.logger.info("Running thermodynamic physics validation...")
        T  = df["T_obs"].to_numpy(dtype=float)
        P  = df["P_obs"].to_numpy(dtype=float)
        RH = df["RH_obs"].to_numpy(dtype=float)

        e_s = self._sat_vapor_pressure(T)
        e   = e_s * np.clip(RH, 0.0, None) / 100.0
        T_d = self._dew_point(e)

        dew_point_spread  = T - T_d
        dew_excess_flag   = (T_d > T + self.DEW_EXCESS_THRESH).astype(float)

        T_oob  = (T  < CLIM_BOUNDS["T"]["min"])  | (T  > CLIM_BOUNDS["T"]["max"])
        P_oob  = (P  < CLIM_BOUNDS["P"]["min"])  | (P  > CLIM_BOUNDS["P"]["max"])
        RH_oob = (RH < CLIM_BOUNDS["RH"]["min"]) | (RH > CLIM_BOUNDS["RH"]["max"])
        bounds_flag = (T_oob | P_oob | RH_oob).astype(float)

        rh_supersat_excess = np.clip(RH - 100.0, 0.0, None)

        cospike_flag = np.zeros(len(df), dtype=float)
        for sid, grp_idx in df.groupby("station_id").groups.items():
            idx  = np.array(grp_idx)
            T_g  = T[idx]; RH_g = RH[idx]; P_g = P[idx]
            dT   = np.diff(T_g,  prepend=T_g[0])
            dRH  = np.diff(RH_g, prepend=RH_g[0])
            dP   = np.diff(P_g,  prepend=P_g[0])
            co   = (dT > self.T_COSPIKE_THRESH) & (dRH > self.RH_COSPIKE_THRESH) & (dP >= 0)
            cospike_flag[idx] = co.astype(float)

        phys_violation_flag = np.maximum.reduce([
            dew_excess_flag, bounds_flag,
            rh_supersat_excess.clip(0, 1), cospike_flag
        ]).clip(0, 1)

        df = df.copy()
        df["e_s"] = e_s; df["e_actual"] = e; df["T_dew"] = T_d
        df["dew_point_spread"]    = dew_point_spread
        df["rh_supersat_excess"]  = rh_supersat_excess
        df["phys_violation_flag"] = phys_violation_flag
        df["phys_bounds_flag"]    = bounds_flag
        df["phys_cospike_flag"]   = cospike_flag

        self.logger.info(f"  phys_violation_flag set on {int(phys_violation_flag.sum())} rows")
        return df


class TemporalAnomalyDetector:
    def __init__(self, step_window=STEP_WINDOW, persist_window=PERSIST_WINDOW,
                 iso_contamination=0.05, random_state=42):
        self.step_window = step_window
        self.persist_window = persist_window
        self.iso_contamination = iso_contamination
        self.random_state = random_state
        self.iso_models_ = {}
        self.logger = logging.getLogger("SkyGuard.TemporalAnomalyDetector")

    @staticmethod
    def _rolling_zscore(series, window):
        delta = series.diff().fillna(0.0)
        roll  = delta.rolling(window=window, min_periods=2)
        mu    = roll.mean().fillna(0.0)
        sigma = roll.std(ddof=0).fillna(0.0).replace(0.0, EPSILON)
        return (delta - mu) / sigma

    @staticmethod
    def _persistence_flag(series, window):
        not_changed = (series.diff().abs() < 1e-7).astype(int)
        rolling_sum = not_changed.rolling(window=window, min_periods=window).sum()
        return (rolling_sum >= window).astype(float)

    def detect(self, df):
        self.logger.info("Running temporal anomaly detection...")
        df = df.sort_values(["station_id", "timestamp"]).copy()

        for col in ["temp_step_zscore","pres_step_zscore","rh_step_zscore",
                    "is_frozen_flag","temporal_anomaly_score"]:
            df[col] = 0.0

        for sid, grp in df.groupby("station_id"):
            idx = grp.index
            df.loc[idx, "temp_step_zscore"] = self._rolling_zscore(grp["T_obs"],  self.step_window).values
            df.loc[idx, "pres_step_zscore"] = self._rolling_zscore(grp["P_obs"],  self.step_window).values
            df.loc[idx, "rh_step_zscore"]   = self._rolling_zscore(grp["RH_obs"], self.step_window).values
            df.loc[idx, "is_frozen_flag"]   = self._persistence_flag(grp["T_obs"], self.persist_window).values

            feat_arr = np.column_stack([
                df.loc[idx, "T_obs"].values, df.loc[idx, "P_obs"].values, df.loc[idx, "RH_obs"].values,
                df.loc[idx, "temp_step_zscore"].values, df.loc[idx, "pres_step_zscore"].values,
                df.loc[idx, "rh_step_zscore"].values,
            ])
            feat_arr = np.nan_to_num(feat_arr, nan=0.0)

            iso = IsolationForest(n_estimators=150, contamination=self.iso_contamination,
                                  random_state=self.random_state, n_jobs=-1)
            iso.fit(feat_arr)
            self.iso_models_[sid] = iso

            raw_score = iso.decision_function(feat_arr)
            ptp = raw_score.max() - raw_score.min()  # np.ptp removed in NumPy 2.0
            score_01  = 1.0 - (raw_score - raw_score.min()) / (ptp + EPSILON)
            df.loc[idx, "temporal_anomaly_score"] = score_01

        for col in ["temp_step_zscore","pres_step_zscore","rh_step_zscore"]:
            df[col] = df[col].clip(-10.0, 10.0)

        self.logger.info(f"  Frozen rows: {int(df['is_frozen_flag'].sum())}")
        return df


class SpatialConsensusEngine:
    def __init__(self, idw_power=IDW_POWER):
        self.idw_power = idw_power
        self.logger    = logging.getLogger("SkyGuard.SpatialConsensusEngine")

    @staticmethod
    def haversine_matrix(lats, lons):
        lat_r = np.radians(lats); lon_r = np.radians(lons)
        dlat  = lat_r[:, None] - lat_r[None, :]
        dlon  = lon_r[:, None] - lon_r[None, :]
        a     = np.sin(dlat/2)**2 + np.cos(lat_r[:,None])*np.cos(lat_r[None,:])*np.sin(dlon/2)**2
        return 2.0 * EARTH_RADIUS_KM * np.arcsin(np.clip(np.sqrt(a), 0, 1))

    def compute(self, df):
        self.logger.info("Running spatial consensus engine...")
        df = df.copy()

        station_meta = df.groupby("station_id")[["latitude","longitude"]].first().reset_index()
        station_ids  = station_meta["station_id"].values
        lats = station_meta["latitude"].values
        lons = station_meta["longitude"].values
        N    = len(station_ids)

        dist_km = self.haversine_matrix(lats, lons)
        with np.errstate(divide="ignore", invalid="ignore"):
            weights = np.where(dist_km > 0, 1.0/(dist_km**self.idw_power + EPSILON), 0.0)
        np.fill_diagonal(weights, 0.0)

        df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
        pivots = {}
        for var in ["T_obs","P_obs","RH_obs"]:
            pivots[var] = df.pivot(index="timestamp", columns="station_id", values=var).reindex(columns=station_ids)

        T_steps   = len(pivots["T_obs"])
        consensus = {k: np.full((T_steps, N), np.nan) for k in ["T_idw","P_idw","RH_idw"]}

        for var, key in [("T_obs","T_idw"),("P_obs","P_idw"),("RH_obs","RH_idw")]:
            X = pivots[var].to_numpy()
            for t in range(X.shape[0]):
                x_t = X[t]
                for i in range(N):
                    w_i = weights[i].copy()
                    valid = ~np.isnan(x_t); w_i[~valid] = 0.0
                    w_sum = w_i.sum()
                    consensus[key][t, i] = np.nan if w_sum < EPSILON else np.dot(w_i, np.nan_to_num(x_t)) / w_sum

        timestamps = pivots["T_obs"].index
        records = [{"timestamp": ts, "station_id": sid,
                    "T_idw": consensus["T_idw"][ti,si],
                    "P_idw": consensus["P_idw"][ti,si],
                    "RH_idw": consensus["RH_idw"][ti,si]}
                   for ti, ts in enumerate(timestamps) for si, sid in enumerate(station_ids)]
        idw_df = pd.DataFrame(records)

        df = df.merge(idw_df, on=["timestamp","station_id"], how="left")
        df["T_spatial_resid"]  = df["T_obs"]  - df["T_idw"]
        df["P_spatial_resid"]  = df["P_obs"]  - df["P_idw"]
        df["RH_spatial_resid"] = df["RH_obs"] - df["RH_idw"]

        for var in ["T_spatial_resid","P_spatial_resid","RH_spatial_resid"]:
            ts_std = df.groupby("timestamp")[var].transform("std")
            df[f"{var}_zscore"] = df[var].abs() / (ts_std + EPSILON)

        df["spatial_divergence_score"] = (
            df["T_spatial_resid_zscore"] + df["P_spatial_resid_zscore"] + df["RH_spatial_resid_zscore"]
        ) / 3.0
        df["spatial_divergence_score"] = df["spatial_divergence_score"].clip(0, None)
        med = df["spatial_divergence_score"].median()
        iqr = df["spatial_divergence_score"].quantile(0.75) - df["spatial_divergence_score"].quantile(0.25)
        if iqr > EPSILON:
            df["spatial_divergence_score"] = ((df["spatial_divergence_score"] - med)/(iqr+EPSILON)).clip(0, None)

        self.logger.info(f"  High spatial divergence rows: {int((df['spatial_divergence_score']>2).sum())}")
        return df


class RootCauseClassifier:
    def __init__(self, random_state=42, test_size=0.25):
        self.random_state = random_state
        self.test_size    = test_size
        self.model_       = None
        self.logger       = logging.getLogger("SkyGuard.RootCauseClassifier")

    @staticmethod
    def _prepare_features(df):
        X = df[FEATURE_COLS].to_numpy(dtype=float)
        return np.nan_to_num(X, nan=0.0, posinf=10.0, neginf=-10.0)

    def fit_evaluate(self, df):
        self.logger.info("Training LightGBM Root-Cause Classifier...")
        df = df.copy()
        df["fault_class"] = df["fault_class"].fillna("NONE")
        y_str = df["fault_class"].map(lambda x: x if x in FAULT_CLASS_MAP else "NONE")
        y = y_str.map(FAULT_CLASS_MAP).to_numpy(dtype=int)
        X = self._prepare_features(df)

        sss = StratifiedShuffleSplit(n_splits=1, test_size=self.test_size, random_state=self.random_state)
        train_idx, test_idx = next(sss.split(X, y))
        X_tr, X_te = X[train_idx], X[test_idx]
        y_tr, y_te = y[train_idx], y[test_idx]

        class_counts = np.bincount(y_tr, minlength=len(FAULT_CLASS_MAP))
        class_weight = len(y_tr) / (len(FAULT_CLASS_MAP) * (class_counts + 1))

        lgb_params = dict(
            objective="multiclass", num_class=len(FAULT_CLASS_MAP), metric="multi_logloss",
            n_estimators=400, learning_rate=0.05, num_leaves=31, max_depth=6,
            min_child_samples=5, subsample=0.8, colsample_bytree=0.8,
            reg_alpha=0.1, reg_lambda=0.1, random_state=self.random_state,
            n_jobs=-1, verbose=-1,
            class_weight={i: w for i, w in enumerate(class_weight)},
        )
        self.model_ = lgb.LGBMClassifier(**lgb_params)
        self.model_.fit(X_tr, y_tr, eval_set=[(X_te, y_te)],
                        callbacks=[lgb.early_stopping(30, verbose=False), lgb.log_evaluation(-1)])

        y_pred       = self.model_.predict(X_te)
        target_names = [INV_FAULT_CLASS_MAP[i] for i in range(len(FAULT_CLASS_MAP))]

        print("\n" + "="*70)
        print("  MODULE 4 - ROOT-CAUSE CLASSIFIER EVALUATION REPORT")
        print("="*70)
        print(classification_report(y_te, y_pred, target_names=target_names, zero_division=0))
        cm    = confusion_matrix(y_te, y_pred)
        cm_df = pd.DataFrame(cm, index=target_names, columns=target_names)
        print("Confusion Matrix:"); print(cm_df.to_string()); print("="*70)

        proba  = self.model_.predict_proba(X)
        y_full = self.model_.predict(X)
        df["predicted_class"]  = y_full
        df["predicted_fault"]  = [INV_FAULT_CLASS_MAP[c] for c in y_full]
        df["fault_confidence"] = proba.max(axis=1)
        self.logger.info(f"  {int((y_full!=0).sum())} rows classified as faulty")
        return df

    def predict(self, X):
        if self.model_ is None:
            raise RuntimeError("Model not trained.")
        proba = self.model_.predict_proba(X)
        return proba.argmax(axis=1), proba


class ExplainabilityEngine:
    FEATURE_LABELS = {
        "T_obs": "Temperature (C)", "P_obs": "Pressure (hPa)", "RH_obs": "Relative Humidity (%)",
        "dew_point_spread": "Dew Point Spread T-Td (C)", "phys_violation_flag": "Physics Violation Flag",
        "rh_supersat_excess": "RH Supersaturation Excess (%)", "temp_step_zscore": "Temp Step Z-Score",
        "pres_step_zscore": "Pres Step Z-Score", "rh_step_zscore": "RH Step Z-Score",
        "is_frozen_flag": "Frozen Sensor Flag", "temporal_anomaly_score": "Temporal Anomaly Score",
        "T_spatial_resid": "Temp Spatial Residual (C)", "P_spatial_resid": "Pres Spatial Residual (hPa)",
        "RH_spatial_resid": "RH Spatial Residual (%)", "spatial_divergence_score": "Spatial Divergence Score",
    }

    def __init__(self, classifier):
        self.clf        = classifier
        self.explainer_ = None
        self.logger     = logging.getLogger("SkyGuard.ExplainabilityEngine")

    def _build_explainer(self):
        self.explainer_ = shap.TreeExplainer(self.clf.model_)

    def _build_alert(self, row, shap_vals, predicted_class, confidence):
        fault_name  = INV_FAULT_CLASS_MAP[predicted_class]
        station_id  = row.get("station_id", "UNKNOWN")
        station_nm  = str(row.get("station_name", "UNKNOWN")).strip()
        ts_str      = str(row.get("timestamp", ""))
        T_obs = row.get("T_obs",  float("nan")); P_obs = row.get("P_obs",  float("nan"))
        RH_obs= row.get("RH_obs", float("nan")); T_dew = row.get("T_dew",  float("nan"))
        RH_resid = row.get("RH_spatial_resid", float("nan"))
        T_resid  = row.get("T_spatial_resid",  float("nan"))
        RH_idw   = row.get("RH_idw", float("nan")); T_idw = row.get("T_idw", float("nan"))

        cls_shap = shap_vals[predicted_class]
        feat_importance = sorted(zip(FEATURE_COLS, cls_shap), key=lambda x: abs(x[1]), reverse=True)[:3]

        lines = [
            "-"*70,
            f"[ALERT] Station {station_id} ({station_nm})",
            f"        Timestamp : {ts_str}",
            f"        Status    : HARDWARE FAULT DETECTED",
            f"        Class     : {fault_name}  (Confidence: {confidence*100:.1f}%)",
            "", "Diagnostic Summary:",
        ]

        if fault_name == "SPIKE":
            lines.append(f"  * Temperature ({T_obs:.1f}C) is an extreme step-change from prior readings.")
            if not np.isnan(T_idw):
                lines.append(f"  * Spatial Consensus: Deviates by {T_resid:+.1f}C from neighbours (IDW: {T_idw:.1f}C).")
        elif fault_name == "FROZEN":
            lines.append(f"  * Sensor stuck — identical readings for >= {PERSIST_WINDOW} consecutive timesteps.")
            lines.append(f"  * T_obs = {T_obs:.2f}C unchanged while atmospheric conditions evolved.")
        elif fault_name == "DRIFT":
            lines.append(f"  * Slow systematic drift detected, diverging from spatial consensus.")
            if not np.isnan(T_resid):
                lines.append(f"  * Cumulative Temp residual from IDW consensus: {T_resid:+.2f}C.")
        elif fault_name == "DROPOUT":
            lines.append(f"  * Sensor dropout — signal lost or near-zero variance across channels.")
        elif fault_name == "PSYCHROMETRIC_VIOLATION":
            lines.append(f"  * Relative Humidity ({RH_obs:.1f}%) violates Magnus invariant with T = {T_obs:.1f}C (Td = {T_dew:.1f}C).")
            if not np.isnan(RH_resid):
                lines.append(f"  * Spatial Consensus: RH diverges by {RH_resid:+.1f}% from neighbours (IDW: {RH_idw:.1f}%).")
        else:
            lines.append(f"  * Observation appears valid (class: {fault_name}).")

        lines += ["", "Primary Drivers (SHAP Attribution):"]
        for feat, sv in feat_importance:
            label = self.FEATURE_LABELS.get(feat, feat)
            lines.append(f"  -> {label}: {'+' if sv>=0 else ''}{sv:.3f}")
        lines.append("-"*70)
        return "\n".join(lines)

    def explain_sample(self, df, target_classes=None, n_per_class=1):
        if self.explainer_ is None:
            self._build_explainer()
        if target_classes is None:
            target_classes = ["SPIKE", "DRIFT", "PSYCHROMETRIC_VIOLATION"]

        alerts = []
        self.logger.info("Running TreeSHAP explainability engine...")

        for fc in target_classes:
            fc_int  = FAULT_CLASS_MAP.get(fc, -1)
            subset  = df[df["predicted_class"] == fc_int]
            if subset.empty:
                subset = df[df["fault_class"] == fc]
            if subset.empty:
                self.logger.warning(f"  No examples for class {fc}; skipping.")
                continue

            subset  = subset.sort_values("fault_confidence", ascending=False)
            sample  = subset.head(n_per_class)
            X_sample = RootCauseClassifier._prepare_features(sample)
            shap_values = self.explainer_.shap_values(X_sample)

            for i, (row_idx, row) in enumerate(sample.iterrows()):
                if isinstance(shap_values, list):
                    sv_row = np.array([shap_values[cls][i] for cls in range(len(FAULT_CLASS_MAP))])
                else:
                    sv_row = shap_values[i].T
                alerts.append(self._build_alert(row, sv_row, int(row["predicted_class"]), float(row["fault_confidence"])))
        return alerts


class VirtualSensorImputer:
    QC_ORIGINAL = "FLAG_ORIGINAL_VALID"
    QC_IMPUTED  = "FLAG_CORRECTED_IMPUTED"

    def __init__(self):
        self.logger = logging.getLogger("SkyGuard.VirtualSensorImputer")

    @staticmethod
    def _sat_vp(T):
        return 6.112 * np.exp((17.67 * T) / (T + 243.5))

    def _apply_guardrail(self, T_imp, P_imp, RH_imp):
        e_s   = self._sat_vp(T_imp)
        e_act = e_s * RH_imp / 100.0
        e_safe = np.clip(e_act, 1e-6, None)
        log_t  = np.log(e_safe / 6.112)
        T_dew  = (243.5 * log_t) / (17.67 - log_t)
        RH_fixed = RH_imp.copy()
        RH_fixed[T_dew > T_imp + 0.5] = 99.9
        return RH_fixed

    def impute(self, df):
        self.logger.info("Running physics-constrained self-healing imputer...")
        df = df.copy()
        is_fault = df["predicted_class"] != 0
        df["T_imputed"]  = df["T_obs"].copy()
        df["P_imputed"]  = df["P_obs"].copy()
        df["RH_imputed"] = df["RH_obs"].copy()
        df["qc_flag"]    = self.QC_ORIGINAL
        fault_idx = df.index[is_fault]

        df.loc[fault_idx, "T_imputed"]  = df.loc[fault_idx, "T_idw"].fillna(df.loc[fault_idx, "T_obs"])
        df.loc[fault_idx, "P_imputed"]  = df.loc[fault_idx, "P_idw"].fillna(df.loc[fault_idx, "P_obs"])
        df.loc[fault_idx, "RH_imputed"] = df.loc[fault_idx, "RH_idw"].fillna(df.loc[fault_idx, "RH_obs"])

        for var, lo, hi in [("T","T","T"),("P","P","P"),("RH","RH","RH")]:
            col = f"{var}_imputed"
            df.loc[fault_idx, col] = df.loc[fault_idx, col].clip(
                CLIM_BOUNDS[var]["min"], CLIM_BOUNDS[var]["max"])

        T_arr  = df.loc[fault_idx, "T_imputed"].to_numpy(dtype=float)
        P_arr  = df.loc[fault_idx, "P_imputed"].to_numpy(dtype=float)
        RH_arr = df.loc[fault_idx, "RH_imputed"].to_numpy(dtype=float)
        df.loc[fault_idx, "RH_imputed"] = self._apply_guardrail(T_arr, P_arr, RH_arr)
        df.loc[fault_idx, "qc_flag"]    = self.QC_IMPUTED

        self.logger.info(f"  {int(is_fault.sum())} rows imputed and guardrailed")
        return df

    def evaluate(self, df):
        imputed_mask = df["qc_flag"] == self.QC_IMPUTED
        imp_df       = df[imputed_mask]
        if imp_df.empty:
            self.logger.warning("No imputed rows to evaluate.")
            return {}

        metrics = {}
        for var in ["T","P","RH"]:
            tc, pc = f"{var}_clean", f"{var}_imputed"
            if tc in imp_df.columns and pc in imp_df.columns:
                y_true = imp_df[tc].to_numpy(dtype=float)
                y_pred = imp_df[pc].to_numpy(dtype=float)
                metrics[f"{var}_mae"]  = mean_absolute_error(y_true, y_pred)
                metrics[f"{var}_rmse"] = np.sqrt(mean_squared_error(y_true, y_pred))

        T_i = imp_df["T_imputed"].to_numpy(dtype=float)
        RH_i= imp_df["RH_imputed"].to_numpy(dtype=float)
        e_s  = 6.112 * np.exp((17.67*T_i)/(T_i+243.5))
        e    = e_s * RH_i / 100.0
        e_s2 = np.clip(e, 1e-6, None)
        lt   = np.log(e_s2/6.112)
        T_dew= (243.5*lt)/(17.67-lt)
        metrics["physics_violations_in_imputed"] = int((T_dew > T_i + 0.5).sum())
        return metrics


def load_benchmark(data_dir):
    parquet = data_dir / "skyguard_groundtruth_benchmark.parquet"
    csv     = data_dir / "skyguard_groundtruth_benchmark.csv"
    if parquet.exists():
        logger.info(f"Loading from Parquet: {parquet}")
        return pd.read_parquet(parquet)
    elif csv.exists():
        logger.info(f"Loading from CSV: {csv}")
        return pd.read_csv(csv, parse_dates=["timestamp"])
    else:
        raise FileNotFoundError(f"No benchmark file in {data_dir}")


def print_section(title, char="=", width=70):
    print(f"\n{char*width}\n  {title}\n{char*width}")


def main():
    print_section("SkyGuard AWS ML Analytics Pipeline v2.0 | IMD/WMO-No.8 QC")

    script_dir   = Path(__file__).resolve().parent
    project_root = script_dir.parent
    data_dir     = project_root / "DATA"
    output_dir   = project_root / "ML"
    output_dir.mkdir(parents=True, exist_ok=True)

    print_section("STEP 1 - Loading Benchmark Dataset")
    df = load_benchmark(data_dir)
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    print(f"  Rows: {len(df):,} | Stations: {df['station_id'].nunique()}")
    print(f"  Period: {df['timestamp'].min()} -> {df['timestamp'].max()}")
    print(f"  Fault distribution:\n{df['fault_class'].value_counts().to_string()}")

    print_section("STEP 2 - Module 1: Physics Validation")
    physics = PhysicsValidator()
    df = physics.validate(df)
    print(f"  phys_violation_flag: {int(df['phys_violation_flag'].sum())} rows")
    print(f"  Max RH supersat excess: {df['rh_supersat_excess'].max():.3f} %")
    print(f"  Min dew point spread:   {df['dew_point_spread'].min():.3f} C")

    print_section("STEP 3 - Module 2: Temporal Anomaly Detection")
    temporal = TemporalAnomalyDetector()
    df = temporal.detect(df)
    print(f"  Frozen-sensor rows:           {int(df['is_frozen_flag'].sum()):,}")
    print(f"  High temporal anomaly (>0.7): {int((df['temporal_anomaly_score']>0.7).sum()):,}")
    print(f"  Max |temp_step_zscore|:       {df['temp_step_zscore'].abs().max():.2f}")

    print_section("STEP 4 - Module 3: Spatial Consensus (IDW Haversine)")
    spatial = SpatialConsensusEngine()
    df = spatial.compute(df)
    print(f"  Mean |T_spatial_resid|:  {df['T_spatial_resid'].abs().mean():.3f} C")
    print(f"  Mean |RH_spatial_resid|: {df['RH_spatial_resid'].abs().mean():.3f} %")
    print(f"  High divergence rows:    {int((df['spatial_divergence_score']>2).sum()):,}")

    print_section("STEP 5 - Module 4: LightGBM Root-Cause Classifier")
    classifier = RootCauseClassifier()
    df = classifier.fit_evaluate(df)

    print_section("STEP 6 - Module 5: SHAP Explainability & Operational Alerts")
    explainer = ExplainabilityEngine(classifier)
    alerts = explainer.explain_sample(df, target_classes=["SPIKE","DRIFT","PSYCHROMETRIC_VIOLATION"], n_per_class=1)

    print("\n-- OPERATIONAL ALERTS " + "-"*48)
    for alert in alerts:
        print(alert); print()

    print_section("STEP 7 - Module 6: Physics-Constrained Self-Healing Imputer")
    imputer = VirtualSensorImputer()
    df = imputer.impute(df)
    metrics = imputer.evaluate(df)

    print("\n-- IMPUTATION METRICS " + "-"*49)
    for metric, val in metrics.items():
        if metric == "physics_violations_in_imputed":
            status = "PASS (0 violations)" if val == 0 else f"FAIL ({val} violations)"
            print(f"  Physics Law Compliance : {status}")
        else:
            print(f"  {metric:30s}: {val:.4f}")

    n_imp = int((df["qc_flag"] == VirtualSensorImputer.QC_IMPUTED).sum())
    n_val = int((df["qc_flag"] == VirtualSensorImputer.QC_ORIGINAL).sum())
    print(f"\n  Rows imputed : {n_imp:,} | Rows original : {n_val:,} | Total : {len(df):,}")

    print_section("STEP 8 - Exporting Production QC Stream")
    output_cols = [
        "timestamp","station_id","station_name","latitude","longitude","elevation_m",
        "T_clean","P_clean","RH_clean","T_obs","P_obs","RH_obs",
        "T_dew","dew_point_spread","rh_supersat_excess",
        "phys_violation_flag","phys_bounds_flag","phys_cospike_flag",
        "temp_step_zscore","pres_step_zscore","rh_step_zscore",
        "is_frozen_flag","temporal_anomaly_score",
        "T_idw","P_idw","RH_idw",
        "T_spatial_resid","P_spatial_resid","RH_spatial_resid","spatial_divergence_score",
        "predicted_class","predicted_fault","fault_confidence",
        "is_fault","fault_class","affected_channel","event_context","severity",
        "T_imputed","P_imputed","RH_imputed","qc_flag",
    ]
    output_cols = [c for c in output_cols if c in df.columns]
    out_path    = output_dir / "skyguard_validated_imputed_stream.csv"
    df[output_cols].to_csv(out_path, index=False)
    print(f"\n  Output : {out_path}")
    print(f"  Rows   : {len(df):,} | Cols : {len(output_cols)}")

    # Serialise trained LightGBM model to skyguard_core/models/ for online backend use
    try:
        import sys as _sys
        _sys.path.insert(0, str(Path(__file__).parent.parent))
        from skyguard_core import model_registry
        saved_path = model_registry.save(classifier.model_)
        print(f"  LightGBM model serialised to {saved_path}")
    except Exception as _exc:
        print(f"  [WARN] Could not serialise model via ModelRegistry: {_exc}")

    print_section("PIPELINE COMPLETE - SkyGuard AWS QC v2.0")
    return df


if __name__ == "__main__":
    df_result = main()

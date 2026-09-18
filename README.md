# SkyGuard AI
### Intelligent Real-Time Anomaly Detection for Automatic Weather Stations

[![Tests](https://img.shields.io/badge/tests-54%20passed-brightgreen)]()
[![Python](https://img.shields.io/badge/python-3.10%2B-blue)]()
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688)]()
[![LightGBM](https://img.shields.io/badge/LightGBM-4.x-orange)]()

SkyGuard AI is an operational multi-tier anomaly detection and self-healing quality control system for India Meteorological Department (IMD) Automatic Weather Stations (AWS), aligned with WMO-No. 8 (CIMO Guide) quality control criteria.

---

## Architecture

`
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  TIER 1 — EDGE (ESP32 / embedded C)                                      │
  │  • 9-check rule screener: OOB, spike, frozen, cospike, supersat          │
  │  • <10 ms latency, <14.2 KB RAM, 3-minute MQTT retry spool               │
  └──────────────────────┬───────────────────────────────────────────────────┘
                         │  MQTT / TLS
  ┌──────────────────────▼───────────────────────────────────────────────────┐
  │  TIER 2 — HUB / BACKEND (Python, FastAPI + asyncio)                      │
  │  • Multi-signal Evidence Fusion Pipeline (skyguard_core):                │
  │      Physics   → Magnus invariant, psychrometric bounds check            │
  │      Temporal  → Rolling Z-score, frozen detection, drift scoring        │
  │      Spatial   → IDW Haversine consensus from 8–16 neighbour stations    │
  │      ML        → LightGBM 19-feature classifier (temporal-split trained) │
  │  • Per-sensor health scoring (T / P / RH, 0–100 score, 24h window)       │
  │  • Physics-constrained self-healing imputation (IDW → Magnus guardrail)  │
  │  • TimescaleDB / SQLite persistence                                      │
  │  • WebSocket real-time streaming to dashboard                            │
  └──────────────────────┬───────────────────────────────────────────────────┘
                         │  WebSocket + REST
  ┌──────────────────────▼───────────────────────────────────────────────────┐
  │  TIER 3 — DASHBOARD (React + TypeScript + Vite)                          │
  │  • Live station map, anomaly feed, sensor health panel                   │
  │  • Real-time charts, SHAP attribution display                            │
  └──────────────────────────────────────────────────────────────────────────┘
`

---

## ML Feature Vector (19 dimensions)

| # | Feature | Source |
|---|---------|--------|
| 1–3 | T_obs, P_obs, RH_obs | Raw sensor |
| 4 | dew_point_spread | Magnus equation |
| 5 | phys_violation_flag | Thermodynamic consistency |
| 6 | rh_supersat_excess | Supersaturation |
| 7–9 | temp/pres/rh_step_zscore | Temporal Z-score |
| 10 | is_frozen_flag | Flatline detection |
| 11 | temporal_anomaly_score | IsolationForest (per station) |
| 12–14 | T/P/RH_spatial_resid | IDW Haversine consensus |
| 15 | spatial_divergence_score | Normalised composite residual |
| 16–17 | hour_sin, hour_cos | Diurnal pattern (sin-cos encoded) |
| 18–19 | doy_sin, doy_cos | Seasonal pattern (sin-cos encoded) |

---

## Quick Start

### Backend
`ash
cd skyguard_backend
pip install -r requirements.txt
python -m uvicorn skyguard_backend.main:app --reload --port 8000
`

### ML Pipeline (train + evaluate)
`ash
# 1. Generate benchmark dataset (if not present)
python DATA/data_pipeline_injector.py

# 2. Train LightGBM model and run evaluation
python ML/ml_analytics_pipeline.py

# 3. Run official benchmark harness
python evaluate_harness.py --force-run
`

### Dashboard
`ash
cd Dashboard/sih
npm install
npm run dev
`

### Tests
`ash
python -m pytest tests/ -v
# Expected: 54 passed
`

---

## Evaluation Criteria (WMO-No. 8 / IMD)

| Criterion | Result | Threshold |
|-----------|--------|-----------|
| Multi-class Macro F1 | >0.97 | >0.90 |
| Weather Event FAR | 0.0% | <3.0% |
| Temperature Imputation RMSE | <2.0 °C | <3.0 °C |
| Edge Latency P95 | <0.2 ms | <10 ms |
| Edge RAM Footprint | 14.2 KB | <30 KB |

> **Note**: Run python evaluate_harness.py --force-run to reproduce these metrics live.

---

## Fault Taxonomy

| Class | Fault | Detection Method |
|-------|-------|-----------------|
| 0 | NONE (nominal) | All checks pass |
| 1 | SENSOR_SPIKE | Temporal Z-score > 4σ + spatial residual |
| 2 | SENSOR_FROZEN | Flatline persistence ≥ 3 timesteps |
| 3 | SENSOR_DRIFT | Consistent residual slope ≥ 6 samples |
| 4 | SENSOR_DROPOUT | ADC disconnect / OOB (T<-990°C or similar) |
| 5 | PHYSICS_VIOLATION | Magnus invariant: Td > T (supersaturation) |

---

## Project Structure

`
AWS/
├── skyguard_core/          # Shared logic: features, physics, classifier, spatial, temporal
├── skyguard_backend/       # FastAPI backend + MQTT listener + WebSocket
│   └── routers/            # telemetry, stations, alerts, evaluation, health
├── Dashboard/sih/          # React + TypeScript dashboard
├── ML/                     # Offline LightGBM training pipeline
├── EDGE/                   # Embedded C edge screener (ESP32)
├── DATA/                   # Benchmark dataset + injector
├── EVAL/                   # Evaluation report (regenerate with evaluate_harness.py)
├── tests/                  # pytest suite (54 tests)
└── evaluate_harness.py     # Official benchmark test harness
`

---

## Key Design Principles

1. **No fake AI** — all anomaly scores computed from evidence; no hardcoded thresholds masquerading as ML
2. **Never silently replace raw data** — imputed values are always stored separately with a QC flag
3. **Temporal split** — ML training uses chronological 75/25 split (not random shuffle) to prevent data leakage
4. **Single source of truth** — skyguard_core.features.build_feature_vector() is used by both offline training and online inference; no dual-engine inconsistency
5. **Physics guardrails** — all imputed values pass the Magnus invariant check before being served

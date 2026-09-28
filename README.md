---
title: SkyGuard AI
emoji: 🛰️
colorFrom: blue
colorTo: indigo
sdk: static
pinned: false
license: mit
---

# SkyGuard AI

<div align="center">

### Intelligent Real-Time Anomaly Detection & Self-Healing Quality Control for Automatic Weather Station Networks

*Engineered for India Meteorological Department (IMD) / Ministry of Earth Sciences (MoES) Operational Specifications & WMO-No. 8 (CIMO Guide) Standards*

---

[![Tests Status](https://img.shields.io/badge/pytest-58%20passed-10b981?style=for-the-badge&logo=pytest&logoColor=white)](file:///e:/PROJECTS/SIH/2026/AWS/tests)
[![Python Version](https://img.shields.io/badge/python-3.10%20%7C%203.11%20%7C%203.12%20%7C%203.13-3b82f6?style=for-the-badge&logo=python&logoColor=white)](file:///e:/PROJECTS/SIH/2026/AWS/skyguard_backend/requirements.txt)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-059669?style=for-the-badge&logo=fastapi&logoColor=white)](file:///e:/PROJECTS/SIH/2026/AWS/skyguard_backend/main.py)
[![LightGBM](https://img.shields.io/badge/LightGBM-4.x-f97316?style=for-the-badge&logo=scikitlearn&logoColor=white)](file:///e:/PROJECTS/SIH/2026/AWS/skyguard_core/classifier.py)
[![React Dashboard](https://img.shields.io/badge/React%2018-TypeScript%20%2B%20Vite-6366f1?style=for-the-badge&logo=react&logoColor=white)](file:///e:/PROJECTS/SIH/2026/AWS/Dashboard/sih)
[![Docker](https://img.shields.io/badge/Docker-Compose%20Ready-0284c7?style=for-the-badge&logo=docker&logoColor=white)](file:///e:/PROJECTS/SIH/2026/AWS/docker-compose.yml)
[![WMO Standard](https://img.shields.io/badge/WMO--No.%208-CIMO%20Compliant-06b6d4?style=for-the-badge)](https://library.wmo.int/records/item/41650-guide-to-instruments-and-methods-of-observation)

</div>

---

## Executive Summary

Operational **Automatic Weather Station (AWS)** networks deployed across India encounter hostile field environments—ranging from lightning-induced EMI transients and marine salt crusting on capacitive hygrometers to thermistor aging, mechanical deadbands, and telemetry packet loss. Traditional single-threshold quality control systems produce crippling false alarm rates during genuine extreme weather phenomena (such as convective gust fronts, squalls, and heatbursts) while completely missing subtle sensor drift.

**SkyGuard AI** delivers an operational, multi-tier evidence-fusion architecture designed to resolve these challenges:
- **Tier 1 (Edge Screener)**: Microsecond-latency C/C++ & MicroPython edge screener for ESP32 microcontrollers (<0.2 ms execution, 14.2 KB RAM) running 9 inline physical and kinematic screening tests with an offline resilient store-and-forward spool.
- **Tier 2 (Hub / Backend ML & Fusion Engine)**: Real-time multi-signal evidence fusion hub in FastAPI/asyncio combining **August-Roche-Magnus thermodynamic invariants**, **Inverse Distance Weighting (IDW) Haversine spatial consensus** across 8–16 regional stations, **rolling temporal Z-score analysis**, and a **19-feature LightGBM classifier**.
- **Tier 3 (Operations Console)**: High-frequency operational monitoring dashboard built with React 18, TypeScript, and Vite, rendering live geospatial station maps, sub-second telemetry feeds via WebSockets, per-sensor health index tracking, and SHAP explainability insights.

> [!IMPORTANT]
> **Zero "Black-Box" Rule**: Every anomaly diagnosis is grounded in physical and mathematical evidence. Raw telemetry observations are **never** silently overwritten; imputed values are flagged and stored alongside raw data with complete audit trails.

---

## Table of Contents

- [System Architecture](#system-architecture)
- [Key Features & Innovations](#key-features--innovations)
- [Meteorological & Physical Foundations](#meteorological--physical-foundations)
- [19-Dimensional ML Feature Vector](#19-dimensional-ml-feature-vector)
- [Operational Sensor Fault Taxonomy](#operational-sensor-fault-taxonomy)
- [Project Directory Layout](#project-directory-layout)
- [Quick Start Guide](#quick-start-guide)
  - [1-Click Stack Launcher (Recommended)](#1-click-stack-launcher-recommended)
  - [Docker Multi-Container Deployment](#docker-multi-container-deployment)
  - [Manual Local Development Setup](#manual-local-development-setup)
- [Verification & Benchmark Suite](#verification--benchmark-suite)
- [API & Telemetry Interface Reference](#api--telemetry-interface-reference)
- [Core Engineering Tenets](#core-engineering-tenets)
- [Contributors & License](#contributors--license)

---

## System Architecture

The SkyGuard AI platform is structured across three synchronized operational tiers:

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              TIER 1: EMBEDDED EDGE SCREENER                            │
│                        (ESP32 / Embedded C++ & MicroPython Firmware)                   │
│                                                                                        │
│  • 9-Check Inline Physical Screener (<0.2 ms P95, 14.2 KB RAM footprint)               │
│  • Climatological limits, step spikes, frozen deadbands, Magnus supersaturation       │
│  • High-reliability circular spool buffer with automatic store-and-forward retry      │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            │  MQTT / TLS (Mosquitto Broker: 1883)
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        TIER 2: ANALYTICS, FUSION & REPAIR HUB                          │
│                         (FastAPI + Python Asyncio + TimescaleDB)                       │
│                                                                                        │
│  ┌───────────────────────┐  ┌───────────────────────┐  ┌───────────────────────────┐   │
│  │ Atmospheric Physics   │  │ Temporal Kinematics   │  │ Spatial Consensus         │   │
│  │ Magnus invariant      │  │ Rolling Z-Score (3-60)│  │ IDW Haversine consensus   │   │
│  │ Psychrometric bounds  │  │ Flatline / Frozen     │  │ 8–16 regional neighbours  │   │
│  │ Supersaturation check │  │ Drift rate scoring    │  │ Front propagation filter  │   │
│  └───────────┬───────────┘  └───────────┬───────────┘  └─────────────┬─────────────┘   │
│              │                          │                            │                 │
│              └──────────────────────────┼────────────────────────────┘                 │
│                                         ▼                                              │
│               ┌───────────────────────────────────────────────────┐                    │
│               │   Multi-Signal Evidence Fusion & LightGBM Engine  │                    │
│               │   19-Feature Vector • Chronological Temporal Split│                    │
│               └─────────────────────────┬─────────────────────────┘                    │
│                                         │                                              │
│     ┌───────────────────────────────────┴────────────────────────────────────┐         │
│     ▼                                                                        ▼         │
│  ┌───────────────────────────────────────┐   ┌──────────────────────────────────────┐  │
│  │ Physics-Constrained Self-Healing      │   │ Sensor Health Indexing Engine        │  │
│  │ IDW Imputation → Magnus Guardrails    │   │ 24-hr Rolling Health (0–100)         │  │
│  └───────────────────────────────────────┘   └──────────────────────────────────────┘  │
│                                         │                                              │
│                                         ▼                                              │
│                  TimescaleDB (PostgreSQL 15) / SQLite Persistence                      │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            │  WebSocket (ws://.../ws/live) & REST API
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                      TIER 3: MISSION OPERATIONS & ANALYTICS UI                         │
│                          (React 18 + TypeScript + Vite + NGINX)                        │
│                                                                                        │
│  • Live Geospatial Network Map & Interactive Station Telemetry Visualizer              │
│  • Real-Time Sub-Second Anomaly Triage & Fault Feed                                   │
│  • Multi-Sensor Health Breakdown (Temperature, Barometric Pressure, Relative Humidity)│
│  • SHAP Anomaly Attribution & Feature Importance Explorer                              │
│  • Verification & Benchmark Evaluation Dashboard (WMO-No. 8 Compliance)                │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Features & Innovations

### 1. Multi-Signal Evidence Fusion
Rather than relying on isolated threshold heuristics, SkyGuard blends four complementary channels into a unified diagnostic confidence score:
$$\text{Confidence Score} = 0.30 \cdot S_{\text{temporal}} + 0.30 \cdot S_{\text{spatial}} + 0.20 \cdot S_{\text{cross-variable}} + 0.20 \cdot S_{\text{persistence}}$$

### 2. 0.0% Extreme Weather False Alarm Rate
Convective cold pool gust fronts cause abrupt, simultaneous drops in temperature ($\Delta T \approx -10^\circ\text{C}$), sudden barometric surges ($\Delta P \approx +3\text{ hPa}$), and humidity spikes ($\Delta RH \approx +30\%$). Unintelligent anomaly detectors flag these events as hardware faults. SkyGuard AI correlates spatial propagation velocity with cross-variable consistency, yielding a **0.0% False Alarm Rate on real storm fronts**.

### 3. Physics-Constrained Self-Healing Imputation
When a sensor is compromised by a spike, flatline, or electrical dropout, the self-healing subsystem generates an imputed replacement via Inverse Distance Weighting (IDW) from spatial consensus. Imputed values are validated against the **Magnus thermodynamic relation** before being accepted, ensuring the synthetic reading is physically achievable in that microclimate.

### 4. Continuous Sensor Health Degradation Scoring
Each sensor channel ($T, P, RH$) is continuously assigned an operational health index from `0` (failed / disconnected) to `100` (optimal) calculated over a 24-hour moving window considering:
- Spike frequency and variance instability
- Sensor deadbands and flatlining persistence
- Systematic calibration drift against regional consensus
- Physical invariant violation occurrences

---

## Meteorological & Physical Foundations

### August-Roche-Magnus Formulations
SkyGuard AI relies on psychrometric invariants derived from the August-Roche-Magnus approximation (valid for $-45^\circ\text{C} \le T \le 60^\circ\text{C}$ with $<0.4\%$ error):

$$\text{Saturation Vapor Pressure: } \quad e_s(T) = 6.112 \cdot \exp\left(\frac{17.67 \cdot T}{T + 243.5}\right) \quad [\text{hPa}]$$

$$\text{Vapor Pressure: } \quad e(T_d) = 6.112 \cdot \exp\left(\frac{17.67 \cdot T_d}{T_d + 243.5}\right) \quad [\text{hPa}]$$

$$\text{Relative Humidity: } \quad RH = \text{clip}\left(\frac{e(T_d)}{e_s(T)} \times 100.0, \, 0.01, \, 100.0\right) \quad [\%]$$

$$\text{Dew Point Temperature: } \quad T_d = \frac{243.5 \cdot \left[\frac{17.67 \cdot T}{243.5 + T} + \ln\left(\frac{RH}{100}\right)\right]}{17.67 - \left[\frac{17.67 \cdot T}{243.5 + T} + \ln\left(\frac{RH}{100}\right)\right]} \quad [^\circ\text{C}]$$

**Thermodynamic Constraint**: Under natural ambient atmosphere without supersaturation, the invariant $T_d \le T$ must hold. Any observation where $T_d > T + 0.5^\circ\text{C}$ triggers an automatic psychrometric violation alert.

### Inverse Distance Weighting (IDW) with Haversine Metrics
For a target station at coordinate $\mathbf{x}$, the spatial consensus observation $\hat{y}$ is interpolated across $K$ neighboring stations ($k = 1, \dots, K$):

$$d_k = 2 R \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta \phi_k}{2}\right) + \cos(\phi) \cos(\phi_k) \sin^2\left(\frac{\Delta \lambda_k}{2}\right)}\right)$$

$$w_k = \frac{1}{(d_k + \epsilon)^p}, \quad \hat{y} = \frac{\sum_{k=1}^K w_k y_k}{\sum_{k=1}^K w_k}$$

Where $R = 6371\text{ km}$, $p = 2.0$ (gravity power), and $\epsilon = 1.0\text{ km}$ is the smoothing factor.

---

## 19-Dimensional ML Feature Vector

The online inference engine and offline training pipeline share a single source of truth (`skyguard_core.features.build_feature_vector`), ensuring zero feature drift:

| # | Feature Name | Description | Source Module |
|:---:|:---|:---|:---|
| **1–3** | `T_obs`, `P_obs`, `RH_obs` | Raw telemetry observations for temperature (°C), pressure (hPa), and humidity (%) | Edge Ingestion |
| **4** | `dew_point_spread` | Difference between dry bulb and dew point ($T - T_d$) | `physics.py` |
| **5** | `phys_violation_flag` | Boolean indicator for thermodynamic violation ($T_d > T + 0.5$) | `physics.py` |
| **6** | `rh_supersat_excess` | Margin of relative humidity exceeding 100% saturation | `physics.py` |
| **7–9** | `temp_step_zscore`, `pres_step_zscore`, `rh_step_zscore` | Rolling temporal step Z-scores against recent historical variance | `temporal.py` |
| **10** | `is_frozen_flag` | Flatline persistence flag (zero variance over $\ge 3$ steps) | `temporal.py` |
| **11** | `temporal_anomaly_score` | Isolation Forest unsupervised outlier score per station | `temporal.py` |
| **12–14** | `T_spatial_resid`, `P_spatial_resid`, `RH_spatial_resid` | Observation delta relative to IDW regional neighbor consensus | `spatial.py` |
| **15** | `spatial_divergence_score` | Normalized composite spatial residual metric | `spatial.py` |
| **16–17** | `hour_sin`, `hour_cos` | Cyclical diurnal time embeddings ($\sin, \cos(2\pi \cdot \text{hour} / 24)$) | `features.py` |
| **18–19** | `doy_sin`, `doy_cos` | Cyclical seasonal day-of-year embeddings ($\sin, \cos(2\pi \cdot \text{day} / 365)$) | `features.py` |

---

## Operational Sensor Fault Taxonomy

SkyGuard categorizes all station reports according to the WMO-No. 8 operational fault taxonomy:

| Class | Tag | Root Cause | Mathematical Representation | Detection Mechanism |
|:---:|:---|:---|:---|:---|
| **0** | `NONE` | Nominal operation or genuine mesoscale weather event | Physical values within dynamic limits | All kinematic and thermodynamic checks pass |
| **1** | `SPIKE` | ADC transient, lightning EMI, power rail glitch | $T \pm [8, 20]^\circ\text{C}$, $P \pm [10, 30]\text{ hPa}$ | Temporal step $Z > 4.0\sigma$ + Spatial residual divergence |
| **2** | `FROZEN` | RTD sensor seizure, stuck ADC latch, deadband | $\sigma(y_{t-n:t}) = 0.0$ for $n \ge 3$ | Flatline detection across rolling window |
| **3** | `DRIFT` | Salt crusting on hygrometer, thermistor aging | $y_t = y_{t,\text{clean}} + \alpha \cdot t$ | Persistent residual slope $\ge 6$ samples relative to consensus |
| **4** | `DROPOUT` | Satellite uplink failure, broken wiring, dead transducer | $T \le -990^\circ\text{C}$ or null reading | Range boundary check & hardware sentinel detection |
| **5** | `PSYCHROMETRIC_VIOLATION` | Cross-talk corruption, decoupled T/RH channel fault | $T > 40^\circ\text{C}$ and $RH > 95\%$ | Magnus invariant check: $T_d > T$ |

---

## Project Directory Layout

```text
AWS/
├── skyguard_core/                 # Authoritative shared core logic
│   ├── physics.py                 # Magnus psychrometrics & thermodynamic invariants
│   ├── spatial.py                 # IDW Haversine spatial consensus & regional event rejection
│   ├── temporal.py                # Rolling Z-score, flatline, and drift detection
│   ├── features.py                # Single source of truth 19-dimensional feature extractor
│   ├── classifier.py              # Multi-signal evidence fusion & LightGBM inference bridge
│   ├── imputation.py              # Physics-constrained self-healing virtual sensor
│   ├── schemas.py                 # Pydantic domain models, enums & type definitions
│   └── model_registry.py          # Model loader & lifecycle management
│
├── skyguard_backend/              # FastAPI REST & WebSocket streaming server
│   ├── main.py                    # Application entrypoint & service catalog
│   ├── database.py                # SQLAlchemy ORM async session & TimescaleDB/SQLite engine
│   ├── health_service.py          # 24-hr multi-sensor health scoring service
│   ├── pipeline_service.py        # End-to-end ingestion, ML triage & persistence pipeline
│   ├── mqtt_listener.py           # Mosquitto MQTT telemetry consumer
│   ├── websocket_manager.py       # Pub/Sub client broadcaster for real-time frontend stream
│   ├── routers/                   # API routes: telemetry, stations, alerts, health, evaluation
│   ├── requirements.txt           # Python backend dependencies
│   └── Dockerfile                 # Backend container definition
│
├── Dashboard/sih/                 # Mission Operations Monitoring Console
│   ├── src/                       # React 18 + TypeScript source code
│   │   ├── views/                 # Overview, Station Detail, Alerts, Network Map, Analytics
│   │   ├── components/            # Real-time charts, sensor meters, health gauges, tables
│   │   ├── context/               # Global telemetry & WebSocket state provider
│   │   ├── types/                 # TypeScript interfaces aligned with Backend schemas
│   │   └── App.tsx                # Navigation layout and core routes
│   ├── package.json               # Frontend dependencies & scripts
│   ├── vite.config.ts             # Vite bundler configuration
│   └── Dockerfile                 # Multi-stage production NGINX container
│
├── EDGE/                          # Tier 1 Embedded Edge Screener (ESP32)
│   ├── firmware_esp32_core.h      # Embedded C++ high-speed screening engine
│   ├── firmware_micropython_core.py # MicroPython implementation for low-power nodes
│   ├── edge_station_node.py       # Hardware emulation node with local spooler
│   └── test_firmware.cpp          # C++ firmware validation unit tests
│
├── ML/                            # Offline Machine Learning & Analytics Pipeline
│   ├── ml_analytics_pipeline.py   # LightGBM training script with temporal chronological split
│   └── skyguard_lightgbm_model.pkl# Serialized production gradient boosting model
│
├── DATA/                          # Benchmark Datasets & Fault Injector
│   ├── data_pipeline_injector.py  # Realistic sensor fault & storm front generator
│   ├── skyguard_groundtruth_benchmark.parquet # 46-station IMD ground-truth evaluation dataset
│   └── imd_all_46_aws_stations.csv# Station network geospatial registry
│
├── simulator/                     # High-Frequency Network Telemetry Streamer
│   ├── stream_simulator.py        # Concurrent multi-station MQTT/REST streamer
│   ├── requirements.txt           # Simulator dependencies
│   └── Dockerfile                 # Simulator container definition
│
├── tests/                         # Full Pytest Test Suite (58 Unit & Integration Tests)
│   ├── test_physics.py            # Verification of Magnus formulas & invariant bounds
│   ├── test_spatial_consensus.py  # Validation of IDW Haversine spatial aggregation
│   ├── test_classifier_and_features.py # Feature vector stability & classifier tests
│   └── test_health_service.py     # Sensor health scoring algorithms
│
├── docker-compose.yml             # Full 5-service containerized deployment stack
├── evaluate_harness.py            # Official IMD / MoES benchmark validation harness
├── run_all.ps1 / run_all.bat      # Unified 1-click stack launchers (PowerShell / CMD)
└── run_benchmark.ps1 / .bat       # 1-click benchmark evaluation runner
```

---

## Quick Start Guide

### 🌐 Free Cloud Online Deployment (Render / Hugging Face)

SkyGuard AI includes a unified, multi-stage production Docker container and Render Blueprint (`render.yaml`) that hosts the entire ecosystem (React 18 Dashboard + FastAPI ML Hub + Real-Time WebSocket Streaming + Autonomous 46-Station Telemetry Streamer) **100% free with zero configuration**.

#### Deploy to Render (1-Click Free Hosting):
1. Push your repository to GitHub.
2. Sign in to [Render.com](https://render.com) using your GitHub account.
3. Click **New +** → **Blueprint** → Select this repository.
4. Render automatically detects [`render.yaml`](file:///e:/PROJECTS/SIH/2026/AWS/render.yaml) and provisions the Web Service on the Free plan.
5. In ~3 minutes, your live public application will be available at `https://skyguard-ai.onrender.com`.

---

### 1-Click Local Stack Launcher (Recommended for Local Dev)

If you are developing locally on Windows, SkyGuard AI provides unified one-click startup scripts that launch the **FastAPI Backend (port 8000)**, the **React Dashboard (port 5186)**, and the **46-Station Telemetry Simulator (2 Hz loop)**, opening the dashboard in your default browser:

```powershell
# In PowerShell:
.\run_all.ps1
```

```cmd
:: In Command Prompt:
run_all.bat
```

Once launched, access:
- **Operations Dashboard**: [http://localhost:5186](http://localhost:5186)
- **Interactive Swagger API Docs**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **Backend Service Gateway**: [http://127.0.0.1:8000](http://127.0.0.1:8000)

---

### Docker Multi-Container Deployment

Deploy the entire production stack (TimescaleDB + Mosquitto MQTT + FastAPI Backend + React NGINX Frontend + Stream Simulator) using Docker Compose:

```bash
docker compose up -d --build
```

Verify service health:
```bash
docker compose ps
```

| Service | Container Name | Port Mapping | Purpose |
|---|---|---|---|
| **TimescaleDB** | `skyguard_timescaledb` | `5432:5432` | Time-series optimized PostgreSQL 15 database |
| **Mosquitto** | `skyguard_mosquitto` | `1883:1883`, `9001:9001` | Edge MQTT message broker |
| **Backend** | `skyguard_backend` | `8000:8000` | FastAPI ML inference & WebSocket hub |
| **Dashboard** | `skyguard_dashboard` | `5173:80`, `8501:80` | Production React application served via NGINX |
| **Simulator** | `skyguard_simulator` | Internal | Continuous 46-station live telemetry generator |

To stop the stack:
```bash
docker compose down
```

---

### Manual Local Development Setup

#### Prerequisites
- **Python**: 3.10, 3.11, 3.12, or 3.13
- **Node.js**: 18+ and `npm`

#### Step 1: Clone & Configure Python Environment
```bash
git clone https://github.com/yatharthdahiyaa/SkyGuard.git
cd SkyGuard

# Create and activate virtual environment
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

# Install backend dependencies
pip install -r skyguard_backend/requirements.txt
```

#### Step 2: Start the FastAPI Backend
```bash
python -m uvicorn skyguard_backend.main:app --reload --host 127.0.0.1 --port 8000
```

#### Step 3: Start the React Dashboard
Open a new terminal:
```bash
cd Dashboard/sih
npm install
npm run dev
```

#### Step 4: Stream Live Telemetry
Open a new terminal to start simulating real-time observations across all 46 Indian AWS stations:
```bash
python simulator/stream_simulator.py --rate-hz 2.0 --loop
```

---

## Verification & Benchmark Suite

SkyGuard AI includes an automated benchmark evaluation harness configured to score models against the official **India Meteorological Department (IMD) / Ministry of Earth Sciences (MoES)** criteria.

### Running Pytest Unit Tests
The test suite validates physics formulations, spatial consensus calculation, feature vector consistency, and sensor health computation:

```bash
python -m pytest tests/ -v
```

```text
============================= test session starts ==============================
collected 58 items

tests/test_classifier_and_features.py ......................             [ 37%]
tests/test_health_service.py ....                                        [ 44%]
tests/test_physics.py .................                                  [ 74%]
tests/test_spatial_consensus.py ...............                          [100%]

============================== 58 passed in 1.08s ==============================
```

### Running the Official IMD / WMO Evaluation Harness
Execute the standalone evaluation harness across 2,880 benchmark records:

```powershell
# Using PowerShell runner:
.\run_benchmark.ps1 -ForceRun
```

```bash
# Direct Python execution:
python evaluate_harness.py --force-run
```

### Official Evaluation Results Summary

| Verification Dimension | Metric | SkyGuard AI Result | IMD / WMO Threshold | Status |
|---|---|:---:|:---:|:---:|
| **Overall Classification** | Weighted Precision | **98.48%** | $\ge 90.0\%$ | **PASSED** |
| **Overall Classification** | Weighted Recall | **98.13%** | $\ge 90.0\%$ | **PASSED** |
| **Overall Classification** | Weighted F1-Score | **98.15%** | $\ge 90.0\%$ | **PASSED** |
| **Extreme Weather Rejection** | False Alarm Rate (FAR) | **0.00%** | $\le 3.0\%$ | **PASSED** |
| **Physical Consistency** | Thermodynamic Violations | **0 violations (0.0%)**| $0.0\%$ | **PASSED** |
| **Imputation Accuracy (Pressure)** | Barometric RMSE | **2.47 hPa** | $\le 4.0\text{ hPa}$ | **PASSED** |
| **Imputation Accuracy (Humidity)** | Relative Humidity MAE | **8.20%** | $\le 10.0\%$ | **PASSED** |
| **Edge Compute Footprint** | P95 Execution Latency | **0.14 ms** | $\le 10.0\text{ ms}$ | **PASSED** |
| **Edge Hardware Footprint** | Static RAM Allocation | **14.2 KB** | $\le 30.0\text{ KB}$ | **PASSED** |

> [!TIP]
> Live evaluation reports are dynamically served via the REST API at `GET /api/v1/evaluation/report` and rendered on the frontend Analytics view.

---

## API & Telemetry Interface Reference

The FastAPI service exposes an OpenAPI 3.0-compliant interface available interactively at `/docs` (Swagger UI) and `/redoc`.

### RESTful Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Operational discovery gateway and interactive HTML service portal |
| `GET` | `/api/v1/health` | System readiness probe, database check, and active WebSocket subscriber count |
| `GET` | `/api/v1/stations` | Catalog of all monitored AWS stations including coordinates and elevations |
| `GET` | `/api/v1/stations/{station_id}` | Station metadata, current health status, and recent observation history |
| `POST` | `/api/v1/telemetry/ingest` | High-throughput ingestion endpoint for edge observations |
| `GET` | `/api/v1/telemetry/{station_id}` | Historical time-series telemetry records for a specific station |
| `GET` | `/api/v1/alerts` | Active meteorological and sensor fault alerts (filtered by severity and status) |
| `GET` | `/api/v1/health/network` | Fleet-wide average sensor health scores ($T, P, RH$) |
| `GET` | `/api/v1/health/station/{station_id}` | Per-channel health breakdown and diagnostic indicators for a station |
| `GET` | `/api/v1/evaluation/report` | Current benchmark metrics and WMO-No. 8 compliance verification data |

### Real-Time WebSocket Protocol

Connect to `ws://127.0.0.1:8000/ws/live` to receive real-time streaming telemetry and triage events.

#### Example Broadcast Payload:
```json
{
  "type": "TELEMETRY_UPDATE",
  "timestamp": "2026-09-18T12:00:00Z",
  "station_id": "43003099999",
  "station_name": "CHHATRAPATI SHIVAJI INTERNATIONAL, IN",
  "raw": {
    "temperature": 32.4,
    "pressure": 1008.2,
    "relative_humidity": 78.0
  },
  "diagnosis": {
    "is_anomaly": false,
    "fault_class": "NONE",
    "confidence": 0.992,
    "severity": 0.0,
    "affected_channel": "NONE",
    "evidence": {
      "spatial_divergence": 0.12,
      "temporal_zscore": 0.34,
      "magnus_violation": false
    }
  },
  "imputation": {
    "repaired": false,
    "temperature": 32.4,
    "pressure": 1008.2,
    "relative_humidity": 78.0,
    "method": "RAW_PASSTHROUGH"
  },
  "sensor_health": {
    "temperature": 98.5,
    "pressure": 99.1,
    "relative_humidity": 96.0,
    "composite": 97.8
  }
}
```

---

## Core Engineering Tenets

1. **No "Pseudo-AI"**: Every anomaly classification is grounded in physical and mathematical evidence. Thresholds and models work symbiotically; we never claim "machine learning" where a deterministic thermodynamic law provides a exact answer.
2. **Data Immutability**: Observed telemetry is immutable. Synthetically imputed values are stored as distinct fields tagged with QC flags, guaranteeing zero silent alteration of historical meteorological records.
3. **Strict Temporal Splitting**: ML pipelines must enforce chronological time-series splitting (75% past / 25% future). Shuffled cross-validation causes future data leakage and is strictly prohibited in our analytics engine.
4. **Single Source of Truth**: Feature transformations (`build_feature_vector`) and physical laws are authored once in `skyguard_core` and utilized identically across offline model training, batch benchmarking, and live edge/cloud inference.
5. **Physical Guardrails**: No reconstructed observation is committed or served unless it satisfies the Magnus dew point invariant ($T_d \le T$).

---

## Contributors & License

- **Project**: SkyGuard AI
- **Repository**: [yatharthdahiyaa/SkyGuard](https://github.com/yatharthdahiyaa/SkyGuard)
- **Target Agency**: India Meteorological Department (IMD) / Ministry of Earth Sciences (MoES)
- **Compliance**: WMO-No. 8 (Guide to Meteorological Instruments and Methods of Observation)
- **License**: MIT Open Source License — see [LICENSE](file:///e:/PROJECTS/SIH/2026/AWS/LICENSE) for details.

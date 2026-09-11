# SkyGuard AI: Data & Simulation Layer
### Multi-Station Automatic Weather Station (AWS) Network Simulator & Ground-Truth Sensor Fault Injector
*Engineered for India Meteorological Department (IMD) / Ministry of Earth Sciences (MoES) and WMO-No. 8 Operational Standards.*

---

## 1. Overview & Problem Statement

Operational Automatic Weather Station (AWS) networks deployed across India face severe hardware and environmental stresses—ranging from lightning strikes, marine salt contamination, and calibration drift to telemetry packet corruption and sensor freeze. Conventional thresholding often triggers false alarms during genuine extreme weather events (such as convective cold pool gust fronts, heatbursts, and tropical squalls) while missing subtle sensor degradation.

**SkyGuard AI Data & Simulation Layer** solves this challenge by providing an end-to-end, physics-consistent pipeline that:
1. Ingests raw NOAA ISD / IMD hourly and synoptic station CSV files.
2. Derives coupled psychrometric parameters using the **August-Roche-Magnus formulation**.
3. Resamples and synchronizes regional multi-station networks onto a continuous spatial-temporal grid.
4. Injects **5 operational sensor fault typologies** with exact ground-truth labels.
5. Injects **genuine propagating mesoscale weather events** (true negatives) with spatial kinematic lag and coupled thermodynamic signatures ($\Delta T$, $\Delta P$, $\Delta RH$) so anomaly detection models can be evaluated against false alarms.

---

## 2. Atmospheric Thermodynamics & Physics

### August-Roche-Magnus Formulations
Saturation vapor pressure $e_s(T)$ and actual vapor pressure $e(T_d)$ over liquid water (valid for $-45^\circ\text{C} \le T \le 60^\circ\text{C}$, error $< 0.4\%$):
$$e_s(T) = 6.112 \cdot \exp\left(\frac{17.67 \cdot T}{T + 243.5}\right) \quad [\text{hPa}]$$
$$e(T_d) = 6.112 \cdot \exp\left(\frac{17.67 \cdot T_d}{T_d + 243.5}\right) \quad [\text{hPa}]$$

Relative Humidity ($RH$):
$$RH = \text{clip}\left(\frac{e(T_d)}{e_s(T)} \times 100.0, \, 1.0, \, 100.0\right) \quad [\%]$$

Magnus Inverse Transform (Dew Point derivation from $T$ and $RH$):
$$\gamma(T, RH) = \frac{17.67 \cdot T}{243.5 + T} + \ln\left(\frac{RH}{100.0}\right)$$
$$T_d = \frac{243.5 \cdot \gamma}{17.67 - \gamma} \quad [^\circ\text{C}]$$

**Psychrometric Invariant**: Under natural atmospheric conditions without supersaturation, $T_d \le T$ strictly holds.

### Mesoscale Kinematic Front Propagation
A convective gust front traveling with wind velocity vector $\mathbf{v} = v (\cos\theta, \sin\theta)$ reaches station $i$ with Cartesian offset $\mathbf{x}_i$ at time:
$$t_{\text{arr}, i} = t_0 + \frac{\mathbf{x}_i \cdot \hat{\mathbf{v}} - \min_k(\mathbf{x}_k \cdot \hat{\mathbf{v}})}{v}$$
The physical signature across all stations is coupled:
- Rapid temperature plunge: $\Delta T \approx -8^\circ\text{C}$ to $-12^\circ\text{C}$
- Pressure mesohigh jump: $\Delta P \approx +2$ to $+5\text{ hPa}$
- Humidity surge: $\Delta RH \approx +25\%$ to $+40\%$
- **Ground Truth Label**: `is_fault = 0`, `fault_class = 'NONE'`, `event_context = 'GENUINE_WEATHER_FRONT'`

---

## 3. Operational Sensor Fault Taxonomy (True Positives)

| Class | Fault Typology | Meteorological / Hardware Root Cause | Mathematical Mutation |
|:---:|:---|:---|:---|
| **1** | **SPIKE** | ADC bit-flip, lightning EMI, inductive transient | Single or 2-sample impulse jump: $T \pm [8, 20]^\circ\text{C}$, $P \pm [10, 30]\text{ hPa}$, $RH \pm [35, 60]\%$ |
| **2** | **FROZEN** | RTD mechanical seizure, transducer deadband, stuck firmware | Signal variance strictly drops to zero ($\sigma = 0.0$) repeating exact float for $3\text{h}$ to $24\text{h}$ |
| **3** | **DRIFT** | Capacitive hygrometer salt/dust deposition, thermistor aging | Unidirectional creep: $\Delta RH = +\alpha \cdot \Delta t$ ($+0.4\%/\text{h}$ up to $+30\%$) |
| **4** | **DROPOUT** | GPRS/satellite uplink packet loss, telemetry CRC fail | Intermittent missing values or sentinel tokens (`-999.0`) |
| **5** | **PSYCHROMETRIC_VIOLATION** | Independent dual-sensor malfunction, circuit cross-talk | Unphysical state: $T > 40^\circ\text{C}$ and $RH > 95\%$ without pressure change ($T_d > T$) |

---

## 4. Output Data Schema

The exported datasets (`.parquet` and `.csv`) follow this strict schema:

| Column | Type | Description |
|---|---|---|
| `timestamp` | `string` | UTC ISO-8601 string (`YYYY-MM-DDTHH:MM:SSZ`) |
| `station_id` | `string` | WMO / IMD station identifier (e.g., `'43003099999'`) |
| `station_name` | `string` | Station name (e.g., `'CHHATRAPATI SHIVAJI INTERNATIONAL, IN'`) |
| `latitude` | `float64` | Station latitude in decimal degrees |
| `longitude` | `float64` | Station longitude in decimal degrees |
| `elevation_m` | `float64` | Station elevation above mean sea level in meters |
| `T_clean` | `float64` | Ground-truth uncorrupted temperature (°C) |
| `P_clean` | `float64` | Ground-truth uncorrupted barometric pressure (hPa) |
| `RH_clean` | `float64` | Ground-truth uncorrupted relative humidity (%) |
| `T_obs` | `float64` | Observed temperature (including sensor faults / real weather) |
| `P_obs` | `float64` | Observed pressure (including sensor faults / real weather) |
| `RH_obs` | `float64` | Observed relative humidity (including sensor faults / real weather) |
| `is_fault` | `int64` | Binary flag: `0` = Clean / genuine weather, `1` = Sensor fault |
| `fault_class` | `string` | Categorical: `['NONE', 'SPIKE', 'FROZEN', 'DRIFT', 'DROPOUT', 'PSYCHROMETRIC_VIOLATION']` |
| `affected_channel` | `string` | Categorical: `['NONE', 'T', 'P', 'RH', 'MULTIPLE']` |
| `event_context` | `string` | Categorical: `['NORMAL', 'GENUINE_WEATHER_FRONT', 'HEATBURST']` |
| `severity` | `float64` | Fault severity scale $[0.0, 1.0]$ |

---

## 5. Directory Structure

```
e:/PROJECTS/SIH/2026/AWS/DATA/
├── csv/                                         # Raw NOAA ISD weather station CSV files
│   ├── CSMI (Mumbai Airport).csv               # 43003099999 (Lat: 19.09°N, Lon: 72.87°E, Elev: 11.3m)
│   ├── Bombay (Colaba).csv                     # 43057099999 (Lat: 18.90°N, Lon: 72.82°E, Elev: 11.0m)
│   ├── Pune.csv                                # 43063099999 (Lat: 18.53°N, Lon: 73.85°E, Elev: 558.0m)
│   ├── Nasik City.csv                          # 42921099999 (Lat: 19.97°N, Lon: 73.82°E, Elev: 598.0m)
│   ├── Safdarjung (New Delhi).csv              # 42182099999 (North India cluster)
│   ├── Meerut.csv                              # 42139099999 (North India cluster)
│   ├── Churu.csv                               # 42170099999 (North India cluster)
│   └── Agra.csv                                # 42260099999 (North India cluster)
├── skyguard/                                    # Modular SkyGuard AI Python package
│   ├── __init__.py                             # Core class exports
│   ├── physics.py                              # AtmosphericThermodynamics & Magnus equations
│   ├── parser.py                               # NOAAISDParser & AWSStationMetadata
│   ├── synchronizer.py                         # SpatialNetworkSynchronizer & Geodesic distances
│   ├── injector.py                             # GroundTruthAnomalyInjector (5 classes + front)
│   └── plotting.py                             # SkyGuardVisualizer publication-grade dashboard
├── tests/
│   └── test_pipeline.py                        # Automated unit & integration tests (pytest)
├── data_pipeline_injector.py                    # Master CLI pipeline & execution engine
├── skyguard_groundtruth_benchmark.parquet       # Generated benchmark dataset (Parquet)
├── skyguard_groundtruth_benchmark.csv           # Generated benchmark dataset (CSV)
├── injection_validation_plot.png               # High-resolution 5-panel validation figure
└── README.md                                   # Comprehensive documentation
```

---

## 6. Quickstart & CLI Usage

### Run Default Pipeline (Maharashtra Cluster, 30 Days, 1-Hour Sampling)
```bash
python data_pipeline_injector.py
```

### Run with Custom Parameters
```bash
python data_pipeline_injector.py \
    --cluster maharashtra \
    --freq 1h \
    --days 30 \
    --fault-rate 0.065 \
    --output-parquet skyguard_groundtruth_benchmark.parquet \
    --output-csv skyguard_groundtruth_benchmark.csv \
    --plot-path injection_validation_plot.png
```

### Run High-Frequency 15-Minute Testing with Cubic Spline
```bash
python data_pipeline_injector.py \
    --cluster maharashtra \
    --freq 15min \
    --days 14 \
    --spline \
    --output-parquet benchmark_15min.parquet \
    --output-csv benchmark_15min.csv \
    --plot-path benchmark_15min.png
```

### Run North India Cluster
```bash
python data_pipeline_injector.py \
    --cluster north_india \
    --days 30 \
    --output-parquet skyguard_north_india_benchmark.parquet \
    --output-csv skyguard_north_india_benchmark.csv \
    --plot-path north_india_plot.png
```

### Run Automated Unit Tests
```bash
python -m pytest -v tests/test_pipeline.py
```

---

## 7. Python API Integration

```python
from skyguard.parser import NOAAISDParser
from skyguard.synchronizer import SpatialNetworkSynchronizer
from skyguard.injector import GroundTruthAnomalyInjector
from skyguard.plotting import SkyGuardVisualizer

# 1. Ingest raw station files
parser = NOAAISDParser(csv_dir="csv")
station_data = parser.load_cluster("maharashtra")

# 2. Resample and synchronize onto spatial grid
synchronizer = SpatialNetworkSynchronizer()
df_sync, dist_matrix, cartesian_coords = synchronizer.synchronize(
    station_data=station_data,
    freq="1h",
    start_date="2023-05-01T00:00:00Z",
    end_date="2023-05-31T23:00:00Z"
)

# 3. Inject weather events & sensor faults
injector = GroundTruthAnomalyInjector(random_state=42, target_fault_rate=0.065)
df_benchmark = injector.inject_benchmark_suite(
    df=df_sync,
    cartesian_coords=cartesian_coords,
    target_fault_rate=0.065
)

# 4. Generate diagnostic dashboard
SkyGuardVisualizer.plot_inspection_dashboard(
    df=df_benchmark,
    output_path="injection_validation_plot.png"
)
```

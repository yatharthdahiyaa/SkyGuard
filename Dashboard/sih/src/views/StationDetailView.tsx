import React, { useState, useMemo, useEffect } from 'react';
import { Station, SensorConfig, TimeRange, TimeSeriesPoint, AnomalyMarker } from '../types/telemetry';
import { HealthPill } from '../components/telemetry/HealthPill';
import { HealthScore } from '../components/common/HealthScore';
import { TimeSeriesChart, MetricSeriesConfig } from '../components/charts/TimeSeriesChart';
import { AIInsightCard } from '../components/ai/AIInsightCard';
import { Timeline } from '../components/common/Timeline';
import { Modal } from '../components/common/Modal';
import { TelemetryAPI } from '../services/api';
import { useRouter } from '../context/RouterContext';
import { 
  Radio, 
  ArrowRight, 
  Check, 
  Power, 
  Wrench, 
  Download, 
  Sliders, 
  Activity, 
  Clock, 
  Zap, 
  ShieldAlert, 
  Battery, 
  Wifi, 
  ChevronRight,
  Flame,
  Droplets,
  Gauge,
  Cpu
} from '../components/icons';

interface StationDetailViewProps {
  stationId: string;
  stations: Station[];
  onRequestReboot: (station: Station) => void;
  onRequestCalibrate: (station: Station) => void;
  onAcknowledgeAlert?: (alertId: string) => void;
}

export const StationDetailView: React.FC<StationDetailViewProps> = ({
  stationId,
  stations,
  onRequestReboot,
  onRequestCalibrate,
  onAcknowledgeAlert
}) => {
  const { navigate } = useRouter();
  const station = stations.find((s) => s.id === stationId) || stations[0];

  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [editingSensor, setEditingSensor] = useState<SensorConfig | null>(null);

  const [telemetrySeries, setTelemetrySeries] = useState<{
    temp: TimeSeriesPoint[];
    press: TimeSeriesPoint[];
    rh: TimeSeriesPoint[];
    anomalyMarkers: AnomalyMarker[];
  }>({
    temp: [],
    press: [],
    rh: [],
    anomalyMarkers: []
  });

  useEffect(() => {
    let isMounted = true;
    if (!station?.id) return;

    Promise.all([
      TelemetryAPI.getTimeSeries(station.id, 'T', timeRange),
      TelemetryAPI.getTimeSeries(station.id, 'P', timeRange),
      TelemetryAPI.getTimeSeries(station.id, 'RH', timeRange)
    ]).then(([tData, pData, rhData]) => {
      if (!isMounted) return;
      setTelemetrySeries({
        temp: tData.series,
        press: pData.series,
        rh: rhData.series,
        anomalyMarkers: [...tData.anomalyMarkers, ...pData.anomalyMarkers, ...rhData.anomalyMarkers]
      });
    }).catch(err => {
      console.warn('Failed to load live station telemetry time-series:', err);
    });

    return () => {
      isMounted = false;
    };
  }, [station?.id, timeRange]);

  const voltSeries: TimeSeriesPoint[] = useMemo(() => {
    if (telemetrySeries.temp.length > 0) {
      return telemetrySeries.temp.map(pt => ({
        timestamp: pt.timestamp,
        value: Number((station.readings?.voltageV ?? 12.1).toFixed(1))
      }));
    }
    return [{ timestamp: 'Now', value: station.readings?.voltageV ?? 12.1 }];
  }, [telemetrySeries.temp, station.readings?.voltageV]);

  const currSeries: TimeSeriesPoint[] = useMemo(() => {
    if (telemetrySeries.temp.length > 0) {
      return telemetrySeries.temp.map(pt => ({
        timestamp: pt.timestamp,
        value: Number((station.readings?.currentA ?? 0.42).toFixed(2))
      }));
    }
    return [{ timestamp: 'Now', value: station.readings?.currentA ?? 0.42 }];
  }, [telemetrySeries.temp, station.readings?.currentA]);

  const sigSeries: TimeSeriesPoint[] = useMemo(() => {
    if (telemetrySeries.temp.length > 0) {
      return telemetrySeries.temp.map(pt => ({
        timestamp: pt.timestamp,
        value: Number((station.readings?.signalDbm ?? -65).toFixed(0))
      }));
    }
    return [{ timestamp: 'Now', value: station.readings?.signalDbm ?? -65 }];
  }, [telemetrySeries.temp, station.readings?.signalDbm]);

  const vibSeries: TimeSeriesPoint[] = useMemo(() => {
    if (telemetrySeries.temp.length > 0) {
      return telemetrySeries.temp.map(pt => ({
        timestamp: pt.timestamp,
        value: Number((station.readings?.vibrationRms ?? 0.16).toFixed(2))
      }));
    }
    return [{ timestamp: 'Now', value: station.readings?.vibrationRms ?? 0.16 }];
  }, [telemetrySeries.temp, station.readings?.vibrationRms]);

  const multiSeriesList: MetricSeriesConfig[] = [
    { id: 'T', label: 'Temperature (T)', unit: '°C', color: '#f97316', points: telemetrySeries.temp },
    { id: 'P', label: 'Pressure (P)', unit: 'hPa', color: '#06b6d4', points: telemetrySeries.press },
    { id: 'RH', label: 'Humidity (RH)', unit: '%', color: '#3b82f6', points: telemetrySeries.rh },
    { id: 'voltage', label: 'RTU Bus Voltage', unit: 'V', color: '#10b981', points: voltSeries },
    { id: 'current', label: 'Loop Current', unit: 'A', color: '#6366f1', points: currSeries },
    { id: 'signal', label: 'Carrier RSSI', unit: 'dBm', color: '#ec4899', points: sigSeries },
    { id: 'vibration', label: 'Vibration RMS', unit: 'mm/s', color: '#8b5cf6', points: vibSeries }
  ];

  return (
    <div className="view-container station-detail-view-container font-mono">
      {/* 1. Header */}
      <div className="station-detail-hero panel">
        <div className="hero-top-nav">
          <button onClick={() => navigate('/stations')} className="btn-back-breadcrumb font-mono">
            ← BACK TO STATIONS
          </button>
          <div className="hero-tags-group">
            <span className="hero-id-tag">ID: {station.id.toUpperCase()}</span>
            <span className="hero-firmware-tag">FW: {station.firmware}</span>
          </div>
        </div>

        <div className="hero-main-content">
          <div className="hero-identity-cluster">
            <div className="hero-icon-box">
              <Radio size={24} className="text-blue-400" />
            </div>
            <div>
              <div className="hero-code-row">
                <h1 className="hero-station-code">{station.code}</h1>
                <HealthPill status={station.status} />
              </div>
              <p className="hero-station-name text-primary">{station.name}</p>
              <div className="hero-meta-row text-muted">
                <span>SECTOR: {station.sector.toUpperCase()}</span>
                <span>·</span>
                <span>COORDS: {station.lat.toFixed(4)}°N, {station.lng.toFixed(4)}°W</span>
                <span>·</span>
                <span>ELEVATION: {station.elevationM}m AMSL</span>
                <span>·</span>
                <span>LAST COMMUNICATION: {station.lastSeen}</span>
              </div>
            </div>
          </div>

          <div className="hero-actions-cluster">
            {station.activeAlertCount > 0 && onAcknowledgeAlert && (
              <button 
                className="btn-hero-action btn-hero-ack"
                onClick={() => onAcknowledgeAlert('alt-8092')}
              >
                <Check size={13} />
                <span>ACKNOWLEDGE ALERT</span>
              </button>
            )}
            <button 
              className="btn-hero-action"
              onClick={() => onRequestCalibrate(station)}
            >
              <Wrench size={13} />
              <span>CONFIGURE SENSORS</span>
            </button>
            <button 
              className="btn-hero-action"
              onClick={() => onRequestReboot(station)}
            >
              <Power size={13} />
              <span>RESTART / RECONNECT</span>
            </button>
            <button 
              className="btn-hero-action"
              onClick={() => alert(`Generating comprehensive telemetry audit report for ${station.code}...`)}
            >
              <Download size={13} />
              <span>EXPORT REPORT</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Station Health Summary Cards */}
      <div className="station-summary-grid">
        <div className="summary-card panel">
          <span className="s-label text-muted">OVERALL HEALTH SCORE</span>
          <div className="s-val-row">
            <HealthScore score={station.healthScore} size="lg" />
          </div>
          <span className="s-sub text-secondary">Calculated from 8 telemetry sensors</span>
        </div>

        <div className="summary-card panel">
          <span className="s-label text-muted">AVAILABILITY UPTIME</span>
          <div className="s-val-row">
            <span className="s-big-val text-emerald-400">{station.uptimePct}%</span>
          </div>
          <span className="s-sub text-secondary">Last 30-day packet reception rate</span>
        </div>

        <div className="summary-card panel">
          <span className="s-label text-muted">DRY-BULB TEMPERATURE</span>
          <div className="s-val-row">
            <span className="s-big-val text-orange-400">{station.readings.temperature}°C</span>
          </div>
          <span className="s-sub text-secondary">Pt1000 RTD · Dew-Point: {station.readings.dewPoint}°C</span>
        </div>

        <div className="summary-card panel">
          <span className="s-label text-muted">RF SIGNAL CARRIER SNR</span>
          <div className="s-val-row">
            <span className="s-big-val text-primary">{station.snrDb} dB</span>
          </div>
          <span className="s-sub text-secondary">RSSI {station.readings.signalDbm} dBm · RTT {station.latencyMs}ms</span>
        </div>

        <div className="summary-card panel">
          <span className="s-label text-muted">BATTERY & POWER BUS</span>
          <div className="s-val-row">
            <span className="s-big-val text-primary">{station.readings.voltageV} V</span>
          </div>
          <span className="s-sub text-secondary">Draw: {station.readings.currentA} A · LiFePO4 Reserve</span>
        </div>

        <div className="summary-card panel">
          <span className="s-label text-muted">ACTIVE FAULTS & SENSORS</span>
          <div className="s-val-row">
            <span className={`s-big-val ${station.activeAlertCount > 0 ? 'text-critical font-bold' : 'text-emerald-400'}`}>
              {station.activeAlertCount} FAULTS
            </span>
          </div>
          <span className="s-sub text-secondary">{station.onlineSensors} of {station.sensorCount} sensors operational</span>
        </div>
      </div>

      {/* 3. AI Anomaly Detection Insight Card */}
      {station.status === 'faulty' ? (
        <AIInsightCard
          headline="AI detected abnormal vibration behavior and thermodynamic invariant breach"
          anomalyScore={94}
          confidence={0.96}
          timestamp="22:12:00 UTC (Active)"
          expectedRange="0.8 - 1.8 mm/s · Δ ≤ 0.2°C"
          observedValue="3.42 mm/s · Δ = +2.7°C"
          severity="critical"
          onInvestigate={() => navigate('/alerts/alt-8092')}
        />
      ) : station.status === 'degraded' ? (
        <AIInsightCard
          headline="AI detected barometric transducer flatline"
          anomalyScore={78}
          confidence={0.88}
          timestamp="21:40:00 UTC"
          expectedRange="σ² > 0.05 hPa"
          observedValue="σ² = 0.000 hPa"
          severity="warning"
          onInvestigate={() => navigate('/alerts/alt-8088')}
        />
      ) : null}

      {/* 4. Time-Series Monitoring Chart */}
      <TimeSeriesChart
        seriesList={multiSeriesList}
        title={`${station.code} // REAL-TIME MULTI-METRIC SENSOR CORRIDORS`}
        anomalyRegion={
          station.status === 'faulty' 
            ? { startIndex: 24, endIndex: 40, label: 'Harmonic Bearing Anomaly & Polymer Drift', severity: 'critical' }
            : undefined
        }
        anomalyMarkers={telemetrySeries.anomalyMarkers}
        height={280}
      />

      {/* Split Row: Sensor Configuration & Station History */}
      <div className="station-bottom-split">
        {/* Left: Sensor Configuration Table */}
        <div className="panel station-sensor-config-card font-mono">
          <div className="panel-header">
            <div className="panel-header-title">
              <Sliders size={14} className="text-blue-400" />
              <span>SENSOR CONFIGURATION & CALIBRATION MATRIX</span>
            </div>
            <span className="text-muted text-xs">{station.sensors.length} HARDWARE PROBES</span>
          </div>

          <div className="industrial-table-container">
            <table className="industrial-table font-mono">
              <thead>
                <tr>
                  <th>SENSOR / ID</th>
                  <th>TYPE</th>
                  <th>STATUS</th>
                  <th>SAMPLING</th>
                  <th>TOLERANCE</th>
                  <th>LAST READING</th>
                  <th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {station.sensors.map((sensor) => (
                  <tr key={sensor.id}>
                    <td>
                      <div className="td-station-block">
                        <span className="font-bold text-primary">{sensor.name}</span>
                        <span className="text-muted text-xs">{sensor.id}</span>
                      </div>
                    </td>
                    <td>
                      <span className="text-secondary">{sensor.type}</span>
                    </td>
                    <td>
                      <HealthPill status={sensor.status} size="sm" />
                    </td>
                    <td>
                      <span className="text-primary">{sensor.samplingRateHz} Hz</span>
                    </td>
                    <td>
                      <span className="text-muted">{sensor.thresholdMin} to {sensor.thresholdMax} {sensor.unit}</span>
                    </td>
                    <td>
                      <span className="font-bold text-primary">{sensor.lastReading} {sensor.unit}</span>
                    </td>
                    <td>
                      <button 
                        className="btn-table-action"
                        onClick={() => setEditingSensor(sensor)}
                      >
                        <Wrench size={11} />
                        <span>CONFIG</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Station History Timeline */}
        <div className="panel station-history-card font-mono">
          <div className="panel-header">
            <div className="panel-header-title">
              <Clock size={14} className="text-emerald-400" />
              <span>CHRONOLOGICAL STATION HISTORY</span>
            </div>
            <span className="text-muted text-xs">AUDIT EVENTS</span>
          </div>
          <div className="panel-body">
            <Timeline 
              items={station.history.map(h => ({
                id: h.id,
                type: h.type,
                timestamp: h.timestamp,
                title: h.title,
                description: h.description,
                severity: h.severity,
                operator: h.operator
              }))}
            />
          </div>
        </div>
      </div>

      {/* Sensor Configuration Modal */}
      {editingSensor && (
        <Modal
          isOpen={true}
          onClose={() => setEditingSensor(null)}
          title={`EDIT SENSOR CONFIG // ${editingSensor.name.toUpperCase()}`}
          footer={
            <div className="modal-actions-right">
              <button className="btn-modal-cancel" onClick={() => setEditingSensor(null)}>
                CANCEL
              </button>
              <button 
                className="btn-modal-confirm btn-primary-confirm"
                onClick={() => {
                  alert(`Sensor parameters updated for ${editingSensor.id}. Calibration frame transmitted.`);
                  setEditingSensor(null);
                }}
              >
                APPLY CONFIGURATION
              </button>
            </div>
          }
        >
          <div className="provision-form font-mono">
            <div className="form-group">
              <label className="form-label">SENSOR IDENTIFIER</label>
              <input type="text" readOnly value={editingSensor.id} className="form-input read-only" />
            </div>
            <div className="form-group">
              <label className="form-label">TRANSDUCER TYPE</label>
              <input type="text" readOnly value={editingSensor.type} className="form-input read-only" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">SAMPLING FREQUENCY (HZ)</label>
                <input type="number" defaultValue={editingSensor.samplingRateHz} className="form-input" />
              </div>
              <div className="form-group">
                <label className="form-label">ENGINEERING UNIT</label>
                <input type="text" readOnly value={editingSensor.unit} className="form-input read-only" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">MINIMUM SAFE THRESHOLD</label>
                <input type="number" defaultValue={editingSensor.thresholdMin} className="form-input" />
              </div>
              <div className="form-group">
                <label className="form-label">MAXIMUM SAFE THRESHOLD</label>
                <input type="number" defaultValue={editingSensor.thresholdMax} className="form-input" />
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

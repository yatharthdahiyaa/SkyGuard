import React, { useState, useEffect, useMemo } from 'react';
import { Station, SensorConfig, HealthStatus, TimeSeriesPoint, AnomalyMarker, ParameterType, TimeRange } from '../types/telemetry';
import { TimeSeriesChart, MetricSeriesConfig } from '../components/charts/TimeSeriesChart';
import { TelemetryAPI } from '../services/api';
import { useRouter } from '../context/RouterContext';
import {
  Activity,
  Thermometer,
  Droplets,
  Wind,
  Zap,
  Wifi,
  Cpu,
  Radio,
  Gauge,
  Battery,
  ChevronLeft,
  Clock,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Eye
} from '../components/icons';

/* ─── helpers ─── */
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const pct = (v: number, lo: number, hi: number) => clamp(((v - lo) / (hi - lo)) * 100, 0, 100);
const statusColor = (s: HealthStatus) =>
  s === 'healthy' ? '#10b981' : s === 'degraded' ? '#f59e0b' : s === 'faulty' ? '#ef4444' : '#94a3b8';
const statusLabel = (s: HealthStatus) =>
  s === 'healthy' ? 'NOMINAL' : s === 'degraded' ? 'DEGRADED' : s === 'faulty' ? 'FAULT' : 'OFFLINE';
const formatTime = () => new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

/* ─── Radial gauge ─── */
const RadialGauge: React.FC<{ value: number; max: number; label: string; unit: string; color: string; size?: number }> = ({
  value, max, label, unit, color, size = 90
}) => {
  const ratio = clamp(value / max, 0, 1);
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * 0.75;
  const offset = dash - dash * ratio;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(135deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e2e8f0" strokeWidth="6" strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="6" strokeDasharray={`${dash} ${circ}`} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
      </svg>
      <div style={{ textAlign: 'center', marginTop: -size/2 - 4, position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'monospace', color }}>{value.toFixed(1)}<span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 2 }}>{unit}</span></div>
      </div>
      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, marginTop: 8, textAlign: 'center' }}>{label}</div>
    </div>
  );
};

/* ─── StatusDot ─── */
const StatusDot: React.FC<{ status: HealthStatus; size?: number }> = ({ status, size = 10 }) => (
  <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size, height: size }}>
    {status === 'healthy' && <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: statusColor(status), animation: 'pulse 2s infinite', opacity: 0.3 }} />}
    <span style={{ display: 'block', width: size * 0.7, height: size * 0.7, borderRadius: '50%', background: statusColor(status) }} />
  </span>
);

interface SensorHealthDetailViewProps {
  stationId: string;
  stations: Station[];
}

export const SensorHealthDetailView: React.FC<SensorHealthDetailViewProps> = ({ stationId, stations }) => {
  const { navigate } = useRouter();
  const station = stations.find(s => s.id === stationId);
  const [liveTime, setLiveTime] = useState(formatTime());
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [isLoadingTelemetry, setIsLoadingTelemetry] = useState(true);

  // Real telemetry from backend
  const [telemetry, setTelemetry] = useState<{
    temp: TimeSeriesPoint[];
    press: TimeSeriesPoint[];
    rh: TimeSeriesPoint[];
    anomalyTemp: AnomalyMarker[];
    anomalyPress: AnomalyMarker[];
    anomalyRh: AnomalyMarker[];
    correctedTemp?: TimeSeriesPoint[];
    correctedPress?: TimeSeriesPoint[];
    correctedRh?: TimeSeriesPoint[];
  }>({
    temp: [], press: [], rh: [],
    anomalyTemp: [], anomalyPress: [], anomalyRh: []
  });

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setLiveTime(formatTime()), 1000);
    return () => clearInterval(t);
  }, []);

  // Fetch real telemetry from backend
  useEffect(() => {
    if (!station) return;
    let mounted = true;
    setIsLoadingTelemetry(true);

    Promise.all([
      TelemetryAPI.getTimeSeries(station.id, 'T', timeRange),
      TelemetryAPI.getTimeSeries(station.id, 'P', timeRange),
      TelemetryAPI.getTimeSeries(station.id, 'RH', timeRange)
    ]).then(([tData, pData, rhData]) => {
      if (!mounted) return;
      setTelemetry({
        temp: tData.series,
        press: pData.series,
        rh: rhData.series,
        anomalyTemp: tData.anomalyMarkers,
        anomalyPress: pData.anomalyMarkers,
        anomalyRh: rhData.anomalyMarkers,
        correctedTemp: tData.correctedOverlay,
        correctedPress: pData.correctedOverlay,
        correctedRh: rhData.correctedOverlay
      });
      setIsLoadingTelemetry(false);
    }).catch(() => {
      if (mounted) setIsLoadingTelemetry(false);
    });

    return () => { mounted = false; };
  }, [station, timeRange]);

  if (!station) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
        <AlertCircle size={40} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
        <p style={{ fontSize: 16, fontWeight: 600 }}>Station not found</p>
        <button onClick={() => navigate('/sensor-health')} style={{ marginTop: 12, padding: '8px 20px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 13, color: '#004e99', fontWeight: 600 }}>
          ← Back to Sensor Health
        </button>
      </div>
    );
  }

  // Build chart series configs
  const tempSeries: MetricSeriesConfig[] = [
    { id: 'T', label: 'Temperature', unit: '°C', color: '#ea580c', points: telemetry.temp, anomalyMarkers: telemetry.anomalyTemp }
  ];
  const pressSeries: MetricSeriesConfig[] = [
    { id: 'P', label: 'Pressure', unit: 'hPa', color: '#3b82f6', points: telemetry.press, anomalyMarkers: telemetry.anomalyPress }
  ];
  const rhSeries: MetricSeriesConfig[] = [
    { id: 'RH', label: 'Humidity', unit: '%', color: '#06b6d4', points: telemetry.rh, anomalyMarkers: telemetry.anomalyRh }
  ];

  return (
    <div className="view-container fade-in" style={{ padding: '24px 28px', maxWidth: '1520px', margin: '0 auto', width: '100%' }}>

      {/* ─── HEADER ─── */}
      <header style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <button onClick={() => navigate('/sensor-health')} style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8,
            border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontSize: 12, color: '#64748b', fontWeight: 600, transition: 'all 0.15s'
          }}>
            <ChevronLeft size={14} /> Back to Fleet
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 14,
              background: `linear-gradient(135deg, ${statusColor(station.status)}22 0%, ${statusColor(station.status)}44 100%)`,
              border: `2px solid ${statusColor(station.status)}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Radio size={22} color={statusColor(station.status)} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                {station.code}
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 10px', borderRadius: 6,
                  background: statusColor(station.status) + '18', color: statusColor(station.status),
                  border: `1px solid ${statusColor(station.status)}30`
                }}>
                  {statusLabel(station.status)}
                </span>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 10px',
                  borderRadius: 20, fontSize: 10, fontWeight: 700, background: '#ecfdf5',
                  border: '1px solid #a7f3d0', color: '#059669'
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', animation: 'pulse 2s infinite' }} />
                  LIVE
                </span>
              </h1>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                {station.name} · {station.region} · {station.sector} · {station.elevationM}m AMSL
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 12, color: '#475569', fontFamily: 'monospace', fontWeight: 600 }}>
              <Clock size={13} /> {liveTime} IST
            </div>
          </div>
        </div>
      </header>

      {/* ─── LIVE READINGS STRIP ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 24 }}>
        {[
          { label: 'Temperature', value: station.readings.temperature.toFixed(1), unit: '°C', icon: <Thermometer size={15} color="#ea580c" />, accent: '#ea580c' },
          { label: 'Pressure', value: station.readings.pressure.toFixed(1), unit: 'hPa', icon: <Gauge size={15} color="#3b82f6" />, accent: '#3b82f6' },
          { label: 'Humidity', value: station.readings.humidity.toFixed(1), unit: '%', icon: <Droplets size={15} color="#06b6d4" />, accent: '#06b6d4' },
          { label: 'Dew Point', value: station.readings.dewPoint.toFixed(1), unit: '°C', icon: <Wind size={15} color="#8b5cf6" />, accent: '#8b5cf6' },
          { label: 'Supply Voltage', value: station.readings.voltageV.toFixed(1), unit: 'V', icon: <Zap size={15} color="#f59e0b" />, accent: '#f59e0b' },
          { label: 'Current', value: station.readings.currentA.toFixed(2), unit: 'A', icon: <Battery size={15} color="#10b981" />, accent: '#10b981' },
          { label: 'Signal', value: `${station.readings.signalDbm}`, unit: 'dBm', icon: <Wifi size={15} color="#6366f1" />, accent: '#6366f1' },
          { label: 'Health Score', value: `${station.healthScore}`, unit: '/100', icon: <Activity size={15} color={station.healthScore >= 80 ? '#10b981' : '#ef4444'} />, accent: station.healthScore >= 80 ? '#10b981' : '#ef4444' },
        ].map((item, i) => (
          <div key={i} style={{
            background: '#fff', borderRadius: 12, padding: '12px 14px', border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: 2
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#94a3b8' }}>{item.label}</span>
              {item.icon}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'monospace', color: item.accent }}>
              {item.value}<span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 2, fontWeight: 500 }}>{item.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ─── REAL TELEMETRY CHARTS ─── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
            <Activity size={16} color="#004e99" />
            Real-Time Telemetry History
            {isLoadingTelemetry && <RefreshCw size={14} color="#94a3b8" style={{ animation: 'spin 1s linear infinite' }} />}
          </h2>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['1h', '24h', '7d', '30d'] as TimeRange[]).map(tr => (
              <button key={tr} onClick={() => setTimeRange(tr)} style={{
                padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                border: timeRange === tr ? '1.5px solid #004e99' : '1px solid #e2e8f0',
                background: timeRange === tr ? '#eff6ff' : '#fff',
                color: timeRange === tr ? '#004e99' : '#64748b'
              }}>
                {tr}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
          {telemetry.temp.length > 0 ? (
            <>
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <TimeSeriesChart seriesList={tempSeries} height={220} title="Ambient Temperature (°C)" allowMultiMetric={false} />
              </div>
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <TimeSeriesChart seriesList={pressSeries} height={220} title="Barometric Pressure (hPa)" allowMultiMetric={false} />
              </div>
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <TimeSeriesChart seriesList={rhSeries} height={220} title="Relative Humidity (%)" allowMultiMetric={false} />
              </div>
            </>
          ) : (
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 48, textAlign: 'center', color: '#94a3b8' }}>
              {isLoadingTelemetry ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                  <RefreshCw size={28} style={{ animation: 'spin 1s linear infinite', opacity: 0.5 }} />
                  <span style={{ fontSize: 13 }}>Loading telemetry from backend…</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                  <Activity size={28} style={{ opacity: 0.3 }} />
                  <span style={{ fontSize: 13 }}>No telemetry history available for this station.</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── BOTTOM GRID: PROBES + HARDWARE + META ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginBottom: 28 }}>

        {/* Individual Probes */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8, background: '#fafbfc' }}>
            <Cpu size={15} color="#004e99" />
            <h3 style={{ fontSize: 13, fontWeight: 700, color: '#334155', margin: 0 }}>Individual Probe Status</h3>
            <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 'auto', fontFamily: 'monospace', fontWeight: 600 }}>
              {station.onlineSensors}/{station.sensorCount} ONLINE
            </span>
          </div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {station.sensors.map(sensor => (
              <SensorProbeRow key={sensor.id} sensor={sensor} />
            ))}
          </div>
        </div>

        {/* Hardware Telemetry Gauges */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8, background: '#fafbfc' }}>
            <Activity size={15} color="#004e99" />
            <h3 style={{ fontSize: 13, fontWeight: 700, color: '#334155', margin: 0 }}>Hardware Telemetry</h3>
          </div>
          <div style={{ padding: 24, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24, justifyItems: 'center' }}>
            <RadialGauge value={station.readings.voltageV} max={14} label="Supply Voltage" unit="V" color="#ea580c" />
            <RadialGauge value={station.readings.currentA} max={2} label="Current Draw" unit="A" color="#3b82f6" />
            <RadialGauge value={station.readings.vibrationRms} max={2} label="Vibration RMS" unit="mm/s" color="#10b981" />
            <RadialGauge value={Math.abs(station.readings.signalDbm)} max={120} label="Signal Strength" unit="dBm" color="#8b5cf6" />
          </div>
        </div>

        {/* Station Metadata */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8, background: '#fafbfc' }}>
            <Radio size={15} color="#004e99" />
            <h3 style={{ fontSize: 13, fontWeight: 700, color: '#334155', margin: 0 }}>Station Metadata</h3>
          </div>
          <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px' }}>
            <MetaRow label="Firmware" value={station.firmware} />
            <MetaRow label="Uptime" value={`${station.uptimePct}%`} />
            <MetaRow label="Latency" value={`${station.latencyMs}ms`} />
            <MetaRow label="SNR" value={`${station.snrDb} dB`} />
            <MetaRow label="Confidence" value={`${(station.modelConfidence * 100).toFixed(0)}%`} />
            <MetaRow label="Elevation" value={`${station.elevationM}m AMSL`} />
            <MetaRow label="Coordinates" value={`${station.lat.toFixed(4)}, ${station.lng.toFixed(4)}`} />
            <MetaRow label="Last Seen" value={station.lastSeen} />
            <MetaRow label="Last Ping" value={station.lastPingAt} />
            <MetaRow label="Last Fault" value={station.lastFault || 'None'} highlight={station.lastFault !== 'None' && station.lastFault !== 'none'} />
          </div>
          <div style={{ padding: '0 16px 16px' }}>
            <button onClick={() => navigate(`/stations/${station.id}`)} style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '10px 16px', borderRadius: 10, border: '1.5px solid #004e99',
              background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', color: '#004e99',
              fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s'
            }}>
              <Eye size={14} /> Full Station Dashboard
            </button>
          </div>
        </div>
      </div>

      {/* ─── EVENT TIMELINE ─── */}
      {station.history.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', marginBottom: 28 }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8, background: '#fafbfc' }}>
            <Clock size={15} color="#004e99" />
            <h3 style={{ fontSize: 13, fontWeight: 700, color: '#334155', margin: 0 }}>Recent Events</h3>
          </div>
          <div style={{ padding: 16 }}>
            {station.history.map((ev, i) => (
              <div key={ev.id} style={{
                display: 'flex', gap: 12, padding: '10px 0',
                borderBottom: i < station.history.length - 1 ? '1px solid #f1f5f9' : 'none'
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', marginTop: 5, flexShrink: 0,
                  background: ev.severity === 'critical' ? '#ef4444' : ev.severity === 'warning' ? '#f59e0b' : '#10b981'
                }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>{ev.title}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{ev.description}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4, fontFamily: 'monospace' }}>{ev.timestamp}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

/* ─── Sub-components ─── */

const SensorProbeRow: React.FC<{ sensor: SensorConfig }> = ({ sensor }) => {
  const isFaulty = sensor.status === 'faulty' || sensor.status === 'degraded';
  const fillPct = pct(sensor.lastReading, sensor.thresholdMin, sensor.thresholdMax);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
      borderRadius: 10, background: isFaulty ? '#fef2f2' : '#f8fafc',
      border: `1px solid ${isFaulty ? '#fecaca' : '#e2e8f0'}`, transition: 'all 0.2s'
    }}>
      <StatusDot status={sensor.status} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {sensor.name}
        </div>
        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{sensor.type} · {sensor.samplingRateHz} Hz</div>
      </div>
      <div style={{ textAlign: 'right', minWidth: 65 }}>
        <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'monospace', color: isFaulty ? '#ef4444' : '#0f172a' }}>
          {sensor.lastReading.toFixed(1)}<span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 2 }}>{sensor.unit}</span>
        </div>
      </div>
      <div style={{ width: 70 }}>
        <div style={{ width: '100%', height: 5, borderRadius: 3, background: '#e2e8f0', overflow: 'hidden' }}>
          <div style={{
            width: `${fillPct}%`, height: '100%', borderRadius: 3,
            background: isFaulty ? '#ef4444' : fillPct > 85 ? '#f59e0b' : '#10b981',
            transition: 'width 0.5s ease'
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#cbd5e1', marginTop: 3 }}>
          <span>{sensor.thresholdMin}</span><span>{sensor.thresholdMax}</span>
        </div>
      </div>
    </div>
  );
};

const MetaRow: React.FC<{ label: string; value: string; highlight?: boolean }> = ({ label, value, highlight }) => (
  <div>
    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>{label}</div>
    <div style={{ fontSize: 12, fontWeight: 600, color: highlight ? '#ef4444' : '#334155', fontFamily: 'monospace', wordBreak: 'break-all' }}>{value}</div>
  </div>
);

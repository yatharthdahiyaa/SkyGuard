import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Station, SensorConfig, HealthStatus } from '../types/telemetry';
import { useRouter } from '../context/RouterContext';
import {
  Activity,
  Thermometer,
  Droplets,
  Wind,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Search,
  Zap,
  Wifi,
  Cpu,
  Radio,
  Gauge,
  Battery,
  ChevronRight,
  Clock,
  Filter,
  RefreshCw,
  Download,
  Eye
} from '../components/icons';

/* ─── helpers ─── */
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const pct = (v: number, lo: number, hi: number) => clamp(((v - lo) / (hi - lo)) * 100, 0, 100);
const statusColor = (s: HealthStatus) =>
  s === 'healthy' ? '#10b981' : s === 'degraded' ? '#f59e0b' : s === 'faulty' ? '#ef4444' : '#94a3b8';
const statusLabel = (s: HealthStatus) =>
  s === 'healthy' ? 'NOMINAL' : s === 'degraded' ? 'DEGRADED' : s === 'faulty' ? 'FAULT' : 'OFFLINE';

const formatTime = () => {
  const d = new Date();
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
};

/* ─── types ─── */
type StatusFilter = 'all' | 'healthy' | 'degraded' | 'faulty' | 'offline';
type SortKey = 'name' | 'health' | 'status' | 'latency';

interface SensorHealthViewProps {
  stations: Station[];
}

/* ─── mini sparkline ─── */
const MiniSparkline: React.FC<{ values: number[]; color: string; width?: number; height?: number }> = ({
  values, color, width = 80, height = 24
}) => {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
};

/* ─── radial gauge ─── */
const RadialGauge: React.FC<{ value: number; max: number; label: string; unit: string; color: string; size?: number }> = ({
  value, max, label, unit, color, size = 72
}) => {
  const ratio = clamp(value / max, 0, 1);
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * 0.75; // 270° arc
  const offset = dash - dash * ratio;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(135deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border-light, #e2e8f0)" strokeWidth="5"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${dash} ${circ}`} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      </svg>
      <div className="text-center -mt-5" style={{ position: 'relative', zIndex: 1 }}>
        <div className="text-sm font-bold font-mono" style={{ color }}>{value.toFixed(1)}<span className="text-[10px] text-slate-400 ml-0.5">{unit}</span></div>
      </div>
      <div className="text-[10px] text-slate-500 font-medium mt-0.5 text-center leading-tight">{label}</div>
    </div>
  );
};

/* ─── status dot ─── */
const StatusDot: React.FC<{ status: HealthStatus; animate?: boolean }> = ({ status, animate = false }) => (
  <span className="relative flex items-center justify-center" style={{ width: 10, height: 10 }}>
    {animate && status === 'healthy' && (
      <span className="absolute inset-0 rounded-full animate-ping opacity-40" style={{ backgroundColor: statusColor(status) }} />
    )}
    <span className="relative block w-2 h-2 rounded-full" style={{ backgroundColor: statusColor(status) }} />
  </span>
);

/* ─── main component ─── */
export const SensorHealthView: React.FC<SensorHealthViewProps> = ({ stations }) => {
  const { navigate } = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('status');
  const [expandedStation, setExpandedStation] = useState<string | null>(null);
  const [liveTime, setLiveTime] = useState(formatTime());

  // Store recent readings for sparklines (keyed by station id + metric)
  const sparkRef = useRef<Record<string, number[]>>({});

  // Live clock tick
  useEffect(() => {
    const t = setInterval(() => setLiveTime(formatTime()), 1000);
    return () => clearInterval(t);
  }, []);

  // Track sparkline history from live data
  useEffect(() => {
    stations.forEach(st => {
      const push = (key: string, val: number) => {
        if (!sparkRef.current[key]) sparkRef.current[key] = [];
        sparkRef.current[key].push(val);
        if (sparkRef.current[key].length > 30) sparkRef.current[key].shift();
      };
      push(`${st.id}-T`, st.readings.temperature);
      push(`${st.id}-P`, st.readings.pressure);
      push(`${st.id}-RH`, st.readings.humidity);
      push(`${st.id}-V`, st.readings.voltageV);
    });
  }, [stations]);

  // Filtered + sorted list
  const processed = useMemo(() => {
    let list = [...stations];

    // search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(s =>
        s.code.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.region.toLowerCase().includes(q)
      );
    }

    // status filter
    if (statusFilter !== 'all') {
      list = list.filter(s => s.status === statusFilter);
    }

    // sort
    list.sort((a, b) => {
      switch (sortKey) {
        case 'status': {
          const ord: Record<HealthStatus, number> = { faulty: 0, degraded: 1, offline: 2, healthy: 3 };
          return ord[a.status] - ord[b.status];
        }
        case 'health': return a.healthScore - b.healthScore;
        case 'latency': return b.latencyMs - a.latencyMs;
        case 'name': return a.name.localeCompare(b.name);
        default: return 0;
      }
    });

    return list;
  }, [stations, searchQuery, statusFilter, sortKey]);

  // Fleet-wide aggregates
  const totalSensors = stations.reduce((s, st) => s + st.sensorCount, 0);
  const onlineSensors = stations.reduce((s, st) => s + st.onlineSensors, 0);
  const faultyCount = stations.filter(s => s.status === 'faulty').length;
  const degradedCount = stations.filter(s => s.status === 'degraded').length;
  const healthyCount = stations.filter(s => s.status === 'healthy').length;
  const offlineCount = stations.filter(s => s.status === 'offline').length;
  const avgHealth = stations.length > 0 ? Math.round(stations.reduce((a, s) => a + s.healthScore, 0) / stations.length) : 0;
  const avgLatency = stations.length > 0 ? Math.round(stations.reduce((a, s) => a + s.latencyMs, 0) / stations.length) : 0;
  const avgVoltage = stations.length > 0 ? (stations.reduce((a, s) => a + s.readings.voltageV, 0) / stations.length).toFixed(1) : '0';
  const avgSignal = stations.length > 0 ? Math.round(stations.reduce((a, s) => a + s.readings.signalDbm, 0) / stations.length) : 0;

  return (
    <div className="view-container fade-in" style={{ padding: '24px 28px', maxWidth: '1520px', margin: '0 auto', width: '100%' }}>

      {/* ─── HEADER ─── */}
      <header style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #003366 0%, #004e99 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Activity size={18} color="#ff9933" />
              </div>
              Sensor Health Monitoring
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 10px',
                borderRadius: 20, fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
                background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#059669'
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', animation: 'pulse 2s infinite' }} />
                LIVE
              </span>
            </h1>
            <p style={{ margin: '6px 0 0 46px', fontSize: 13, color: '#64748b' }}>
              Real-time probe diagnostics, hardware telemetry &amp; per-sensor health across the IMD AWS fleet.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 12, color: '#475569', fontFamily: 'monospace', fontWeight: 600 }}>
              <Clock size={13} />
              {liveTime} IST
            </div>
          </div>
        </div>
      </header>

      {/* ─── FLEET KPI STRIP ─── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 12, marginBottom: 24
      }}>
        {[
          { label: 'Total Probes', value: totalSensors, sub: `${onlineSensors} online`, icon: <Cpu size={16} color="#004e99" />, accent: '#004e99' },
          { label: 'Healthy', value: healthyCount, sub: `${Math.round(healthyCount / Math.max(1, stations.length) * 100)}% of fleet`, icon: <CheckCircle2 size={16} color="#10b981" />, accent: '#10b981' },
          { label: 'Faulty', value: faultyCount, sub: faultyCount > 0 ? 'Action required' : 'None detected', icon: <AlertTriangle size={16} color="#ef4444" />, accent: '#ef4444' },
          { label: 'Degraded', value: degradedCount, sub: 'Monitoring', icon: <AlertCircle size={16} color="#f59e0b" />, accent: '#f59e0b' },
          { label: 'Fleet Health', value: `${avgHealth}%`, sub: avgHealth >= 90 ? 'Excellent' : avgHealth >= 70 ? 'Good' : 'Poor', icon: <Activity size={16} color="#004e99" />, accent: '#004e99' },
          { label: 'Avg Latency', value: `${avgLatency}ms`, sub: avgLatency < 50 ? 'Low latency' : 'Check network', icon: <Wifi size={16} color="#6366f1" />, accent: '#6366f1' },
          { label: 'Avg Voltage', value: `${avgVoltage}V`, sub: 'DC supply', icon: <Zap size={16} color="#ea580c" />, accent: '#ea580c' },
          { label: 'Signal Avg', value: `${avgSignal}dBm`, sub: avgSignal > -70 ? 'Good' : 'Weak', icon: <Radio size={16} color="#8b5cf6" />, accent: '#8b5cf6' },
        ].map((kpi, i) => (
          <div key={i} style={{
            background: '#fff', borderRadius: 12, padding: '14px 16px',
            border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 4,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8' }}>{kpi.label}</span>
              {kpi.icon}
            </div>
            <span style={{ fontSize: 22, fontWeight: 800, color: kpi.accent, fontFamily: 'monospace' }}>
              {kpi.value}
            </span>
            <span style={{ fontSize: 10, color: '#94a3b8' }}>{kpi.sub}</span>
          </div>
        ))}
      </div>

      {/* ─── TOOLBAR ─── */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
        marginBottom: 20, padding: '12px 16px', background: '#f8fafc',
        borderRadius: 12, border: '1px solid #e2e8f0'
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Search station code, name, region…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%', padding: '8px 12px 8px 32px', borderRadius: 8,
              border: '1px solid #e2e8f0', fontSize: 13, background: '#fff',
              outline: 'none', color: '#334155', fontFamily: 'inherit'
            }}
          />
        </div>

        {/* Status filter pills */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', 'healthy', 'faulty', 'degraded', 'offline'] as StatusFilter[]).map(f => (
            <button key={f} onClick={() => setStatusFilter(f)} style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.03em', cursor: 'pointer',
              border: statusFilter === f ? '1.5px solid #004e99' : '1px solid #e2e8f0',
              background: statusFilter === f ? '#eff6ff' : '#fff',
              color: statusFilter === f ? '#004e99' : '#64748b',
              transition: 'all 0.15s ease'
            }}>
              {f === 'all' ? `All (${stations.length})` : `${f} (${stations.filter(s => s.status === f).length})`}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
          <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>Sort:</span>
          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value as SortKey)}
            style={{
              padding: '5px 8px', borderRadius: 6, border: '1px solid #e2e8f0',
              fontSize: 12, background: '#fff', color: '#334155', cursor: 'pointer'
            }}
          >
            <option value="status">Status (Critical first)</option>
            <option value="health">Health Score (Low first)</option>
            <option value="latency">Latency (High first)</option>
            <option value="name">Name (A-Z)</option>
          </select>
        </div>

        <span style={{ fontSize: 11, color: '#94a3b8' }}>
          {processed.length} station{processed.length !== 1 ? 's' : ''} shown
        </span>
      </div>

      {/* ─── STATION CARDS ─── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {processed.length === 0 && (
          <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8', fontSize: 14 }}>
            <Search size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
            No stations match your search or filter criteria.
          </div>
        )}

        {processed.map(station => {
          const isExpanded = expandedStation === station.id;
          const spark = (key: string) => sparkRef.current[`${station.id}-${key}`] || [];

          return (
            <div key={station.id} style={{
              background: '#fff', borderRadius: 14, border: `1.5px solid ${station.status === 'faulty' ? '#fecaca' : station.status === 'degraded' ? '#fde68a' : '#e2e8f0'}`,
              boxShadow: station.status === 'faulty' ? '0 0 0 1px rgba(239,68,68,0.08), 0 2px 8px rgba(239,68,68,0.06)' : '0 1px 3px rgba(0,0,0,0.04)',
              overflow: 'hidden', transition: 'box-shadow 0.2s ease'
            }}>
              {/* ─ Station row ─ */}
              <div
                onClick={() => navigate(`/sensor-health/${station.id}`)}
                style={{
                  display: 'grid', gridTemplateColumns: '260px 1fr auto',
                  alignItems: 'center', padding: '14px 20px', cursor: 'pointer',
                  gap: 20, minHeight: 64
                }}
              >
                {/* Left: Identity */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <StatusDot status={station.status} animate />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {station.code}
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                        background: statusColor(station.status) + '18',
                        color: statusColor(station.status),
                        border: `1px solid ${statusColor(station.status)}30`
                      }}>
                        {statusLabel(station.status)}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                      {station.name} · {station.region}
                    </div>
                  </div>
                </div>

                {/* Center: Live readings strip */}
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                  <ReadingChip icon={<Thermometer size={12} color="#ea580c" />} label="Temp" value={station.readings.temperature.toFixed(1)} unit="°C" spark={spark('T')} color="#ea580c" />
                  <ReadingChip icon={<Gauge size={12} color="#3b82f6" />} label="Pres" value={station.readings.pressure.toFixed(1)} unit="hPa" spark={spark('P')} color="#3b82f6" />
                  <ReadingChip icon={<Droplets size={12} color="#06b6d4" />} label="RH" value={station.readings.humidity.toFixed(1)} unit="%" spark={spark('RH')} color="#06b6d4" />
                  <ReadingChip icon={<Zap size={12} color="#f59e0b" />} label="Volts" value={station.readings.voltageV.toFixed(1)} unit="V" spark={spark('V')} color="#f59e0b" />
                  <ReadingChip icon={<Wifi size={12} color="#8b5cf6" />} label="Signal" value={`${station.readings.signalDbm}`} unit="dBm" color="#8b5cf6" />
                </div>

                {/* Right: Health + expand */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'monospace', color: station.healthScore >= 80 ? '#10b981' : station.healthScore >= 50 ? '#f59e0b' : '#ef4444' }}>
                      {station.healthScore}
                    </div>
                    <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Health</div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setExpandedStation(isExpanded ? null : station.id); }}
                    style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    title={isExpanded ? 'Collapse' : 'Quick preview'}
                  >
                    <ChevronRight size={16} color="#94a3b8" style={{
                      transition: 'transform 0.2s ease',
                      transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)'
                    }} />
                  </button>
                </div>
              </div>

              {/* ─ Expanded detail panel ─ */}
              {isExpanded && (
                <div style={{
                  borderTop: '1px solid #f1f5f9', background: '#fafbfc',
                  padding: '20px 24px', animation: 'fadeIn 0.2s ease'
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>

                    {/* Per-sensor cards */}
                    <div>
                      <h4 style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Cpu size={13} color="#004e99" /> Individual Probe Status
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {station.sensors.map(sensor => (
                          <SensorRow key={sensor.id} sensor={sensor} />
                        ))}
                      </div>
                    </div>

                    {/* Hardware telemetry gauges */}
                    <div>
                      <h4 style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Activity size={13} color="#004e99" /> Hardware Telemetry
                      </h4>
                      <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12,
                        background: '#fff', borderRadius: 10, padding: 16, border: '1px solid #e2e8f0'
                      }}>
                        <RadialGauge value={station.readings.voltageV} max={14} label="Supply Voltage" unit="V" color="#ea580c" />
                        <RadialGauge value={station.readings.currentA} max={2} label="Current Draw" unit="A" color="#3b82f6" />
                        <RadialGauge value={station.readings.vibrationRms} max={2} label="Vibration RMS" unit="mm/s" color="#10b981" />
                        <RadialGauge value={Math.abs(station.readings.signalDbm)} max={120} label="Signal (abs)" unit="dBm" color="#8b5cf6" />
                      </div>
                    </div>

                    {/* Station meta */}
                    <div>
                      <h4 style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Radio size={13} color="#004e99" /> Station Info
                      </h4>
                      <div style={{
                        background: '#fff', borderRadius: 10, padding: 16, border: '1px solid #e2e8f0',
                        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px', fontSize: 12
                      }}>
                        <MetaItem label="Firmware" value={station.firmware} />
                        <MetaItem label="Sensors" value={`${station.onlineSensors}/${station.sensorCount} online`} />
                        <MetaItem label="Uptime" value={`${station.uptimePct}%`} />
                        <MetaItem label="Latency" value={`${station.latencyMs}ms`} />
                        <MetaItem label="SNR" value={`${station.snrDb} dB`} />
                        <MetaItem label="Confidence" value={`${(station.modelConfidence * 100).toFixed(0)}%`} />
                        <MetaItem label="Elevation" value={`${station.elevationM}m AMSL`} />
                        <MetaItem label="Last Seen" value={station.lastSeen} />
                        <MetaItem label="Lat / Lng" value={`${station.lat.toFixed(4)}, ${station.lng.toFixed(4)}`} />
                        <MetaItem label="Last Fault" value={station.lastFault || 'None'} highlight={station.lastFault !== 'None'} />
                      </div>

                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/sensor-health/${station.id}`); }}
                        style={{
                          marginTop: 12, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          padding: '8px 16px', borderRadius: 8, border: '1px solid #004e99',
                          background: '#eff6ff', color: '#004e99', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <Eye size={13} /> Open Full Sensor Health View
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* CSS animation */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
};

/* ─── sub-components ─── */

const ReadingChip: React.FC<{
  icon: React.ReactNode; label: string; value: string; unit: string; spark?: number[]; color: string;
}> = ({ icon, label, value, unit, spark, color }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '4px 10px', borderRadius: 8,
    background: color + '08', border: `1px solid ${color}18`
  }}>
    {icon}
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: '#0f172a' }}>
        {value}<span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 2 }}>{unit}</span>
      </span>
    </div>
    {spark && spark.length > 2 && (
      <MiniSparkline values={spark} color={color} width={50} height={18} />
    )}
  </div>
);

const SensorRow: React.FC<{ sensor: SensorConfig }> = ({ sensor }) => {
  const isFaulty = sensor.status === 'faulty' || sensor.status === 'degraded';
  const fillPct = pct(sensor.lastReading, sensor.thresholdMin, sensor.thresholdMax);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
      borderRadius: 10, background: isFaulty ? '#fef2f2' : '#fff',
      border: `1px solid ${isFaulty ? '#fecaca' : '#e2e8f0'}`,
      transition: 'background 0.2s ease'
    }}>
      <StatusDot status={sensor.status} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {sensor.name}
        </div>
        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{sensor.type}</div>
      </div>
      <div style={{ textAlign: 'right', minWidth: 60 }}>
        <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', color: isFaulty ? '#ef4444' : '#0f172a' }}>
          {sensor.lastReading.toFixed(1)}
          <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 2 }}>{sensor.unit}</span>
        </div>
        <div style={{ fontSize: 9, color: '#94a3b8' }}>{sensor.samplingRateHz} Hz</div>
      </div>
      {/* threshold bar */}
      <div style={{ width: 60 }}>
        <div style={{ width: '100%', height: 4, borderRadius: 2, background: '#e2e8f0', overflow: 'hidden' }}>
          <div style={{
            width: `${fillPct}%`, height: '100%', borderRadius: 2,
            background: isFaulty ? '#ef4444' : fillPct > 85 ? '#f59e0b' : '#10b981',
            transition: 'width 0.4s ease'
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#cbd5e1', marginTop: 2 }}>
          <span>{sensor.thresholdMin}</span>
          <span>{sensor.thresholdMax}</span>
        </div>
      </div>
    </div>
  );
};

const MetaItem: React.FC<{ label: string; value: string; highlight?: boolean }> = ({ label, value, highlight }) => (
  <div>
    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 12, fontWeight: 600, color: highlight ? '#ef4444' : '#334155', fontFamily: 'monospace', wordBreak: 'break-all' }}>{value}</div>
  </div>
);

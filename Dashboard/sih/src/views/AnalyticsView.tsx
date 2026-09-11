import React, { useState, useMemo, useEffect } from 'react';
import { TimeRange, Station, ModelBenchmark } from '../types/telemetry';
import { DateRangePicker } from '../components/common/DateRangePicker';
import { TelemetryAPI } from '../services/api';
import { HealthPill } from '../components/telemetry/HealthPill';
import { 
  BarChart3, 
  Download, 
  TrendingUp, 
  ShieldCheck, 
  Atom, 
  Clock, 
  CheckCircle2, 
  AlertTriangle,
  FileSpreadsheet,
  Cpu,
  Zap,
  ArrowUpDown,
  Filter,
  Layers,
  Sparkles,
  RefreshCw
} from 'lucide-react';

interface AnalyticsViewProps {
  onExportReport: () => void;
  stations?: Station[];
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ 
  onExportReport,
  stations = [] 
}) => {
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'warning' | 'info'>('all');
  const [stationSortField, setStationSortField] = useState<'uptimePct' | 'healthScore' | 'activeAlertCount' | 'latencyMs'>('uptimePct');
  const [sortAsc, setSortAsc] = useState(false);

  const faultBreakdown = [
    { type: 'Capacitive Humidity Drift', count: 18, pct: 41, trend: 'increasing', rootCause: 'Polymer dielectric saturation in maritime fog', component: 'Polymer RH Transducer', color: '#3b82f6' },
    { type: 'Magnus Dew-Point Invariant Breach', count: 12, pct: 27, trend: 'increasing', rootCause: 'Non-physical sensor combination (T_dew > T)', component: 'Hygrometer / RTD Assembly', color: '#ef4444' },
    { type: 'Barometric Flatline Variance', count: 7, pct: 16, trend: 'decreasing', rootCause: 'MEMS capillary ingress & ice bridging', component: 'Piezoresistive Transducer', color: '#f59e0b' },
    { type: 'Step Jump / Discontinuity', count: 4, pct: 9, trend: 'stable', rootCause: 'Unscheduled switchgear brownout & ADC reboot', component: 'Edge RTU 24V Front-End', color: '#8b5cf6' },
    { type: 'Spatial Consensus Divergence', count: 3, pct: 7, trend: 'decreasing', rootCause: 'Localized microclimate vs regional cluster mean', component: 'Cluster Consensus Engine', color: '#06b6d4' },
  ];

  // 7-day fault occurrences over time
  const faultTimeline = [
    { day: 'Mon', critical: 2, warning: 5, info: 8 },
    { day: 'Tue', critical: 1, warning: 4, info: 7 },
    { day: 'Wed', critical: 4, warning: 7, info: 10 },
    { day: 'Thu', critical: 2, warning: 3, info: 6 },
    { day: 'Fri', critical: 5, warning: 8, info: 12 },
    { day: 'Sat', critical: 1, warning: 3, info: 5 },
    { day: 'Sun', critical: 3, warning: 6, info: 9 },
  ];

  const sortedStations = useMemo(() => {
    return [...stations].sort((a, b) => {
      const valA = a[stationSortField];
      const valB = b[stationSortField];
      return sortAsc ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
    });
  }, [stations, stationSortField, sortAsc]);

  const handleSort = (field: 'uptimePct' | 'healthScore' | 'activeAlertCount' | 'latencyMs') => {
    if (stationSortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setStationSortField(field);
      setSortAsc(false);
    }
  };

  const [benchmarks, setBenchmarks] = useState<ModelBenchmark[]>([]);

  useEffect(() => {
    let isMounted = true;
    TelemetryAPI.getModelBenchmarks().then((bms) => {
      if (isMounted && bms && bms.length > 0) {
        setBenchmarks(bms);
      }
    }).catch(err => {
      console.warn('Failed to query live benchmarks:', err);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const modelCurrent = benchmarks[0] || {
    version: 'v2.4-prod (SkyGuard Physics-Informed ML)',
    name: 'Physics-Informed Ensemble (CNN + Spatial Consensus)',
    isCurrent: true,
    accuracy: 0.984,
    precision: 0.981,
    recall: 0.976,
    f1Score: 0.978,
    falsePositiveRate: 0.006,
    falseNegativeRate: 0.024,
    avgConfidence: 0.984,
    detectionLatencyMs: 11
  };

  return (
    <div className="view-container analytics-view-container font-mono">
      {/* View Header */}
      <div className="view-header-strip">
        <div className="view-title-group">
          <h1 className="view-title">FLEET ANALYTICS &amp; RELIABILITY</h1>
          <p className="view-subtitle text-secondary">
            HISTORICAL SENSOR FAULT TRENDS, RTU FLEET BENCHMARKS, AND AI MODEL INFERENCE VERIFICATION
          </p>
        </div>

        <div className="analytics-actions-strip">
          <DateRangePicker value={timeRange} onChange={(val) => setTimeRange(val as TimeRange)} />
          <button onClick={onExportReport} className="btn-export-csv" title="Download Telemetry Audit">
            <Download size={13} />
            <span>EXPORT AUDIT REPORT</span>
          </button>
        </div>
      </div>

      {/* Analytics KPI Strip */}
      <div className="kpi-grid">
        <div className="kpi-card panel">
          <div className="kpi-header">
            <span className="kpi-label">MAGNUS INVARIANT PASS RATE</span>
            <Atom size={14} className="text-emerald-400" />
          </div>
          <div className="kpi-value-row">
            <span className="kpi-main-value text-emerald-400">98.4%</span>
            <span className="kpi-badge badge-healthy">+0.6% vs last week</span>
          </div>
          <div className="kpi-footer-metric text-secondary">
            184,200 thermodynamic validations evaluated
          </div>
        </div>

        <div className="kpi-card panel">
          <div className="kpi-header">
            <span className="kpi-label">MEAN TIME BETWEEN FAILURES (MTBF)</span>
            <Clock size={14} className="text-blue-400" />
          </div>
          <div className="kpi-value-row">
            <span className="kpi-main-value">314.8 <span className="kpi-unit">hrs</span></span>
            <span className="kpi-badge badge-neutral">TARGET: 300 hrs</span>
          </div>
          <div className="kpi-footer-metric text-secondary">
            Field RTU operational availability: 99.88%
          </div>
        </div>

        <div className="kpi-card panel">
          <div className="kpi-header">
            <span className="kpi-label">VIRTUAL CORRECTION IMPUTED FRAMES</span>
            <TrendingUp size={14} className="text-purple-400" />
          </div>
          <div className="kpi-value-row">
            <span className="kpi-main-value">2,840</span>
            <span className="kpi-badge badge-neutral">1.4% of total frames</span>
          </div>
          <div className="kpi-footer-metric text-secondary">
            Physics-based Kalman state estimator
          </div>
        </div>

        <div className="kpi-card panel">
          <div className="kpi-header">
            <span className="kpi-label">MEAN TIME TO RESOLUTION (MTTR)</span>
            <ShieldCheck size={14} className="text-emerald-400" />
          </div>
          <div className="kpi-value-row">
            <span className="kpi-main-value">18.2 <span className="kpi-unit">min</span></span>
            <span className="kpi-badge badge-healthy">-4.1 min vs baseline</span>
          </div>
          <div className="kpi-footer-metric text-secondary">
            Auto-recalibration dispatched 82% of incidents
          </div>
        </div>
      </div>

      {/* Section 1: Fault Trends Chart & Severity Breakdown */}
      <div className="analytics-section-panel panel">
        <div className="panel-header">
          <div className="panel-header-title">
            <BarChart3 size={15} className="text-blue-400" />
            <span>FAULT OCCURRENCES OVER TIME &amp; SEVERITY DISTRIBUTION</span>
          </div>
          <div className="filter-pill-group">
            <span className="text-muted text-xs mr-2">SEVERITY:</span>
            {(['all', 'critical', 'warning', 'info'] as const).map((sev) => (
              <button
                key={sev}
                className={`filter-pill ${severityFilter === sev ? 'active' : ''}`}
                onClick={() => setSeverityFilter(sev)}
              >
                {sev.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="panel-body">
          <div className="fault-trend-chart-container">
            <div className="chart-legend-row text-xs text-muted mb-3">
              <span className="legend-chip"><span className="legend-box critical" /> Critical Invariant Breaches</span>
              <span className="legend-chip"><span className="legend-box warning" /> High-Severity Degradation</span>
              <span className="legend-chip"><span className="legend-box info" /> Informational / Drift Warnings</span>
            </div>

            {/* Stacked Bar Representation */}
            <div className="stacked-bars-grid">
              {faultTimeline.map((item) => {
                const total = item.critical + item.warning + item.info;
                const critH = severityFilter === 'all' || severityFilter === 'critical' ? (item.critical / 25) * 160 : 0;
                const warnH = severityFilter === 'all' || severityFilter === 'warning' ? (item.warning / 25) * 160 : 0;
                const infoH = severityFilter === 'all' || severityFilter === 'info' ? (item.info / 25) * 160 : 0;

                return (
                  <div key={item.day} className="stacked-bar-col">
                    <div className="bar-column-wrap">
                      <div className="bar-segment info" style={{ height: `${infoH}px` }} title={`Info: ${item.info}`} />
                      <div className="bar-segment warning" style={{ height: `${warnH}px` }} title={`Warning: ${item.warning}`} />
                      <div className="bar-segment critical" style={{ height: `${critH}px` }} title={`Critical: ${item.critical}`} />
                    </div>
                    <span className="bar-day-label">{item.day}</span>
                    <span className="bar-count-label text-muted">{total}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Top Fault Types Taxonomy */}
      <div className="analytics-section-panel panel">
        <div className="panel-header">
          <div className="panel-header-title">
            <AlertTriangle size={15} className="text-amber-400" />
            <span>TOP FAULT TAXONOMY &amp; ROOT CAUSE RANKING</span>
          </div>
          <span className="badge-neutral">44 TOTAL INCIDENTS</span>
        </div>

        <div className="panel-body">
          <div className="fault-taxonomy-table-wrap">
            <table className="station-table">
              <thead>
                <tr>
                  <th>RANK</th>
                  <th>FAULT TYPE</th>
                  <th>EVENTS</th>
                  <th>SHARE</th>
                  <th>TREND</th>
                  <th>AFFECTED COMPONENT</th>
                  <th>PRIMARY ROOT CAUSE</th>
                </tr>
              </thead>
              <tbody>
                {faultBreakdown.map((item, idx) => (
                  <tr key={idx}>
                    <td className="font-bold text-muted">#{idx + 1}</td>
                    <td>
                      <span className="font-bold text-primary">{item.type}</span>
                    </td>
                    <td className="font-bold">{item.count}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${item.pct}%`, backgroundColor: item.color }} />
                        </div>
                        <span className="text-secondary">{item.pct}%</span>
                      </div>
                    </td>
                    <td>
                      <span className={`status-badge-inline ${item.trend === 'increasing' ? 'badge-critical' : item.trend === 'decreasing' ? 'badge-healthy' : 'badge-neutral'}`}>
                        {item.trend === 'increasing' ? '↑ INCREASING' : item.trend === 'decreasing' ? '↓ DECREASING' : '→ STABLE'}
                      </span>
                    </td>
                    <td className="text-secondary">{item.component}</td>
                    <td className="text-muted text-xs">{item.rootCause}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Section 3: Station Performance Comparison */}
      <div className="analytics-section-panel panel">
        <div className="panel-header">
          <div className="panel-header-title">
            <TrendingUp size={15} className="text-emerald-400" />
            <span>STATION RELIABILITY &amp; PERFORMANCE BENCHMARK</span>
          </div>
          <span className="text-secondary text-xs">CLICK COLUMN HEADERS TO SORT</span>
        </div>

        <div className="panel-body">
          <div className="station-table-wrap">
            <table className="station-table">
              <thead>
                <tr>
                  <th>STATION</th>
                  <th>REGION</th>
                  <th onClick={() => handleSort('uptimePct')} className="cursor-pointer hover:text-primary">
                    <div className="flex items-center gap-1">
                      AVAILABILITY % <ArrowUpDown size={12} />
                    </div>
                  </th>
                  <th onClick={() => handleSort('healthScore')} className="cursor-pointer hover:text-primary">
                    <div className="flex items-center gap-1">
                      HEALTH SCORE <ArrowUpDown size={12} />
                    </div>
                  </th>
                  <th onClick={() => handleSort('activeAlertCount')} className="cursor-pointer hover:text-primary">
                    <div className="flex items-center gap-1">
                      INCIDENTS <ArrowUpDown size={12} />
                    </div>
                  </th>
                  <th>MTBF</th>
                  <th>MTTR</th>
                  <th onClick={() => handleSort('latencyMs')} className="cursor-pointer hover:text-primary">
                    <div className="flex items-center gap-1">
                      LATENCY <ArrowUpDown size={12} />
                    </div>
                  </th>
                  <th>ACCURACY</th>
                </tr>
              </thead>
              <tbody>
                {sortedStations.map((st) => (
                  <tr key={st.id} className={st.status === 'faulty' ? 'row-faulty' : ''}>
                    <td>
                      <div className="flex items-center gap-2">
                        <HealthPill status={st.status} size="sm" />
                        <div>
                          <div className="font-bold text-primary">{st.code}</div>
                          <div className="text-xs text-muted truncate">{st.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="text-secondary">{st.region}</td>
                    <td>
                      <span className={`font-bold ${st.uptimePct >= 99.5 ? 'text-emerald-400' : st.uptimePct >= 95 ? 'text-amber-400' : 'text-critical'}`}>
                        {st.uptimePct}%
                      </span>
                    </td>
                    <td>
                      <span className={`font-bold ${st.healthScore >= 90 ? 'text-emerald-400' : st.healthScore >= 70 ? 'text-amber-400' : 'text-critical'}`}>
                        {st.healthScore}/100
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge-inline ${st.activeAlertCount > 0 ? 'badge-critical' : 'badge-healthy'}`}>
                        {st.activeAlertCount} ACTIVE
                      </span>
                    </td>
                    <td className="text-secondary">320h</td>
                    <td className="text-secondary">15m</td>
                    <td className="text-secondary">{st.latencyMs}ms</td>
                    <td>
                      <span className="text-emerald-400 font-bold">{(st.modelConfidence * 100).toFixed(1)}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Section 4: AI Model Performance & Version Comparison */}
      <div className="analytics-section-panel panel">
        <div className="panel-header">
          <div className="panel-header-title">
            <Cpu size={15} className="text-purple-400" />
            <span>AI MODEL INFERENCE BENCHMARKS (MODEL v2.4 vs MODEL v2.3)</span>
          </div>
          <span className="badge-healthy">DRIFT: 0.014 (NEGLIGIBLE)</span>
        </div>

        <div className="panel-body">
          <div className="model-benchmark-cards-grid mb-6">
            <div className="mini-metric-card">
              <span className="mini-lbl">PRECISION</span>
              <span className="mini-val text-emerald-400">{(modelCurrent.precision * 100).toFixed(1)}%</span>
              <span className="mini-sub text-secondary">+2.3% vs v2.3</span>
            </div>
            <div className="mini-metric-card">
              <span className="mini-lbl">RECALL</span>
              <span className="mini-val text-blue-400">{(modelCurrent.recall * 100).toFixed(1)}%</span>
              <span className="mini-sub text-secondary">+2.8% vs v2.3</span>
            </div>
            <div className="mini-metric-card">
              <span className="mini-lbl">F1 SCORE</span>
              <span className="mini-val text-purple-400">{(modelCurrent.f1Score * 100).toFixed(1)}%</span>
              <span className="mini-sub text-secondary">+2.5% vs v2.3</span>
            </div>
            <div className="mini-metric-card">
              <span className="mini-lbl">FALSE POSITIVE RATE</span>
              <span className="mini-val text-emerald-400">{(modelCurrent.falsePositiveRate * 100).toFixed(2)}%</span>
              <span className="mini-sub text-secondary">-0.82% reduction</span>
            </div>
            <div className="mini-metric-card">
              <span className="mini-lbl">INFERENCE LATENCY</span>
              <span className="mini-val text-cyan-400">{modelCurrent.detectionLatencyMs} ms</span>
              <span className="mini-sub text-secondary">-18 ms faster</span>
            </div>
          </div>

          <div className="model-comparison-table-wrap">
            <table className="station-table">
              <thead>
                <tr>
                  <th>MODEL VERSION</th>
                  <th>ARCHITECTURE</th>
                  <th>PRECISION</th>
                  <th>RECALL</th>
                  <th>F1 SCORE</th>
                  <th>FALSE POSITIVE RATE</th>
                  <th>INFERENCE SPEED</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {(benchmarks.length > 0 ? benchmarks : [modelCurrent]).map((bm, i) => (
                  <tr key={bm.version || i} className={i === 0 ? 'bg-blue-950/20' : ''}>
                    <td className="font-bold text-primary">
                      {bm.version} {i === 0 && <span className="ml-2 text-xs text-emerald-400">(ACTIVE PRODUCTION)</span>}
                    </td>
                    <td className="text-secondary">{bm.name || (i === 0 ? 'Temporal CNN + Kalman State Estimator' : 'Random Forest + Heuristic Invariants')}</td>
                    <td className="text-emerald-400 font-bold">{(bm.precision * 100).toFixed(1)}%</td>
                    <td className="text-blue-400 font-bold">{(bm.recall * 100).toFixed(1)}%</td>
                    <td className="text-purple-400 font-bold">{(bm.f1Score * 100).toFixed(1)}%</td>
                    <td className="text-amber-400 font-bold">{(bm.falsePositiveRate * 100).toFixed(2)}%</td>
                    <td className="text-cyan-400 font-bold">{bm.detectionLatencyMs} ms</td>
                    <td>
                      <span className={`status-badge-inline ${i === 0 ? 'badge-healthy' : 'badge-neutral'}`}>
                        {i === 0 ? 'DEPLOYED' : 'DEPRECATED'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

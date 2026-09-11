import React, { useState, useMemo } from 'react';
import { ParameterType, AnomalyMarker, TimeSeriesPoint } from '../../types/telemetry';
import { Activity, AlertCircle, Check } from 'lucide-react';

interface ParameterLineChartProps {
  series: TimeSeriesPoint[];
  parameter: ParameterType;
  anomalyMarkers: AnomalyMarker[];
  correctedOverlay?: TimeSeriesPoint[];
  height?: number;
  title?: string;
  stationCode?: string;
}

export const ParameterLineChart: React.FC<ParameterLineChartProps> = ({
  series,
  parameter,
  anomalyMarkers,
  correctedOverlay,
  height = 240,
  title,
  stationCode
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const config = useMemo(() => {
    switch (parameter) {
      case 'T':
        return {
          name: 'Temperature',
          unit: '°C',
          color: '#f97316',
          overlayColor: '#38bdf8',
          label: 'Ambient Dry-Bulb T'
        };
      case 'P':
        return {
          name: 'Pressure',
          unit: 'hPa',
          color: '#06b6d4',
          overlayColor: '#34d399',
          label: 'Barometric Station Pressure'
        };
      case 'RH':
      default:
        return {
          name: 'Relative Humidity',
          unit: '%',
          color: '#3b82f6',
          overlayColor: '#10b981',
          label: 'Relative Humidity (Magnus Linked)'
        };
    }
  }, [parameter]);

  // Compute min, max, bounds
  const { minVal, maxVal, pointsSvg, overlaySvg } = useMemo(() => {
    if (!series || series.length === 0) {
      return { minVal: 0, maxVal: 100, pointsSvg: '', overlaySvg: '' };
    }

    const allVals = [...series.map(s => s.value)];
    if (correctedOverlay) {
      allVals.push(...correctedOverlay.map(c => c.value));
    }

    let min = Math.min(...allVals);
    let max = Math.max(...allVals);
    const padding = (max - min) * 0.15 || 2;
    min = Math.floor(min - padding);
    max = Math.ceil(max + padding);

    const width = 800;
    const chartHeight = height - 40;

    const toX = (index: number) => (index / (series.length - 1 || 1)) * (width - 60) + 40;
    const toY = (val: number) => chartHeight - ((val - min) / (max - min || 1)) * (chartHeight - 30) - 15;

    // Build SVG path string for raw series
    const pStr = series.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(pt.value).toFixed(1)}`).join(' ');

    // Build SVG path string for corrected overlay
    let oStr = '';
    if (correctedOverlay && correctedOverlay.length === series.length) {
      oStr = correctedOverlay.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(pt.value).toFixed(1)}`).join(' ');
    }

    return { minVal: min, maxVal: max, pointsSvg: pStr, overlaySvg: oStr };
  }, [series, correctedOverlay, height]);

  const width = 800;
  const chartHeight = height - 40;
  const toX = (index: number) => (index / (series.length - 1 || 1)) * (width - 60) + 40;
  const toY = (val: number) => chartHeight - ((val - minVal) / (maxVal - minVal || 1)) * (chartHeight - 30) - 15;

  const currentHover = hoverIndex !== null && series[hoverIndex] ? series[hoverIndex] : series[series.length - 1];
  const currentCorrected = hoverIndex !== null && correctedOverlay && correctedOverlay[hoverIndex] 
    ? correctedOverlay[hoverIndex] 
    : correctedOverlay ? correctedOverlay[correctedOverlay.length - 1] : null;

  return (
    <div className="parameter-chart-wrapper panel">
      <div className="chart-header">
        <div className="chart-title-group">
          <Activity size={14} style={{ color: config.color }} />
          <span className="chart-title font-mono">{title || `${config.name} (${config.unit})`}</span>
          {stationCode && <span className="chart-station-tag font-mono">[{stationCode}]</span>}
        </div>
        <div className="chart-legend font-mono">
          <div className="legend-item">
            <span className="legend-line" style={{ backgroundColor: config.color }} />
            <span>Raw Telemetry</span>
          </div>
          {correctedOverlay && (
            <div className="legend-item">
              <span className="legend-line dashed" style={{ backgroundColor: config.overlayColor }} />
              <span>Physics Imputed</span>
            </div>
          )}
          {anomalyMarkers.length > 0 && (
            <div className="legend-item">
              <span className="legend-marker" />
              <span>Anomaly Detected ({anomalyMarkers.length})</span>
            </div>
          )}
        </div>
      </div>

      <div className="chart-readout-banner font-mono">
        <div className="readout-block">
          <span className="readout-label">LATEST RAW</span>
          <span className="readout-value font-mono" style={{ color: config.color }}>
            {currentHover ? currentHover.value.toFixed(1) : '--'} {config.unit}
          </span>
        </div>
        {currentCorrected && (
          <div className="readout-block">
            <span className="readout-label">CORRECTED (VIRTUAL)</span>
            <span className="readout-value font-mono" style={{ color: config.overlayColor }}>
              {currentCorrected.value.toFixed(1)} {config.unit}
            </span>
          </div>
        )}
        <div className="readout-block">
          <span className="readout-label">TIMESTAMP</span>
          <span className="readout-value text-secondary">
            {currentHover ? currentHover.timestamp : '--'}
          </span>
        </div>
        <div className="readout-block">
          <span className="readout-label">DYNAMIC RANGE</span>
          <span className="readout-value text-muted font-mono">
            {minVal} - {maxVal} {config.unit}
          </span>
        </div>
      </div>

      <div className="chart-svg-container" style={{ height }}>
        <svg 
          viewBox={`0 0 ${width} ${chartHeight}`} 
          className="chart-svg"
          preserveAspectRatio="none"
          onMouseLeave={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id={`grad-${parameter}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={config.color} stopOpacity="0.20" />
              <stop offset="100%" stopColor={config.color} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0.2, 0.5, 0.8].map((ratio, idx) => {
            const y = chartHeight * ratio;
            const val = maxVal - (maxVal - minVal) * ratio;
            return (
              <g key={idx} className="chart-grid-line">
                <line x1="35" y1={y} x2={width} y2={y} stroke="var(--border-subtle)" strokeDasharray="3 3" />
                <text x="32" y={y + 3} textAnchor="end" fill="var(--text-muted)" fontSize="9" fontFamily="var(--font-mono)">
                  {val.toFixed(0)}
                </text>
              </g>
            );
          })}

          {/* Area under raw curve */}
          {pointsSvg && (
            <path
              d={`${pointsSvg} L ${toX(series.length - 1)} ${chartHeight} L ${toX(0)} ${chartHeight} Z`}
              fill={`url(#grad-${parameter})`}
            />
          )}

          {/* Imputed / Corrected dashed line */}
          {overlaySvg && (
            <path
              d={overlaySvg}
              fill="none"
              stroke={config.overlayColor}
              strokeWidth="2"
              strokeDasharray="5 4"
              opacity="0.95"
            />
          )}

          {/* Raw Line */}
          {pointsSvg && (
            <path
              d={pointsSvg}
              fill="none"
              stroke={config.color}
              strokeWidth="2.2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {/* Anomaly markers */}
          {anomalyMarkers.map((marker, mIdx) => {
            const matchIndex = series.findIndex(s => s.timestamp === marker.timestamp);
            if (matchIndex === -1) return null;
            const cx = toX(matchIndex);
            const cy = toY(marker.value);
            const markerColor = marker.severity === 'critical' ? 'var(--state-critical)' : 'var(--state-warning)';

            return (
              <g key={mIdx} className="chart-anomaly-point">
                <circle cx={cx} cy={cy} r="10" fill={markerColor} opacity="0.25" className="pulse-circle" />
                <circle cx={cx} cy={cy} r="5" fill="var(--bg-surface)" stroke={markerColor} strokeWidth="2.5" />
                {/* Marker Flag Callout */}
                <line x1={cx} y1={cy - 5} x2={cx} y2={cy - 24} stroke={markerColor} strokeWidth="1.5" />
                <rect 
                  x={cx - 50} 
                  y={cy - 40} 
                  width="100" 
                  height="16" 
                  rx="3" 
                  fill="var(--bg-surface-raised)" 
                  stroke={markerColor} 
                  strokeWidth="1" 
                />
                <text 
                  x={cx} 
                  y={cy - 28} 
                  textAnchor="middle" 
                  fill="var(--text-primary)" 
                  fontSize="8.5" 
                  fontFamily="var(--font-mono)" 
                  fontWeight="600"
                >
                  {marker.label.split(' ')[0]} FAULT
                </text>
              </g>
            );
          })}

          {/* Hover interactive vertical crosshair */}
          {hoverIndex !== null && series[hoverIndex] && (
            <g className="chart-crosshair">
              <line
                x1={toX(hoverIndex)}
                y1="0"
                x2={toX(hoverIndex)}
                y2={chartHeight}
                stroke="var(--text-secondary)"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              <circle
                cx={toX(hoverIndex)}
                cy={toY(series[hoverIndex].value)}
                r="4.5"
                fill={config.color}
                stroke="#ffffff"
                strokeWidth="1.5"
              />
            </g>
          )}

          {/* Invisible hover capture slices */}
          {series.map((_, i) => {
            const x = toX(i);
            const stepW = (width - 60) / (series.length || 1);
            return (
              <rect
                key={i}
                x={x - stepW / 2}
                y="0"
                width={stepW}
                height={chartHeight}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(i)}
                style={{ cursor: 'crosshair' }}
              />
            );
          })}
        </svg>
      </div>

      <div className="chart-footer-time-labels font-mono">
        <span>{series[0]?.timestamp || ''}</span>
        <span>{series[Math.floor(series.length / 2)]?.timestamp || ''}</span>
        <span>{series[series.length - 1]?.timestamp || ''}</span>
      </div>
    </div>
  );
};

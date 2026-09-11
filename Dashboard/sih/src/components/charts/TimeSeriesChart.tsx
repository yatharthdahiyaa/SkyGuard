import React, { useState, useMemo } from 'react';
import { ParameterType, TimeSeriesPoint, AnomalyMarker } from '../../types/telemetry';
import { Activity, Plus, Minus, RotateCcw } from '../icons';

export interface MetricSeriesConfig {
  id: ParameterType;
  label: string;
  unit: string;
  color: string;
  points: TimeSeriesPoint[];
}

interface TimeSeriesChartProps {
  seriesList: MetricSeriesConfig[];
  anomalyRegion?: { startIndex: number; endIndex: number; label: string; severity?: 'critical' | 'warning' };
  anomalyMarkers?: AnomalyMarker[];
  height?: number;
  title?: string;
  allowMultiMetric?: boolean;
}

export const TimeSeriesChart: React.FC<TimeSeriesChartProps> = ({
  seriesList,
  anomalyRegion,
  anomalyMarkers = [],
  height = 260,
  title,
  allowMultiMetric = true
}) => {
  const [activeMetricIds, setActiveMetricIds] = useState<ParameterType[]>([seriesList[0]?.id || 'vibration']);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const toggleMetric = (id: ParameterType) => {
    if (!allowMultiMetric) {
      setActiveMetricIds([id]);
      return;
    }
    if (activeMetricIds.includes(id)) {
      if (activeMetricIds.length > 1) {
        setActiveMetricIds(activeMetricIds.filter(m => m !== id));
      }
    } else {
      setActiveMetricIds([...activeMetricIds, id]);
    }
  };

  const primarySeries = seriesList.find(s => activeMetricIds.includes(s.id)) || seriesList[0];
  const allPoints = primarySeries?.points || [];

  // Zoom slice
  const visiblePoints = useMemo(() => {
    if (zoomLevel === 1) return allPoints;
    const count = Math.max(10, Math.floor(allPoints.length / zoomLevel));
    return allPoints.slice(allPoints.length - count);
  }, [allPoints, zoomLevel]);

  const width = 800;
  const chartHeight = height - 40;

  // Min / Max calculation for all active metrics
  const bounds = useMemo(() => {
    const activeSeries = seriesList.filter(s => activeMetricIds.includes(s.id));
    let min = Infinity;
    let max = -Infinity;

    activeSeries.forEach(s => {
      const pts = zoomLevel === 1 ? s.points : s.points.slice(s.points.length - visiblePoints.length);
      pts.forEach(p => {
        if (p.value < min) min = p.value;
        if (p.value > max) max = p.value;
      });
    });

    if (min === Infinity) { min = 0; max = 10; }
    const padding = (max - min) * 0.15 || 1;
    return { min: min - padding, max: max + padding };
  }, [seriesList, activeMetricIds, zoomLevel, visiblePoints.length]);

  const toX = (index: number) => (index / (visiblePoints.length - 1 || 1)) * (width - 60) + 40;
  const toY = (val: number) => chartHeight - ((val - bounds.min) / (bounds.max - bounds.min || 1)) * (chartHeight - 30) - 15;

  return (
    <div className="time-series-chart-card panel font-mono">
      <div className="chart-top-bar">
        <div className="chart-title-left">
          <Activity size={14} className="text-blue-400" />
          <span className="chart-main-title">{title || 'TIME-SERIES SENSOR MONITORING'}</span>
        </div>

        {/* Zoom Controls */}
        <div className="chart-zoom-controls">
          <button 
            className="btn-zoom" 
            onClick={() => setZoomLevel(prev => Math.min(prev + 0.5, 3))}
            title="Zoom In"
          >
            <Plus size={11} />
          </button>
          <button 
            className="btn-zoom" 
            onClick={() => setZoomLevel(prev => Math.max(prev - 0.5, 1))}
            title="Zoom Out"
          >
            <Minus size={11} />
          </button>
          <button 
            className="btn-zoom" 
            onClick={() => setZoomLevel(1)}
            title="Reset Zoom"
          >
            <RotateCcw size={11} />
          </button>
          <span className="zoom-indicator text-muted">{zoomLevel}x</span>
        </div>
      </div>

      {/* Metric Selectors Pill Group */}
      <div className="metric-selectors-row">
        {seriesList.map(metric => {
          const isActive = activeMetricIds.includes(metric.id);
          return (
            <button
              key={metric.id}
              type="button"
              className={`metric-pill-btn ${isActive ? 'active' : ''}`}
              style={{ borderColor: isActive ? metric.color : undefined }}
              onClick={() => toggleMetric(metric.id)}
            >
              <span className="metric-dot" style={{ backgroundColor: metric.color }} />
              <span>{metric.label} ({metric.unit})</span>
            </button>
          );
        })}
      </div>

      {/* Main SVG Plot */}
      <div className="chart-svg-container" style={{ height }}>
        <svg viewBox={`0 0 ${width} ${chartHeight}`} className="chart-svg" preserveAspectRatio="none">
          {/* Horizontal Grid lines */}
          {[0.25, 0.5, 0.75].map((r, idx) => {
            const y = chartHeight * r;
            const val = bounds.max - (bounds.max - bounds.min) * r;
            return (
              <g key={idx}>
                <line x1="38" y1={y} x2={width} y2={y} stroke="var(--border-subtle)" strokeDasharray="3 3" />
                <text x="34" y={y + 3} textAnchor="end" fill="var(--text-muted)" fontSize="9">
                  {val.toFixed(1)}
                </text>
              </g>
            );
          })}

          {/* Anomaly Highlight Shading Band */}
          {anomalyRegion && (
            <g className="anomaly-region-band">
              <rect
                x={toX(Math.max(0, anomalyRegion.startIndex))}
                y="10"
                width={Math.max(20, toX(anomalyRegion.endIndex) - toX(anomalyRegion.startIndex))}
                height={chartHeight - 20}
                fill={anomalyRegion.severity === 'critical' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)'}
                stroke={anomalyRegion.severity === 'critical' ? 'var(--state-critical)' : 'var(--state-warning)'}
                strokeWidth="1"
                strokeDasharray="4 2"
              />
              <text
                x={toX(anomalyRegion.startIndex) + 6}
                y="24"
                fill={anomalyRegion.severity === 'critical' ? 'var(--state-critical)' : 'var(--state-warning)'}
                fontSize="9"
                fontWeight="700"
              >
                ⚠ {anomalyRegion.label}
              </text>
            </g>
          )}

          {/* Active Series Lines */}
          {seriesList
            .filter(s => activeMetricIds.includes(s.id))
            .map(s => {
              const pts = zoomLevel === 1 ? s.points : s.points.slice(s.points.length - visiblePoints.length);
              const pathD = pts
                .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(pt.value).toFixed(1)}`)
                .join(' ');

              return (
                <path
                  key={s.id}
                  d={pathD}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            })}

          {/* Anomaly point flags */}
          {anomalyMarkers.map((marker, mIdx) => {
            const matchIndex = visiblePoints.findIndex(p => p.timestamp === marker.timestamp);
            if (matchIndex === -1) return null;
            const cx = toX(matchIndex);
            const cy = toY(marker.value);
            const markerColor = marker.severity === 'critical' ? 'var(--state-critical)' : 'var(--state-warning)';

            return (
              <g key={mIdx}>
                <circle cx={cx} cy={cy} r="6" fill={markerColor} opacity="0.3" className="pulse-circle" />
                <circle cx={cx} cy={cy} r="3.5" fill="#ffffff" stroke={markerColor} strokeWidth="2" />
              </g>
            );
          })}

          {/* Crosshair hover tracker */}
          {hoverIndex !== null && visiblePoints[hoverIndex] && (
            <g>
              <line
                x1={toX(hoverIndex)}
                y1="0"
                x2={toX(hoverIndex)}
                y2={chartHeight}
                stroke="var(--text-secondary)"
                strokeDasharray="2 2"
              />
            </g>
          )}

          {/* Transparent click/hover captures */}
          {visiblePoints.map((_, i) => (
            <rect
              key={i}
              x={toX(i) - 10}
              y="0"
              width="20"
              height={chartHeight}
              fill="transparent"
              onMouseEnter={() => setHoverIndex(i)}
            />
          ))}
        </svg>
      </div>

      <div className="chart-bottom-timeline">
        <span>{visiblePoints[0]?.timestamp || ''}</span>
        <span>{visiblePoints[Math.floor(visiblePoints.length / 2)]?.timestamp || ''}</span>
        <span>{visiblePoints[visiblePoints.length - 1]?.timestamp || ''}</span>
      </div>
    </div>
  );
};

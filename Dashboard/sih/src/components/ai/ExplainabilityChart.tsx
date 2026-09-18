import React from 'react';
import { FeatureImportance, EvidenceStep, RecommendedAction } from '../../types/telemetry';
import { 
  BarChart3, 
  Activity, 
  ShieldAlert, 
  ArrowRight, 
  CheckCircle2, 
  AlertTriangle, 
  Wrench,
  Clock
} from '../icons';

interface ExplainabilityChartProps {
  features: FeatureImportance[];
  evidenceSteps?: EvidenceStep[];
  recommendedActions?: RecommendedAction[];
  baselineVsObserved?: {
    timestamps: string[];
    baseline: number[];
    actual: number[];
    anomalyStartIndex: number;
    metricLabel: string;
    unit: string;
  };
}

export const ExplainabilityChart: React.FC<ExplainabilityChartProps> = ({
  features,
  evidenceSteps = [],
  recommendedActions = [],
  baselineVsObserved
}) => {
  return (
    <div className="explainability-chart-container font-mono">
      {/* 1. Horizontal Contribution / Bar Visualization */}
      <div className="subpanel-card panel">
        <div className="subpanel-header">
          <div className="subpanel-title">
            <BarChart3 size={14} className="text-blue-400" />
            <span>WHY WAS THIS ALERT TRIGGERED? (CONTRIBUTING SIGNALS)</span>
          </div>
          <span className="status-tag pass font-mono">NORMALIZED SHAP</span>
        </div>

        <div className="subpanel-body">
          <div className="contributing-features-list">
            {features.map((feat, idx) => {
              const isRisk = feat.direction === 'increases_risk';

              return (
                <div key={idx} className="feature-contrib-row">
                  <div className="feature-contrib-label-line">
                    <span className="feat-name font-bold text-primary">{feat.feature}</span>
                    <div className="feat-values-comparison text-muted">
                      <span>Baseline: {feat.baselineValue}</span>
                      <ArrowRight size={10} className="inline-arrow" />
                      <span className="text-primary font-bold">Observed: {feat.observedValue}</span>
                    </div>
                  </div>

                    <div className="feature-contrib-bar-wrap">
                    <div className="feature-contrib-track">
                      <div
                        className={`feature-contrib-fill ${isRisk ? 'bar-risk' : 'bar-safe'}`}
                        style={{ width: `${Math.min(100, Math.max(0, feat.contributionPct || 0))}%` }}
                      />
                    </div>
                    <span className={`feat-score-pct ${isRisk ? 'text-critical font-bold' : 'text-emerald-400'}`}>
                      +{Math.min(100, Math.max(0, feat.contributionPct || 0))}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. Expected vs Observed Chart */}
      {baselineVsObserved && (
        <div className="subpanel-card panel">
          <div className="subpanel-header">
            <div className="subpanel-title">
              <Activity size={14} className="text-amber-400" />
              <span>EXPECTED VS OBSERVED SIGNAL CORRIDOR ({baselineVsObserved.metricLabel.toUpperCase()})</span>
            </div>
            <div className="chart-legend-mini font-mono text-xs">
              <span className="legend-sample baseline-dashed" /> Expected Baseline
              <span className="legend-sample actual-solid" /> Actual Sensor Telemetry
              <span className="legend-sample anomaly-box" /> Anomaly Region
            </div>
          </div>

          <div className="subpanel-body">
            <div className="baseline-chart-svg-wrap">
              <svg viewBox="0 0 760 210" className="baseline-svg">
                {/* Self-Contained Bounded Plot Corridor */}
                {(() => {
                  const all = [...baselineVsObserved.baseline, ...baselineVsObserved.actual].filter(n => typeof n === 'number' && !isNaN(n));
                  if (all.length === 0) return null;
                  const rawMin = Math.min(...all);
                  const rawMax = Math.max(...all);
                  const range = rawMax - rawMin;
                  const pad = range > 0 ? range * 0.20 : Math.max(Math.abs(rawMin) * 0.15, 2);
                  const min = rawMin - pad;
                  const max = rawMax + pad;
                  const span = max - min || 1;

                  const plotLeft = 60;
                  const plotRight = 720;
                  const plotTop = 25;
                  const plotBottom = 175;
                  const plotWidth = plotRight - plotLeft;
                  const plotHeight = plotBottom - plotTop;

                  const numPoints = Math.max(1, (baselineVsObserved.timestamps.length || 1) - 1);
                  const toX = (i: number) => {
                    const norm = Math.max(0, Math.min(1, i / numPoints));
                    return plotLeft + norm * plotWidth;
                  };
                  const toY = (v: number) => {
                    const clamped = Math.max(min, Math.min(max, v));
                    const norm = (clamped - min) / span;
                    return plotBottom - norm * plotHeight;
                  };

                  const safeStartIndex = Math.max(0, Math.min(baselineVsObserved.anomalyStartIndex, baselineVsObserved.actual.length - 1));
                  const triggerX = toX(safeStartIndex);
                  const triggerVal = baselineVsObserved.actual[safeStartIndex] ?? rawMax;
                  const triggerY = toY(triggerVal);

                  const baselinePath = baselineVsObserved.baseline.map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(v)}`).join(' ');
                  const actualPath = baselineVsObserved.actual.map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(v)}`).join(' ');

                  const boxWidth = Math.max(0, plotRight - triggerX);
                  const textY = triggerY < 45 ? triggerY + 20 : triggerY - 12;
                  const textX = Math.max(plotLeft + 45, Math.min(plotRight - 45, triggerX));

                  const yTicks = [
                    { val: max, y: plotTop },
                    { val: (max + min) / 2, y: (plotTop + plotBottom) / 2 },
                    { val: min, y: plotBottom }
                  ];

                  return (
                    <>
                      {/* Grid guidelines & Y-axis labels */}
                      {yTicks.map((tick, idx) => (
                        <g key={idx}>
                          <line
                            x1={plotLeft}
                            y1={tick.y}
                            x2={plotRight}
                            y2={tick.y}
                            stroke="rgba(0, 51, 102, 0.12)"
                            strokeDasharray={idx === 1 ? "4 4" : "2 2"}
                          />
                          <text
                            x={plotLeft - 8}
                            y={tick.y + 4}
                            textAnchor="end"
                            fill="#64748b"
                            fontSize="10"
                            fontFamily="monospace"
                          >
                            {tick.val.toFixed(1)}{baselineVsObserved.unit}
                          </text>
                        </g>
                      ))}

                      {/* Anomaly detection region box */}
                      {boxWidth > 0 && (
                        <rect
                          x={triggerX}
                          y={plotTop - 5}
                          width={boxWidth}
                          height={plotHeight + 10}
                          fill="rgba(239, 68, 68, 0.08)"
                          stroke="rgba(239, 68, 68, 0.4)"
                          strokeDasharray="4 2"
                          rx="4"
                        />
                      )}

                      {/* Baseline Line (Dashed) */}
                      <path
                        d={baselinePath}
                        fill="none"
                        stroke="#0284c7"
                        strokeWidth="2.5"
                        strokeDasharray="6 4"
                      />

                      {/* Actual Telemetry Line (Solid) */}
                      <path
                        d={actualPath}
                        fill="none"
                        stroke="var(--state-critical)"
                        strokeWidth="2.5"
                      />

                      {/* Data Points on Actual */}
                      {baselineVsObserved.actual.map((v, i) => (
                        <circle
                          key={i}
                          cx={toX(i)}
                          cy={toY(v)}
                          r={i === safeStartIndex ? "5" : "3.5"}
                          fill={i >= safeStartIndex ? "var(--state-critical)" : "#0284c7"}
                          stroke="#ffffff"
                          strokeWidth="1.5"
                        />
                      ))}

                      {/* Detection Trigger Point Highlight */}
                      <circle
                        cx={triggerX}
                        cy={triggerY}
                        r="6"
                        fill="var(--state-critical)"
                        stroke="#ffffff"
                        strokeWidth="2.5"
                      />
                      <rect
                        x={textX - 58}
                        y={textY - 11}
                        width="116"
                        height="16"
                        fill="#ffffff"
                        stroke="var(--state-critical)"
                        strokeWidth="1"
                        rx="3"
                      />
                      <text
                        x={textX}
                        y={textY + 1}
                        textAnchor="middle"
                        fill="var(--state-critical)"
                        fontSize="9"
                        fontWeight="700"
                      >
                        ANOMALY TRIP POINT
                      </text>

                      {/* Integrated X-axis Timestamps */}
                      {baselineVsObserved.timestamps.map((t, idx) => (
                        <text
                          key={idx}
                          x={toX(idx)}
                          y="198"
                          textAnchor="middle"
                          fill="#64748b"
                          fontSize="10"
                          fontFamily="monospace"
                        >
                          {t}
                        </text>
                      ))}
                    </>
                  );
                })()}
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* 3. Evidence Timeline Sequence */}
      {evidenceSteps.length > 0 && (
        <div className="subpanel-card panel">
          <div className="subpanel-header">
            <div className="subpanel-title">
              <Clock size={14} className="text-emerald-400" />
              <span>EVIDENCE SEQUENCE (ANOMALY EVOLUTION TIMELINE)</span>
            </div>
            <span className="text-muted font-mono">{evidenceSteps.length} STAGES</span>
          </div>

          <div className="subpanel-body">
            <div className="evidence-timeline-stepper">
              {evidenceSteps.map((step, idx) => {
                const color = 
                  step.status === 'critical' ? 'var(--state-critical)' : 
                  step.status === 'warning' ? 'var(--state-warning)' : 'var(--state-healthy)';

                return (
                  <div key={step.step} className="evidence-step-item">
                    <div className="evidence-step-left">
                      <div className="evidence-step-badge" style={{ borderColor: color, color }}>
                        {step.step}
                      </div>
                      {idx < evidenceSteps.length - 1 && <div className="evidence-step-line" />}
                    </div>
                    <div className="evidence-step-content">
                      <div className="evidence-step-top">
                        <span className="step-stage-name" style={{ color }}>{step.stage.toUpperCase()}</span>
                        <span className="step-timestamp text-muted">{step.timestamp}</span>
                      </div>
                      <div className="step-title font-bold text-primary">{step.title}</div>
                      <p className="step-desc text-secondary">{step.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 4. Prioritized Recommended Actions */}
      {recommendedActions.length > 0 && (
        <div className="subpanel-card panel">
          <div className="subpanel-header">
            <div className="subpanel-title">
              <Wrench size={14} className="text-blue-400" />
              <span>AI-GENERATED RECOMMENDED ACTIONS</span>
            </div>
            <span className="badge-neutral font-mono">PRIORITIZED</span>
          </div>

          <div className="subpanel-body">
            <div className="recommendations-list">
              {recommendedActions.map((action) => {
                const badgeColor = 
                  action.priority === 'high' ? 'badge-critical' :
                  action.priority === 'medium' ? 'badge-warning' : 'badge-neutral';

                return (
                  <div key={action.id} className="recommendation-item">
                    <div className="rec-top">
                      <span className="rec-title font-bold text-primary">{action.title}</span>
                      <span className={`kpi-badge ${badgeColor} font-mono`}>
                        {action.priority.toUpperCase()} PRIORITY
                      </span>
                    </div>
                    <p className="rec-desc text-secondary">{action.description}</p>
                    <div className="rec-footer">
                      <span className="rec-status text-muted">Status: {action.status.replace('_', ' ').toUpperCase()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

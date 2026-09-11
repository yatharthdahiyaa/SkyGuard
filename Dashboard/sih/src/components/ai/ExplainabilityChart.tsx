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
                        style={{ width: `${feat.contributionPct}%` }}
                      />
                    </div>
                    <span className={`feat-score-pct ${isRisk ? 'text-critical font-bold' : 'text-emerald-400'}`}>
                      +{feat.contributionPct}%
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
              <span>EXPECTED VS OBSERVED SIGNAL CORRIDOR</span>
            </div>
            <div className="chart-legend-mini font-mono text-xs">
              <span className="legend-sample baseline-dashed" /> Expected Baseline
              <span className="legend-sample actual-solid" /> Actual Sensor Telemetry
              <span className="legend-sample anomaly-box" /> Detection Trigger
            </div>
          </div>

          <div className="subpanel-body">
            <div className="baseline-chart-svg-wrap">
              <svg viewBox="0 0 700 180" className="baseline-svg" preserveAspectRatio="none">
                {/* Bounds */}
                {(() => {
                  const all = [...baselineVsObserved.baseline, ...baselineVsObserved.actual];
                  const min = Math.min(...all) * 0.9;
                  const max = Math.max(...all) * 1.1;
                  const toX = (i: number) => (i / (baselineVsObserved.timestamps.length - 1)) * 620 + 40;
                  const toY = (v: number) => 160 - ((v - min) / (max - min || 1)) * 130 - 15;

                  const baselinePath = baselineVsObserved.baseline.map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(v)}`).join(' ');
                  const actualPath = baselineVsObserved.actual.map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(v)}`).join(' ');
                  const triggerIndex = baselineVsObserved.anomalyStartIndex;

                  return (
                    <>
                      {/* Anomaly detection region box */}
                      <rect
                        x={toX(triggerIndex)}
                        y={10}
                        width={660 - toX(triggerIndex)}
                        height={150}
                        fill="rgba(239, 68, 68, 0.12)"
                        stroke="var(--state-critical)"
                        strokeDasharray="4 2"
                      />

                      {/* Baseline Line (Dashed) */}
                      <path
                        d={baselinePath}
                        fill="none"
                        stroke="var(--state-info)"
                        strokeWidth="2"
                        strokeDasharray="5 4"
                      />

                      {/* Actual Telemetry Line (Solid) */}
                      <path
                        d={actualPath}
                        fill="none"
                        stroke="var(--state-critical)"
                        strokeWidth="2.5"
                      />

                      {/* Detection Trigger Point */}
                      <circle
                        cx={toX(triggerIndex)}
                        cy={toY(baselineVsObserved.actual[triggerIndex])}
                        r="6"
                        fill="var(--state-critical)"
                        stroke="#ffffff"
                        strokeWidth="2"
                      />
                      <text
                        x={toX(triggerIndex)}
                        y={toY(baselineVsObserved.actual[triggerIndex]) - 14}
                        textAnchor="middle"
                        fill="var(--state-critical)"
                        fontSize="9"
                        fontWeight="700"
                      >
                        ANOMALY TRIP POINT
                      </text>
                    </>
                  );
                })()}
              </svg>
            </div>
            <div className="baseline-chart-footer text-muted">
              {baselineVsObserved.timestamps.map((t, idx) => (
                <span key={idx}>{t}</span>
              ))}
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

import React from 'react';
import { 
  AnomalyExplanation, 
  PhysicsConsistency, 
  TemporalPattern, 
  SpatialConsensus, 
  FeatureImportance 
} from '../../types/telemetry';
import { SeverityBadge } from './SeverityBadge';
import { HealthPill } from './HealthPill';
import { 
  Atom, 
  Clock, 
  Radio, 
  BarChart3, 
  MessageSquareQuote, 
  AlertCircle, 
  CheckCircle2, 
  Info,
  Wrench,
  ArrowRight
} from 'lucide-react';

interface ExplainabilityPanelProps {
  explanation: AnomalyExplanation;
  onRemediate?: () => void;
}

// 1. Physics Consistency Card
export const PhysicsConsistencyCard: React.FC<{ data: PhysicsConsistency }> = ({ data }) => {
  return (
    <div className={`subpanel-card ${data.passed ? 'border-healthy' : 'border-critical'}`}>
      <div className="subpanel-header">
        <div className="subpanel-title font-mono">
          <Atom size={14} className={data.passed ? 'text-emerald-400' : 'text-rose-400'} />
          <span>PHYSICS INVARIANT CHECK (THERMODYNAMICS)</span>
        </div>
        <span className={`status-tag ${data.passed ? 'pass' : 'fail'} font-mono`}>
          {data.passed ? 'PASSED' : 'INVARIANT BREACH'}
        </span>
      </div>

      <div className="subpanel-body">
        <div className="invariant-rule-box font-mono">
          <span className="rule-label">FORMULA / CONSTRAINT:</span>
          <span className="rule-text">{data.invariant}</span>
        </div>

        <div className="physics-metrics-row font-mono">
          <div className="p-metric">
            <span className="p-label">ACTUAL READING</span>
            <span className={`p-value ${!data.passed ? 'text-critical font-bold' : ''}`}>
              {data.dewPointActual}°C
            </span>
          </div>
          <div className="p-metric">
            <span className="p-label">MAGNUS THEORETICAL BOUND</span>
            <span className="p-value text-secondary">
              {data.dewPointMagnus}°C
            </span>
          </div>
          <div className="p-metric">
            <span className="p-label">RESIDUAL BIAS Δ</span>
            <span className={`p-value ${data.delta > 1 ? 'text-critical' : 'text-emerald-400'}`}>
              +{data.delta}°C
            </span>
          </div>
        </div>

        <p className="subpanel-explanation text-secondary">
          {data.detail}
        </p>
      </div>
    </div>
  );
};

// 2. Temporal Pattern Card
export const TemporalPatternCard: React.FC<{ data: TemporalPattern }> = ({ data }) => {
  const isTrip = data.errorScore >= data.threshold;

  return (
    <div className={`subpanel-card ${isTrip ? 'border-warning' : 'border-subtle'}`}>
      <div className="subpanel-header">
        <div className="subpanel-title font-mono">
          <Clock size={14} className={isTrip ? 'text-amber-400' : 'text-blue-400'} />
          <span>TEMPORAL SIGNAL PROFILE</span>
        </div>
        <span className={`status-tag ${isTrip ? 'warn' : 'pass'} font-mono`}>
          {data.metricName.toUpperCase()}
        </span>
      </div>

      <div className="subpanel-body">
        <div className="temporal-metrics-grid font-mono">
          <div className="t-cell">
            <span className="t-label">ANOMALY SCORE</span>
            <span className={`t-value ${isTrip ? 'text-warning font-bold' : ''}`}>
              {(data.errorScore * 100).toFixed(0)} / 100
            </span>
          </div>
          <div className="t-cell">
            <span className="t-label">DETECTION THRESHOLD</span>
            <span className="t-value text-muted">
              {(data.threshold * 100).toFixed(0)} / 100
            </span>
          </div>
          <div className="t-cell">
            <span className="t-label">OBSERVED RATE</span>
            <span className="t-value text-amber-300 font-mono">
              {data.deltaRate}
            </span>
          </div>
          <div className="t-cell">
            <span className="t-label">PERSISTENCE</span>
            <span className="t-value text-secondary">
              {data.durationMin} minutes
            </span>
          </div>
        </div>

        <p className="subpanel-explanation text-secondary">
          {data.detail}
        </p>
      </div>
    </div>
  );
};

// 3. Spatial Consensus Card
export const SpatialConsensusCard: React.FC<{ data: SpatialConsensus }> = ({ data }) => {
  const isOutlier = data.divergingNeighbors >= 2;

  return (
    <div className={`subpanel-card ${isOutlier ? 'border-critical' : 'border-subtle'}`}>
      <div className="subpanel-header">
        <div className="subpanel-title font-mono">
          <Radio size={14} className={isOutlier ? 'text-rose-400' : 'text-blue-400'} />
          <span>SPATIAL CONSENSUS & NEIGHBOR CROSS-CHECK</span>
        </div>
        <span className="status-tag font-mono">
          {data.divergingNeighbors}/{data.neighborCount} DIVERGING
        </span>
      </div>

      <div className="subpanel-body">
        <div className="consensus-summary-bar font-mono">
          <div className="c-stat">
            <span className="c-label">THIS NODE READING</span>
            <span className="c-val text-primary font-bold">{data.targetValue}</span>
          </div>
          <div className="c-stat">
            <span className="c-label">NEIGHBORHOOD AVG</span>
            <span className="c-val text-secondary">{data.neighborsAvg}</span>
          </div>
          <div className="c-stat">
            <span className="c-label">CONSENSUS SCORE</span>
            <span className={`c-val ${data.consensusScore < 0.4 ? 'text-critical' : 'text-emerald-400'}`}>
              {(data.consensusScore * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Neighboring Station Comparison Bar Chart */}
        <div className="neighbor-comparison-list">
          <div className="neighbor-comparison-header font-mono">
            <span>NEIGHBORING RTU</span>
            <span>DISTANCE</span>
            <span>VALUE</span>
            <span>VARIATION DELTA</span>
          </div>
          {data.neighbors.map((nb) => {
            const delta = Number((data.targetValue - nb.value).toFixed(1));
            const isHighDelta = Math.abs(delta) > 5;
            return (
              <div key={nb.id} className="neighbor-row font-mono">
                <div className="nb-info">
                  <HealthPill status={nb.status} size="sm" showLabel={false} />
                  <span className="nb-name">{nb.name}</span>
                </div>
                <span className="nb-dist text-muted">{nb.distanceKm} km</span>
                <span className="nb-val">{nb.value}</span>
                <span className={`nb-delta ${isHighDelta ? 'text-critical' : 'text-secondary'}`}>
                  {delta > 0 ? `+${delta}` : delta}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// 4. Feature Importance SHAP Chart
export const FeatureImportanceChart: React.FC<{ features: FeatureImportance[] }> = ({ features }) => {
  return (
    <div className="subpanel-card">
      <div className="subpanel-header">
        <div className="subpanel-title font-mono">
          <BarChart3 size={14} className="text-blue-400" />
          <span>ATTRIBUTION ANALYSIS (SHAP RESIDUAL CONTRIBUTIONS)</span>
        </div>
        <span className="status-tag font-mono">NORMALIZED SHAP</span>
      </div>

      <div className="subpanel-body">
        <div className="shap-feature-bars">
          {features.map((item, idx) => {
            const widthPct = Math.min(100, Math.max(0, Math.round((item.importance ?? 0) * 100)));
            const isRisk = item.direction === 'increases_risk';

            return (
              <div key={idx} className="shap-row font-mono">
                <div className="shap-info-line">
                  <span className="shap-name">{item.feature}</span>
                  <div className="shap-vals text-muted">
                    <span>Base: {item.baselineValue}</span>
                    <ArrowRight size={10} className="inline-icon" />
                    <span className="text-primary font-semibold">Observed: {item.observedValue}</span>
                  </div>
                </div>
                <div className="shap-track-container">
                  <div className="shap-track">
                    <div 
                      className={`shap-bar ${isRisk ? 'bar-risk' : 'bar-safe'}`}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                  <span className={`shap-score ${isRisk ? 'text-critical' : 'text-emerald-400'}`}>
                    +{widthPct}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// 5. Plain Language Summary
export const PlainLanguageSummary: React.FC<{ 
  summary: string; 
  remediation: string;
  confidence: number;
  onRemediate?: () => void;
}> = ({ summary, remediation, confidence, onRemediate }) => {
  return (
    <div className="plain-language-panel panel">
      <div className="plain-header">
        <MessageSquareQuote size={18} className="text-amber-400" />
        <div className="plain-title-box">
          <span className="plain-title font-mono">DIAGNOSTIC VERDICT (EXPLAINABLE SYNTHESIS)</span>
          <span className="plain-confidence font-mono">SYSTEM CONFIDENCE: {Math.round(confidence * 100)}%</span>
        </div>
      </div>
      <p className="plain-summary-text">
        "{summary}"
      </p>

      <div className="remediation-box">
        <div className="remediation-text-group">
          <div className="remediation-label font-mono">
            <Wrench size={13} className="text-blue-400" />
            <span>OPERATIONAL REMEDIATION RECOMMENDED</span>
          </div>
          <p className="remediation-instruction font-mono text-secondary">
            {remediation}
          </p>
        </div>
        {onRemediate && (
          <button onClick={onRemediate} className="remediate-action-btn font-mono">
            DISPATCH RECALIBRATION
          </button>
        )}
      </div>
    </div>
  );
};

// Main Stacked Component
export const ExplainabilityPanel: React.FC<ExplainabilityPanelProps> = ({
  explanation,
  onRemediate
}) => {
  return (
    <div className="explainability-panel-root">
      <div className="explainability-header-strip panel">
        <div className="exp-station-info">
          <span className="exp-station-name font-mono">{explanation.stationName}</span>
          <span className="exp-badge-group">
            <SeverityBadge severity={explanation.severity} confidence={explanation.confidence} />
            <span className="exp-fault-type font-mono">FAULT: {explanation.faultType.replace('_', ' ').toUpperCase()}</span>
            <span className="exp-param-badge font-mono">SENSOR: {explanation.parameter}</span>
          </span>
        </div>
        <span className="exp-timestamp font-mono text-muted">
          EVENT: {new Date(explanation.timestamp).toLocaleString()}
        </span>
      </div>

      {/* 5. Plain Language Summary First */}
      <PlainLanguageSummary 
        summary={explanation.plainLanguageSummary}
        remediation={explanation.suggestedRemediation}
        confidence={explanation.confidence}
        onRemediate={onRemediate}
      />

      {/* Stacked Sub-panels */}
      <div className="explainability-grid">
        <PhysicsConsistencyCard data={explanation.physicsConsistency} />
        <TemporalPatternCard data={explanation.temporalPattern} />
        <SpatialConsensusCard data={explanation.spatialConsensus} />
        <FeatureImportanceChart features={explanation.featureImportance} />
      </div>
    </div>
  );
};

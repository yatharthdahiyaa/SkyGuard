import React from 'react';
import { Severity } from '../../types/telemetry';
import { SeverityBadge } from '../telemetry/SeverityBadge';
import { Cpu, ShieldAlert, ArrowUpRight, Wrench } from '../icons';

interface AIInsightCardProps {
  headline?: string;
  anomalyScore: number;
  confidence: number;
  timestamp: string;
  expectedRange: string;
  observedValue: string;
  severity: Severity;
  onInvestigate?: () => void;
}

export const AIInsightCard: React.FC<AIInsightCardProps> = ({
  headline = 'AI detected abnormal vibration behavior',
  anomalyScore,
  confidence,
  timestamp,
  expectedRange,
  observedValue,
  severity,
  onInvestigate
}) => {
  return (
    <div className={`ai-insight-card panel font-mono border-${severity}`}>
      <div className="insight-top">
        <div className="insight-title-group">
          <Cpu size={16} className="text-purple-400" />
          <span className="insight-headline font-bold">{headline}</span>
        </div>
        <SeverityBadge severity={severity} confidence={confidence} />
      </div>

      <div className="insight-metrics-strip">
        <div className="insight-cell">
          <span className="cell-label text-muted">ANOMALY SCORE</span>
          <span className={`cell-val ${anomalyScore > 85 ? 'text-critical font-bold' : 'text-warning'}`}>
            {anomalyScore} / 100
          </span>
        </div>
        <div className="insight-cell">
          <span className="cell-label text-muted">MODEL CONFIDENCE</span>
          <span className="cell-val text-primary font-bold">
            {(confidence * 100).toFixed(0)}%
          </span>
        </div>
        <div className="insight-cell">
          <span className="cell-label text-muted">EXPECTED RANGE</span>
          <span className="cell-val text-secondary">{expectedRange}</span>
        </div>
        <div className="insight-cell">
          <span className="cell-label text-muted">OBSERVED VALUE</span>
          <span className="cell-val text-critical font-bold">{observedValue}</span>
        </div>
        <div className="insight-cell">
          <span className="cell-label text-muted">TIMESTAMP</span>
          <span className="cell-val text-muted">{timestamp}</span>
        </div>
      </div>

      {onInvestigate && (
        <div className="insight-footer">
          <button onClick={onInvestigate} className="btn-insight-investigate font-mono">
            <span>DEEP ROOT CAUSE EXPLAINABILITY</span>
            <ArrowUpRight size={12} />
          </button>
        </div>
      )}
    </div>
  );
};

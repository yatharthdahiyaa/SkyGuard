import React from 'react';
import { Severity } from '../../types/telemetry';
import { AlertOctagon, AlertTriangle, Info } from 'lucide-react';

interface SeverityBadgeProps {
  severity: Severity;
  confidence: number; // 0 to 1 e.g. 0.96
  showConfidence?: boolean;
}

export const SeverityBadge: React.FC<SeverityBadgeProps> = ({
  severity,
  confidence,
  showConfidence = true
}) => {
  const confPercent = Math.round(confidence * 100);

  const getIcon = () => {
    switch (severity) {
      case 'critical':
        return <AlertOctagon size={12} strokeWidth={2.5} />;
      case 'warning':
        return <AlertTriangle size={12} strokeWidth={2.5} />;
      case 'info':
      default:
        return <Info size={12} strokeWidth={2.5} />;
    }
  };

  return (
    <span className={`severity-badge severity-${severity} font-mono`}>
      {getIcon()}
      <span className="severity-label">{severity.toUpperCase()}</span>
      {showConfidence && (
        <span className="severity-confidence">{confPercent}% conf</span>
      )}
    </span>
  );
};

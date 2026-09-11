import React, { useEffect } from 'react';
import { Severity, FaultType } from '../../types/telemetry';
import { SeverityBadge } from '../telemetry/SeverityBadge';
import { AlertCircle, X, ArrowUpRight } from 'lucide-react';

export interface AnomalyToastProps {
  id: string;
  stationId: string;
  stationName: string;
  faultType: FaultType;
  severity: Severity;
  confidence: number;
  message?: string;
  onClick: () => void;
  onDismiss: () => void;
}

export const AnomalyToast: React.FC<AnomalyToastProps> = ({
  stationName,
  faultType,
  severity,
  confidence,
  message,
  onClick,
  onDismiss
}) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss();
    }, 9000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const borderColor = severity === 'critical' 
    ? 'var(--state-critical)' 
    : severity === 'warning' 
    ? 'var(--state-warning)' 
    : 'var(--state-info)';

  return (
    <div 
      className={`anomaly-toast-card severity-${severity}`}
      style={{ borderLeftColor: borderColor }}
    >
      <div className="toast-header-line">
        <SeverityBadge severity={severity} confidence={confidence} />
        <span className="toast-timestamp font-mono">JUST NOW</span>
        <button 
          onClick={(e) => { e.stopPropagation(); onDismiss(); }} 
          className="toast-close-btn"
          aria-label="Dismiss notification"
        >
          <X size={13} />
        </button>
      </div>

      <div className="toast-body-content" onClick={onClick}>
        <div className="toast-station-title font-mono">
          {stationName}
        </div>
        <p className="toast-fault-desc font-mono">
          {message || `Anomaly detected: ${faultType.replace('_', ' ').toUpperCase()} on supervisory bus.`}
        </p>

        <div className="toast-action-hint font-mono">
          <span>INVESTIGATE EXPLAINABILITY</span>
          <ArrowUpRight size={12} />
        </div>
      </div>
    </div>
  );
};

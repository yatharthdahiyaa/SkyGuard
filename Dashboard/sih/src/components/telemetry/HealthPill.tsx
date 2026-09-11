import React from 'react';
import { HealthStatus } from '../../types/telemetry';
import { CheckCircle2, AlertTriangle, XCircle, PowerOff } from 'lucide-react';

interface HealthPillProps {
  status: HealthStatus;
  size?: 'sm' | 'md';
  showLabel?: boolean;
}

export const HealthPill: React.FC<HealthPillProps> = ({
  status,
  size = 'md',
  showLabel = true
}) => {
  const getIcon = () => {
    const iconSize = size === 'sm' ? 11 : 13;
    switch (status) {
      case 'healthy':
        return <CheckCircle2 size={iconSize} />;
      case 'degraded':
        return <AlertTriangle size={iconSize} />;
      case 'faulty':
        return <XCircle size={iconSize} />;
      case 'offline':
      default:
        return <PowerOff size={iconSize} />;
    }
  };

  const labels: Record<HealthStatus, string> = {
    healthy: 'NOMINAL',
    degraded: 'DEGRADED',
    faulty: 'FAULTY',
    offline: 'OFFLINE'
  };

  return (
    <span className={`health-pill health-${status} health-pill-${size} font-mono`}>
      <span className={`health-dot status-dot ${status === 'faulty' ? 'critical' : status === 'degraded' ? 'warning' : status}`} />
      {getIcon()}
      {showLabel && <span className="health-label">{labels[status]}</span>}
    </span>
  );
};

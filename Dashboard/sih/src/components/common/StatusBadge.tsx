import React from 'react';

interface StatusBadgeProps {
  status: 'healthy' | 'warning' | 'critical' | 'offline' | 'degraded' | 'faulty' | 'info';
  label?: string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  size = 'md'
}) => {
  const normStatus = 
    status === 'faulty' ? 'critical' :
    status === 'degraded' ? 'warning' : status;

  const defaultLabels: Record<string, string> = {
    healthy: 'HEALTHY',
    warning: 'WARNING',
    critical: 'CRITICAL',
    offline: 'OFFLINE',
    info: 'INFO'
  };

  const displayLabel = label || defaultLabels[normStatus] || status.toUpperCase();

  return (
    <span className={`status-badge-root status-${normStatus} size-${size} font-mono`}>
      <span className={`status-dot ${normStatus}`} />
      <span className="status-badge-text">{displayLabel}</span>
    </span>
  );
};

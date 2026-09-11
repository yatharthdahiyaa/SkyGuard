import React from 'react';
import { TrendingUp, TrendingDown, Minus } from '../icons';

interface KPICardProps {
  title: string;
  value: string | number;
  unit?: string;
  changePct?: number; // e.g. +2.4 or -1.8
  changeLabel?: string; // e.g. "vs previous period"
  icon?: React.ReactNode;
  variant?: 'nominal' | 'healthy' | 'warning' | 'critical' | 'info' | 'neutral';
  badge?: string;
}

export const KPICard: React.FC<KPICardProps> = ({
  title,
  value,
  unit,
  changePct,
  changeLabel = 'vs last period',
  icon,
  variant = 'neutral',
  badge
}) => {
  const isPositive = changePct !== undefined && changePct > 0;
  const isNegative = changePct !== undefined && changePct < 0;

  return (
    <div className={`kpi-card panel font-mono kpi-${variant}`}>
      <div className="kpi-header">
        <span className="kpi-label">{title}</span>
        {icon && <div className="kpi-icon-slot">{icon}</div>}
      </div>

      <div className="kpi-value-row">
        <div className="kpi-val-group">
          <span className="kpi-main-value">{value}</span>
          {unit && <span className="kpi-unit"> {unit}</span>}
        </div>
        {badge && (
          <span className={`kpi-badge badge-${variant}`}>
            {badge}
          </span>
        )}
      </div>

      {changePct !== undefined && (
        <div className="kpi-trend-row">
          <span className={`kpi-trend-pill ${isPositive ? 'trend-up' : isNegative ? 'trend-down' : 'trend-steady'}`}>
            {isPositive ? <TrendingUp size={11} /> : isNegative ? <TrendingDown size={11} /> : <Minus size={11} />}
            <span>{isPositive ? `+${changePct}%` : `${changePct}%`}</span>
          </span>
          <span className="kpi-trend-label text-muted">{changeLabel}</span>
        </div>
      )}
    </div>
  );
};

import React from 'react';
import { ShieldCheck } from '../icons';

interface HealthRingProps {
  score: number; // e.g. 88
  healthyPct: number; // e.g. 71.4
  warningPct: number; // e.g. 14.3
  criticalPct: number; // e.g. 14.3
  offlinePct: number; // e.g. 0.0
  totalStations?: number;
}

export const HealthRing: React.FC<HealthRingProps> = ({
  score,
  healthyPct,
  warningPct,
  criticalPct,
  offlinePct,
  totalStations = 7
}) => {
  // SVG donut chart calculation
  const radius = 64;
  const strokeWidth = 14;
  const circumference = 2 * Math.PI * radius;

  // Segment stroke offsets
  const hOffset = circumference * (1 - healthyPct / 100);
  const wLength = (warningPct / 100) * circumference;
  const cLength = (criticalPct / 100) * circumference;
  const oLength = (offlinePct / 100) * circumference;

  const wOffset = -(healthyPct / 100) * circumference;
  const cOffset = -((healthyPct + warningPct) / 100) * circumference;
  const oOffset = -((healthyPct + warningPct + criticalPct) / 100) * circumference;

  return (
    <div className="health-ring-panel panel font-mono">
      <div className="health-ring-header">
        <div className="health-ring-title-group">
          <ShieldCheck size={16} className="text-emerald-400" />
          <span className="health-ring-title">NETWORK HEALTH & AVAILABILITY INDEX</span>
        </div>
        <span className="badge-healthy font-mono">GLOBAL MESH STATUS: NOMINAL</span>
      </div>

      <div className="health-ring-body">
        {/* SVG Donut Visual */}
        <div className="health-donut-wrapper">
          <svg className="health-donut-svg" width="170" height="170" viewBox="0 0 170 170">
            {/* Background ring */}
            <circle
              cx="85"
              cy="85"
              r={radius}
              fill="transparent"
              stroke="var(--bg-surface-raised)"
              strokeWidth={strokeWidth}
            />

            {/* Healthy Segment (Green) */}
            <circle
              cx="85"
              cy="85"
              r={radius}
              fill="transparent"
              stroke="var(--state-healthy)"
              strokeWidth={strokeWidth}
              strokeDasharray={`${(healthyPct / 100) * circumference} ${circumference}`}
              strokeDashoffset="0"
              transform="rotate(-90 85 85)"
              strokeLinecap="round"
            />

            {/* Warning Segment (Amber) */}
            {warningPct > 0 && (
              <circle
                cx="85"
                cy="85"
                r={radius}
                fill="transparent"
                stroke="var(--state-warning)"
                strokeWidth={strokeWidth}
                strokeDasharray={`${wLength} ${circumference}`}
                strokeDashoffset={wOffset}
                transform="rotate(-90 85 85)"
              />
            )}

            {/* Critical Segment (Red) */}
            {criticalPct > 0 && (
              <circle
                cx="85"
                cy="85"
                r={radius}
                fill="transparent"
                stroke="var(--state-critical)"
                strokeWidth={strokeWidth}
                strokeDasharray={`${cLength} ${circumference}`}
                strokeDashoffset={cOffset}
                transform="rotate(-90 85 85)"
              />
            )}

            {/* Offline Segment (Gray) */}
            {offlinePct > 0 && (
              <circle
                cx="85"
                cy="85"
                r={radius}
                fill="transparent"
                stroke="var(--state-offline)"
                strokeWidth={strokeWidth}
                strokeDasharray={`${oLength} ${circumference}`}
                strokeDashoffset={oOffset}
                transform="rotate(-90 85 85)"
              />
            )}
          </svg>

          {/* Center Score Display */}
          <div className="donut-center-label">
            <span className="donut-score-num">{score}</span>
            <span className="donut-score-lbl">HEALTH SCORE</span>
          </div>
        </div>

        {/* Legend Breakdown Chips */}
        <div className="health-ring-breakdown">
          <div className="health-stat-chip chip-healthy">
            <div className="chip-indicator" />
            <div className="chip-info">
              <span className="chip-label">HEALTHY</span>
              <span className="chip-pct">{healthyPct.toFixed(1)}%</span>
            </div>
          </div>

          <div className="health-stat-chip chip-warning">
            <div className="chip-indicator" />
            <div className="chip-info">
              <span className="chip-label">WARNING</span>
              <span className="chip-pct">{warningPct.toFixed(1)}%</span>
            </div>
          </div>

          <div className="health-stat-chip chip-critical">
            <div className="chip-indicator" />
            <div className="chip-info">
              <span className="chip-label">CRITICAL</span>
              <span className="chip-pct">{criticalPct.toFixed(1)}%</span>
            </div>
          </div>

          <div className="health-stat-chip chip-offline">
            <div className="chip-indicator" />
            <div className="chip-info">
              <span className="chip-label">OFFLINE</span>
              <span className="chip-pct">{offlinePct.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

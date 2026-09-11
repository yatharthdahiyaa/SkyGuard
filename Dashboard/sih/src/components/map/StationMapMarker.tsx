import React from 'react';
import { HealthStatus } from '../../types/telemetry';

interface StationMapMarkerProps {
  x: number;
  y: number;
  code: string;
  status: HealthStatus;
  isActive?: boolean;
  onClick: () => void;
}

export const StationMapMarker: React.FC<StationMapMarkerProps> = ({
  x,
  y,
  code,
  status,
  isActive = false,
  onClick
}) => {
  const color = 
    status === 'healthy' ? 'var(--state-healthy)' :
    status === 'degraded' ? 'var(--state-warning)' :
    status === 'faulty' ? 'var(--state-critical)' : 'var(--state-offline)';

  return (
    <g className="station-map-marker" onClick={onClick} style={{ cursor: 'pointer' }}>
      {/* Outer pulse when active or critical */}
      {(isActive || status === 'faulty') && (
        <circle cx={x} cy={y} r="16" fill="none" stroke={color} strokeWidth="1.5" opacity="0.6" className="pulse-circle" />
      )}

      {/* Main node pin */}
      <circle cx={x} cy={y} r={isActive ? 9 : 7} fill="var(--bg-surface)" stroke={color} strokeWidth="2.5" />
      <circle cx={x} cy={y} r="3" fill={color} />

      {/* Code label pill */}
      <rect
        x={x + 10}
        y={y - 10}
        width={code.length * 6 + 14}
        height="18"
        rx="3"
        fill="var(--bg-surface-raised)"
        stroke={isActive ? color : 'var(--border-subtle)'}
        strokeWidth="1"
      />
      <text
        x={x + 17}
        y={y + 3}
        fill="var(--text-primary)"
        fontSize="9"
        fontFamily="var(--font-mono)"
        fontWeight="600"
      >
        {code}
      </text>
    </g>
  );
};

import React from 'react';
import { Station } from '../../types/telemetry';
import { HealthPill } from '../telemetry/HealthPill';
import { HealthScore } from '../common/HealthScore';
import { Link } from '../../context/RouterContext';
import { Radio, ChevronRight } from '../icons';

interface StationCardProps {
  station: Station;
  isSelected?: boolean;
  onSelect?: () => void;
}

export const StationCard: React.FC<StationCardProps> = ({
  station,
  isSelected = false,
  onSelect
}) => {
  return (
    <div 
      className={`station-quick-card panel font-mono ${isSelected ? 'selected' : ''}`}
      onClick={onSelect}
    >
      <div className="st-card-header">
        <div className="st-code-box">
          <Radio size={13} className="text-blue-400" />
          <span className="st-code font-bold">{station.code}</span>
        </div>
        <HealthPill status={station.status} size="sm" />
      </div>

      <div className="st-name font-bold text-primary truncate">{station.name}</div>
      <div className="st-sector text-muted">{station.sector} · {station.elevationM}m</div>

      <div className="st-card-metrics-row">
        <HealthScore score={station.healthScore} size="sm" />
        <div className="st-uptime-stat">
          <span className="stat-label text-muted">UPTIME:</span>
          <span className="stat-value">{station.uptimePct}%</span>
        </div>
      </div>

      <div className="st-readings-row">
        <div className="st-reading-item">
          <span className="r-label">T:</span>
          <span className="r-val">{station.readings.temperature}°C</span>
        </div>
        <div className="st-reading-item">
          <span className="r-label">RH:</span>
          <span className={`r-val ${station.readings.humidity > 95 ? 'text-critical font-bold' : ''}`}>
            {station.readings.humidity}%
          </span>
        </div>
        <div className="st-reading-item">
          <span className="r-label">P:</span>
          <span className="r-val">{station.readings.pressure}</span>
        </div>
        <div className="st-reading-item">
          <span className="r-label">VIB:</span>
          <span className="r-val">{station.readings.vibrationRms}</span>
        </div>
      </div>

      <div className="st-card-footer">
        <span className="st-seen text-muted">{station.lastSeen}</span>
        <Link to={`/stations/${station.id}`} className="st-inspect-link" onClick={(e) => e.stopPropagation()}>
          <span>INVESTIGATE</span>
          <ChevronRight size={11} />
        </Link>
      </div>
    </div>
  );
};

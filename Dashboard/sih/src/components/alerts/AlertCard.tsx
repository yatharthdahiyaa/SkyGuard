import React from 'react';
import { AlertEvent } from '../../types/telemetry';
import { SeverityBadge } from '../telemetry/SeverityBadge';
import { Link } from '../../context/RouterContext';
import { ChevronRight, Clock, User } from '../icons';

interface AlertCardProps {
  alert: AlertEvent;
  onAcknowledge?: (id: string) => void;
}

export const AlertCard: React.FC<AlertCardProps> = ({ alert, onAcknowledge }) => {
  return (
    <div className={`alert-card-root panel font-mono border-${alert.severity}`}>
      <div className="alert-card-top">
        <div className="alert-card-id-row">
          <SeverityBadge severity={alert.severity} confidence={alert.confidence} />
          <span className="alert-id-tag font-bold">{alert.id.toUpperCase()}</span>
        </div>
        <span className={`alert-triage-pill triage-${alert.status}`}>
          {alert.status.toUpperCase()}
        </span>
      </div>

      <div className="alert-card-station font-bold">{alert.stationName}</div>
      <div className="alert-card-fault text-secondary">
        FAULT: {alert.faultType.replace('_', ' ').toUpperCase()} ({alert.parameter} BUS)
      </div>

      <p className="alert-card-summary text-secondary truncate">
        {alert.explanation.plainLanguageSummary}
      </p>

      <div className="alert-card-meta text-muted">
        <div className="meta-item">
          <Clock size={11} />
          <span>{alert.durationMin}m active</span>
        </div>
        <div className="meta-item">
          <User size={11} />
          <span>{alert.assignedOperator}</span>
        </div>
      </div>

      <div className="alert-card-footer">
        {alert.status === 'new' && onAcknowledge && (
          <button 
            className="btn-card-ack"
            onClick={(e) => { e.stopPropagation(); onAcknowledge(alert.id); }}
          >
            ACKNOWLEDGE
          </button>
        )}
        <Link to={`/alerts/${alert.id}`} className="btn-card-inspect">
          <span>INVESTIGATE AI</span>
          <ChevronRight size={11} />
        </Link>
      </div>
    </div>
  );
};

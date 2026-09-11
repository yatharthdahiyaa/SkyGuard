import React, { useState } from 'react';
import { AlertEvent, AlertTriageStatus } from '../../types/telemetry';
import { SeverityBadge } from '../telemetry/SeverityBadge';
import { useRouter } from '../../context/RouterContext';
import { 
  ChevronRight, 
  Check, 
  CheckCircle2, 
  Clock, 
  User, 
  AlertTriangle, 
  MessageSquareQuote,
  Flame
} from '../icons';

interface AlertTableProps {
  alerts: AlertEvent[];
  onChangeStatus: (id: string, newStatus: AlertTriageStatus) => void;
  onAssignOperator?: (id: string, operator: string) => void;
  onAddNote?: (id: string) => void;
}

export const AlertTable: React.FC<AlertTableProps> = ({
  alerts,
  onChangeStatus,
  onAssignOperator,
  onAddNote
}) => {
  const { navigate } = useRouter();
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 6;

  const sortedAlerts = [...alerts].sort((a, b) => {
    return sortAsc 
      ? a.anomalyScore - b.anomalyScore 
      : b.anomalyScore - a.anomalyScore;
  });

  const totalPages = Math.ceil(sortedAlerts.length / pageSize) || 1;
  const paginated = sortedAlerts.slice((page - 1) * pageSize, page * pageSize);

  const operators = ['Duty Meteorologist (RMC)', 'Field RTU Engineer', 'Dr. A. Sharma (Lead)', 'AWS Telemetry Officer'];

  return (
    <div className="panel alert-table-card font-mono">
      <div className="industrial-table-container">
        <table className="industrial-table">
          <thead>
            <tr>
              <th>ALERT ID</th>
              <th>SEVERITY</th>
              <th>STATION</th>
              <th>FAULT TYPE</th>
              <th>AI CONFIDENCE</th>
              <th onClick={() => setSortAsc(!sortAsc)} style={{ cursor: 'pointer' }}>
                SCORE {sortAsc ? '▲' : '▼'}
              </th>
              <th>DETECTED</th>
              <th>DURATION</th>
              <th>STATUS (TRIAGE)</th>
              <th>OPERATOR</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={11} className="empty-table-state">
                  NO ANOMALY ALERTS CURRENTLY MATCH CRITERIA.
                </td>
              </tr>
            ) : (
              paginated.map((alert) => (
                <tr
                  key={alert.id}
                  className="alert-row-interactive"
                  onClick={() => navigate(`/alerts/${alert.id}`)}
                >
                  <td>
                    <span className="font-bold text-primary">{alert.id.toUpperCase()}</span>
                  </td>
                  <td>
                    <SeverityBadge severity={alert.severity} confidence={alert.confidence} showConfidence={false} />
                  </td>
                  <td>
                    <div className="td-station-block">
                      <span className="font-bold text-primary">{alert.stationName}</span>
                      <span className="text-muted text-xs">RTU: {alert.stationId}</span>
                    </div>
                  </td>
                  <td>
                    <span className="fault-type-pill">
                      {alert.faultType.replace('_', ' ').toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <span className="text-primary font-bold">{(alert.confidence * 100).toFixed(0)}%</span>
                  </td>
                  <td>
                    <span className={`score-badge ${alert.anomalyScore > 90 ? 'text-critical font-bold' : alert.anomalyScore > 75 ? 'text-warning font-bold' : 'text-secondary'}`}>
                      {alert.anomalyScore} / 100
                    </span>
                  </td>
                  <td>
                    <span className="text-secondary">{new Date(alert.triggeredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </td>
                  <td>
                    <span className="text-muted">{alert.durationMin} min</span>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {/* Triage Status progression selector */}
                    <select
                      value={alert.status}
                      onChange={(e) => onChangeStatus(alert.id, e.target.value as AlertTriageStatus)}
                      className={`triage-select triage-${alert.status} font-mono`}
                    >
                      <option value="new">NEW</option>
                      <option value="investigating">INVESTIGATING</option>
                      <option value="acknowledged">ACKNOWLEDGED</option>
                      <option value="resolved">RESOLVED</option>
                    </select>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <select
                      value={alert.assignedOperator}
                      onChange={(e) => onAssignOperator && onAssignOperator(alert.id, e.target.value)}
                      className="operator-select font-mono"
                    >
                      {operators.map((op) => (
                        <option key={op} value={op}>{op}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div className="row-actions-group" onClick={(e) => e.stopPropagation()}>
                      {onAddNote && (
                        <button 
                          className="btn-table-action" 
                          title="Add Note"
                          onClick={() => onAddNote(alert.id)}
                        >
                          <MessageSquareQuote size={11} />
                        </button>
                      )}
                      <button
                        className="btn-table-action btn-action-view"
                        title="Investigate AI Explainability"
                        onClick={() => navigate(`/alerts/${alert.id}`)}
                      >
                        <span>EXPLAIN</span>
                        <ChevronRight size={11} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="table-pagination-footer font-mono">
        <span className="pagination-info text-muted">
          PAGE {page} OF {totalPages} ({alerts.length} TOTAL ALERTS)
        </span>
        <div className="pagination-buttons">
          <button
            className="btn-page"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(p - 1, 1))}
          >
            PREV
          </button>
          {Array.from({ length: totalPages }).map((_, i) => (
            <button
              key={i}
              className={`btn-page-num ${page === i + 1 ? 'active' : ''}`}
              onClick={() => setPage(i + 1)}
            >
              {i + 1}
            </button>
          ))}
          <button
            className="btn-page"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
          >
            NEXT
          </button>
        </div>
      </div>
    </div>
  );
};

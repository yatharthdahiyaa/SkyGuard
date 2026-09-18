import React, { useState, useMemo } from 'react';
import { AlertEvent, AlertTriageStatus } from '../types/telemetry';
import { AlertTable } from '../components/alerts/AlertTable';
import { Modal } from '../components/common/Modal';
import { 
  AlertOctagon, 
  CheckCircle2, 
  Search, 
  Filter, 
  Clock, 
  User, 
  Download, 
  Plus 
} from '../components/icons';

interface AlertsViewProps {
  alerts: AlertEvent[];
  onChangeAlertStatus: (id: string, newStatus: AlertTriageStatus) => void;
  onAssignOperator?: (id: string, operator: string) => void;
  onAcknowledgeAll?: () => void;
}

export const AlertsView: React.FC<AlertsViewProps> = ({
  alerts,
  onChangeAlertStatus,
  onAssignOperator,
  onAcknowledgeAll
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [faultFilter, setFaultFilter] = useState<string>('all');
  const [operatorFilter, setOperatorFilter] = useState<string>('all');

  const [activeNoteAlertId, setActiveNoteAlertId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');

  const activeCount = alerts.filter(a => a.status === 'active' || a.status === 'new' || a.status === 'investigating').length;
  const criticalCount = alerts.filter(a => a.severity === 'critical' && a.status !== 'resolved').length;
  const ackCount = alerts.filter(a => a.status === 'acknowledged').length;
  const resolvedCount = alerts.filter(a => a.status === 'resolved').length;

  const handleExportAlertsCSV = () => {
    const headers = ['Alert ID', 'Station ID', 'Station Name', 'Fault Type', 'Severity', 'Confidence', 'Anomaly Score', 'Parameter', 'Detected At', 'Status', 'Operator'];
    const rows = (filteredAlerts.length > 0 ? filteredAlerts : alerts).map(a => [
      `"${a.id}"`,
      `"${a.stationId}"`,
      `"${a.stationName.replace(/"/g, '""')}"`,
      `"${a.faultType}"`,
      `"${a.severity.toUpperCase()}"`,
      a.confidence,
      a.anomalyScore,
      `"${a.parameter}"`,
      `"${a.triggeredAt}"`,
      `"${a.status.toUpperCase()}"`,
      `"${a.assignedOperator}"`
    ]);

    const blob = new Blob([[headers.join(','), ...rows.map(r => r.join(','))].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `imd_skyguard_alerts_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const filteredAlerts = useMemo(() => {
    return alerts.filter(a => {
      const matchesSearch = 
        a.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.stationName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.faultType.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesSev = severityFilter === 'all' || a.severity === severityFilter;
      const matchesStat = statusFilter === 'all' || a.status === statusFilter;
      const matchesFault = faultFilter === 'all' || a.faultType === faultFilter;
      const matchesOp = operatorFilter === 'all' || a.assignedOperator === operatorFilter;

      return matchesSearch && matchesSev && matchesStat && matchesFault && matchesOp;
    });
  }, [alerts, searchQuery, severityFilter, statusFilter, faultFilter, operatorFilter]);

  const faultTypes = Array.from(new Set(alerts.map(a => a.faultType)));
  const operators = Array.from(new Set(alerts.map(a => a.assignedOperator)));

  const handleSaveNote = () => {
    if (activeNoteAlertId) {
      alert(`Investigation note appended to ${activeNoteAlertId.toUpperCase()}: "${noteText}"`);
      setActiveNoteAlertId(null);
      setNoteText('');
    }
  };

  return (
    <div className="view-container alerts-view-container font-mono">
      {/* Header */}
      <div className="view-header-strip">
        <div className="view-title-group">
          <h1 className="view-title">ALERTS</h1>
          <p className="view-subtitle text-secondary">
            CENTRAL INCIDENT MANAGEMENT & MULTI-PARAMETRIC AI FAULT QUEUE
          </p>
        </div>

        <div className="alerts-top-counters">
          <div className="alert-count-pill pill-active">
            <span className="count-num font-bold">{activeCount}</span>
            <span className="count-lbl">ACTIVE</span>
          </div>
          <div className="alert-count-pill pill-critical">
            <span className="count-num font-bold">{criticalCount}</span>
            <span className="count-lbl">CRITICAL</span>
          </div>
          <div className="alert-count-pill pill-ack">
            <span className="count-num font-bold">{ackCount}</span>
            <span className="count-lbl">ACKNOWLEDGED</span>
          </div>
          <div className="alert-count-pill pill-resolved">
            <span className="count-num font-bold">{resolvedCount}</span>
            <span className="count-lbl">RESOLVED</span>
          </div>
          <button 
            className="btn-export-csv"
            onClick={handleExportAlertsCSV}
            title="Download CSV log of operational alerts"
            style={{ marginLeft: '8px' }}
          >
            <Download size={13} />
            <span>EXPORT CSV</span>
          </button>
        </div>
      </div>

      {/* Multi-filter Bar */}
      <div className="panel alerts-filter-panel font-mono">
        <div className="alerts-filter-row">
          <div className="search-input-wrapper">
            <Search size={13} className="text-secondary" />
            <input
              type="text"
              placeholder="Search alert ID, station, or fault..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="filter-search-input"
            />
          </div>

          <div className="stations-selects-cluster">
            <div className="filter-select-item">
              <span className="filter-label">SEVERITY:</span>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="filter-select font-mono"
              >
                <option value="all">ALL SEVERITIES</option>
                <option value="critical">CRITICAL</option>
                <option value="warning">WARNING</option>
                <option value="info">INFORMATIONAL</option>
              </select>
            </div>

            <div className="filter-select-item">
              <span className="filter-label">TRIAGE STATUS:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="filter-select font-mono"
              >
                <option value="all">ALL STAGES</option>
                <option value="active">ACTIVE</option>
                <option value="new">NEW</option>
                <option value="investigating">INVESTIGATING</option>
                <option value="acknowledged">ACKNOWLEDGED</option>
                <option value="resolved">RESOLVED</option>
              </select>
            </div>

            <div className="filter-select-item">
              <span className="filter-label">FAULT TYPE:</span>
              <select
                value={faultFilter}
                onChange={(e) => setFaultFilter(e.target.value)}
                className="filter-select font-mono"
              >
                <option value="all">ALL FAULTS</option>
                {faultTypes.map(ft => (
                  <option key={ft} value={ft}>{ft.replace('_', ' ').toUpperCase()}</option>
                ))}
              </select>
            </div>

            <div className="filter-select-item">
              <span className="filter-label">OPERATOR:</span>
              <select
                value={operatorFilter}
                onChange={(e) => setOperatorFilter(e.target.value)}
                className="filter-select font-mono"
              >
                <option value="all">ALL OPERATORS</option>
                {operators.map(op => (
                  <option key={op} value={op}>{op}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Alert Triage Table */}
      <AlertTable
        alerts={filteredAlerts}
        onChangeStatus={onChangeAlertStatus}
        onAssignOperator={onAssignOperator}
        onAddNote={(id) => {
          setActiveNoteAlertId(id);
          setNoteText('');
        }}
      />

      {/* Add Investigation Note Modal */}
      {activeNoteAlertId && (
        <Modal
          isOpen={true}
          onClose={() => setActiveNoteAlertId(null)}
          title={`ADD OPERATOR INVESTIGATION NOTE // ${activeNoteAlertId.toUpperCase()}`}
          footer={
            <div className="modal-actions-right">
              <button className="btn-modal-cancel" onClick={() => setActiveNoteAlertId(null)}>
                CANCEL
              </button>
              <button className="btn-modal-confirm btn-primary-confirm" onClick={handleSaveNote}>
                APPEND TO AUDIT LOG
              </button>
            </div>
          }
        >
          <div className="form-group font-mono">
            <label className="form-label">OPERATOR NOTES / ROOT CAUSE OBSERVATIONS</label>
            <textarea
              rows={4}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Record operational observations, hardware serials verified, or dispatch tickets..."
              className="form-input"
            />
          </div>
        </Modal>
      )}
    </div>
  );
};

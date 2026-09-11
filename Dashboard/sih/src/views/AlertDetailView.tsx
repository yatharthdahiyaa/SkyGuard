import React, { useState } from 'react';
import { AlertEvent, AlertTriageStatus } from '../types/telemetry';
import { SeverityBadge } from '../components/telemetry/SeverityBadge';
import { ExplainabilityChart } from '../components/ai/ExplainabilityChart';
import { Modal } from '../components/common/Modal';
import { useRouter } from '../context/RouterContext';
import { 
  AlertOctagon, 
  CheckCircle2, 
  Clock, 
  User, 
  Wrench, 
  ChevronRight, 
  ArrowRight, 
  Check, 
  Flame, 
  MessageSquareQuote,
  Cpu,
  ShieldAlert,
  Sliders,
  ExternalLink
} from '../components/icons';

interface AlertDetailViewProps {
  alertId: string;
  alerts: AlertEvent[];
  onChangeStatus: (id: string, newStatus: AlertTriageStatus) => void;
  onAssignOperator?: (id: string, operator: string) => void;
}

export const AlertDetailView: React.FC<AlertDetailViewProps> = ({
  alertId,
  alerts,
  onChangeStatus,
  onAssignOperator
}) => {
  const { navigate } = useRouter();
  const alertItem = alerts.find(a => a.id === alertId) || alerts[0];
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedOp, setSelectedOp] = useState(alertItem.assignedOperator);

  const operators = ['Duty Meteorologist (RMC)', 'Field RTU Engineer', 'Dr. A. Sharma (Lead)', 'AWS Telemetry Officer'];

  return (
    <div className="view-container alert-detail-view-container font-mono">
      {/* 1. Header */}
      <div className="alert-detail-hero panel">
        <div className="hero-top-nav">
          <button onClick={() => navigate('/alerts')} className="btn-back-breadcrumb font-mono">
            ← BACK TO ALERTS FEED
          </button>
          <div className="hero-tags-group">
            <span className="hero-id-tag">ALERT ID: {alertItem.id.toUpperCase()}</span>
            <span className="hero-firmware-tag">MODEL: {alertItem.explanation.modelVersion}</span>
          </div>
        </div>

        <div className="hero-main-content">
          <div className="hero-identity-cluster">
            <div className="hero-icon-box alert-icon-large">
              <AlertOctagon size={24} className="text-critical" />
            </div>
            <div>
              <div className="hero-code-row">
                <h1 className="hero-station-code">{alertItem.id.toUpperCase()}</h1>
                <SeverityBadge severity={alertItem.severity} confidence={alertItem.confidence} />
                <span className={`alert-triage-pill triage-${alertItem.status}`}>
                  {alertItem.status.toUpperCase()}
                </span>
              </div>
              <p className="hero-station-name text-primary">
                STATION: {alertItem.stationName} (NODE {alertItem.stationId.toUpperCase()})
              </p>
              <div className="hero-meta-row text-muted">
                <span>DETECTED: {new Date(alertItem.triggeredAt).toLocaleString()}</span>
                <span>·</span>
                <span>DURATION: {alertItem.durationMin} minutes</span>
                <span>·</span>
                <span>ASSIGNED OPERATOR: {alertItem.assignedOperator}</span>
              </div>
            </div>
          </div>

          {/* Operator Action Buttons */}
          <div className="hero-actions-cluster">
            {alertItem.status !== 'acknowledged' && alertItem.status !== 'resolved' && (
              <button 
                className="btn-hero-action btn-hero-ack"
                onClick={() => onChangeStatus(alertItem.id, 'acknowledged')}
              >
                <Check size={13} />
                <span>ACKNOWLEDGE</span>
              </button>
            )}
            <button 
              className="btn-hero-action"
              onClick={() => setIsAssignModalOpen(true)}
            >
              <User size={13} />
              <span>ASSIGN</span>
            </button>
            <button 
              className="btn-hero-action"
              onClick={() => {
                alert(`Incident ${alertItem.id.toUpperCase()} escalated to Senior Telemetry Command.`);
              }}
            >
              <ShieldAlert size={13} className="text-warning" />
              <span>ESCALATE</span>
            </button>
            {alertItem.status !== 'resolved' && (
              <button 
                className="btn-hero-action btn-hero-resolve"
                onClick={() => onChangeStatus(alertItem.id, 'resolved')}
              >
                <CheckCircle2 size={13} />
                <span>RESOLVE</span>
              </button>
            )}
            <button 
              className="btn-hero-action"
              onClick={() => setIsNoteModalOpen(true)}
            >
              <MessageSquareQuote size={13} />
              <span>ADD NOTE</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Large AI Diagnosis Panel */}
      <div className="ai-diagnosis-hero-card panel font-mono">
        <div className="diagnosis-top-line">
          <div className="diagnosis-badge-group">
            <Cpu size={16} className="text-purple-400" />
            <span className="diagnosis-model-tag">{alertItem.explanation.modelVersion} INFERENCE</span>
          </div>
          <span className="risk-level-tag risk-critical">
            RISK LEVEL: {alertItem.explanation.riskLevel}
          </span>
        </div>

        <h2 className="diagnosis-verdict-title">
          "{alertItem.explanation.plainLanguageSummary}"
        </h2>

        <div className="diagnosis-metrics-grid">
          <div className="d-cell">
            <span className="d-lbl text-muted">PREDICTED FAULT</span>
            <span className="d-val text-primary font-bold">
              {alertItem.faultType.replace('_', ' ').toUpperCase()}
            </span>
          </div>
          <div className="d-cell">
            <span className="d-lbl text-muted">CONFIDENCE</span>
            <span className="d-val text-primary font-bold">
              {(alertItem.confidence * 100).toFixed(0)}%
            </span>
          </div>
          <div className="d-cell">
            <span className="d-lbl text-muted">ANOMALY SCORE</span>
            <span className="d-val text-critical font-bold">
              {alertItem.anomalyScore} / 100
            </span>
          </div>
          <div className="d-cell">
            <span className="d-lbl text-muted">SENSING BUS</span>
            <span className="d-val text-secondary font-bold">
              {alertItem.parameter} TRANSDUCER
            </span>
          </div>
          <div className="d-cell">
            <span className="d-lbl text-muted">STATUS</span>
            <span className="d-val text-emerald-400 font-bold">
              {alertItem.status.toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      {/* 3, 4, 5, 6. Why Was This Triggered? Expected vs Observed, Evidence Timeline & Recommendations */}
      <ExplainabilityChart
        features={alertItem.explanation.featureImportance}
        evidenceSteps={alertItem.explanation.evidenceTimeline}
        recommendedActions={alertItem.explanation.recommendedActions}
        baselineVsObserved={alertItem.explanation.baselineVsObserved}
      />

      {/* Assign Operator Modal */}
      {isAssignModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsAssignModalOpen(false)}
          title={`REASSIGN INCIDENT // ${alertItem.id.toUpperCase()}`}
          footer={
            <div className="modal-actions-right">
              <button className="btn-modal-cancel" onClick={() => setIsAssignModalOpen(false)}>
                CANCEL
              </button>
              <button 
                className="btn-modal-confirm btn-primary-confirm"
                onClick={() => {
                  if (onAssignOperator) onAssignOperator(alertItem.id, selectedOp);
                  setIsAssignModalOpen(false);
                }}
              >
                REASSIGN OPERATOR
              </button>
            </div>
          }
        >
          <div className="form-group font-mono">
            <label className="form-label">ASSIGN TO OPERATOR</label>
            <select 
              value={selectedOp} 
              onChange={(e) => setSelectedOp(e.target.value)}
              className="form-input"
            >
              {operators.map(op => (
                <option key={op} value={op}>{op}</option>
              ))}
            </select>
          </div>
        </Modal>
      )}

      {/* Add Note Modal */}
      {isNoteModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsNoteModalOpen(false)}
          title={`INVESTIGATION NOTE // ${alertItem.id.toUpperCase()}`}
          footer={
            <div className="modal-actions-right">
              <button className="btn-modal-cancel" onClick={() => setIsNoteModalOpen(false)}>
                CANCEL
              </button>
              <button 
                className="btn-modal-confirm btn-primary-confirm"
                onClick={() => {
                  alert(`Note saved to incident audit trail: "${noteText}"`);
                  setIsNoteModalOpen(false);
                  setNoteText('');
                }}
              >
                SAVE NOTE
              </button>
            </div>
          }
        >
          <div className="form-group font-mono">
            <label className="form-label">OPERATOR AUDIT OBSERVATION</label>
            <textarea
              rows={4}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Record diagnostic findings, physical sensor status, or resolution steps..."
              className="form-input"
            />
          </div>
        </Modal>
      )}
    </div>
  );
};

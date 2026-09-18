import React, { useState } from 'react';
import { AlertEvent, AlertTriageStatus } from '../types/telemetry';
import { SeverityBadge } from '../components/telemetry/SeverityBadge';
import { 
  PhysicsConsistencyCard, 
  TemporalPatternCard, 
  SpatialConsensusCard, 
  FeatureImportanceChart 
} from '../components/telemetry/ExplainabilityPanel';
import { ExplainabilityChart } from '../components/ai/ExplainabilityChart';
import { Modal } from '../components/common/Modal';
import { useRouter } from '../context/RouterContext';
import { 
  AlertOctagon, 
  CheckCircle2, 
  Clock, 
  User, 
  Wrench, 
  ArrowRight, 
  Check, 
  Cpu, 
  ShieldAlert, 
  MessageSquareQuote,
  Activity,
  Radio,
  Atom
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
  
  // Safe lookup matching case-insensitively, or fallback to first alert if exists
  const alertItem = alerts.find(a => a.id.toLowerCase() === alertId.toLowerCase()) || alerts[0];
  const operators = ['Duty Meteorologist (RMC)', 'Field RTU Engineer', 'Dr. A. Sharma (Lead)', 'AWS Telemetry Officer'];
  
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedOp, setSelectedOp] = useState(alertItem?.assignedOperator || operators[0]);

  // Loading or synchronization fallback if alerts list is empty
  if (!alertItem) {
    return (
      <div className="view-container alert-detail-view-container font-mono">
        <div className="panel" style={{ padding: '48px 24px', textAlign: 'center', background: 'var(--bg-surface)' }}>
          <AlertOctagon size={44} className="text-warning" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
            TELEMETRY INCIDENT SYNCHRONIZING
          </h2>
          <p className="text-secondary" style={{ fontSize: '13px', maxWidth: '540px', margin: '0 auto 24px', lineHeight: 1.5 }}>
            Alert record "{alertId}" is currently synchronizing with the IMD SkyGuard Layer-2 ML inference pipeline. Please select an incident from the active queue.
          </p>
          <button 
            onClick={() => navigate('/alerts')} 
            className="btn-hero-action btn-hero-ack font-mono"
            style={{ padding: '8px 20px', display: 'inline-flex', alignItems: 'center', gap: '8px', margin: '0 auto' }}
          >
            ← RETURN TO ALERTS QUEUE
          </button>
        </div>
      </div>
    );
  }

  const { explanation } = alertItem;

  return (
    <div className="view-container alert-detail-view-container font-mono">
      {/* 1. Hero Incident Bar */}
      <div className="alert-detail-hero panel">
        <div className="hero-top-nav">
          <button onClick={() => navigate('/alerts')} className="btn-back-breadcrumb font-mono">
            ← BACK TO ALERTS FEED
          </button>
          <div className="hero-tags-group">
            <span className="hero-id-tag">INCIDENT // {alertItem.id.toUpperCase()}</span>
            <span className="hero-firmware-tag">{explanation?.modelVersion || 'SkyGuard AI v2.4'}</span>
          </div>
        </div>

        <div className="hero-main-content">
          <div className="hero-identity-cluster">
            <div className="hero-icon-box alert-icon-large">
              <AlertOctagon size={26} className="text-critical" />
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

          {/* Incident Operator Action Buttons */}
          <div className="hero-actions-cluster">
            {alertItem.status !== 'acknowledged' && alertItem.status !== 'resolved' && (
              <button 
                className="btn-hero-action btn-hero-ack"
                onClick={() => onChangeStatus(alertItem.id, 'acknowledged')}
                title="Mark incident as acknowledged"
              >
                <Check size={13} />
                <span>ACKNOWLEDGE</span>
              </button>
            )}
            <button 
              className="btn-hero-action"
              onClick={() => setIsAssignModalOpen(true)}
              title="Reassign duty officer"
            >
              <User size={13} />
              <span>ASSIGN</span>
            </button>
            <button 
              className="btn-hero-action"
              onClick={() => {
                alert(`Incident ${alertItem.id.toUpperCase()} escalated to IMD Senior Telemetry Command.`);
              }}
              title="Escalate incident"
            >
              <ShieldAlert size={13} className="text-warning" />
              <span>ESCALATE</span>
            </button>
            {alertItem.status !== 'resolved' && (
              <button 
                className="btn-hero-action btn-hero-resolve"
                onClick={() => onChangeStatus(alertItem.id, 'resolved')}
                title="Resolve incident"
              >
                <CheckCircle2 size={13} />
                <span>RESOLVE</span>
              </button>
            )}
            <button 
              className="btn-hero-action"
              onClick={() => setIsNoteModalOpen(true)}
              title="Append operator note"
            >
              <MessageSquareQuote size={13} />
              <span>ADD NOTE</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Operational Two-Column Explainability Grid */}
      <div className="alert-detail-grid-split">
        {/* LEFT COLUMN: Diagnostic Verdict, Signal Corridor & Physics Evidence */}
        <div className="alert-detail-left-col">
          {/* AI Diagnostic Verdict & Synthesis Card */}
          <div className="ai-diagnosis-hero-card panel font-mono">
            <div className="diagnosis-top-line">
              <div className="diagnosis-badge-group">
                <Cpu size={16} className="text-purple-400" />
                <span className="diagnosis-model-tag">{explanation?.modelVersion || 'SkyGuard AI'} INFERENCE</span>
              </div>
              <span className={`risk-level-tag risk-${alertItem.severity}`}>
                RISK LEVEL: {explanation?.riskLevel || alertItem.severity.toUpperCase()}
              </span>
            </div>

            <h2 className="diagnosis-verdict-title">
              "{explanation?.plainLanguageSummary || 'Automated anomaly detected on sensing channel.'}"
            </h2>

            <div className="diagnosis-metrics-grid">
              <div className="d-cell">
                <span className="d-lbl text-muted">PREDICTED FAULT</span>
                <span className="d-val text-primary font-bold">
                  {alertItem.faultType.replace('_', ' ').toUpperCase()}
                </span>
              </div>
              <div className="d-cell">
                <span className="d-lbl text-muted">MODEL CONFIDENCE</span>
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
                <span className="d-lbl text-muted">TRIAGE STATUS</span>
                <span className="d-val text-emerald-500 font-bold">
                  {alertItem.status.toUpperCase()}
                </span>
              </div>
            </div>
          </div>

          {/* Expected vs Observed Signal Corridor Chart */}
          {explanation?.baselineVsObserved && (
            <ExplainabilityChart
              features={[]}
              evidenceSteps={[]}
              recommendedActions={[]}
              baselineVsObserved={explanation.baselineVsObserved}
            />
          )}

          {/* Multi-Signal Evidence Pipeline Breakdown */}
          {explanation?.physicsConsistency && (
            <PhysicsConsistencyCard data={explanation.physicsConsistency} />
          )}

          {explanation?.spatialConsensus && (
            <SpatialConsensusCard data={explanation.spatialConsensus} />
          )}

          {explanation?.temporalPattern && (
            <TemporalPatternCard data={explanation.temporalPattern} />
          )}
        </div>

        {/* RIGHT COLUMN: Attribution Analysis, Timeline Evolution & Remediation */}
        <div className="alert-detail-right-col">
          {/* Attribution Analysis (Normalized SHAP Contributions) */}
          {explanation?.featureImportance && explanation.featureImportance.length > 0 && (
            <FeatureImportanceChart features={explanation.featureImportance} />
          )}

          {/* Evidence Sequence Stepper (Timeline Evolution) */}
          {explanation?.evidenceTimeline && explanation.evidenceTimeline.length > 0 && (
            <div className="subpanel-card panel">
              <div className="subpanel-header">
                <div className="subpanel-title font-mono">
                  <Clock size={14} className="text-emerald-500" />
                  <span>EVIDENCE SEQUENCE (ANOMALY EVOLUTION)</span>
                </div>
                <span className="text-muted font-mono">{explanation.evidenceTimeline.length} STAGES</span>
              </div>

              <div className="subpanel-body">
                <div className="evidence-timeline-stepper font-mono">
                  {explanation.evidenceTimeline.map((step, idx) => {
                    const color = 
                      step.status === 'critical' ? 'var(--state-critical)' : 
                      step.status === 'warning' ? 'var(--state-warning)' : 'var(--state-healthy)';

                    return (
                      <div key={step.step} className="evidence-step-item">
                        <div className="evidence-step-left">
                          <div className="evidence-step-badge" style={{ borderColor: color, color }}>
                            {step.step}
                          </div>
                          {idx < explanation.evidenceTimeline.length - 1 && <div className="evidence-step-line" />}
                        </div>
                        <div className="evidence-step-content">
                          <div className="evidence-step-top">
                            <span className="step-stage-name" style={{ color }}>{step.stage.toUpperCase()}</span>
                            <span className="step-timestamp text-muted">{step.timestamp}</span>
                          </div>
                          <div className="step-title font-bold text-primary">{step.title}</div>
                          <p className="step-desc text-secondary">{step.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Operational Remediation Actions */}
          {explanation?.recommendedActions && explanation.recommendedActions.length > 0 && (
            <div className="subpanel-card panel">
              <div className="subpanel-header">
                <div className="subpanel-title font-mono">
                  <Wrench size={14} className="text-blue-500" />
                  <span>AI-RECOMMENDED OPERATIONAL ACTIONS</span>
                </div>
                <span className="status-tag pass font-mono">PRIORITIZED</span>
              </div>

              <div className="subpanel-body">
                <div className="recommendations-list font-mono">
                  {explanation.recommendedActions.map((action) => {
                    const badgeColor = 
                      action.priority === 'high' ? 'badge-critical' :
                      action.priority === 'medium' ? 'badge-warning' : 'badge-neutral';

                    return (
                      <div key={action.id} className="recommendation-item">
                        <div className="rec-top">
                          <span className="rec-title font-bold text-primary">{action.title}</span>
                          <span className={`kpi-badge ${badgeColor} font-mono`}>
                            {action.priority.toUpperCase()} PRIORITY
                          </span>
                        </div>
                        <p className="rec-desc text-secondary">{action.description}</p>
                        <div className="rec-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                          <span className="rec-status text-muted">Status: {action.status.replace('_', ' ').toUpperCase()}</span>
                          <button 
                            className="btn-hero-action btn-hero-ack font-mono"
                            style={{ padding: '3px 8px', fontSize: '10px' }}
                            onClick={() => alert(`Operational command dispatched: "${action.title}" to Station ${alertItem.stationId}`)}
                          >
                            DISPATCH COMMAND
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

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
                CONFIRM REASSIGNMENT
              </button>
            </div>
          }
        >
          <div className="form-group font-mono">
            <label className="form-label">SELECT DUTY OPERATOR</label>
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
          title={`INCIDENT AUDIT NOTE // ${alertItem.id.toUpperCase()}`}
          footer={
            <div className="modal-actions-right">
              <button className="btn-modal-cancel" onClick={() => setIsNoteModalOpen(false)}>
                CANCEL
              </button>
              <button 
                className="btn-modal-confirm btn-primary-confirm"
                onClick={() => {
                  alert(`Note successfully appended to incident audit trail: "${noteText}"`);
                  setIsNoteModalOpen(false);
                  setNoteText('');
                }}
              >
                SAVE AUDIT NOTE
              </button>
            </div>
          }
        >
          <div className="form-group font-mono">
            <label className="form-label">OPERATOR OBSERVATION & REMARKS</label>
            <textarea
              rows={4}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Record diagnostic findings, ground validation, sensor state, or corrective actions..."
              className="form-input"
            />
          </div>
        </Modal>
      )}
    </div>
  );
};

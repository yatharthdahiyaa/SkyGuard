import React, { useEffect } from 'react';
import { AlertTriangle, X, ShieldAlert } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  confirmSeverity?: 'critical' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  description,
  confirmLabel = 'CONFIRM ACTION',
  confirmSeverity = 'critical',
  onConfirm,
  onCancel
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-container panel font-mono" role="dialog" aria-modal="true">
        <div className="modal-header">
          <div className="modal-title-group">
            <ShieldAlert size={18} className={confirmSeverity === 'critical' ? 'text-critical' : 'text-warning'} />
            <span className="modal-title">{title}</span>
          </div>
          <button onClick={onCancel} className="modal-close-btn" aria-label="Close dialog">
            <X size={15} />
          </button>
        </div>

        <div className="modal-body">
          <p className="modal-description">{description}</p>
          <div className="modal-warning-notice">
            <AlertTriangle size={14} className="text-warning" />
            <span>This action will dispatch supervisory commands directly to edge hardware RTUs.</span>
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onCancel} className="btn-modal-cancel">
            CANCEL
          </button>
          <button 
            onClick={onConfirm} 
            className={`btn-modal-confirm ${confirmSeverity === 'critical' ? 'btn-critical' : 'btn-warning'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

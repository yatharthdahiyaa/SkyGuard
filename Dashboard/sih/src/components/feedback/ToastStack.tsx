import React from 'react';
import { AnomalyToast, AnomalyToastProps } from './AnomalyToast';
import { BellOff } from 'lucide-react';

export interface ToastItem extends Omit<AnomalyToastProps, 'onDismiss'> {}

interface ToastStackProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
  onMuteAll?: () => void;
}

export const ToastStack: React.FC<ToastStackProps> = ({ toasts, onDismiss, onMuteAll }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack-container" aria-live="polite">
      <div className="toast-stack-header-bar font-mono">
        <span className="toast-stack-badge">LIVE ANOMALY POPUPS ({toasts.length})</span>
        {onMuteAll && (
          <button 
            onClick={onMuteAll} 
            className="toast-mute-all-btn"
            title="Turn off live popup notifications"
          >
            <BellOff size={11} />
            <span>TURN OFF NOTIFICATIONS</span>
          </button>
        )}
      </div>
      {toasts.map((t) => (
        <AnomalyToast
          key={t.id}
          {...t}
          onDismiss={() => onDismiss(t.id)}
        />
      ))}
    </div>
  );
};

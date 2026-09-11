import React from 'react';
import { AnomalyToast, AnomalyToastProps } from './AnomalyToast';

export interface ToastItem extends Omit<AnomalyToastProps, 'onDismiss'> {}

interface ToastStackProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export const ToastStack: React.FC<ToastStackProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack-container" aria-live="polite">
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

import React from 'react';
import { Activity } from '../icons';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon,
  actionLabel,
  onAction
}) => {
  return (
    <div className="empty-state-container panel font-mono">
      <div className="empty-state-icon">
        {icon || <Activity size={24} className="text-muted" />}
      </div>
      <h3 className="empty-state-title">{title}</h3>
      <p className="empty-state-desc text-secondary">{description}</p>
      {actionLabel && onAction && (
        <button onClick={onAction} className="btn-empty-action font-mono">
          {actionLabel}
        </button>
      )}
    </div>
  );
};

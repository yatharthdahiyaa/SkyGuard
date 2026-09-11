import React, { useEffect } from 'react';
import { X } from '../icons';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = '480px'
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside 
        className="generic-drawer-window panel font-mono" 
        style={{ maxWidth: width }} 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-header">
          <div>
            <div className="drawer-title font-bold">{title}</div>
            {subtitle && <div className="drawer-subtitle text-secondary">{subtitle}</div>}
          </div>
          <button onClick={onClose} className="drawer-close-btn" aria-label="Close drawer">
            <X size={16} />
          </button>
        </div>
        <div className="drawer-body">
          {children}
        </div>
        {footer && (
          <div className="drawer-footer">
            {footer}
          </div>
        )}
      </aside>
    </div>
  );
};

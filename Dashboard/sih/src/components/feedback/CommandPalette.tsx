import React, { useState, useEffect, useMemo } from 'react';
import { Station, AlertEvent, ViewType } from '../../types/telemetry';
import { Search, Radio, AlertOctagon, LayoutDashboard, Sliders, MapPin, X } from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  stations: Station[];
  alerts: AlertEvent[];
  onSelectView: (view: ViewType) => void;
  onSelectStation: (station: Station) => void;
  onSelectAlert: (alert: AlertEvent) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  stations,
  alerts,
  onSelectView,
  onSelectStation,
  onSelectAlert
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
      } else if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) {
      return {
        views: [
          { id: 'overview', name: 'Overview Dashboard', icon: LayoutDashboard },
          { id: 'stations', name: 'Telemetry Stations & RTUs', icon: Radio },
          { id: 'alerts', name: 'Anomaly Alerts & Explainability', icon: AlertOctagon },
          { id: 'network-map', name: 'Network Topology & Spatial Mesh', icon: MapPin },
          { id: 'analytics', name: 'Analytics & Physics Compliance', icon: Sliders },
          { id: 'settings', name: 'System Settings & Telemetry Stream', icon: Sliders }
        ],
        stations: stations.slice(0, 4),
        alerts: alerts.slice(0, 3)
      };
    }

    return {
      views: [
        { id: 'overview', name: 'Overview Dashboard', icon: LayoutDashboard },
        { id: 'stations', name: 'Telemetry Stations & RTUs', icon: Radio },
        { id: 'alerts', name: 'Anomaly Alerts & Explainability', icon: AlertOctagon },
        { id: 'network-map', name: 'Network Topology & Spatial Mesh', icon: MapPin },
        { id: 'analytics', name: 'Analytics & Physics Compliance', icon: Sliders },
        { id: 'settings', name: 'System Settings & Telemetry Stream', icon: Sliders }
      ].filter(v => v.name.toLowerCase().includes(q)),
      stations: stations.filter(s => 
        s.name.toLowerCase().includes(q) || 
        s.code.toLowerCase().includes(q) || 
        s.sector.toLowerCase().includes(q)
      ),
      alerts: alerts.filter(a => 
        a.stationName.toLowerCase().includes(q) || 
        a.faultType.toLowerCase().includes(q) ||
        a.parameter.toLowerCase().includes(q)
      )
    };
  }, [query, stations, alerts]);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="command-palette-modal panel" onClick={(e) => e.stopPropagation()}>
        <div className="command-input-row font-mono">
          <Search size={16} className="text-secondary" />
          <input
            type="text"
            className="command-input"
            placeholder="Search stations, alerts, telemetry parameters, or views... (Esc to close)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <button onClick={onClose} className="command-close-btn" aria-label="Close palette">
            <X size={15} />
          </button>
        </div>

        <div className="command-results-list font-mono">
          {/* Views */}
          {filtered.views.length > 0 && (
            <div className="command-section">
              <span className="command-section-label">SYSTEM VIEWS</span>
              {filtered.views.map((v) => {
                const IconComponent = v.icon;
                return (
                  <button
                    key={v.id}
                    className="command-item"
                    onClick={() => {
                      onSelectView(v.id as ViewType);
                      onClose();
                    }}
                  >
                    <IconComponent size={14} className="text-secondary" />
                    <span>{v.name}</span>
                    <span className="command-shortcut text-muted">JUMP</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Stations */}
          {filtered.stations.length > 0 && (
            <div className="command-section">
              <span className="command-section-label">TELEMETRY STATIONS</span>
              {filtered.stations.map((s) => (
                <button
                  key={s.id}
                  className="command-item"
                  onClick={() => {
                    onSelectStation(s);
                    onClose();
                  }}
                >
                  <Radio size={14} className="text-blue-400" />
                  <span className="font-semibold">{s.code}</span>
                  <span className="text-secondary truncate">{s.name}</span>
                  <span className={`station-tag-mini status-${s.status}`}>{s.status.toUpperCase()}</span>
                </button>
              ))}
            </div>
          )}

          {/* Alerts */}
          {filtered.alerts.length > 0 && (
            <div className="command-section">
              <span className="command-section-label">ACTIVE ANOMALY ALERTS</span>
              {filtered.alerts.map((a) => (
                <button
                  key={a.id}
                  className="command-item"
                  onClick={() => {
                    onSelectAlert(a);
                    onClose();
                  }}
                >
                  <AlertOctagon size={14} className="text-critical" />
                  <span className="font-semibold">{a.stationName}</span>
                  <span className="text-secondary">[{a.faultType.replace('_', ' ').toUpperCase()}]</span>
                  <span className="text-critical font-bold">{Math.round(a.confidence * 100)}% conf</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

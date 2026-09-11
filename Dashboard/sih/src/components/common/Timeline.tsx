import React from 'react';
import { Severity } from '../../types/telemetry';
import { 
  AlertTriangle, 
  CheckCircle2, 
  WifiOff, 
  Cpu, 
  Wrench, 
  Activity, 
  Info 
} from '../icons';

export interface TimelineItem {
  id: string;
  type: 'fault' | 'alert' | 'maintenance' | 'config' | 'connectivity' | 'prediction';
  timestamp: string;
  title: string;
  description: string;
  severity?: Severity;
  stationCode?: string;
  operator?: string;
}

interface TimelineProps {
  items: TimelineItem[];
  maxItems?: number;
}

export const Timeline: React.FC<TimelineProps> = ({ items, maxItems = 10 }) => {
  const displayItems = items.slice(0, maxItems);

  const getIcon = (type: TimelineItem['type'], severity?: Severity) => {
    switch (type) {
      case 'fault':
        return <AlertTriangle size={13} className={severity === 'critical' ? 'text-critical' : 'text-warning'} />;
      case 'alert':
        return <CheckCircle2 size={13} className="text-blue-400" />;
      case 'connectivity':
        return <WifiOff size={13} className="text-secondary" />;
      case 'prediction':
        return <Cpu size={13} className="text-purple-400" />;
      case 'maintenance':
      case 'config':
        return <Wrench size={13} className="text-emerald-400" />;
      default:
        return <Activity size={13} className="text-secondary" />;
    }
  };

  return (
    <div className="industrial-timeline font-mono">
      {displayItems.map((item, idx) => (
        <div key={item.id} className="timeline-entry">
          <div className="timeline-gutter">
            <div className={`timeline-node node-type-${item.type}`}>
              {getIcon(item.type, item.severity)}
            </div>
            {idx < displayItems.length - 1 && <div className="timeline-connector" />}
          </div>

          <div className="timeline-content">
            <div className="timeline-entry-header">
              <span className="timeline-title font-semibold text-primary">{item.title}</span>
              <span className="timeline-timestamp text-muted">{item.timestamp}</span>
            </div>
            <p className="timeline-description text-secondary">{item.description}</p>
            {(item.stationCode || item.operator) && (
              <div className="timeline-meta-row text-muted">
                {item.stationCode && <span className="timeline-station-tag">NODE: {item.stationCode}</span>}
                {item.operator && <span className="timeline-operator-tag">OP: {item.operator}</span>}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

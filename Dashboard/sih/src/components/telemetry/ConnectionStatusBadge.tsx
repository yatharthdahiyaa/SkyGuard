import React from 'react';
import { WsStatus } from '../../types/telemetry';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';

interface ConnectionStatusBadgeProps {
  status: WsStatus;
  lastMessageAt: string | null;
  onRetry?: () => void;
}

export const ConnectionStatusBadge: React.FC<ConnectionStatusBadgeProps> = ({
  status,
  lastMessageAt,
  onRetry
}) => {
  if (status === 'live') {
    return (
      <div 
        className="connection-badge connection-live" 
        title={`Live WebSocket stream · Last frame: ${lastMessageAt || 'Active'}`}
      >
        <span className="live-dot-pulse" />
        <Wifi size={13} className="text-emerald-400" />
        <span className="badge-text font-mono font-semibold">LIVE</span>
        {lastMessageAt && (
          <span className="badge-meta font-mono">{lastMessageAt}</span>
        )}
      </div>
    );
  }

  if (status === 'reconnecting') {
    return (
      <div 
        className="connection-badge connection-reconnecting"
        title="WebSocket disconnected · Retrying telemetry broker handshakes"
      >
        <RefreshCw size={13} className="spin-slow text-amber-400" />
        <span className="badge-text font-mono font-semibold">RECONNECTING…</span>
      </div>
    );
  }

  return (
    <div 
      className="connection-badge connection-offline"
      title="Downlink lost · Displaying cached supervisory state"
    >
      <WifiOff size={13} className="text-slate-400" />
      <div className="offline-text-group">
        <span className="badge-text font-mono font-semibold">OFFLINE</span>
        <span className="badge-subtext">showing cached data</span>
      </div>
      {lastMessageAt && (
        <span className="badge-meta font-mono">[{lastMessageAt}]</span>
      )}
      {onRetry && (
        <button 
          onClick={onRetry} 
          className="badge-retry-btn font-mono"
          title="Attempt immediate reconnection handshake"
        >
          RETRY
        </button>
      )}
    </div>
  );
};

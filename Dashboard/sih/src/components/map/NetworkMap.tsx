import React, { useState } from 'react';
import { Station } from '../../types/telemetry';
import { StationMapMarker } from './StationMapMarker';
import { HealthPill } from '../telemetry/HealthPill';
import { Link } from '../../context/RouterContext';
import { 
  Compass, 
  Plus, 
  Minus, 
  RotateCcw, 
  Layers, 
  Radio, 
  ChevronRight, 
  X,
  ExternalLink
} from '../icons';

interface NetworkMapProps {
  stations: Station[];
  selectedStationId?: string | null;
  onSelectStation?: (station: Station) => void;
  height?: number | string;
  showControls?: boolean;
}

export const NetworkMap: React.FC<NetworkMapProps> = ({
  stations,
  selectedStationId,
  onSelectStation,
  height = 480,
  showControls = true
}) => {
  const [activeStationId, setActiveStationId] = useState<string | null>(selectedStationId || null);
  const [mapMode, setMapMode] = useState<'standard' | 'satellite'>('standard');
  const [zoomScale, setZoomScale] = useState<number>(1);

  // Compute dynamic geographic bounds from stations list
  const { minLat, maxLat, minLng, maxLng } = React.useMemo(() => {
    if (!stations.length) return { minLat: 18.0, maxLat: 30.0, minLng: 72.0, maxLng: 80.0 };
    const lats = stations.map(s => s.lat);
    const lngs = stations.map(s => s.lng);
    const minL = Math.min(...lats);
    const maxL = Math.max(...lats);
    const minG = Math.min(...lngs);
    const maxG = Math.max(...lngs);
    const padLat = Math.max(0.4, (maxL - minL) * 0.15);
    const padLng = Math.max(0.4, (maxG - minG) * 0.15);
    return {
      minLat: minL - padLat,
      maxLat: maxL + padLat,
      minLng: minG - padLng,
      maxLng: maxG + padLng
    };
  }, [stations]);

  // Map geographic coords to SVG viewbox (800 x 500)
  const toCoords = (lat: number, lng: number) => {
    const spanLng = Math.max(0.001, maxLng - minLng);
    const spanLat = Math.max(0.001, maxLat - minLat);
    const x = Math.max(40, Math.min(760, ((lng - minLng) / spanLng) * 700 + 50));
    const y = Math.max(40, Math.min(460, 460 - ((lat - minLat) / spanLat) * 400));
    return { x, y };
  };

  const activeStation = stations.find(s => s.id === (activeStationId || selectedStationId));

  const handleMarkerClick = (station: Station) => {
    setActiveStationId(station.id);
    if (onSelectStation) onSelectStation(station);
  };

  return (
    <div className="network-map-component panel font-mono" style={{ height }}>
      {/* HUD Header */}
      {showControls && (
        <div className="map-hud-top-bar">
          <div className="hud-badge">
            <Compass size={12} className="text-secondary" />
            <span>GRID EPSG:3857 · IMD AWS OBSERVATORY GRID</span>
          </div>

          <div className="map-top-actions">
            <button
              className={`map-mode-btn ${mapMode === 'satellite' ? 'active' : ''}`}
              onClick={() => setMapMode(mapMode === 'standard' ? 'satellite' : 'standard')}
            >
              <Layers size={11} />
              <span>{mapMode === 'standard' ? 'VECTOR TOPO' : 'SATELLITE RADAR'}</span>
            </button>
            <div className="map-zoom-pill">
              <button onClick={() => setZoomScale(z => Math.min(z + 0.2, 2.0))} title="Zoom in">
                <Plus size={11} />
              </button>
              <button onClick={() => setZoomScale(z => Math.max(z - 0.2, 0.8))} title="Zoom out">
                <Minus size={11} />
              </button>
              <button onClick={() => setZoomScale(1)} title="Fit network">
                <RotateCcw size={11} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SVG Map Canvas */}
      <div className="map-svg-wrap">
        <svg 
          viewBox="0 0 800 500" 
          className="map-main-svg"
          style={{ transform: `scale(${zoomScale})`, transformOrigin: 'center center', transition: 'transform 0.2s ease' }}
        >
          <defs>
            <pattern id="map-grid-dots" width="30" height="30" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1" fill="var(--border-subtle)" />
            </pattern>
            {mapMode === 'satellite' && (
              <radialGradient id="satellite-glow" cx="45%" cy="40%" r="60%">
                <stop offset="0%" stopColor="#0c2d48" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#090c10" stopOpacity="0.9" />
              </radialGradient>
            )}
          </defs>

          {/* Background */}
          <rect width="800" height="500" fill="url(#map-grid-dots)" />
          {mapMode === 'satellite' && (
            <rect width="800" height="500" fill="url(#satellite-glow)" />
          )}

          {/* Simulated Geographic Sector Land Boundaries */}
          <path
            d="M 100 490 Q 130 380 170 300 T 260 190 Q 300 120 400 50 T 660 30 Q 740 180 700 320 T 600 490 Z"
            fill="none"
            stroke={mapMode === 'satellite' ? 'rgba(56, 189, 248, 0.25)' : 'var(--border-medium)'}
            strokeWidth="1.2"
            strokeDasharray="5 3"
          />

          {/* Inter-station links (capped for performance) */}
          {activeStation && (
            <g className="map-active-links">
              {stations
                .filter((s) => s.id !== activeStationId && s.sector === activeStation.sector)
                .slice(0, 5)
                .map((stB) => {
                  const pA = toCoords(activeStation.lat, activeStation.lng);
                  const pB = toCoords(stB.lat, stB.lng);
                  return (
                    <line
                      key={`${activeStation.id}-${stB.id}`}
                      x1={pA.x}
                      y1={pA.y}
                      x2={pB.x}
                      y2={pB.y}
                      stroke="var(--state-info)"
                      strokeWidth={1.4}
                      strokeDasharray="4 3"
                      opacity={0.7}
                    />
                  );
                })}
            </g>
          )}

          {/* Station Markers */}
          {stations.map((st) => {
            const { x, y } = toCoords(st.lat, st.lng);
            return (
              <StationMapMarker
                key={st.id}
                x={x}
                y={y}
                code={st.code}
                status={st.status}
                isActive={st.id === activeStationId}
                onClick={() => handleMarkerClick(st)}
              />
            );
          })}
        </svg>
      </div>

      {/* Station Interactive Popup Card */}
      {activeStation && (
        <div className="map-station-popup panel font-mono">
          <div className="popup-top-line">
            <div className="popup-code-group">
              <Radio size={13} className="text-blue-400" />
              <span className="popup-code font-bold">{activeStation.code}</span>
            </div>
            <HealthPill status={activeStation.status} size="sm" />
            <button onClick={() => setActiveStationId(null)} className="popup-close-btn" aria-label="Close popup">
              <X size={12} />
            </button>
          </div>

          <div className="popup-station-name">{activeStation.name}</div>
          <div className="popup-location text-muted">{activeStation.region} · {activeStation.elevationM}m</div>

          <div className="popup-metrics-grid">
            <div className="p-chip">
              <span className="p-lbl">HEALTH</span>
              <span className="p-val text-primary font-bold">{activeStation.healthScore}/100</span>
            </div>
            <div className="p-chip">
              <span className="p-lbl">ALERTS</span>
              <span className={`p-val ${activeStation.activeAlertCount > 0 ? 'text-critical font-bold' : ''}`}>
                {activeStation.activeAlertCount} active
              </span>
            </div>
            <div className="p-chip">
              <span className="p-lbl">LAST SEEN</span>
              <span className="p-val text-secondary">{activeStation.lastSeen}</span>
            </div>
          </div>

          {activeStation.lastFault && activeStation.status !== 'healthy' && (
            <div className="popup-fault-banner text-critical">
              ⚠ FAULT: {activeStation.lastFault}
            </div>
          )}

          <div className="popup-action-row">
            <Link to={`/stations/${activeStation.id}`} className="btn-popup-view font-mono">
              <span>VIEW STATION DETAIL</span>
              <ExternalLink size={12} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

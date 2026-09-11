import React, { useState, useMemo } from 'react';
import { Station } from '../types/telemetry';
import { HealthPill } from '../components/telemetry/HealthPill';
import { useRouter, Link } from '../context/RouterContext';
import { 
  Radio, 
  Zap, 
  Compass, 
  Globe, 
  ChevronRight, 
  ChevronLeft,
  Search, 
  Filter, 
  Layers, 
  Maximize2, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw,
  AlertOctagon,
  ExternalLink,
  ShieldCheck,
  Activity,
  Sliders
} from 'lucide-react';

interface NetworkMapViewProps {
  stations: Station[];
  onSelectStation?: (station: Station) => void;
}

export const NetworkMapView: React.FC<NetworkMapViewProps> = ({
  stations,
  onSelectStation
}) => {
  const { navigate } = useRouter();
  const [selectedStationId, setSelectedStationId] = useState<string>('st-01');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [baseLayer, setBaseLayer] = useState<'vector' | 'satellite'>('vector');
  const [showTopologyLinks, setShowTopologyLinks] = useState<boolean>(true);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Compute dynamic geographic bounds from stations list
  const { minLat, maxLat, minLng, maxLng } = useMemo(() => {
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

  const toCoords = (lat: number, lng: number) => {
    const spanLng = Math.max(0.001, maxLng - minLng);
    const spanLat = Math.max(0.001, maxLat - minLat);
    const x = Math.max(40, Math.min(820, ((lng - minLng) / spanLng) * 740 + 60));
    const y = Math.max(40, Math.min(500, 490 - ((lat - minLat) / spanLat) * 420));
    return { x, y };
  };

  const filteredStations = useMemo(() => {
    return stations.filter((st) => {
      const matchesSearch = 
        st.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        st.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        st.region.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = 
        statusFilter === 'all' ? true :
        statusFilter === 'healthy' ? st.status === 'healthy' :
        statusFilter === 'warning' ? st.status === 'degraded' :
        statusFilter === 'critical' ? st.status === 'faulty' :
        statusFilter === 'offline' ? st.status === 'offline' : true;

      const matchesRegion = 
        regionFilter === 'all' ? true : st.sector.toLowerCase().includes(regionFilter.toLowerCase());

      return matchesSearch && matchesStatus && matchesRegion;
    });
  }, [stations, searchQuery, statusFilter, regionFilter]);

  const activeStation = stations.find(s => s.id === selectedStationId) || stations[0];

  const handleZoomIn = () => setZoomLevel(prev => Math.min(2.5, prev + 0.25));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(0.75, prev - 0.25));
  const handleResetView = () => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleSelectStation = (st: Station) => {
    setSelectedStationId(st.id);
    const coords = toCoords(st.lat, st.lng);
    // Pan slightly towards selected station
    setPanOffset({
      x: (430 - coords.x) * 0.3,
      y: (270 - coords.y) * 0.3
    });
    if (onSelectStation) onSelectStation(st);
  };

  return (
    <div className="network-map-fullscreen-wrapper">
      {/* Top Map Control Bar */}
      <div className="map-topbar font-mono">
        <div className="map-topbar-left">
          <button 
            className="map-sidebar-toggle-btn"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title={sidebarOpen ? "Collapse Station Sidebar" : "Expand Station Sidebar"}
          >
            {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
            <span>{sidebarOpen ? 'COLLAPSE LIST' : 'STATIONS LIST'}</span>
          </button>

          <div className="map-title-badge">
            <Radio size={14} className="text-emerald-400" />
            <span className="font-bold">NATIONAL AWS METEOROLOGICAL OBSERVATORY GRID</span>
            <span className="text-muted">·</span>
            <span className="text-secondary">{stations.length} TOTAL NODES</span>
          </div>
        </div>

        <div className="map-topbar-right">
          {/* Base Layer Switcher */}
          <div className="map-layer-selector">
            <button
              className={`layer-btn ${baseLayer === 'vector' ? 'active' : ''}`}
              onClick={() => setBaseLayer('vector')}
            >
              <Compass size={13} />
              <span>VECTOR GRID</span>
            </button>
            <button
              className={`layer-btn ${baseLayer === 'satellite' ? 'active' : ''}`}
              onClick={() => setBaseLayer('satellite')}
            >
              <Globe size={13} />
              <span>SATELLITE HUD</span>
            </button>
          </div>

          {/* Topology Toggle */}
          <button
            className={`map-layer-toggle-btn ${showTopologyLinks ? 'active' : ''}`}
            onClick={() => setShowTopologyLinks(!showTopologyLinks)}
            title="Toggle inter-station spatial consensus links"
          >
            <Zap size={13} />
            <span>MESH LINKS {showTopologyLinks ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      </div>

      <div className="map-body-layout">
        {/* Synchronized Station List Sidebar */}
        <div className={`map-sync-sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
          <div className="sidebar-search-box">
            <Search size={14} className="text-secondary" />
            <input 
              type="text"
              placeholder="Search station or code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="sidebar-search-input font-mono"
            />
          </div>

          {/* Quick Status Filter Pills */}
          <div className="sidebar-filter-pills font-mono">
            {['all', 'healthy', 'warning', 'critical', 'offline'].map((st) => (
              <button
                key={st}
                className={`filter-pill ${statusFilter === st ? 'active' : ''}`}
                onClick={() => setStatusFilter(st)}
              >
                {st.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Station List Items */}
          <div className="sidebar-stations-scrollable">
            {filteredStations.map((st) => {
              const isSelected = st.id === selectedStationId;
              return (
                <div 
                  key={st.id}
                  className={`station-list-item font-mono ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleSelectStation(st)}
                >
                  <div className="station-item-top">
                    <span className="station-code font-bold">{st.code}</span>
                    <HealthPill status={st.status} size="sm" />
                  </div>
                  <div className="station-name text-secondary truncate">{st.name}</div>
                  <div className="station-item-meta text-muted">
                    <span>Score: <b className={st.healthScore < 80 ? 'text-critical' : 'text-emerald-400'}>{st.healthScore}</b></span>
                    <span>·</span>
                    <span>{st.region}</span>
                    <span>·</span>
                    <span>{st.latencyMs}ms</span>
                  </div>
                </div>
              );
            })}
            {filteredStations.length === 0 && (
              <div className="no-stations-found font-mono text-muted text-center p-4">
                No telemetry stations matching criteria.
              </div>
            )}
          </div>
        </div>

        {/* Interactive Map Viewport */}
        <div className={`map-viewport-container ${baseLayer === 'satellite' ? 'satellite-mode' : 'vector-mode'}`}>
          {/* Map Controls Floating Overlay */}
          <div className="map-floating-controls font-mono">
            <button onClick={handleZoomIn} className="floating-ctrl-btn" title="Zoom In">
              <ZoomIn size={16} />
            </button>
            <button onClick={handleZoomOut} className="floating-ctrl-btn" title="Zoom Out">
              <ZoomOut size={16} />
            </button>
            <button onClick={handleResetView} className="floating-ctrl-btn" title="Reset / Fit Network">
              <RotateCcw size={15} />
            </button>
            <div className="zoom-indicator-text text-muted">
              {Math.round(zoomLevel * 100)}%
            </div>
          </div>

          {/* Map HUD Status */}
          <div className="map-hud-legend font-mono">
            <div className="legend-item"><span className="status-dot healthy" /> Healthy ({stations.filter(s => s.status === 'healthy').length})</div>
            <div className="legend-item"><span className="status-dot warning" /> Warning ({stations.filter(s => s.status === 'degraded').length})</div>
            <div className="legend-item"><span className="status-dot critical" /> Critical ({stations.filter(s => s.status === 'faulty').length})</div>
            <div className="legend-item"><span className="status-dot offline" /> Offline ({stations.filter(s => s.status === 'offline').length})</div>
          </div>

          {/* SVG Map Canvas */}
          <svg 
            viewBox="0 0 860 540" 
            className="fullscreen-map-svg"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <pattern id="grid-pattern-full" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--border-subtle)" strokeWidth="0.75" />
              </pattern>
              <pattern id="sub-grid" width="8" height="8" patternUnits="userSpaceOnUse">
                <path d="M 8 0 L 0 0 0 8" fill="none" stroke="var(--border-subtle)" strokeWidth="0.25" opacity="0.4" />
              </pattern>
              <radialGradient id="satellite-glow" cx="50%" cy="50%" r="60%">
                <stop offset="0%" stopColor="#0284c7" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#0284c7" stopOpacity="0.0" />
              </radialGradient>
            </defs>

            {/* Transform Group for Pan and Zoom */}
            <g transform={`translate(${panOffset.x}, ${panOffset.y}) scale(${zoomLevel})`} style={{ transformOrigin: '430px 270px', transition: 'transform 0.25s ease-out' }}>
              {/* Grid Background */}
              <rect width="860" height="540" fill="url(#sub-grid)" />
              <rect width="860" height="540" fill="url(#grid-pattern-full)" />
              <circle cx="430" cy="270" r="300" fill="url(#satellite-glow)" />

              {/* Geographic Contour Paths */}
              <path
                d="M 100 520 Q 130 400 170 340 T 250 230 Q 290 140 370 70 T 630 50 Q 710 190 670 330 T 590 520 Z"
                fill="rgba(15, 23, 42, 0.45)"
                stroke="var(--border-medium)"
                strokeWidth="1.2"
                strokeDasharray="6 4"
              />
              <path
                d="M 140 500 Q 180 390 220 300 T 360 170 Q 460 120 540 100"
                fill="none"
                stroke="var(--border-subtle)"
                strokeWidth="0.8"
              />

              {/* Inter-node Telemetry Links (optimized for 6 nearest cluster links) */}
              {showTopologyLinks && activeStation && (
                <g className="spatial-links-group">
                  {stations
                    .filter((s) => s.id !== selectedStationId && s.sector === activeStation.sector)
                    .slice(0, 6)
                    .map((stB) => {
                      const posA = toCoords(activeStation.lat, activeStation.lng);
                      const posB = toCoords(stB.lat, stB.lng);
                      const isFaultyLink = activeStation.status === 'faulty' || stB.status === 'faulty';

                      return (
                        <g key={`${activeStation.id}-${stB.id}`}>
                          <line
                            x1={posA.x}
                            y1={posA.y}
                            x2={posB.x}
                            y2={posB.y}
                            stroke={isFaultyLink ? 'var(--state-critical)' : 'var(--state-info)'}
                            strokeWidth={1.8}
                            strokeDasharray={isFaultyLink ? '4 3' : 'none'}
                            opacity={0.8}
                          />
                          <circle r="3" fill={isFaultyLink ? 'var(--state-critical)' : 'var(--state-info)'}>
                            <animateMotion
                              path={`M ${posA.x} ${posA.y} L ${posB.x} ${posB.y}`}
                              dur="3s"
                              repeatCount="indefinite"
                            />
                          </circle>
                        </g>
                      );
                    })}
                </g>
              )}

              {/* Station Markers */}
              {stations.map((st) => {
                const { x, y } = toCoords(st.lat, st.lng);
                const isSelected = st.id === selectedStationId;
                const nodeColor = 
                  st.status === 'healthy' ? 'var(--state-healthy)' :
                  st.status === 'degraded' ? 'var(--state-warning)' :
                  st.status === 'faulty' ? 'var(--state-critical)' : 'var(--state-offline)';

                return (
                  <g 
                    key={st.id} 
                    className="map-node-interactive"
                    onClick={() => handleSelectStation(st)}
                    style={{ cursor: 'pointer' }}
                  >
                    {/* Active pulse */}
                    {isSelected && (
                      <circle cx={x} cy={y} r="18" fill="none" stroke={nodeColor} strokeWidth="1.5" opacity="0.6" className="pulse-circle" />
                    )}

                    {/* Outer node disc */}
                    <circle 
                      cx={x} 
                      cy={y} 
                      r={isSelected ? 11 : 8} 
                      fill="var(--bg-surface)" 
                      stroke={nodeColor} 
                      strokeWidth={isSelected ? 2.5 : 1.8} 
                    />
                    <circle cx={x} cy={y} r={isSelected ? 4.5 : 3.5} fill={nodeColor} />

                    {/* Code label pill */}
                    <rect
                      x={x + 13}
                      y={y - 11}
                      width={st.code.length * 6.8 + 14}
                      height="20"
                      rx="3"
                      fill="var(--bg-surface-raised)"
                      stroke={isSelected ? nodeColor : 'var(--border-subtle)'}
                      strokeWidth={isSelected ? 1.5 : 0.8}
                    />
                    <text
                      x={x + 20}
                      y={y + 3}
                      fill="var(--text-primary)"
                      fontSize="9"
                      fontFamily="var(--font-mono)"
                      fontWeight={isSelected ? '700' : '500'}
                    >
                      {st.code}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Floating Station Inspector Popup Card */}
          {activeStation && (
            <div className="map-station-popup-card panel font-mono">
              <div className="popup-card-header">
                <div className="popup-title-block">
                  <div className="popup-code font-bold text-primary">{activeStation.code}</div>
                  <div className="popup-name text-secondary truncate">{activeStation.name}</div>
                </div>
                <HealthPill status={activeStation.status} size="sm" />
              </div>

              <div className="popup-metrics-grid">
                <div className="popup-metric">
                  <span className="pm-label">TEMP</span>
                  <span className="pm-val text-orange-400">{activeStation.readings.temperature} °C</span>
                </div>
                <div className="popup-metric">
                  <span className="pm-label">HUMIDITY</span>
                  <span className={`pm-val ${activeStation.readings.humidity > 90 ? 'text-critical' : 'text-blue-400'}`}>
                    {activeStation.readings.humidity} %
                  </span>
                </div>
                <div className="popup-metric">
                  <span className="pm-label">PRESSURE</span>
                  <span className="pm-val text-cyan-400">{activeStation.readings.pressure} hPa</span>
                </div>
                <div className="popup-metric">
                  <span className="pm-label">HEALTH</span>
                  <span className={`pm-val ${activeStation.healthScore < 80 ? 'text-critical' : 'text-emerald-400'}`}>
                    {activeStation.healthScore}/100
                  </span>
                </div>
              </div>

              <div className="popup-status-line text-muted">
                <span>LAT: {activeStation.lat.toFixed(3)}°N</span>
                <span>·</span>
                <span>LNG: {activeStation.lng.toFixed(3)}°W</span>
                <span>·</span>
                <span>SNR: {activeStation.snrDb}dB</span>
              </div>

              {activeStation.activeAlertCount > 0 && (
                <div className="popup-alert-strip text-critical">
                  <AlertOctagon size={13} />
                  <span>{activeStation.activeAlertCount} ACTIVE INCIDENTS DETECTED</span>
                </div>
              )}

              <div className="popup-action-row">
                <Link 
                  to={`/stations/${activeStation.id}`}
                  className="btn-popup-open-detail"
                >
                  <span>STATION METRICS &amp; AI DIAGNOSTICS</span>
                  <ExternalLink size={13} />
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

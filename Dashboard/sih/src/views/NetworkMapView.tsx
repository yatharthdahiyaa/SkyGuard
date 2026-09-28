import React, { useState, useMemo, useCallback } from 'react';
import { Station } from '../types/telemetry';
import { HealthPill } from '../components/telemetry/HealthPill';
import { useRouter, Link } from '../context/RouterContext';
import { IndiaLeafletMap } from '../components/map/IndiaLeafletMap';
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
  const [selectedStationId, setSelectedStationId] = useState<string | null>(stations[0]?.id || null);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [baseLayer, setBaseLayer] = useState<'vector' | 'satellite'>('vector');
  const [showTopologyLinks, setShowTopologyLinks] = useState<boolean>(true);
  const [currentState, setCurrentState] = useState<string | null>(null);

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

  const handleSelectStation = useCallback((st: Station) => {
    setSelectedStationId(st.id);
    if (onSelectStation) onSelectStation(st);
  }, [onSelectStation]);

  const handleStateZoom = useCallback((stateName: string | null) => {
    setCurrentState(stateName);
  }, []);

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
              <span>DARK HUD</span>
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

        {/* Interactive Leaflet Map Viewport */}
        <div className="map-viewport-container leaflet-viewport">
          {/* Map HUD Status Legend */}
          <div className="map-hud-legend font-mono">
            <div className="legend-item"><span className="status-dot healthy" /> Healthy ({stations.filter(s => s.status === 'healthy').length})</div>
            <div className="legend-item"><span className="status-dot warning" /> Warning ({stations.filter(s => s.status === 'degraded').length})</div>
            <div className="legend-item"><span className="status-dot critical" /> Critical ({stations.filter(s => s.status === 'faulty').length})</div>
            <div className="legend-item"><span className="status-dot offline" /> Offline ({stations.filter(s => s.status === 'offline').length})</div>
          </div>

          {/* The Leaflet Map */}
          <IndiaLeafletMap
            stations={filteredStations.length > 0 ? filteredStations : stations}
            selectedStationId={selectedStationId}
            onSelectStation={handleSelectStation}
            baseLayer={baseLayer}
            showTopologyLinks={showTopologyLinks}
            onStateZoom={handleStateZoom}
          />

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
                <span>LNG: {activeStation.lng.toFixed(3)}°E</span>
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

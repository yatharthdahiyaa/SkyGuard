import React, { useState, useMemo } from 'react';
import { Station } from '../types/telemetry';
import { StationTable } from '../components/stations/StationTable';
import { FilterBar } from '../components/common/FilterBar';
import { Modal } from '../components/common/Modal';
import { 
  Radio, 
  Plus, 
  Download, 
  Sliders, 
  Search, 
  Filter, 
  Check, 
  X 
} from '../components/icons';

interface StationsViewProps {
  stations: Station[];
  onPingStation?: (id: string) => void;
  onRequestReboot?: (station: Station) => void;
  onRequestCalibrate?: (station: Station) => void;
  onExportStations?: () => void;
}

export const StationsView: React.FC<StationsViewProps> = ({
  stations,
  onPingStation,
  onRequestReboot,
  onRequestCalibrate,
  onExportStations
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [faultFilter, setFaultFilter] = useState<string>('all');
  const [minHealthScore, setMinHealthScore] = useState<number>(0);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Filtered station list
  const filteredStations = useMemo(() => {
    return stations.filter((s) => {
      const matchesSearch = 
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.id.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
      const matchesRegion = regionFilter === 'all' || s.region === regionFilter;
      const matchesFault = faultFilter === 'all' || (faultFilter === 'has_fault' ? s.status !== 'healthy' : s.status === 'healthy');
      const matchesHealth = s.healthScore >= minHealthScore;

      return matchesSearch && matchesStatus && matchesRegion && matchesFault && matchesHealth;
    });
  }, [stations, searchQuery, statusFilter, regionFilter, faultFilter, minHealthScore]);

  const regions = Array.from(new Set(stations.map(s => s.region)));

  return (
    <div className="view-container stations-view-container font-mono">
      {/* Header */}
      <div className="view-header-strip">
        <div className="view-title-group">
          <h1 className="view-title">STATIONS</h1>
          <p className="view-subtitle text-secondary">
            PRIMARY RTU FIELD MONITORING & HARDWARE CONFIGURATION · {stations.length} TOTAL UNITS
          </p>
        </div>

        <div className="stations-header-actions">
          <button 
            className="btn-export-csv"
            onClick={onExportStations}
          >
            <Download size={13} />
            <span>EXPORT</span>
          </button>
          <button 
            className="btn-primary-action font-mono"
            onClick={() => setIsAddModalOpen(true)}
          >
            <Plus size={13} />
            <span>ADD / CONFIGURE STATION</span>
          </button>
        </div>
      </div>

      {/* Search & Advanced Filters */}
      <div className="panel stations-filter-panel font-mono">
        <div className="stations-filter-row">
          <div className="search-input-wrapper">
            <Search size={13} className="text-secondary" />
            <input
              type="text"
              placeholder="Search by station name, RTU code, or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="filter-search-input"
            />
          </div>

          <div className="stations-selects-cluster">
            <div className="filter-select-item">
              <span className="filter-label">STATUS:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="filter-select font-mono"
              >
                <option value="all">ALL STATUSES</option>
                <option value="healthy">HEALTHY / NOMINAL</option>
                <option value="degraded">WARNING / DEGRADED</option>
                <option value="faulty">CRITICAL / FAULTY</option>
                <option value="offline">OFFLINE</option>
              </select>
            </div>

            <div className="filter-select-item">
              <span className="filter-label">REGION:</span>
              <select
                value={regionFilter}
                onChange={(e) => setRegionFilter(e.target.value)}
                className="filter-select font-mono"
              >
                <option value="all">ALL REGIONS</option>
                {regions.map(r => (
                  <option key={r} value={r}>{r.toUpperCase()}</option>
                ))}
              </select>
            </div>

            <div className="filter-select-item">
              <span className="filter-label">FAULTS:</span>
              <select
                value={faultFilter}
                onChange={(e) => setFaultFilter(e.target.value)}
                className="filter-select font-mono"
              >
                <option value="all">ALL NODES</option>
                <option value="has_fault">ACTIVE FAULTS ONLY</option>
                <option value="no_fault">NOMINAL ONLY</option>
              </select>
            </div>

            <div className="filter-slider-item">
              <span className="filter-label">MIN HEALTH: {minHealthScore}</span>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={minHealthScore}
                onChange={(e) => setMinHealthScore(Number(e.target.value))}
                className="range-slider-mini"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Station Table */}
      <StationTable
        stations={filteredStations}
        onPingStation={onPingStation}
        onRequestReboot={onRequestReboot}
        onRequestCalibrate={onRequestCalibrate}
      />

      {/* Add / Configure Station Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="PROVISION / CONFIGURE EDGE RTU STATION"
        footer={
          <div className="modal-actions-right">
            <button className="btn-modal-cancel" onClick={() => setIsAddModalOpen(false)}>
              CANCEL
            </button>
            <button 
              className="btn-modal-confirm btn-primary-confirm"
              onClick={() => {
                alert('Station provisioning job dispatched to supervisory controller.');
                setIsAddModalOpen(false);
              }}
            >
              PROVISION STATION
            </button>
          </div>
        }
      >
        <div className="provision-form font-mono">
          <div className="form-group">
            <label className="form-label">STATION DESIGNATION CODE</label>
            <input type="text" defaultValue="MET-N3-SUMMIT" className="form-input" />
          </div>
          <div className="form-group">
            <label className="form-label">FRIENDLY NAME</label>
            <input type="text" defaultValue="Mount Baker Telemetry Relay" className="form-input" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">SECTOR / REGION</label>
              <input type="text" defaultValue="Western Ghats & Coastal Mesh" className="form-input" />
            </div>
            <div className="form-group">
              <label className="form-label">ELEVATION (M AMSL)</label>
              <input type="number" defaultValue="1850" className="form-input" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">LATITUDE (°N)</label>
              <input type="text" defaultValue="48.7767" className="form-input" />
            </div>
            <div className="form-group">
              <label className="form-label">LONGITUDE (°W)</label>
              <input type="text" defaultValue="-121.8144" className="form-input" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">FIRMWARE CHANNEL</label>
            <select className="form-input font-mono">
              <option>v3.8.2-rtu (LTS Stable)</option>
              <option>v4.0.1-edge (Experimental Kalman)</option>
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
};

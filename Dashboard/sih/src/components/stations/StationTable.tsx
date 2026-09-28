import React, { useState, useMemo } from 'react';
import { Station } from '../../types/telemetry';
import { HealthPill } from '../telemetry/HealthPill';
import { HealthScore } from '../common/HealthScore';
import { useRouter } from '../../context/RouterContext';
import { 
  ChevronRight, 
  Activity, 
  Wrench, 
  Power, 
  ArrowRight, 
  Check, 
  Download,
  Sliders
} from '../icons';

interface StationTableProps {
  stations: Station[];
  onPingStation?: (id: string) => void;
  onRequestReboot?: (station: Station) => void;
  onRequestCalibrate?: (station: Station) => void;
}

type SortField = 'code' | 'status' | 'healthScore' | 'uptimePct' | 'modelConfidence' | 'lastSeen';

export const StationTable: React.FC<StationTableProps> = ({
  stations,
  onPingStation,
  onRequestReboot,
  onRequestCalibrate
}) => {
  const { navigate } = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sortField, setSortField] = useState<SortField>('code');
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const pageSize = 5;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const sortedStations = useMemo(() => {
    return [...stations].sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];
      if (typeof aVal === 'string') {
        return sortAsc 
          ? (aVal as string).localeCompare(bVal as string) 
          : (bVal as string).localeCompare(aVal as string);
      }
      return sortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [stations, sortField, sortAsc]);

  const totalPages = Math.ceil(sortedStations.length / pageSize) || 1;
  const paginatedStations = sortedStations.slice((page - 1) * pageSize, page * pageSize);

  const toggleSelectAll = () => {
    if (selectedIds.length === stations.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(stations.map(s => s.id));
    }
  };

  const toggleSelectRow = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(i => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  return (
    <div className="panel station-table-card font-mono">
      {/* Bulk actions bar if items are selected */}
      {selectedIds.length > 0 && (
        <div className="bulk-actions-strip">
          <span className="bulk-selection-count font-bold">
            {selectedIds.length} STATIONS SELECTED
          </span>
          <div className="bulk-buttons-group">
            <button className="btn-bulk-action" onClick={() => alert(`Bulk calibrate requested for ${selectedIds.length} stations`)}>
              <Wrench size={12} />
              <span>BULK CALIBRATE</span>
            </button>
            <button className="btn-bulk-action" onClick={() => alert(`Exporting metadata for ${selectedIds.length} stations`)}>
              <Download size={12} />
              <span>EXPORT SELECTED</span>
            </button>
            <button className="btn-bulk-action btn-bulk-clear" onClick={() => setSelectedIds([])}>
              DESELECT ALL
            </button>
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="industrial-table-container">
        <table className="industrial-table">
          <thead>
            <tr>
              <th style={{ width: 32 }}>
                <input 
                  type="checkbox" 
                  checked={selectedIds.length === stations.length && stations.length > 0} 
                  onChange={toggleSelectAll} 
                />
              </th>
              <th onClick={() => handleSort('code')} style={{ cursor: 'pointer' }}>
                STATION {sortField === 'code' ? (sortAsc ? '▲' : '▼') : ''}
              </th>
              <th>LOCATION</th>
              <th onClick={() => handleSort('status')} style={{ cursor: 'pointer' }}>
                STATUS {sortField === 'status' ? (sortAsc ? '▲' : '▼') : ''}
              </th>
              <th onClick={() => handleSort('healthScore')} style={{ cursor: 'pointer' }}>
                HEALTH {sortField === 'healthScore' ? (sortAsc ? '▲' : '▼') : ''}
              </th>
              <th>ALERTS</th>
              <th onClick={() => handleSort('lastSeen')} style={{ cursor: 'pointer' }}>
                LAST SEEN {sortField === 'lastSeen' ? (sortAsc ? '▲' : '▼') : ''}
              </th>
              <th onClick={() => handleSort('uptimePct')} style={{ cursor: 'pointer' }}>
                UPTIME {sortField === 'uptimePct' ? (sortAsc ? '▲' : '▼') : ''}
              </th>
              <th onClick={() => handleSort('modelConfidence')} style={{ cursor: 'pointer' }}>
                AI CONF {sortField === 'modelConfidence' ? (sortAsc ? '▲' : '▼') : ''}
              </th>
              <th>LAST FAULT</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {paginatedStations.map((st) => {
              const isChecked = selectedIds.includes(st.id);

              return (
                <tr 
                  key={st.id} 
                  className={`station-row-interactive ${isChecked ? 'row-checked' : ''}`}
                  onClick={() => navigate(`/stations/${st.id}`)}
                >
                  <td onClick={(e) => e.stopPropagation()}>
                    <input 
                      type="checkbox" 
                      checked={isChecked} 
                      onChange={() => toggleSelectRow(st.id)} 
                    />
                  </td>
                  <td>
                    <div className="td-station-block">
                      <span className="station-code-highlight font-bold">{st.code}</span>
                      <span className="station-name-sub text-secondary">{st.name}</span>
                    </div>
                  </td>
                  <td>
                    <span className="sector-tag">{st.sector}</span>
                    <div className="elevation-tag text-muted">{st.elevationM}m AMSL</div>
                  </td>
                  <td>
                    <HealthPill status={st.status} size="sm" />
                  </td>
                  <td>
                    <HealthScore score={st.healthScore} size="sm" />
                  </td>
                  <td>
                    <span className={`badge-pill ${st.activeAlertCount > 0 ? 'badge-critical font-bold' : 'badge-neutral'}`}>
                      {st.activeAlertCount}
                    </span>
                  </td>
                  <td>
                    <span className="text-secondary">{st.lastSeen}</span>
                  </td>
                  <td>
                    <span className="text-primary">{st.uptimePct}%</span>
                  </td>
                  <td>
                    <span className="text-primary font-bold">{(st.modelConfidence * 100).toFixed(0)}%</span>
                  </td>
                  <td>
                    <span className={`truncate text-ellipsis-col ${st.status === 'faulty' ? 'text-critical font-bold' : 'text-muted'}`}>
                      {st.lastFault}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions-group" onClick={(e) => e.stopPropagation()}>
                      {onPingStation && (
                        <button 
                          className="btn-table-action" 
                          title="Ping Telemetry Frame"
                          onClick={() => onPingStation(st.id)}
                        >
                          <Activity size={11} />
                        </button>
                      )}
                      {onRequestCalibrate && (
                        <button 
                          className="btn-table-action" 
                          title="Calibrate Sensors"
                          onClick={() => onRequestCalibrate(st)}
                        >
                          <Wrench size={11} />
                        </button>
                      )}
                      <button 
                        className="btn-table-action btn-action-view" 
                        title="View Station Detail"
                        onClick={() => navigate(`/stations/${st.id}`)}
                      >
                        <span>VIEW</span>
                        <ChevronRight size={11} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="table-pagination-footer font-mono flex items-center justify-between" style={{ padding: '12px 16px', borderTop: '1px solid var(--border-subtle)', background: '#f8fafc' }}>
        <span className="pagination-info text-muted" style={{ fontSize: '11px', fontWeight: 600 }}>
          PAGE {page} OF {totalPages} ({stations.length} TOTAL STATIONS)
        </span>
        <div className="pagination-buttons flex items-center gap-1">
          <button 
            className="btn-page" 
            disabled={page <= 1} 
            onClick={() => setPage(p => Math.max(p - 1, 1))}
            style={{ padding: '4px 8px', borderRadius: '4px', background: '#ffffff', border: '1px solid #cbd5e1', cursor: page <= 1 ? 'not-allowed' : 'pointer', color: '#334155', fontSize: '11px', fontWeight: 600 }}
          >
            PREV
          </button>

          {(() => {
            const pages = [];
            if (totalPages <= 7) {
              for (let i = 1; i <= totalPages; i++) pages.push(i);
            } else {
              if (page <= 4) {
                pages.push(1, 2, 3, 4, 5, '...', totalPages);
              } else if (page >= totalPages - 3) {
                pages.push(1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
              } else {
                pages.push(1, '...', page - 1, page, page + 1, '...', totalPages);
              }
            }
            return pages.map((p, i) => (
              p === '...' ? (
                <span key={`ell-${i}`} style={{ padding: '0 4px', color: '#64748b' }}>...</span>
              ) : (
                <button
                  key={p}
                  className={`btn-page-num ${page === p ? 'active' : ''}`}
                  onClick={() => setPage(p as number)}
                  style={{ 
                    padding: '4px 8px', 
                    borderRadius: '4px', 
                    background: page === p ? '#004e99' : '#ffffff', 
                    color: page === p ? '#ffffff' : '#334155',
                    border: '1px solid',
                    borderColor: page === p ? '#004e99' : '#cbd5e1',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 600
                  }}
                >
                  {p}
                </button>
              )
            ));
          })()}

          <button 
            className="btn-page" 
            disabled={page >= totalPages} 
            onClick={() => setPage(p => Math.min(p + 1, totalPages))}
            style={{ padding: '4px 8px', borderRadius: '4px', background: '#ffffff', border: '1px solid #cbd5e1', cursor: page >= totalPages ? 'not-allowed' : 'pointer', color: '#334155', fontSize: '11px', fontWeight: 600 }}
          >
            NEXT
          </button>
        </div>
      </div>
    </div>
  );
};

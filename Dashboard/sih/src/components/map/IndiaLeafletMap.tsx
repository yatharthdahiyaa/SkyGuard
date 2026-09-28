import React, { useEffect, useRef, useState, useCallback } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Station } from '../../types/telemetry';

// We'll load the GeoJSON dynamically
let cachedGeoJSON: any = null;

interface IndiaLeafletMapProps {
  stations: Station[];
  selectedStationId: string | null;
  onSelectStation: (station: Station) => void;
  baseLayer: 'vector' | 'satellite';
  showTopologyLinks: boolean;
  onStateZoom?: (stateName: string | null) => void;
}

const STATUS_COLORS: Record<string, string> = {
  healthy: '#138808',
  degraded: '#ea580c',
  faulty: '#dc2626',
  offline: '#64748b',
};

const INDIA_CENTER: L.LatLngTuple = [22.5, 82.0];
const INDIA_ZOOM = 5;

const TILE_LAYERS = {
  vector: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
  },
};

// Haversine distance in km
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const IndiaLeafletMap: React.FC<IndiaLeafletMapProps> = ({
  stations,
  selectedStationId,
  onSelectStation,
  baseLayer,
  showTopologyLinks,
  onStateZoom,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const stateLayerRef = useRef<L.GeoJSON | null>(null);
  const markersLayerRef = useRef<L.FeatureGroup | null>(null);
  const linksLayerRef = useRef<L.FeatureGroup | null>(null);
  const markerMapRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const [currentStateName, setCurrentStateName] = useState<string | null>(null);
  const [geoLoaded, setGeoLoaded] = useState(false);

  // Initialize the map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: INDIA_CENTER,
      zoom: INDIA_ZOOM,
      minZoom: 4,
      maxZoom: 18,
      zoomControl: false, // We'll use custom controls
      attributionControl: true,
      maxBounds: L.latLngBounds([4, 65], [38, 100]),
      maxBoundsViscosity: 0.8,
    });

    // Add initial tile layer
    const tileConfig = TILE_LAYERS[baseLayer];
    const tileLayer = L.tileLayer(tileConfig.url, {
      attribution: tileConfig.attribution,
      subdomains: 'abc',
    }).addTo(map);

    tileLayerRef.current = tileLayer;
    mapRef.current = map;

    // Create layer groups
    markersLayerRef.current = L.featureGroup().addTo(map);
    linksLayerRef.current = L.featureGroup().addTo(map);

    // Add zoom control to bottom-right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Load GeoJSON
    loadGeoJSON(map);

    const resizeObserver = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
      }
    });
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Load India states GeoJSON
  const loadGeoJSON = async (map: L.Map) => {
    if (cachedGeoJSON) {
      addStateLayer(map, cachedGeoJSON);
      return;
    }

    try {
      // Load from public/data served at root by Vite
      const res = await fetch('/data/india_states.geojson');
      if (res.ok) {
        cachedGeoJSON = await res.json();
        addStateLayer(map, cachedGeoJSON);
        setGeoLoaded(true);
        return;
      }
    } catch {
      // fallback
    }

    // Try fetching from CDN
    try {
      const res = await fetch('https://raw.githubusercontent.com/geohacker/india/master/state/india_state.geojson');
      if (res.ok) {
        cachedGeoJSON = await res.json();
        addStateLayer(map, cachedGeoJSON);
        setGeoLoaded(true);
      }
    } catch (e) {
      console.warn('Failed to load India states GeoJSON:', e);
    }
  };

  const addStateLayer = (map: L.Map, geojson: any) => {
    if (stateLayerRef.current) {
      map.removeLayer(stateLayerRef.current);
    }

    const stateLayer = L.geoJSON(geojson, {
      style: () => ({
        color: baseLayer === 'satellite' ? 'rgba(56, 189, 248, 0.4)' : 'rgba(0, 78, 153, 0.35)',
        weight: 1.5,
        fillColor: baseLayer === 'satellite' ? 'rgba(56, 189, 248, 0.06)' : 'rgba(0, 78, 153, 0.04)',
        fillOpacity: 1,
      }),
      onEachFeature: (feature, layer) => {
        const stateName = feature.properties?.NAME_1 || feature.properties?.name || feature.properties?.ST_NM || feature.properties?.state || 'Unknown';

        // Tooltip showing state name
        layer.bindTooltip(stateName, {
          permanent: false,
          direction: 'center',
          className: 'india-state-tooltip',
        });

        // Hover highlight
        layer.on('mouseover', () => {
          (layer as any).setStyle({
            fillOpacity: 0.15,
            weight: 2.5,
            color: baseLayer === 'satellite' ? 'rgba(56, 189, 248, 0.7)' : 'rgba(0, 78, 153, 0.6)',
          });
        });

        layer.on('mouseout', () => {
          stateLayer.resetStyle(layer);
        });

        // Click to zoom into state
        layer.on('click', () => {
          const bounds = (layer as any).getBounds();
          map.fitBounds(bounds, { padding: [40, 40], maxZoom: 8 });
          setCurrentStateName(stateName);
          if (onStateZoom) onStateZoom(stateName);
        });
      },
    }).addTo(map);

    stateLayerRef.current = stateLayer;
  };

  // Update tile layer when baseLayer changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const tileConfig = TILE_LAYERS[baseLayer];
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }
    tileLayerRef.current = L.tileLayer(tileConfig.url, {
      attribution: tileConfig.attribution,
      subdomains: 'abc',
    }).addTo(map);

    // Re-add GeoJSON with correct style
    if (cachedGeoJSON) {
      addStateLayer(map, cachedGeoJSON);
    }

    // Re-add markers on top
    if (markersLayerRef.current) {
      markersLayerRef.current.bringToFront();
    }
  }, [baseLayer]);

  // Update station markers
  useEffect(() => {
    const map = mapRef.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer) return;

    // Clear existing markers
    markersLayer.clearLayers();
    markerMapRef.current.clear();

    stations.forEach((st) => {
      const color = STATUS_COLORS[st.status] || STATUS_COLORS.offline;
      const isSelected = st.id === selectedStationId;
      const isCritical = st.status === 'faulty';

      // Outer pulse ring for critical/selected stations
      if (isCritical || isSelected) {
        const pulseMarker = L.circleMarker([st.lat, st.lng], {
          radius: isSelected ? 18 : 14,
          color: color,
          weight: 1.5,
          opacity: 0.5,
          fillColor: color,
          fillOpacity: 0.08,
          className: isCritical ? 'leaflet-pulse-marker critical' : 'leaflet-pulse-marker',
          interactive: false,
        });
        markersLayer.addLayer(pulseMarker);
      }

      // Main marker
      const marker = L.circleMarker([st.lat, st.lng], {
        radius: isSelected ? 9 : 6,
        color: color,
        weight: isSelected ? 3 : 2,
        opacity: 1,
        fillColor: isSelected ? color : '#ffffff',
        fillOpacity: isSelected ? 0.9 : 0.85,
        className: `station-leaflet-marker ${isSelected ? 'selected' : ''}`,
      });

      // Tooltip with station code
      marker.bindTooltip(
        `<div class="station-marker-tooltip">
          <div class="smt-code">${st.code}</div>
          <div class="smt-name">${st.name}</div>
          <div class="smt-status ${st.status}">${st.status.toUpperCase()}</div>
        </div>`,
        {
          permanent: isSelected,
          direction: 'right',
          offset: [10, 0],
          className: 'station-tooltip-custom',
        }
      );

      // Popup with details
      marker.bindPopup(
        `<div class="station-leaflet-popup">
          <div class="slp-header">
            <span class="slp-code">${st.code}</span>
            <span class="slp-status-badge ${st.status}">${st.status.toUpperCase()}</span>
          </div>
          <div class="slp-name">${st.name}</div>
          <div class="slp-region">${st.region} · ${st.elevationM}m ASL</div>
          <div class="slp-metrics">
            <div class="slp-metric">
              <span class="slp-label">TEMP</span>
              <span class="slp-value temp">${st.readings.temperature}°C</span>
            </div>
            <div class="slp-metric">
              <span class="slp-label">HUMIDITY</span>
              <span class="slp-value humidity">${st.readings.humidity}%</span>
            </div>
            <div class="slp-metric">
              <span class="slp-label">PRESSURE</span>
              <span class="slp-value pressure">${st.readings.pressure} hPa</span>
            </div>
            <div class="slp-metric">
              <span class="slp-label">HEALTH</span>
              <span class="slp-value ${st.healthScore < 80 ? 'critical' : 'healthy'}">${st.healthScore}/100</span>
            </div>
          </div>
          <div class="slp-coords">LAT ${st.lat.toFixed(3)}°N · LNG ${st.lng.toFixed(3)}°E</div>
          ${st.activeAlertCount > 0 ? `<div class="slp-alert-strip">⚠ ${st.activeAlertCount} ACTIVE ALERT${st.activeAlertCount > 1 ? 'S' : ''}</div>` : ''}
        </div>`,
        {
          maxWidth: 280,
          className: 'station-popup-custom',
        }
      );

      marker.on('click', () => {
        onSelectStation(st);
      });

      markersLayer.addLayer(marker);
      markerMapRef.current.set(st.id, marker);
    });
  }, [stations, selectedStationId, onSelectStation]);

  // Draw nearby station links
  useEffect(() => {
    const map = mapRef.current;
    const linksLayer = linksLayerRef.current;
    if (!map || !linksLayer) return;

    linksLayer.clearLayers();

    if (!showTopologyLinks || !selectedStationId) return;

    const activeStation = stations.find((s) => s.id === selectedStationId);
    if (!activeStation) return;

    // Find nearby stations (within 500km or closest 6)
    const candidates = stations
      .filter((s) => s.id !== selectedStationId)
      .map((s) => ({
        station: s,
        distance: haversineKm(activeStation.lat, activeStation.lng, s.lat, s.lng),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 8);

    candidates.forEach(({ station: stB, distance }) => {
      const isFaultyLink = activeStation.status === 'faulty' || stB.status === 'faulty';
      const linkColor = isFaultyLink ? '#dc2626' : '#004e99';

      const polyline = L.polyline(
        [
          [activeStation.lat, activeStation.lng],
          [stB.lat, stB.lng],
        ],
        {
          color: linkColor,
          weight: 1.8,
          opacity: 0.6,
          dashArray: isFaultyLink ? '6 4' : '4 8',
          className: 'topology-link-line',
        }
      );

      // Distance label at midpoint
      const midLat = (activeStation.lat + stB.lat) / 2;
      const midLng = (activeStation.lng + stB.lng) / 2;
      const distLabel = L.marker([midLat, midLng], {
        icon: L.divIcon({
          className: 'distance-label-icon',
          html: `<span class="distance-label ${isFaultyLink ? 'faulty' : ''}">${distance.toFixed(0)} km</span>`,
          iconSize: [60, 20],
          iconAnchor: [30, 10],
        }),
        interactive: false,
      });

      linksLayer.addLayer(polyline);
      linksLayer.addLayer(distLabel);
    });
  }, [stations, selectedStationId, showTopologyLinks]);

  // Fly to selected station
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedStationId) return;

    const station = stations.find((s) => s.id === selectedStationId);
    if (!station) return;

    const currentZoom = map.getZoom();
    const targetZoom = Math.max(currentZoom, 7);
    map.flyTo([station.lat, station.lng], targetZoom, {
      duration: 0.8,
      easeLinearity: 0.3,
    });
  }, [selectedStationId]);

  // Reset to India view
  const handleResetView = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo(INDIA_CENTER, INDIA_ZOOM, { duration: 0.6 });
    setCurrentStateName(null);
    if (onStateZoom) onStateZoom(null);
  }, [onStateZoom]);

  return (
    <div className="india-leaflet-map-wrapper">
      {/* Breadcrumb navigation */}
      <div className="map-breadcrumbs font-mono">
        <button
          className="breadcrumb-item root"
          onClick={handleResetView}
        >
          🇮🇳 INDIA
        </button>
        {currentStateName && (
          <>
            <span className="breadcrumb-sep">›</span>
            <span className="breadcrumb-item active">{currentStateName.toUpperCase()}</span>
          </>
        )}
        {selectedStationId && (
          <>
            <span className="breadcrumb-sep">›</span>
            <span className="breadcrumb-item station">
              {stations.find((s) => s.id === selectedStationId)?.code || selectedStationId}
            </span>
          </>
        )}
      </div>

      {/* Map container */}
      <div ref={mapContainerRef} className="india-leaflet-map-container" />

      {/* Reset view button */}
      <button
        className="map-reset-india-btn font-mono"
        onClick={handleResetView}
        title="Reset to all-India view"
      >
        FIT INDIA
      </button>
    </div>
  );
};

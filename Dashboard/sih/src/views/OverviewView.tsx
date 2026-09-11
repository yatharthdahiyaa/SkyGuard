import React, { useState, useEffect, useRef } from 'react';
import { Station, AlertEvent } from '../types/telemetry';
import { useRouter } from '../context/RouterContext';
import { 
  Sun, 
  Cloud, 
  CloudSun, 
  CloudRain, 
  Droplets, 
  Thermometer, 
  Eye, 
  MoreHorizontal, 
  MapPin, 
  Sunrise, 
  Sunset,
  ExternalLink,
  Radio,
  Zap,
  RefreshCw,
  CheckCircle2,
  Compass,
  AlertTriangle
} from '../components/icons';
import { 
  LiveWeatherData, 
  fetchLiveWeatherByCoords, 
  detectUserLocation, 
  parseWmoWeatherCode 
} from '../services/liveWeather';

interface OverviewViewProps {
  stations: Station[];
  alerts: AlertEvent[];
  lastUpdated?: string;
  onRefresh?: () => void;
  onSelectStation?: (station: Station) => void;
  onSelectAlert?: (alert: AlertEvent) => void;
  onAcknowledgeAlert?: (alertId: string) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  stations,
  alerts,
  onRefresh
}) => {
  const { navigate } = useRouter();
  
  // Interactive switches and tabs
  const [upcomingTab, setUpcomingTab] = useState<'hourly' | 'weekly'>('hourly');
  const [forecastTab, setForecastTab] = useState<'weekly' | 'monthly'>('weekly');
  const [tempUnit, setTempUnit] = useState<'C' | 'F'>('C');
  const [windUnit, setWindUnit] = useState<'kmh' | 'knots' | 'ms'>('kmh');
  const [stationFilter, setStationFilter] = useState<'all' | 'alerting' | 'nominal'>('all');
  
  // Location selection: 'my_location', 'imd_hq', or station.id
  const [selectedLocationId, setSelectedLocationId] = useState<string>('my_location');
  const [weatherData, setWeatherData] = useState<LiveWeatherData | null>(null);
  const [isLoadingWeather, setIsLoadingWeather] = useState<boolean>(true);
  const [showHeroOptions, setShowHeroOptions] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  const optionsRef = useRef<HTMLDivElement>(null);

  // Close options dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (optionsRef.current && !optionsRef.current.contains(event.target as Node)) {
        setShowHeroOptions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3200);
  };

  // Reference active station from stations array
  const activeStation = stations.find(s => s.id === selectedLocationId) || stations[0] || {
    id: 'AWS_43003',
    code: 'AWS_43003',
    name: 'CSMI Mumbai Airport AWS',
    lat: 19.0897,
    lng: 72.8657,
    status: 'healthy',
    readings: { temperature: 26.5, humidity: 72.0, pressure: 1011.2 }
  };

  // Convert temperature based on active unit switch
  const formatTemp = (celsius: number | undefined) => {
    if (celsius === undefined || isNaN(celsius)) return '--';
    if (tempUnit === 'F') {
      return `${Math.round((celsius * 9) / 5 + 32)}°F`;
    }
    return `${Math.round(celsius)}°C`;
  };

  // Convert wind speed based on active wind unit switch
  const formatWindSpeed = (kmh: number | undefined) => {
    if (kmh === undefined || isNaN(kmh)) return 0;
    if (windUnit === 'knots') return Math.round(kmh * 0.539957);
    if (windUnit === 'ms') return Math.round(kmh / 3.6);
    return Math.round(kmh);
  };
  const windUnitLabel = windUnit === 'knots' ? 'Knots' : windUnit === 'ms' ? 'm/s' : 'Km/h';

  // Fetch live weather based on chosen location (GPS or selected station)
  const loadWeather = async () => {
    try {
      setIsLoadingWeather(true);
      if (selectedLocationId === 'my_location') {
        const userLoc = await detectUserLocation();
        const live = await fetchLiveWeatherByCoords(userLoc.lat, userLoc.lon, userLoc.name);
        setWeatherData(live);
      } else if (selectedLocationId === 'imd_hq') {
        const live = await fetchLiveWeatherByCoords(28.5892, 77.2215, 'IMD HQ Mausam Bhawan, New Delhi');
        setWeatherData(live);
      } else {
        const st = stations.find(s => s.id === selectedLocationId);
        if (st) {
          const live = await fetchLiveWeatherByCoords(st.lat, st.lng, st.name);
          setWeatherData(live);
        } else {
          const live = await fetchLiveWeatherByCoords(19.0897, 72.8657, 'CSMI Mumbai Airport AWS');
          setWeatherData(live);
        }
      }
    } catch (err) {
      console.warn('Live weather fetch error:', err);
    } finally {
      setIsLoadingWeather(false);
    }
  };

  useEffect(() => {
    loadWeather();
    const interval = setInterval(loadWeather, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [selectedLocationId, stations]);

  const handleManualRefresh = () => {
    loadWeather();
    if (onRefresh) onRefresh();
    triggerToast('Observation & station telemetry synchronized with IMD live feed.');
  };

  const renderWeatherIcon = (code: number, size = 26) => {
    const info = parseWmoWeatherCode(code);
    switch (info.iconType) {
      case 'sun':
        return <Sun size={size} className="text-amber-400" />;
      case 'cloud-sun':
        return <CloudSun size={size} className="text-sky-400" />;
      case 'cloud':
        return <Cloud size={size} className="text-slate-300" />;
      case 'cloud-rain':
        return <CloudRain size={size} className="text-sky-300" />;
      case 'zap':
        return <Zap size={size} className="text-amber-500" />;
      default:
        return <CloudSun size={size} className="text-amber-300" />;
    }
  };

  // 4-Week Extended Climatological Range for Monthly forecast view
  const monthlyOutlook = [
    { period: 'Week 1 (Current)', condition: 'Monsoonal Convection', prob: '85% Precip', min: 24, max: 32, weatherCode: 63, fillLeft: '35%', fillWidth: '40%' },
    { period: 'Week 2 (Outlook)', condition: 'Normal Synoptic Rainfall', prob: '62% Precip', min: 23, max: 31, weatherCode: 2, fillLeft: '30%', fillWidth: '45%' },
    { period: 'Week 3 (Outlook)', condition: 'Sub-Tropical Trough', prob: '45% Precip', min: 22, max: 30, weatherCode: 3, fillLeft: '25%', fillWidth: '40%' },
    { period: 'Week 4 (Climatology)', condition: 'Normal Seasonal Range', prob: '30% Precip', min: 21, max: 29, weatherCode: 1, fillLeft: '20%', fillWidth: '40%' }
  ];

  // Filtered station nodes for bottom network radar
  const displayedStations = stations.filter(st => {
    if (stationFilter === 'alerting') return st.status === 'faulty' || st.status === 'degraded';
    if (stationFilter === 'nominal') return st.status === 'healthy';
    return true;
  });

  return (
    <div className="view-container overview-reference-dashboard">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="mb-3 px-4 py-2.5 bg-sky-950/90 border border-sky-500/40 text-sky-200 text-xs rounded-lg flex items-center justify-between shadow-lg font-sans">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={15} className="text-emerald-400 flex-shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-slate-400 hover:text-white text-xs ml-3 font-bold">
            ✕
          </button>
        </div>
      )}

      <div className="dashboard-reference-grid">
        
        {/* ROW 1: Current Weather Hero Card + Upcoming Weather Strip */}
        <div className="dash-row-top">
          {/* 1.1 Current Weather Hero Card */}
          <div className="card-weather-hero">
            <div className="hero-card-header" style={{ position: 'relative', zIndex: 10 }}>
              {/* Tier 1: Title & Action Controls */}
              <div className="hero-title-controls-line">
                <div className="flex items-center gap-2">
                  <span className="card-section-title">Live Weather Observation</span>
                  {isLoadingWeather && (
                    <RefreshCw size={13} className="animate-spin text-[#ea580c]" />
                  )}
                </div>

                <div className="flex items-center gap-2" ref={optionsRef}>
                  {/* Temperature Unit Toggle Switch */}
                  <div className="pill-toggle-switch" title="Toggle Temperature Unit">
                    <button 
                      className={`pill-toggle-btn ${tempUnit === 'C' ? 'active' : ''}`}
                      onClick={() => setTempUnit('C')}
                    >
                      °C
                    </button>
                    <button 
                      className={`pill-toggle-btn ${tempUnit === 'F' ? 'active' : ''}`}
                      onClick={() => setTempUnit('F')}
                    >
                      °F
                    </button>
                  </div>

                  {/* Refresh Button */}
                  <button 
                    className="card-options-btn" 
                    title="Synchronize Live Telemetry"
                    onClick={handleManualRefresh}
                  >
                    <RefreshCw size={15} className={isLoadingWeather ? 'animate-spin text-[#ea580c]' : 'text-slate-500 hover:text-[#004e99]'} />
                  </button>

                  {/* Options Menu Button */}
                  <button 
                    className="card-options-btn" 
                    title="Observation Actions"
                    onClick={() => setShowHeroOptions(prev => !prev)}
                  >
                    <MoreHorizontal size={18} />
                  </button>

                  {/* Hero Options Dropdown Popover */}
                  {showHeroOptions && (
                    <div className="hero-popover-menu">
                      <button 
                        onClick={() => { setSelectedLocationId('my_location'); setShowHeroOptions(false); triggerToast('Switching to live GPS telemetry detection...'); }}
                        className="hero-popover-btn"
                      >
                        <MapPin size={14} className="text-[#ea580c]" />
                        <span>Detect My GPS Coordinates</span>
                      </button>
                      <button 
                        onClick={() => { setSelectedLocationId('imd_hq'); setShowHeroOptions(false); triggerToast('Centered on IMD National HQ, New Delhi.'); }}
                        className="hero-popover-btn"
                      >
                        <Radio size={14} className="text-[#004e99]" />
                        <span>IMD HQ Mausam Bhawan</span>
                      </button>
                      <button 
                        onClick={() => {
                          const synop = `SYNOP 42182 ${new Date().getUTCDate()}${String(new Date().getUTCHours()).padStart(2, '0')}4 41590 10${Math.round(weatherData?.temperature ?? 26)}0 20${Math.round(weatherData?.humidity ?? 70)}0 40112 52008`;
                          navigator.clipboard?.writeText(synop);
                          setShowHeroOptions(false);
                          triggerToast('Copied IMD SYNOP METAR telegram to clipboard.');
                        }}
                        className="hero-popover-btn"
                      >
                        <ExternalLink size={14} className="text-[#138808]" />
                        <span>Copy WMO SYNOP Code</span>
                      </button>
                      <div style={{ height: 1, background: '#e2e8f0', margin: '3px 0' }} />
                      <button 
                        onClick={() => { handleManualRefresh(); setShowHeroOptions(false); }}
                        className="hero-popover-btn"
                      >
                        <RefreshCw size={14} className="text-[#ea580c]" />
                        <span>Force Re-fetch Feed</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Tier 2: Dedicated Location Dropdown Bar (Zero Overlap) */}
              <div className="hero-location-dropdown-line">
                <MapPin size={15} className="text-[#ea580c]" style={{ flexShrink: 0 }} />
                <select
                  value={selectedLocationId}
                  onChange={(e) => setSelectedLocationId(e.target.value)}
                  className="hero-location-select"
                  title="Select Observation Coordinate / AWS Station"
                >
                  <option value="my_location">📍 My Live GPS Location</option>
                  <option value="imd_hq">🏛️ IMD HQ (Mausam Bhawan, New Delhi)</option>
                  <optgroup label="Registered AWS Observatories">
                    {stations.map(st => (
                      <option key={st.id} value={st.id}>
                        📡 {st.name} ({st.code})
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </div>

            {/* Weather Backdrop - Flowed naturally below header row */}
            <div className="weather-hero-backdrop">
              <div className="hero-clouds-texture" />
              
              <div className="hero-header-line">
                <div className="hero-location-pill">
                  <MapPin size={13} className="text-amber-300" />
                  <span className="font-semibold text-white">
                    {weatherData ? weatherData.locationName : 'Acquiring GPS / Satellite Mesh...'}
                  </span>
                </div>
                <span className="hero-time-text font-mono">
                  {weatherData ? weatherData.timestampStr : new Date().toLocaleTimeString()} · IST
                </span>
              </div>

              <div className="hero-weather-body">
                <div className="flex items-center gap-4">
                  <div className="hero-weather-icon">
                    {renderWeatherIcon(weatherData?.weatherCode ?? 2, 56)}
                  </div>
                  <div>
                    <div className="hero-temp-large font-bold">
                      {weatherData ? formatTemp(weatherData.temperature) : formatTemp(26.5)}
                    </div>
                    <div className="hero-condition-sub text-amber-200 font-medium">
                      {weatherData?.conditionText || 'Live Telemetry Active'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="hero-footer-telemetry flex items-center justify-between text-xs opacity-95 pt-2.5 border-t border-white/20 font-sans">
                <span className="font-mono text-slate-200">
                  {selectedLocationId === 'my_location' 
                    ? `GPS: ${weatherData ? `${weatherData.latitude.toFixed(3)}°N, ${weatherData.longitude.toFixed(3)}°E` : 'Auto-detected'}`
                    : `Station Node: ${activeStation.code}`}
                </span>
                <span className="font-mono text-slate-200">
                  Pressure: <strong>{weatherData ? `${weatherData.pressure} hPa` : '1012.0 hPa'}</strong> · <span className="text-emerald-300">NOMINAL</span>
                </span>
              </div>
            </div>
          </div>

          {/* 1.2 Upcoming Weather Strip (Interactive Hourly vs Weekly toggle) */}
          <div className="card-upcoming-weather">
            <div className="card-title-row">
              <div className="flex items-center gap-2">
                <span className="card-section-title">Upcoming Forecast</span>
                <span className="text-[11px] px-2 py-0.5 rounded bg-blue-50 text-[#004e99] border border-blue-200 font-mono font-semibold">
                  {upcomingTab === 'hourly' ? '6-HOUR SYNOPSIS' : '7-DAY OUTLOOK'}
                </span>
              </div>
              <div className="pill-toggle-switch">
                <button 
                  className={`pill-toggle-btn ${upcomingTab === 'hourly' ? 'active' : ''}`}
                  onClick={() => setUpcomingTab('hourly')}
                  title="Switch to 6-Hour Forecast"
                >
                  Hourly
                </button>
                <button 
                  className={`pill-toggle-btn ${upcomingTab === 'weekly' ? 'active' : ''}`}
                  onClick={() => setUpcomingTab('weekly')}
                  title="Switch to 7-Day Forecast"
                >
                  Weekly
                </button>
              </div>
            </div>

            <div className="upcoming-hourly-strip">
              {upcomingTab === 'hourly' ? (
                // HOURLY VIEW
                weatherData && weatherData.hourly.length > 0 ? (
                  weatherData.hourly.map((item, idx) => (
                    <div key={idx} className="hourly-mini-card">
                      <span className="hourly-condition-name truncate w-full" title={item.condition}>
                        {item.condition}
                      </span>
                      <div className="hourly-icon-box">
                        {renderWeatherIcon(item.weatherCode, 26)}
                      </div>
                      <span className="hourly-temp-value">
                        {formatTemp(item.tempNum)}
                      </span>
                      <span className="hourly-time-label font-mono">
                        {item.time}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-xs text-secondary font-mono col-span-6 text-center">
                    Ingesting live hourly forecast vectors...
                  </div>
                )
              ) : (
                // WEEKLY STRIP VIEW
                weatherData && weatherData.daily.length > 0 ? (
                  weatherData.daily.slice(0, 6).map((item, idx) => (
                    <div key={idx} className="hourly-mini-card border-blue-100 hover:border-[#ff9933]">
                      <span className="hourly-condition-name font-bold text-[#ea580c]">
                        {item.day.slice(0, 3)}
                      </span>
                      <div className="hourly-icon-box">
                        {renderWeatherIcon(item.weatherCode, 26)}
                      </div>
                      <span className="hourly-temp-value text-slate-800">
                        {formatTemp(item.max)}
                      </span>
                      <span className="hourly-time-label font-mono text-slate-500 font-medium">
                        {formatTemp(item.min)} min
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-xs text-secondary font-mono col-span-6 text-center">
                    Ingesting multi-day synoptic projections...
                  </div>
                )
              )}
            </div>
          </div>
        </div>

        {/* ROW 2: Forecast + Wind Dial + Sunrise Arc + Atmospheric Highlights */}
        <div className="dash-row-mid">
          
          {/* 2.1 Forecast Weekly / Monthly Card */}
          <div className="card-forecast-slider">
            <div className="card-title-row">
              <span className="card-section-title">
                {forecastTab === 'weekly' ? '7-Day Synoptic Forecast' : 'Extended Range Outlook'}
              </span>
              <div className="pill-toggle-switch">
                <button 
                  className={`pill-toggle-btn ${forecastTab === 'weekly' ? 'active' : ''}`}
                  onClick={() => setForecastTab('weekly')}
                  title="7-Day Synoptic Observations"
                >
                  Weekly
                </button>
                <button 
                  className={`pill-toggle-btn ${forecastTab === 'monthly' ? 'active' : ''}`}
                  onClick={() => setForecastTab('monthly')}
                  title="4-Week IMD Climatology Projection"
                >
                  Monthly
                </button>
              </div>
            </div>

            <div className="forecast-days-list">
              {forecastTab === 'weekly' ? (
                // 7-DAY SYNOPTIC VIEW
                weatherData && weatherData.daily.length > 0 ? (
                  weatherData.daily.map((row, idx) => (
                    <div key={idx} className="forecast-day-row">
                      <span className="day-label font-sans font-medium">{row.day}</span>
                      <div className="day-weather-icon">
                        {renderWeatherIcon(row.weatherCode, 18)}
                      </div>
                      <span className="day-temp-min font-mono">{formatTemp(row.min)}</span>
                      <div className="day-range-slider-bar">
                        <div 
                          className="range-slider-fill"
                          style={{ 
                            left: row.fillLeft, 
                            width: row.fillWidth,
                            background: 'linear-gradient(90deg, #0284c7, #f59e0b)' 
                          }}
                        />
                      </div>
                      <span className="day-temp-max font-mono font-bold">{formatTemp(row.max)}</span>
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-xs text-secondary font-mono">
                    Loading multi-day meteorology forecast...
                  </div>
                )
              ) : (
                // 4-WEEK EXTENDED CLIMATOLOGICAL OUTLOOK
                monthlyOutlook.map((item, idx) => (
                  <div key={idx} className="forecast-day-row py-1">
                    <div className="flex flex-col w-[110px]">
                      <span className="text-xs font-bold text-slate-800">{item.period}</span>
                      <span className="text-[10px] text-[#ea580c] font-mono font-semibold">{item.prob}</span>
                    </div>
                    <div className="day-weather-icon">
                      {renderWeatherIcon(item.weatherCode, 18)}
                    </div>
                    <span className="day-temp-min font-mono">{formatTemp(item.min)}</span>
                    <div className="day-range-slider-bar">
                      <div 
                        className="range-slider-fill"
                        style={{ 
                          left: item.fillLeft, 
                          width: item.fillWidth,
                          background: 'linear-gradient(90deg, #138808, #ff9933)' 
                        }}
                      />
                    </div>
                    <span className="day-temp-max font-mono font-bold">{formatTemp(item.max)}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 2.2 Wind Compass Dial Card (With interactive unit cycle) */}
          <div className="card-wind-dial">
            <div className="card-title-row">
              <span className="card-section-title">Wind Vector & Bearing</span>
              {/* Unit Toggle Button */}
              <button 
                className="text-[11px] px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-[#004e99] font-mono hover:bg-blue-100 transition-colors font-semibold"
                onClick={() => setWindUnit(prev => prev === 'kmh' ? 'knots' : prev === 'knots' ? 'ms' : 'kmh')}
                title="Click to cycle units: Km/h → Knots → m/s"
              >
                Unit: {windUnitLabel}
              </button>
            </div>

            <div className="compass-container">
              <div className="compass-rose border-slate-300">
                <span className="compass-point point-n text-[#ea580c] font-bold">N</span>
                <span className="compass-point point-s text-slate-500 font-semibold">S</span>
                <span className="compass-point point-w text-slate-500 font-semibold">W</span>
                <span className="compass-point point-e text-slate-500 font-semibold">E</span>

                {/* Dual-tone pointer needle: Saffron North Arrow, Azure South Tail */}
                <svg 
                  className="compass-arrow-needle" 
                  viewBox="0 0 140 140"
                  style={{
                    transform: `rotate(${weatherData?.windDirectionDeg ?? 45}deg)`,
                    transformOrigin: 'center center',
                    transition: 'transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)'
                  }}
                >
                  {/* North pointer (Saffron / Orange) */}
                  <polygon points="70,10 80,42 60,42" fill="#ea580c" />
                  {/* South pointer (Navy / Ocean Blue) */}
                  <polygon points="70,130 78,98 62,98" fill="#004e99" />
                  <circle cx="70" cy="70" r="4.5" fill="#ffffff" stroke="#003366" strokeWidth="1" />
                </svg>

                {/* Center Disc with converted wind speed */}
                <div 
                  className="compass-center-disc cursor-pointer hover:bg-blue-50/70 border border-slate-200 shadow-sm transition-colors"
                  onClick={() => setWindUnit(prev => prev === 'kmh' ? 'knots' : prev === 'knots' ? 'ms' : 'kmh')}
                  title="Click to toggle wind unit"
                >
                  <span className="disc-wind-val font-mono font-bold text-slate-900">
                    {weatherData ? formatWindSpeed(weatherData.windSpeedKmH) : 18}
                  </span>
                  <span className="disc-wind-unit font-mono text-[#ea580c] font-bold">
                    {windUnitLabel}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="text-center text-xs text-secondary font-mono mt-1 flex items-center justify-center gap-2">
              <Compass size={13} className="text-[#ea580c]" />
              <span>Bearing: <strong>{weatherData ? `${weatherData.windDirectionDeg}°` : '315°'}</strong></span>
              <span className="text-slate-400">·</span>
              <span className="text-[#004e99] font-bold">
                {weatherData ? ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(weatherData.windDirectionDeg / 22.5) % 16] : 'NW'}
              </span>
            </div>
          </div>

          {/* 2.3 Sunrise & Sunset Solar Arc */}
          <div className="card-solar-arc">
            <div className="card-title-row">
              <span className="card-section-title">Solar Invariant Arc</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-mono font-bold">
                DIURNAL CYCLE
              </span>
            </div>

            <div className="solar-arc-badge-time font-mono text-[#003366] font-semibold">
              Solar Noon: 12:35 PM
            </div>

            <div className="solar-arc-viewport">
              <svg viewBox="0 0 200 90" className="w-full h-full">
                <defs>
                  <linearGradient id="sun-arc-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ff9933" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#ff9933" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                <path d="M 15 85 Q 100 5 185 85 Z" fill="url(#sun-arc-grad)" />
                <path d="M 15 85 Q 100 5 185 85" fill="none" stroke="#ca8a04" strokeWidth="2" strokeDasharray="4 3" />
                <path d="M 15 85 Q 55 45 100 25" fill="none" stroke="#ff9933" strokeWidth="3" />
                <circle cx="100" cy="25" r="9" fill="#ea580c" />
                <circle cx="100" cy="25" r="5" fill="#fef3c7" />
              </svg>
            </div>

            <div className="solar-times-footer font-sans">
              <div className="solar-time-item">
                <Sunrise size={19} className="text-[#ea580c]" />
                <div>
                  <div className="solar-time-label">Sunrise</div>
                  <div className="solar-time-val font-mono font-bold text-slate-800">
                    {weatherData ? weatherData.sunriseTime : '06:22 AM'}
                  </div>
                </div>
              </div>
              <div className="solar-time-item">
                <Sunset size={19} className="text-amber-600" />
                <div>
                  <div className="solar-time-label">Sunset</div>
                  <div className="solar-time-val font-mono font-bold text-slate-800">
                    {weatherData ? weatherData.sunsetTime : '06:42 PM'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 2.4 Weather / Telemetry Highlights (IMD Palette) */}
          <div className="card-weather-highlights">
            <div className="card-title-row">
              <span className="card-section-title">Atmospheric Highlights</span>
              <span className="text-[10px] text-slate-400 font-mono">SURFACE LEVEL</span>
            </div>

            <div className="highlight-item">
              <div className="highlight-icon-wrap icon-blue">
                <Droplets size={20} />
              </div>
              <div className="highlight-meta">
                <span className="highlight-title">Relative Humidity</span>
                <span className="highlight-desc font-mono">
                  {weatherData ? `${weatherData.humidity}% Moisture` : '72% Moisture'}
                </span>
              </div>
            </div>

            <div className="highlight-item">
              <div className="highlight-icon-wrap icon-cyan">
                <Thermometer size={20} />
              </div>
              <div className="highlight-meta">
                <span className="highlight-title">Feels Like (Thermal)</span>
                <span className="highlight-desc font-mono">
                  {weatherData ? `${formatTemp(weatherData.feelsLike)} Apparent` : formatTemp(26.5)}
                </span>
              </div>
            </div>

            <div className="highlight-item">
              <div className="highlight-icon-wrap icon-purple">
                <Eye size={20} />
              </div>
              <div className="highlight-meta">
                <span className="highlight-title">Barometric Pressure</span>
                <span className="highlight-desc font-mono">
                  {weatherData ? `${weatherData.pressure} hPa QNH` : '1011.2 hPa'}
                </span>
              </div>
            </div>

            <div className="highlight-item">
              <div className="highlight-icon-wrap icon-amber">
                <Sun size={20} />
              </div>
              <div className="highlight-meta">
                <span className="highlight-title">UV Solar Radiation</span>
                <span className="highlight-desc font-mono">
                  {weatherData ? `Index ${weatherData.uvIndex} (Peak)` : 'Index 6'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ROW 3: Regional AWS Observatory Radar Grid with Filter Switch */}
        <div className="dash-row-bottom">
          <div className="card-global-map">
            <div className="card-title-row flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="card-section-title">National AWS Telemetry Network</span>
                <span className="text-xs text-secondary font-mono">· IMD REGIONAL STATIONS</span>
              </div>

              {/* Station Filter Switch */}
              <div className="flex items-center gap-3">
                <div className="pill-toggle-switch">
                  <button 
                    className={`pill-toggle-btn ${stationFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setStationFilter('all')}
                  >
                    All Nodes ({stations.length})
                  </button>
                  <button 
                    className={`pill-toggle-btn ${stationFilter === 'alerting' ? 'active' : ''}`}
                    onClick={() => setStationFilter('alerting')}
                  >
                    🔴 Alerts ({stations.filter(s => s.status === 'faulty' || s.status === 'degraded').length})
                  </button>
                  <button 
                    className={`pill-toggle-btn ${stationFilter === 'nominal' ? 'active' : ''}`}
                    onClick={() => setStationFilter('nominal')}
                  >
                    🟢 Nominal ({stations.filter(s => s.status === 'healthy').length})
                  </button>
                </div>

                <button 
                  onClick={() => navigate('/map')} 
                  className="btn-secondary text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-blue-200 text-[#004e99] hover:bg-blue-50 transition-colors font-semibold shadow-sm"
                >
                  <span>FULLSCREEN RADAR</span>
                  <ExternalLink size={13} />
                </button>
              </div>
            </div>

            {/* Grid of registered stations with live readings */}
            <div className="dash-stations-container">
              <div className="dash-stations-grid">
                {displayedStations.slice(0, 8).map((st) => {
                  const isFaulty = st.status === 'faulty';
                  const isDegraded = st.status === 'degraded';
                  
                  // Official IMD 4-Stage Warning Color Mapping
                  const badgeClass = isFaulty ? 'badge-imd-red' : isDegraded ? 'badge-imd-orange' : 'badge-imd-green';
                  const warningLabel = isFaulty ? 'WARNING (RED)' : isDegraded ? 'ALERT (ORANGE)' : 'NOMINAL (GREEN)';

                  return (
                    <div
                      key={st.id}
                      onClick={() => navigate(`/stations/${st.id}`)}
                      className="station-radar-card"
                    >
                      <div className="station-radar-header">
                        <span className="station-code-text">
                          {st.code}
                        </span>
                        <span className={badgeClass}>
                          {warningLabel}
                        </span>
                      </div>
                      <div className="station-name-text" title={st.name}>
                        {st.name}
                      </div>
                      <div className="station-metrics-row">
                        <span>Temp: <strong className="station-metric-val">{formatTemp(st.readings?.temperature ?? 26.5)}</strong></span>
                        <span>RH: <strong className="station-metric-val">{st.readings?.humidity ?? 70}%</strong></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default OverviewView;

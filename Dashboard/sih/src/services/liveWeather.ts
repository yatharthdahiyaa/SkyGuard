/**
 * SkyGuard Live Weather Service
 * Integrates live global meteorological observations & forecasts from Open-Meteo (WMO standard).
 * Fetches real-time temperature, humidity, pressure, wind velocity & vector, UV index, solar arc times,
 * and 7-day multi-day forecasts based on GPS location or AWS station coordinates.
 */

export interface HourlyForecastItem {
  time: string;
  temp: string;
  tempNum: number;
  condition: string;
  weatherCode: number;
}

export interface DailyForecastItem {
  day: string;
  min: number;
  max: number;
  condition: string;
  weatherCode: number;
  fillLeft: string;
  fillWidth: string;
}

export interface LiveWeatherData {
  locationName: string;
  latitude: number;
  longitude: number;
  timestampStr: string;
  temperature: number;
  feelsLike: number;
  humidity: number;
  pressure: number;
  windSpeedKmH: number;
  windDirectionDeg: number;
  weatherCode: number;
  conditionText: string;
  visibilityKm: number;
  uvIndex: number;
  sunriseTime: string;
  sunsetTime: string;
  hourly: HourlyForecastItem[];
  daily: DailyForecastItem[];
}

export function parseWmoWeatherCode(code: number): { text: string; color: string; iconType: 'sun' | 'cloud-sun' | 'cloud' | 'cloud-rain' | 'cloud-snow' | 'zap' } {
  switch (code) {
    case 0:
      return { text: 'Clear Sky', color: '#f59e0b', iconType: 'sun' };
    case 1:
      return { text: 'Mainly Clear', color: '#f59e0b', iconType: 'sun' };
    case 2:
      return { text: 'Partly Cloudy', color: '#38bdf8', iconType: 'cloud-sun' };
    case 3:
      return { text: 'Overcast', color: '#94a3b8', iconType: 'cloud' };
    case 45:
    case 48:
      return { text: 'Foggy / Haze', color: '#94a3b8', iconType: 'cloud' };
    case 51:
    case 53:
    case 55:
      return { text: 'Drizzle', color: '#60a5fa', iconType: 'cloud-rain' };
    case 61:
    case 63:
      return { text: 'Moderate Rain', color: '#3b82f6', iconType: 'cloud-rain' };
    case 65:
      return { text: 'Heavy Rain', color: '#2563eb', iconType: 'cloud-rain' };
    case 71:
    case 73:
    case 75:
      return { text: 'Snow Fall', color: '#93c5fd', iconType: 'cloud-snow' };
    case 80:
    case 81:
    case 82:
      return { text: 'Rain Showers', color: '#38bdf8', iconType: 'cloud-rain' };
    case 95:
    case 96:
    case 99:
      return { text: 'Thunderstorm', color: '#ea580c', iconType: 'zap' };
    default:
      return { text: 'Fair Weather', color: '#38bdf8', iconType: 'cloud-sun' };
  }
}

function getWindCompassDirection(degrees: number): string {
  const sectors = ['North', 'North-Northeast', 'Northeast', 'East-Northeast', 'East', 'East-Southeast', 'Southeast', 'South-Southeast', 'South', 'South-Southwest', 'Southwest', 'West-Southwest', 'West', 'West-Northwest', 'Northwest', 'North-Northwest'];
  const index = Math.round((degrees % 360) / 22.5) % 16;
  return sectors[index];
}

export async function fetchLiveWeatherByCoords(
  lat: number,
  lon: number,
  fallbackName?: string
): Promise<LiveWeatherData> {
  // 1. Fetch live meteorological observations & forecast from Open-Meteo
  const openMeteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max&timezone=auto&forecast_days=7`;
  
  const res = await fetch(openMeteoUrl);
  if (!res.ok) {
    throw new Error(`Open-Meteo API response status ${res.status}`);
  }
  const data = await res.json();

  // 2. Reverse geocode location name
  let locationName = fallbackName || `${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E`;
  try {
    const geoRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}`, { signal: AbortSignal.timeout(3000) });
    if (geoRes.ok) {
      const geo = await geoRes.json();
      const place = geo.city || geo.locality || geo.principalSubdivision;
      const state = geo.principalSubdivision ? `, ${geo.principalSubdivision}` : '';
      if (place) {
        locationName = `${place}${state}`;
      }
    }
  } catch {
    // If geocoding fails or times out, fallback name remains
  }

  const current = data.current || {};
  const daily = data.daily || {};
  const hourly = data.hourly || {};

  const weatherCode = current.weather_code ?? 2;
  const wmo = parseWmoWeatherCode(weatherCode);
  const windDirName = getWindCompassDirection(current.wind_direction_10m ?? 0);
  const conditionText = `${wmo.text} · ${windDirName}, ${Math.round(current.wind_speed_10m ?? 0)} Km/h`;

  // Parse sunrise & sunset
  let sunriseStr = '06:00 AM';
  let sunsetStr = '06:30 PM';
  if (Array.isArray(daily.sunrise) && daily.sunrise[0]) {
    const sr = new Date(daily.sunrise[0]);
    sunriseStr = sr.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (Array.isArray(daily.sunset) && daily.sunset[0]) {
    const ss = new Date(daily.sunset[0]);
    sunsetStr = ss.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // Parse upcoming 6 hours
  const hourlyList: HourlyForecastItem[] = [];
  if (Array.isArray(hourly.time) && Array.isArray(hourly.temperature_2m)) {
    const now = new Date();
    const currentHourIndex = hourly.time.findIndex((t: string) => new Date(t) >= now);
    const startIdx = currentHourIndex >= 0 ? currentHourIndex : 0;
    
    for (let i = startIdx; i < Math.min(startIdx + 6, hourly.time.length); i++) {
      const itemTime = new Date(hourly.time[i]);
      const hourCode = hourly.weather_code?.[i] ?? 0;
      hourlyList.push({
        time: itemTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        temp: `${Math.round(hourly.temperature_2m[i])}°C`,
        tempNum: Math.round(hourly.temperature_2m[i]),
        condition: parseWmoWeatherCode(hourCode).text,
        weatherCode: hourCode
      });
    }
  }

  // Parse 7 days forecast
  const dailyList: DailyForecastItem[] = [];
  if (Array.isArray(daily.time) && Array.isArray(daily.temperature_2m_max)) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const minAll = Math.min(...(daily.temperature_2m_min || [20]));
    const maxAll = Math.max(...(daily.temperature_2m_max || [35]));
    const span = Math.max(maxAll - minAll, 1);

    for (let i = 0; i < Math.min(7, daily.time.length); i++) {
      const dDate = new Date(daily.time[i] + 'T00:00:00');
      const dayName = i === 0 ? 'Today' : days[dDate.getDay()];
      const dMin = Math.round(daily.temperature_2m_min[i]);
      const dMax = Math.round(daily.temperature_2m_max[i]);
      const dCode = daily.weather_code?.[i] ?? 0;
      
      const leftPct = Math.round(((dMin - minAll) / span) * 60) + 10;
      const widthPct = Math.max(Math.round(((dMax - dMin) / span) * 80), 20);

      dailyList.push({
        day: dayName,
        min: dMin,
        max: dMax,
        condition: parseWmoWeatherCode(dCode).text,
        weatherCode: dCode,
        fillLeft: `${leftPct}%`,
        fillWidth: `${widthPct}%`
      });
    }
  }

  const nowFormatted = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }) + ' · ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return {
    locationName,
    latitude: lat,
    longitude: lon,
    timestampStr: nowFormatted,
    temperature: Number((current.temperature_2m ?? 26.0).toFixed(1)),
    feelsLike: Number((current.apparent_temperature ?? current.temperature_2m ?? 26.0).toFixed(1)),
    humidity: Math.round(current.relative_humidity_2m ?? 70),
    pressure: Number((current.surface_pressure ?? 1012.0).toFixed(1)),
    windSpeedKmH: Math.round(current.wind_speed_10m ?? 15),
    windDirectionDeg: Math.round(current.wind_direction_10m ?? 0),
    weatherCode,
    conditionText,
    visibilityKm: 10,
    uvIndex: Math.round(daily.uv_index_max?.[0] ?? 6),
    sunriseTime: sunriseStr,
    sunsetTime: sunsetStr,
    hourly: hourlyList,
    daily: dailyList
  };
}

/**
 * Attempts to detect the user's live physical GPS location via browser Geolocation API.
 * Defaults to CSMI Mumbai International Airport AWS if permissions are withheld.
 */
export async function detectUserLocation(): Promise<{ lat: number; lon: number; name: string }> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve({ lat: 19.0897, lon: 72.8657, name: 'Mumbai Airport AWS' });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          name: 'My GPS Location'
        });
      },
      () => {
        // Fallback to Mumbai Regional Hub if denied or error
        resolve({ lat: 19.0897, lon: 72.8657, name: 'CSMI Mumbai Airport AWS' });
      },
      { timeout: 5000, enableHighAccuracy: false }
    );
  });
}

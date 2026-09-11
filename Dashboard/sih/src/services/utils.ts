/**
 * SkyGuard Core - Meteorological & Thermodynamic Utilities
 * Pure physics calculations adhering to August-Roche-Magnus formulations.
 */

/**
 * Computes dew-point temperature (Td in °C) from ambient dry-bulb temperature (T in °C)
 * and Relative Humidity (RH in %).
 * 
 * Based on the August-Roche-Magnus psychrometric relationship:
 * a = 17.67, b = 243.5 °C, c = 6.112 hPa
 */
export function calculateMagnusDewPoint(temp: number, rh: number): number {
  if (temp === undefined || rh === undefined || isNaN(temp) || isNaN(rh)) {
    return 0.0;
  }

  // Climatological bounds check
  if (rh <= 0.0) return -50.0;
  if (temp < -80.0 || temp > 100.0) return -50.0;

  const a = 17.67;
  const b = 243.5;
  const c = 6.112;

  const rhClamped = Math.min(Math.max(rh, 0.01), 100.0);
  const es = c * Math.exp((a * temp) / (b + temp));
  const e = es * (rhClamped / 100.0);
  const ratio = Math.max(e / c, 1e-9);
  const logVal = Math.log(ratio);
  const denom = a - logVal;

  if (Math.abs(denom) < 1e-6) {
    return -50.0;
  }

  const td = (b * logVal) / denom;
  return Number(td.toFixed(1));
}

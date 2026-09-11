"""
Atmospheric Thermodynamics & Psychrometric Equations for SkyGuard AI
Adheres to WMO-No. 8 (Guide to Meteorological Instruments and Methods of Observation)
and India Meteorological Department (IMD) standards.
"""

import numpy as np
import pandas as pd
from typing import Union, Tuple


class AtmosphericThermodynamics:
    """
    Static methods for atmospheric thermodynamics, vapor pressure, dew point,
    and psychrometric invariant consistency checks.
    """

    # Constants
    MAGNUS_C1: float = 6.112      # Saturation vapor pressure at 0°C (hPa)
    MAGNUS_A1: float = 17.67      # Magnus constant for water (dimensionless)
    MAGNUS_B1: float = 243.5      # Magnus temperature constant (°C)
    LAPSE_RATE: float = 0.0065    # Standard tropospheric lapse rate (°C/m)
    GAS_CONSTANT_DRY: float = 287.058 # Specific gas constant for dry air (J/(kg·K))
    GRAVITY: float = 9.80665      # Standard acceleration of gravity (m/s²)
    P0_STANDARD: float = 1013.25  # Standard sea-level pressure (hPa)

    @staticmethod
    def saturation_vapor_pressure(temperature_c: Union[float, np.ndarray, pd.Series]) -> Union[float, np.ndarray, pd.Series]:
        r"""
        Computes saturation vapor pressure over liquid water using the August-Roche-Magnus formula:
        .. math::
            e_s(T) = 6.112 \cdot \exp\left(\frac{17.67 \cdot T}{T + 243.5}\right) \quad [\text{hPa}]

        Valid for -45°C <= T <= 60°C with error < 0.4%.
        """
        temp = np.asarray(temperature_c, dtype=float)
        es = AtmosphericThermodynamics.MAGNUS_C1 * np.exp(
            (AtmosphericThermodynamics.MAGNUS_A1 * temp) / (temp + AtmosphericThermodynamics.MAGNUS_B1)
        )
        if isinstance(temperature_c, (float, int)):
            return float(es)
        if isinstance(temperature_c, pd.Series):
            return pd.Series(es, index=temperature_c.index)
        return es

    @staticmethod
    def actual_vapor_pressure(dewpoint_c: Union[float, np.ndarray, pd.Series]) -> Union[float, np.ndarray, pd.Series]:
        r"""
        Computes actual vapor pressure e from Dew Point Td:
        .. math::
            e(T_d) = 6.112 \cdot \exp\left(\frac{17.67 \cdot T_d}{T_d + 243.5}\right) \quad [\text{hPa}]
        """
        return AtmosphericThermodynamics.saturation_vapor_pressure(dewpoint_c)

    @staticmethod
    def relative_humidity_from_dewpoint(
        temperature_c: Union[float, np.ndarray, pd.Series],
        dewpoint_c: Union[float, np.ndarray, pd.Series],
        clip_bounds: Tuple[float, float] = (1.0, 100.0)
    ) -> Union[float, np.ndarray, pd.Series]:
        r"""
        Computes Relative Humidity (RH) from temperature and dew point:
        .. math::
            RH = \text{clip}\left(\frac{e(T_d)}{e_s(T)} \times 100.0, \, 1.0, \, 100.0\right)
        """
        es = AtmosphericThermodynamics.saturation_vapor_pressure(temperature_c)
        e = AtmosphericThermodynamics.actual_vapor_pressure(dewpoint_c)
        ratio = (e / np.maximum(es, 1e-6)) * 100.0
        
        clipped = np.clip(ratio, clip_bounds[0], clip_bounds[1])
        if isinstance(temperature_c, (float, int)) and isinstance(dewpoint_c, (float, int)):
            return float(clipped)
        if isinstance(temperature_c, pd.Series):
            return pd.Series(clipped, index=temperature_c.index)
        return clipped

    @staticmethod
    def dewpoint_from_relative_humidity(
        temperature_c: Union[float, np.ndarray, pd.Series],
        rh_percent: Union[float, np.ndarray, pd.Series]
    ) -> Union[float, np.ndarray, pd.Series]:
        r"""
        Computes Dew Point (Td) from Temperature and Relative Humidity via the Magnus inverse transform:
        .. math::
            \gamma(T, RH) = \frac{17.67 \cdot T}{243.5 + T} + \ln\left(\frac{RH}{100.0}\right)
            T_d = \frac{243.5 \cdot \gamma}{17.67 - \gamma}
        """
        temp = np.asarray(temperature_c, dtype=float)
        rh = np.clip(np.asarray(rh_percent, dtype=float), 0.1, 100.0)
        
        gamma = ((AtmosphericThermodynamics.MAGNUS_A1 * temp) / (temp + AtmosphericThermodynamics.MAGNUS_B1)) + np.log(rh / 100.0)
        td = (AtmosphericThermodynamics.MAGNUS_B1 * gamma) / (AtmosphericThermodynamics.MAGNUS_A1 - gamma)
        
        if isinstance(temperature_c, (float, int)):
            return float(td)
        if isinstance(temperature_c, pd.Series):
            return pd.Series(td, index=temperature_c.index)
        return td

    @staticmethod
    def barometric_hypsometric_pressure(
        sea_level_pressure: Union[float, np.ndarray, pd.Series],
        elevation_m: Union[float, np.ndarray, pd.Series],
        mean_temperature_c: Union[float, np.ndarray, pd.Series] = 25.0
    ) -> Union[float, np.ndarray, pd.Series]:
        r"""
        Computes station-level pressure from Sea Level Pressure (SLP) and elevation:
        .. math::
            P = P_0 \cdot \exp\left(-\frac{g \cdot z}{R_d \cdot T_v}\right)
        """
        t_kelvin = np.asarray(mean_temperature_c, dtype=float) + 273.15
        p0 = np.asarray(sea_level_pressure, dtype=float)
        z = np.asarray(elevation_m, dtype=float)
        
        exponent = -(AtmosphericThermodynamics.GRAVITY * z) / (AtmosphericThermodynamics.GAS_CONSTANT_DRY * t_kelvin)
        p_station = p0 * np.exp(exponent)
        
        if isinstance(sea_level_pressure, (float, int)):
            return float(p_station)
        if isinstance(sea_level_pressure, pd.Series):
            return pd.Series(p_station, index=sea_level_pressure.index)
        return p_station

    @staticmethod
    def check_psychrometric_consistency(
        temperature_c: Union[float, np.ndarray, pd.Series],
        dewpoint_c: Union[float, np.ndarray, pd.Series],
        tolerance_c: float = 0.1
    ) -> Union[bool, np.ndarray, pd.Series]:
        r"""
        Checks the physical psychrometric invariant: Dew Point cannot exceed Temperature
        beyond measurement tolerance (Td <= T + tolerance).
        Returns True for physically consistent states, False for violations.
        """
        t = np.asarray(temperature_c, dtype=float)
        td = np.asarray(dewpoint_c, dtype=float)
        valid = td <= (t + tolerance_c)
        if isinstance(temperature_c, (float, int)):
            return bool(valid)
        if isinstance(temperature_c, pd.Series):
            return pd.Series(valid, index=temperature_c.index)
        return valid

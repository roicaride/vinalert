"""
Capa de abstracción para proveedores meteorológicos.

Para cambiar de proveedor basta con:
  1. Crear una clase que herede de WeatherProvider e implemente los cuatro
     métodos abstractos: fetch(), fetch_diario(), fetch_archivo() y ping().
  2. Registrarla en _REGISTRY.
  3. Cambiar WEATHER_PROVIDER en el .env.

El dict que devuelve fetch() debe mapear exactamente a los campos de LogClima.
Las listas de dicts que devuelven fetch_diario() y fetch_archivo() deben
mapear exactamente a los campos de ClimaDiario (agregados diarios, uno por
fecha; ver el docstring de cada método para el contrato completo).
"""

import os
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Optional
from zoneinfo import ZoneInfo

import requests

TZ_LOCAL = ZoneInfo("Europe/Madrid")


# ─── Contrato ────────────────────────────────────────────────────────────────

class WeatherProvider(ABC):
    """Interfaz común para cualquier proveedor meteorológico."""

    @abstractmethod
    def fetch(self, lat: float, lon: float) -> dict:
        """
        Devuelve un dict con los campos de LogClima:
          temp_c, humedad_relativa_pct, presion_hpa, viento_vel_ms,
          lluvia_mm, et0, uv_index,
          lluvia_prev_24h_mm, prob_lluvia_24h_pct,
          lluvia_prev_48h_mm, prob_lluvia_48h_pct,
          vpd_kpa, punto_rocio_c, radiacion_wm2, nubosidad_pct,
          viento_racha_ms, viento_dir_deg, duracion_sol_s,
          suelo_temp_0cm, suelo_temp_6cm, suelo_temp_18cm,
          suelo_hum_0_1cm, suelo_hum_1_3cm, suelo_hum_3_9cm, suelo_hum_9_27cm
        Todos opcionales (None si el proveedor no los ofrece).
        """

    @abstractmethod
    def fetch_diario(self, lat: float, lon: float, past_days: int = 7) -> list:
        """
        Agregados diarios recientes (pronóstico + días pasados). Devuelve una
        lista de dicts, uno por fecha, cada uno mapeando a los campos de
        ClimaDiario: temp_max/min/media, humedad_relativa_media/max/min,
        punto_rocio_medio, vpd_max,
        precipitacion_total_mm, et0_total_dia, radiacion_total_mj_m2,
        horas_sol, viento_vel_media, viento_racha_max, viento_dir_dominante,
        humectacion_foliar_pct, suelo_modelo_humedad, suelo_modelo_temp,
        además de fecha, fuente y suelo_modelo_capa. Todos los campos
        numéricos son opcionales (None si el proveedor no los ofrece ese día).
        """

    @abstractmethod
    def fetch_archivo(self, lat: float, lon: float, desde, hasta) -> list:
        """
        Igual que fetch_diario() pero contra el archivo histórico, para el
        rango [desde, hasta] (inclusive). Mismo contrato de campos que
        fetch_diario(); fuente debe marcarse como "archivo".
        """

    @abstractmethod
    def ping(self) -> bool:
        """Comprueba conectividad con el proveedor. Devuelve True si OK."""


# ─── Open-Meteo ───────────────────────────────────────────────────────────────

class OpenMeteoProvider(WeatherProvider):
    """
    Implementación para Open-Meteo (https://open-meteo.com).
    Gratuita, sin API key, ET₀ FAO-56 incluida.
    Docs: https://open-meteo.com/en/docs
    """

    BASE_URL = "https://api.open-meteo.com/v1/forecast"
    ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
    TIMEOUT = 25  # segundos (para consultas historicas de varios meses)

    # Todas verificadas contra la API real en una sola llamada a `current`.
    _CURRENT_VARS = [
        "temperature_2m", "relative_humidity_2m", "surface_pressure",
        "wind_speed_10m", "rain", "uv_index", "et0_fao_evapotranspiration",
        "vapour_pressure_deficit", "dew_point_2m", "shortwave_radiation",
        "cloud_cover", "wind_gusts_10m", "wind_direction_10m", "sunshine_duration",
        "soil_temperature_0cm", "soil_temperature_6cm", "soil_temperature_18cm",
        "soil_moisture_0_to_1cm", "soil_moisture_1_to_3cm",
        "soil_moisture_3_to_9cm", "soil_moisture_9_to_27cm",
    ]

    # Nombre en Open-Meteo -> nombre de columna en LogClima
    _MAPA_CURRENT = {
        "temperature_2m": "temp_c",
        "relative_humidity_2m": "humedad_relativa_pct",
        "surface_pressure": "presion_hpa",
        "wind_speed_10m": "viento_vel_ms",
        "rain": "lluvia_mm",
        "uv_index": "uv_index",
        "et0_fao_evapotranspiration": "et0",
        "vapour_pressure_deficit": "vpd_kpa",
        "dew_point_2m": "punto_rocio_c",
        "shortwave_radiation": "radiacion_wm2",
        "cloud_cover": "nubosidad_pct",
        "wind_gusts_10m": "viento_racha_ms",
        "wind_direction_10m": "viento_dir_deg",
        "sunshine_duration": "duracion_sol_s",
        "soil_temperature_0cm": "suelo_temp_0cm",
        "soil_temperature_6cm": "suelo_temp_6cm",
        "soil_temperature_18cm": "suelo_temp_18cm",
        "soil_moisture_0_to_1cm": "suelo_hum_0_1cm",
        "soil_moisture_1_to_3cm": "suelo_hum_1_3cm",
        "soil_moisture_3_to_9cm": "suelo_hum_3_9cm",
        "soil_moisture_9_to_27cm": "suelo_hum_9_27cm",
    }

    # Verificadas contra la API real (curl directo a ambos endpoints, ver
    # informe de revisión final): las 18 responden tanto en el pronóstico
    # (con past_days) como en el archivo.
    #
    # NOTA sobre viento: la variable diaria correcta para una MEDIA es
    # `wind_speed_10m_mean` (confirmado que responde en los dos endpoints).
    # `wind_speed_10m_max` (velocidad sostenida máxima) se descarta a
    # propósito: el spec solo pide media + racha máxima
    # (`wind_gusts_10m_max`, ya cubierta abajo), y una tercera métrica de
    # viento no aporta frente a esas dos.
    #
    # NOTA sobre humectación foliar en el archivo: se comprobó explícitamente
    # (revisión final, hallazgo 5) si `leaf_wetness_probability_mean` vuelve
    # 0.0 de forma espuria en el archivo en días de lluvia fuerte. No es el
    # caso: p. ej. 2023-11-04 (Galicia, precipitation_sum=35.8mm) devuelve
    # leaf_wetness_probability_mean=75; 2025-06-03 (precipitation_sum=16.8mm)
    # devuelve 73. La variable sí responde con valores plausibles y
    # correlacionados con la lluvia en el archivo, así que se comparte tal
    # cual entre pronóstico y archivo (ver informe de revisión final para
    # el detalle completo de la comprobación).
    _DAILY_VARS = [
        "temperature_2m_max", "temperature_2m_min", "temperature_2m_mean",
        "relative_humidity_2m_mean", "relative_humidity_2m_max", "relative_humidity_2m_min",
        "dew_point_2m_mean", "vapour_pressure_deficit_max",
        "precipitation_sum", "et0_fao_evapotranspiration",
        "shortwave_radiation_sum", "sunshine_duration",
        "wind_speed_10m_mean", "wind_gusts_10m_max", "wind_direction_10m_dominant",
        "leaf_wetness_probability_mean",
        "soil_moisture_0_to_7cm_mean", "soil_temperature_0_to_7cm_mean",
    ]

    _MAPA_DAILY = {
        "temperature_2m_max": "temp_max",
        "temperature_2m_min": "temp_min",
        "temperature_2m_mean": "temp_media",
        "relative_humidity_2m_mean": "humedad_relativa_media",
        "relative_humidity_2m_max": "humedad_relativa_max",
        "relative_humidity_2m_min": "humedad_relativa_min",
        "dew_point_2m_mean": "punto_rocio_medio",
        "vapour_pressure_deficit_max": "vpd_max",
        "precipitation_sum": "precipitacion_total_mm",
        "et0_fao_evapotranspiration": "et0_total_dia",
        "shortwave_radiation_sum": "radiacion_total_mj_m2",
        "wind_speed_10m_mean": "viento_vel_media",
        "wind_gusts_10m_max": "viento_racha_max",
        "wind_direction_10m_dominant": "viento_dir_dominante",
        "leaf_wetness_probability_mean": "humectacion_foliar_pct",
        "soil_moisture_0_to_7cm_mean": "suelo_modelo_humedad",
        "soil_temperature_0_to_7cm_mean": "suelo_modelo_temp",
    }

    def fetch(self, lat: float, lon: float) -> dict:
        params = {
            "latitude": lat,
            "longitude": lon,
            "current": ",".join(self._CURRENT_VARS),
            "daily": "precipitation_sum,precipitation_probability_max",
            "forecast_days": 3,
            "wind_speed_unit": "ms",
            "timezone": "auto",
        }

        resp = requests.get(self.BASE_URL, params=params, timeout=self.TIMEOUT)
        resp.raise_for_status()
        data = resp.json()

        current = data.get("current", {})
        daily = data.get("daily", {})

        datos = {
            columna: self._num(current.get(clave))
            for clave, columna in self._MAPA_CURRENT.items()
        }

        # Pronóstico: índice 1 = mañana, índice 2 = pasado mañana
        datos["lluvia_prev_24h_mm"] = self._safe_get(daily, "precipitation_sum", 1)
        datos["prob_lluvia_24h_pct"] = self._safe_get(daily, "precipitation_probability_max", 1)
        datos["lluvia_prev_48h_mm"] = self._safe_get(daily, "precipitation_sum", 2)
        datos["prob_lluvia_48h_pct"] = self._safe_get(daily, "precipitation_probability_max", 2)

        return datos

    @staticmethod
    def _num(valor) -> Optional[float]:
        return float(valor) if valor is not None else None

    def fetch_diario(self, lat: float, lon: float, past_days: int = 7) -> list:
        """Agregados diarios del pronóstico, incluyendo días pasados recientes."""
        params = {
            "latitude": lat, "longitude": lon,
            "daily": ",".join(self._DAILY_VARS),
            "past_days": past_days, "forecast_days": 1,
            "wind_speed_unit": "ms", "timezone": "auto",
        }
        return self._pedir_diario(self.BASE_URL, params, fuente="pronostico")

    def fetch_archivo(self, lat: float, lon: float, desde, hasta) -> list:
        """Agregados diarios del archivo histórico."""
        params = {
            "latitude": lat, "longitude": lon,
            "daily": ",".join(self._DAILY_VARS),
            "start_date": desde.isoformat(), "end_date": hasta.isoformat(),
            "wind_speed_unit": "ms", "timezone": "auto",
        }
        return self._pedir_diario(self.ARCHIVE_URL, params, fuente="archivo")

    def _pedir_diario(self, url: str, params: dict, fuente: str) -> list:
        resp = requests.get(url, params=params, timeout=self.TIMEOUT)
        resp.raise_for_status()
        daily = resp.json().get("daily", {})

        fechas = daily.get("time", [])
        filas = []
        for i, fecha_txt in enumerate(fechas):
            fila = {
                columna: self._num(self._en(daily, clave, i))
                for clave, columna in self._MAPA_DAILY.items()
            }
            fila["fecha"] = datetime.strptime(fecha_txt, "%Y-%m-%d").date()
            # La API da segundos; la columna guarda horas.
            segundos_sol = self._num(self._en(daily, "sunshine_duration", i))
            fila["horas_sol"] = segundos_sol / 3600 if segundos_sol is not None else None
            fila["fuente"] = fuente
            # Ambos endpoints devuelven la capa 0-7cm en sus variables diarias.
            fila["suelo_modelo_capa"] = "0_to_7cm"
            filas.append(fila)
        return filas

    @staticmethod
    def _en(daily: dict, clave: str, idx: int):
        valores = daily.get(clave, [])
        return valores[idx] if idx < len(valores) else None

    def ping(self) -> bool:
        try:
            # Llamada mínima: Madrid, 1 día, solo temperatura actual
            resp = requests.get(
                self.BASE_URL,
                params={"latitude": 40.4, "longitude": -3.7, "current": "temperature_2m", "forecast_days": 1},
                timeout=self.TIMEOUT,
            )
            return resp.status_code == 200
        except Exception:
            return False

    # ── helpers ──────────────────────────────────────────────────────────────

    @staticmethod
    def _safe_get(daily: dict, key: str, idx: int) -> Optional[float]:
        vals = daily.get(key, [])
        if idx < len(vals) and vals[idx] is not None:
            return float(vals[idx])
        return None


# ─── Registro de proveedores ──────────────────────────────────────────────────

_REGISTRY: dict[str, type[WeatherProvider]] = {
    "open_meteo": OpenMeteoProvider,
    # "tomorrow_io": TomorrowIoProvider,   # ejemplo de cómo añadir otro
}


def get_provider() -> WeatherProvider:
    """
    Devuelve la instancia del proveedor configurado en WEATHER_PROVIDER (.env).
    Por defecto: open_meteo.
    """
    name = os.getenv("WEATHER_PROVIDER", "open_meteo").strip().lower()
    cls = _REGISTRY.get(name)
    if cls is None:
        raise ValueError(
            f"Proveedor meteorológico '{name}' no reconocido. "
            f"Opciones: {list(_REGISTRY)}"
        )
    return cls()


def fetch_y_guardar_clima(parcela, db) -> Optional[str]:
    """
    Descarga el clima actual del proveedor configurado y lo guarda en log_clima.
    Devuelve None si OK, o un mensaje de aviso si falla (no es error fatal).
    Compartida entre el endpoint manual (clima_fetch.py) y el scheduler automático.
    """
    from ..models import LogClima

    if parcela.latitud is None or parcela.longitud is None:
        return "La parcela no tiene coordenadas."

    provider = get_provider()
    try:
        datos = provider.fetch(parcela.latitud, parcela.longitud)
    except Exception as exc:
        return str(exc)

    ahora = datetime.now(TZ_LOCAL).replace(tzinfo=None)
    db.add(LogClima(parcela_id=parcela.id, fecha_hora=ahora, **datos))
    db.commit()
    return None


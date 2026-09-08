"""
Clima reconstruido para un instante concreto en el pasado (o presente).

Usado por `app/routers/tratamientos.py`: el clima de un tratamiento debe ser
el del momento en que se aplicó (`body.fecha`), no el más reciente disponible
en el momento de registrar la petición. Si el usuario aplica un tratamiento
el día 13 y lo registra el 18, el clima guardado debe ser el del 13.

Orden de resolución (para en el primero que dé resultado):
  1. Nuestro propio histórico (`log_clima`), si hay una lectura a <= 90 min
     de `momento`. 90 min es la mitad del intervalo del scheduler de clima
     (cada 3h): garantiza coger la lectura de la ventana correcta y no la
     contigua.
  2. La API de Open-Meteo, si la parcela tiene coordenadas: pronóstico
     (con `past_days`) si `momento` es de los últimos 7 días o futuro,
     archivo histórico si es más antiguo. Se pide `timezone=UTC` a
     propósito: así las horas que devuelve la API casan directamente con
     `fecha_hora`, naive en UTC por convención del proyecto, sin conversión
     manual alguna.
  3. Nada: (None, None, None, "no_disponible"). Un fallo de red o de la API
     NUNCA debe impedir crear el tratamiento — se degrada en silencio a este
     paso.
"""

from datetime import date as date_cls
from datetime import datetime, timedelta
from typing import Any, Dict, Optional, Tuple
from zoneinfo import ZoneInfo

import requests

from ..models import LogClima

TZ_LOCAL = ZoneInfo("Europe/Madrid")
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
TIMEOUT = 10  # segundos


TOLERANCIA_LOG_CLIMA_MIN = 90
DIAS_RECIENTES = 7

HOURLY_VARS = (
    "temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,"
    "wind_gusts_10m,wind_direction_10m,rain,et0_fao_evapotranspiration,"
    "vapour_pressure_deficit,dew_point_2m,shortwave_radiation,cloud_cover"
)

ClimaPuntual = Tuple[Optional[float], Optional[float], Optional[datetime], str]


def clima_completo_en_momento(parcela, momento: datetime, db) -> Dict[str, Any]:
    """
    Devuelve un diccionario con todas las variables meteorológicas reconstruidas
    para el instante `momento` (datetime naive UTC).
    """
    resultado = _desde_log_clima_completo(parcela.id, momento, db)
    if resultado is not None:
        return resultado

    if parcela.latitud is not None and parcela.longitud is not None:
        try:
            resultado = _desde_api_completo(parcela.latitud, parcela.longitud, momento)
        except Exception:
            resultado = None
        if resultado is not None:
            return resultado

    return {
        "temp_c_aplicacion": None,
        "viento_ms_aplicacion": None,
        "humedad_relativa_aplicacion": None,
        "lluvia_mm_aplicacion": None,
        "et0_aplicacion": None,
        "viento_racha_ms_aplicacion": None,
        "viento_dir_deg_aplicacion": None,
        "radiacion_wm2_aplicacion": None,
        "presion_hpa_aplicacion": None,
        "vpd_kpa_aplicacion": None,
        "punto_rocio_c_aplicacion": None,
        "nubosidad_pct_aplicacion": None,
        "clima_fecha_hora": None,
        "clima_fuente": "no_disponible",
    }


def clima_en_momento(parcela, momento: datetime, db) -> ClimaPuntual:
    """
    Compatibilidad hacia atrás: devuelve (temp_c, viento_ms, fecha_hora_usada, fuente).
    """
    c = clima_completo_en_momento(parcela, momento, db)
    return (
        c["temp_c_aplicacion"],
        c["viento_ms_aplicacion"],
        c["clima_fecha_hora"],
        c["clima_fuente"],
    )


def _desde_log_clima_completo(parcela_id: int, momento: datetime, db) -> Optional[Dict[str, Any]]:
    antes = (
        db.query(LogClima)
        .filter(LogClima.parcela_id == parcela_id, LogClima.fecha_hora <= momento)
        .order_by(LogClima.fecha_hora.desc())
        .first()
    )
    despues = (
        db.query(LogClima)
        .filter(LogClima.parcela_id == parcela_id, LogClima.fecha_hora > momento)
        .order_by(LogClima.fecha_hora.asc())
        .first()
    )
    candidatos = [c for c in (antes, despues) if c is not None]
    if not candidatos:
        return None

    mas_cercano = min(candidatos, key=lambda c: abs((c.fecha_hora - momento).total_seconds()))
    diff_min = abs((mas_cercano.fecha_hora - momento).total_seconds()) / 60
    if diff_min > TOLERANCIA_LOG_CLIMA_MIN:
        return None

    return {
        "temp_c_aplicacion": mas_cercano.temp_c,
        "viento_ms_aplicacion": mas_cercano.viento_vel_ms,
        "humedad_relativa_aplicacion": mas_cercano.humedad_relativa_pct,
        "lluvia_mm_aplicacion": mas_cercano.lluvia_mm,
        "et0_aplicacion": mas_cercano.et0,
        "viento_racha_ms_aplicacion": mas_cercano.viento_racha_ms,
        "viento_dir_deg_aplicacion": mas_cercano.viento_dir_deg,
        "radiacion_wm2_aplicacion": mas_cercano.radiacion_wm2,
        "presion_hpa_aplicacion": mas_cercano.presion_hpa,
        "vpd_kpa_aplicacion": mas_cercano.vpd_kpa,
        "punto_rocio_c_aplicacion": mas_cercano.punto_rocio_c,
        "nubosidad_pct_aplicacion": mas_cercano.nubosidad_pct,
        "clima_fecha_hora": mas_cercano.fecha_hora,
        "clima_fuente": "log_clima",
    }


def _es_reciente(momento: datetime) -> bool:
    hoy = datetime.now(TZ_LOCAL).replace(tzinfo=None).date()
    limite = hoy - timedelta(days=DIAS_RECIENTES)
    return momento.date() >= limite


def _desde_api_completo(lat: float, lon: float, momento: datetime) -> Optional[Dict[str, Any]]:
    hora_objetivo = momento.replace(minute=0, second=0, microsecond=0)
    if _es_reciente(momento):
        return _fetch_pronostico(lat, lon, hora_objetivo)
    return _fetch_archivo(lat, lon, hora_objetivo)


def _fetch_pronostico(lat: float, lon: float, hora_objetivo: datetime) -> Optional[Dict[str, Any]]:
    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": HOURLY_VARS,
        "past_days": DIAS_RECIENTES,
        "forecast_days": 1,
        "timezone": "Europe/Madrid",
        "wind_speed_unit": "ms",
    }
    resp = requests.get(FORECAST_URL, params=params, timeout=TIMEOUT)
    resp.raise_for_status()
    return _extraer_hora(resp.json(), hora_objetivo, "pronostico")


def _fetch_archivo(lat: float, lon: float, hora_objetivo: datetime) -> Optional[Dict[str, Any]]:
    dia: date_cls = hora_objetivo.date()
    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": HOURLY_VARS,
        "start_date": dia.isoformat(),
        "end_date": dia.isoformat(),
        "timezone": "Europe/Madrid",
        "wind_speed_unit": "ms",
    }
    resp = requests.get(ARCHIVE_URL, params=params, timeout=TIMEOUT)
    resp.raise_for_status()
    return _extraer_hora(resp.json(), hora_objetivo, "archivo")



def _extraer_hora(data: dict, hora_objetivo: datetime, fuente: str) -> Optional[Dict[str, Any]]:
    hourly = data.get("hourly", {})
    horas = hourly.get("time", [])
    objetivo_txt = hora_objetivo.strftime("%Y-%m-%dT%H:%M")
    if objetivo_txt not in horas:
        return None

    idx = horas.index(objetivo_txt)

    def _val(clave):
        arr = hourly.get(clave, [])
        if idx < len(arr) and arr[idx] is not None:
            return float(arr[idx])
        return None

    return {
        "temp_c_aplicacion": _val("temperature_2m"),
        "viento_ms_aplicacion": _val("wind_speed_10m"),
        "humedad_relativa_aplicacion": _val("relative_humidity_2m"),
        "lluvia_mm_aplicacion": _val("rain"),
        "et0_aplicacion": _val("et0_fao_evapotranspiration"),
        "viento_racha_ms_aplicacion": _val("wind_gusts_10m"),
        "viento_dir_deg_aplicacion": _val("wind_direction_10m"),
        "radiacion_wm2_aplicacion": _val("shortwave_radiation"),
        "presion_hpa_aplicacion": _val("surface_pressure"),
        "vpd_kpa_aplicacion": _val("vapour_pressure_deficit"),
        "punto_rocio_c_aplicacion": _val("dew_point_2m"),
        "nubosidad_pct_aplicacion": _val("cloud_cover"),
        "clima_fecha_hora": hora_objetivo,
        "clima_fuente": fuente,
    }

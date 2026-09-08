from datetime import date
from unittest.mock import patch

from app.services.weather import OpenMeteoProvider

DAILY = {
    "time": ["2026-08-15", "2026-08-16"],
    "temperature_2m_max": [31.2, 29.0],
    "temperature_2m_min": [14.8, 15.1],
    "temperature_2m_mean": [22.4, 21.8],
    "relative_humidity_2m_mean": [52, 55],
    "relative_humidity_2m_max": [82, 85],
    "relative_humidity_2m_min": [26, 28],
    "dew_point_2m_mean": [3.9, 4.2],
    "vapour_pressure_deficit_max": [1.94, 1.80],
    "precipitation_sum": [0.0, 2.4],
    "et0_fao_evapotranspiration": [6.18, 5.40],
    "shortwave_radiation_sum": [30.6, 28.1],
    "sunshine_duration": [51931.62, 43200.0],
    "wind_speed_10m_mean": [3.4, 2.9],
    "wind_gusts_10m_max": [14.1, 12.0],
    "wind_direction_10m_dominant": [45, 90],
    "leaf_wetness_probability_mean": [12.0, 30.0],
    "soil_moisture_0_to_7cm_mean": [0.039, 0.052],
    "soil_temperature_0_to_7cm_mean": [19.1, 18.4],
}


class _Resp:
    status_code = 200

    def raise_for_status(self):
        pass

    def json(self):
        return {"daily": DAILY}


def test_fetch_archivo_mapea_los_dias():
    with patch("app.services.weather.requests.get", return_value=_Resp()):
        filas = OpenMeteoProvider().fetch_archivo(41.65, -4.72, date(2026, 8, 15), date(2026, 8, 16))

    assert len(filas) == 2
    d0 = filas[0]
    assert d0["fecha"] == date(2026, 8, 15)
    assert d0["temp_max"] == 31.2
    assert d0["temp_media"] == 22.4
    assert d0["humedad_relativa_media"] == 52.0
    assert d0["vpd_max"] == 1.94
    assert d0["precipitacion_total_mm"] == 0.0
    assert d0["et0_total_dia"] == 6.18
    assert d0["radiacion_total_mj_m2"] == 30.6
    assert d0["humectacion_foliar_pct"] == 12.0
    assert d0["suelo_modelo_humedad"] == 0.039
    assert d0["suelo_modelo_temp"] == 19.1
    assert d0["fuente"] == "archivo"
    assert d0["suelo_modelo_capa"] == "0_to_7cm"


def test_viento_vel_media_usa_la_media_no_el_maximo():
    """
    Hallazgo 1 (review final): viento_vel_media debe salir de
    wind_speed_10m_mean, no de wind_speed_10m_max. La API confirma que
    wind_speed_10m_mean responde en ambos endpoints (pronóstico y archivo);
    ver el informe de revisión final para la evidencia real.
    """
    with patch("app.services.weather.requests.get", return_value=_Resp()):
        filas = OpenMeteoProvider().fetch_archivo(41.65, -4.72, date(2026, 8, 15), date(2026, 8, 16))

    assert filas[0]["viento_vel_media"] == 3.4, "debe venir de wind_speed_10m_mean, no del max"
    assert filas[1]["viento_vel_media"] == 2.9
    # wind_speed_10m_max ya no se pide ni se mapea a ninguna columna.
    assert "wind_speed_10m_max" not in OpenMeteoProvider._DAILY_VARS
    assert "wind_speed_10m_max" not in OpenMeteoProvider._MAPA_DAILY
    assert OpenMeteoProvider._MAPA_DAILY["wind_speed_10m_mean"] == "viento_vel_media"


def test_vpd_medio_no_es_columna_del_modelo():
    """
    Hallazgo 4 (review final): no existe vapour_pressure_deficit_mean (ni
    variantes) en la API de Open-Meteo, en ninguno de los dos endpoints
    (verificado con curl directo). La columna vpd_medio se retiró del todo
    en vez de dejarla puesta a None para siempre.
    """
    with patch("app.services.weather.requests.get", return_value=_Resp()):
        filas = OpenMeteoProvider().fetch_archivo(41.65, -4.72, date(2026, 8, 15), date(2026, 8, 16))

    assert "vpd_medio" not in filas[0]
    assert filas[0]["vpd_max"] == 1.94


def test_horas_sol_se_convierte_de_segundos_a_horas():
    with patch("app.services.weather.requests.get", return_value=_Resp()):
        filas = OpenMeteoProvider().fetch_archivo(41.65, -4.72, date(2026, 8, 15), date(2026, 8, 16))

    assert round(filas[0]["horas_sol"], 2) == round(51931.62 / 3600, 2)
    assert filas[1]["horas_sol"] == 12.0


def test_fetch_diario_marca_fuente_pronostico():
    with patch("app.services.weather.requests.get", return_value=_Resp()):
        filas = OpenMeteoProvider().fetch_diario(41.65, -4.72, past_days=7)

    assert filas[0]["fuente"] == "pronostico"
    assert filas[0]["suelo_modelo_capa"] == "0_to_7cm"


def test_fetch_diario_tolera_variables_ausentes():
    class _RespCorta(_Resp):
        def json(self):
            return {"daily": {"time": ["2026-08-15"], "temperature_2m_max": [31.2]}}

    with patch("app.services.weather.requests.get", return_value=_RespCorta()):
        filas = OpenMeteoProvider().fetch_diario(41.65, -4.72, past_days=7)

    assert len(filas) == 1
    assert filas[0]["temp_max"] == 31.2
    assert filas[0]["vpd_max"] is None

from unittest.mock import patch

from app.services.weather import OpenMeteoProvider

RESPUESTA = {
    "utc_offset_seconds": 7200,
    "current": {
        "temperature_2m": 24.3,
        "relative_humidity_2m": 48,
        "surface_pressure": 939.4,
        "wind_speed_10m": 2.06,
        "rain": 0.0,
        "uv_index": 6.0,
        "et0_fao_evapotranspiration": 0.31,
        "vapour_pressure_deficit": 1.58,
        "dew_point_2m": 12.6,
        "shortwave_radiation": 684.0,
        "cloud_cover": 30,
        "wind_gusts_10m": 4.5,
        "wind_direction_10m": 23,
        "sunshine_duration": 3600.0,
        "soil_temperature_0cm": 22.7,
        "soil_temperature_6cm": 26.1,
        "soil_temperature_18cm": 28.3,
        "soil_moisture_0_to_1cm": 0.087,
        "soil_moisture_1_to_3cm": 0.108,
        "soil_moisture_3_to_9cm": 0.139,
        "soil_moisture_9_to_27cm": 0.175,
    },
    "daily": {
        "precipitation_sum": [0.0, 1.2, 0.4],
        "precipitation_probability_max": [5, 30, 10],
    },
}


class _Resp:
    status_code = 200

    def raise_for_status(self):
        pass

    def json(self):
        return RESPUESTA


def test_fetch_mapea_todas_las_variables():
    with patch("app.services.weather.requests.get", return_value=_Resp()):
        datos = OpenMeteoProvider().fetch(41.65, -4.72)

    # Previas
    assert datos["temp_c"] == 24.3
    assert datos["humedad_relativa_pct"] == 48.0
    assert datos["et0"] == 0.31
    assert datos["lluvia_prev_24h_mm"] == 1.2
    assert datos["prob_lluvia_48h_pct"] == 10.0
    # Nuevas
    assert datos["vpd_kpa"] == 1.58
    assert datos["punto_rocio_c"] == 12.6
    assert datos["radiacion_wm2"] == 684.0
    assert datos["nubosidad_pct"] == 30.0
    assert datos["viento_racha_ms"] == 4.5
    assert datos["viento_dir_deg"] == 23.0
    assert datos["duracion_sol_s"] == 3600.0
    assert datos["suelo_temp_6cm"] == 26.1
    assert datos["suelo_hum_3_9cm"] == 0.139
    assert datos["suelo_hum_9_27cm"] == 0.175


def test_fetch_tolera_variables_ausentes():
    respuesta_corta = {"current": {"temperature_2m": 20.0}, "daily": {}}

    class _RespCorta(_Resp):
        def json(self):
            return respuesta_corta

    with patch("app.services.weather.requests.get", return_value=_RespCorta()):
        datos = OpenMeteoProvider().fetch(41.65, -4.72)

    assert datos["temp_c"] == 20.0
    assert datos["vpd_kpa"] is None
    assert datos["suelo_hum_3_9cm"] is None


def test_el_dict_encaja_en_el_modelo(db_session, parcela_id):
    from datetime import datetime

    from app.models import LogClima

    with patch("app.services.weather.requests.get", return_value=_Resp()):
        datos = OpenMeteoProvider().fetch(41.65, -4.72)

    log = LogClima(parcela_id=parcela_id, fecha_hora=datetime(2026, 8, 17, 12, 0), **datos)
    db_session.add(log)
    db_session.commit()
    assert log.id is not None

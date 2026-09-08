from app.models import LogSensor
from app.services.sensor_stats import calcular_resumen


def test_resumen_sin_lecturas():
    r = calcular_resumen([])
    assert r == {
        "n_sensores": 0,
        "n_lecturas": 0,
        "humedad_media": None,
        "humedad_sd": None,
        "temperatura_media": None,
        "temperatura_sd": None,
        "humedad_max": None,
        "humedad_min": None,
        "temperatura_max": None,
        "temperatura_min": None,
    }


def test_resumen_con_una_lectura_sd_es_none():
    lecturas = [LogSensor(sensor_id=1, humedad_suelo_pct=30.0, temperatura_suelo=18.0)]
    r = calcular_resumen(lecturas)
    assert r["n_sensores"] == 1
    assert r["n_lecturas"] == 1
    assert r["humedad_media"] == 30.0
    assert r["humedad_sd"] is None


def test_resumen_con_varios_sensores():
    lecturas = [
        LogSensor(sensor_id=1, humedad_suelo_pct=30.0, temperatura_suelo=18.0),
        LogSensor(sensor_id=2, humedad_suelo_pct=34.0, temperatura_suelo=20.0),
    ]
    r = calcular_resumen(lecturas)
    assert r["n_sensores"] == 2
    assert r["n_lecturas"] == 2
    assert r["humedad_media"] == 32.0
    assert round(r["humedad_sd"], 4) == round(2.8284271247461903, 4)
    assert r["temperatura_media"] == 19.0


def test_resumen_incluye_maximos_y_minimos():
    lecturas = [
        LogSensor(sensor_id=1, humedad_suelo_pct=30.0, temperatura_suelo=18.0),
        LogSensor(sensor_id=2, humedad_suelo_pct=34.0, temperatura_suelo=20.0),
        LogSensor(sensor_id=3, humedad_suelo_pct=32.0, temperatura_suelo=19.0),
    ]
    r = calcular_resumen(lecturas)
    assert r["humedad_max"] == 34.0
    assert r["humedad_min"] == 30.0
    assert r["temperatura_max"] == 20.0
    assert r["temperatura_min"] == 18.0


def test_maximos_y_minimos_son_none_sin_lecturas():
    r = calcular_resumen([])
    assert r["humedad_max"] is None
    assert r["humedad_min"] is None
    assert r["temperatura_max"] is None
    assert r["temperatura_min"] is None

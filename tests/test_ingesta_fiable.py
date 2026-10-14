"""
La ingesta de lecturas tiene que ser rapida y no tragarse datos imposibles.

- Rapida: el ESP32 espera 8 s a la respuesta. Antes la API consultaba
  Open-Meteo (hasta 25 s) dentro de la peticion y el aparato reenviaba la
  lectura creyendo que habia fallado. Ahora usa el ultimo clima guardado; el
  scheduler ya lo refresca cada pocas horas.
- Limpia: un NaN deja con error el panel de la parcela, y una fecha de 1970
  (ESP que arranca sin hora) acaba invisible en las graficas.
"""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

import app.routers.logs as logs_router
from app.models import LogClima, LogSensor
from tests.ayudas import alta_sensor

MADRID = ZoneInfo("Europe/Madrid")


def _ahora_madrid():
    return datetime.now(MADRID).replace(tzinfo=None)


@pytest.fixture()
def sensor(client, auth_headers, parcela_id):
    return alta_sensor(client, auth_headers, parcela_id)


def _cuerpo(parcela_id, sensor_id, **cambios):
    cuerpo = {
        "parcela_id": parcela_id,
        "sensor_id": sensor_id,
        "fecha_hora": _ahora_madrid().isoformat(),
        "humedad_suelo_pct": 30.0,
        "temperatura_suelo": 18.0,
        "bateria": 4.3,
    }
    cuerpo.update(cambios)
    return cuerpo


def _enviar(client, headers, cuerpo):
    return client.post("/logs/sensor/", json=cuerpo, headers=headers)


# --- Sin esperar al proveedor del clima ------------------------------------------

def test_la_ingesta_no_llama_al_proveedor_del_clima(client, auth_headers, parcela_id, sensor, db_session, monkeypatch):
    # Se anotan las llamadas en vez de lanzar: el codigo antiguo envolvia la
    # llamada en un try/except que se habria tragado la excepcion.
    llamadas = []
    monkeypatch.setattr("app.services.weather.fetch_y_guardar_clima", lambda *a, **k: llamadas.append(a))
    monkeypatch.setattr(logs_router, "fetch_y_guardar_clima", lambda *a, **k: llamadas.append(a), raising=False)
    from app.models import Parcela
    p = db_session.get(Parcela, parcela_id)
    p.latitud, p.longitud = 42.5, -8.8
    db_session.commit()

    resp = _enviar(client, auth_headers, _cuerpo(parcela_id, sensor["id"]))

    assert resp.status_code == 201, resp.text
    assert llamadas == []


def test_la_respuesta_lleva_el_ultimo_clima_guardado(client, auth_headers, parcela_id, sensor, db_session):
    db_session.add(LogClima(parcela_id=parcela_id, fecha_hora=_ahora_madrid() - timedelta(hours=2), temp_c=21.5, viento_vel_ms=1.2))
    db_session.commit()

    cuerpo = _enviar(client, auth_headers, _cuerpo(parcela_id, sensor["id"])).json()

    assert cuerpo["temp_ambiente_c"] == 21.5
    assert cuerpo["viento_ms"] == 1.2


def test_un_clima_de_hace_dias_no_se_presenta_como_actual(client, auth_headers, parcela_id, sensor, db_session):
    db_session.add(LogClima(parcela_id=parcela_id, fecha_hora=_ahora_madrid() - timedelta(days=3), temp_c=9.0))
    db_session.commit()

    cuerpo = _enviar(client, auth_headers, _cuerpo(parcela_id, sensor["id"])).json()

    assert cuerpo["temp_ambiente_c"] is None


# --- Valores imposibles ----------------------------------------------------------

@pytest.mark.parametrize("campo,valor", [
    ("temperatura_suelo", 9999),
    ("temperatura_suelo", -40),
    ("humedad_suelo_pct", 140),
    ("humedad_suelo_pct", -1),
    ("bateria", 250),
])
def test_un_valor_fuera_de_rango_fisico_se_rechaza(client, auth_headers, parcela_id, sensor, db_session, campo, valor):
    resp = _enviar(client, auth_headers, _cuerpo(parcela_id, sensor["id"], **{campo: valor}))
    assert resp.status_code == 422
    assert db_session.query(LogSensor).count() == 0


@pytest.mark.parametrize("literal", ["NaN", "Infinity", "-Infinity"])
def test_nan_e_infinito_se_rechazan(client, auth_headers, parcela_id, sensor, db_session, literal):
    # El JSON estandar no los admite, pero el parser de Python si: hay que
    # cerrarles la puerta explicitamente.
    texto = (
        f'{{"parcela_id": {parcela_id}, "sensor_id": {sensor["id"]}, '
        f'"fecha_hora": "{_ahora_madrid().isoformat()}", "temperatura_suelo": {literal}}}'
    )
    resp = client.post("/logs/sensor/", content=texto, headers={**auth_headers, "Content-Type": "application/json"})
    assert resp.status_code == 422
    assert db_session.query(LogSensor).count() == 0


def test_los_valores_reales_del_campo_se_aceptan(client, auth_headers, parcela_id, sensor):
    resp = _enviar(client, auth_headers, _cuerpo(parcela_id, sensor["id"], temperatura_suelo=-5.5, humedad_suelo_pct=0, bateria=4.28))
    assert resp.status_code == 201


# --- Fechas imposibles -----------------------------------------------------------

def test_una_fecha_de_1970_se_rechaza(client, auth_headers, parcela_id, sensor, db_session):
    # Un ESP que arranca sin bateria de reloj y sin NTP fecha sus lecturas en 1970.
    resp = _enviar(client, auth_headers, _cuerpo(parcela_id, sensor["id"], fecha_hora="1970-01-01T02:00:30"))
    assert resp.status_code == 422
    assert db_session.query(LogSensor).count() == 0


def test_una_fecha_en_el_futuro_se_rechaza(client, auth_headers, parcela_id, sensor):
    futuro = (_ahora_madrid() + timedelta(hours=2)).isoformat()
    assert _enviar(client, auth_headers, _cuerpo(parcela_id, sensor["id"], fecha_hora=futuro)).status_code == 422


def test_unos_minutos_de_adelanto_del_reloj_se_toleran(client, auth_headers, parcela_id, sensor):
    casi = (_ahora_madrid() + timedelta(minutes=5)).isoformat()
    assert _enviar(client, auth_headers, _cuerpo(parcela_id, sensor["id"], fecha_hora=casi)).status_code == 201


def test_una_lectura_antigua_del_buffer_se_acepta(client, auth_headers, parcela_id, sensor):
    # El maestro guarda lo que no pudo subir y lo reenvia dias despues.
    hace_dias = (_ahora_madrid() - timedelta(days=5)).isoformat()
    assert _enviar(client, auth_headers, _cuerpo(parcela_id, sensor["id"], fecha_hora=hace_dias)).status_code == 201

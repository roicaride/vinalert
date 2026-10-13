"""
El ESP32 reenvia una lectura cuando no recibe respuesta a tiempo, aunque el
servidor ya la hubiese guardado. Una lectura EXACTAMENTE igual a una ya
guardada (mismo sensor, misma hora y mismos valores) no se guarda dos veces:
se responde 200 con la que ya habia, para que el aparato la de por subida.

Cualquier diferencia, por pequena que sea, es otra lectura y se guarda.
"""
from app.models import LogSensor
from tests.ayudas import alta_sensor


def _lectura(parcela_id, sensor_id, **cambios):
    cuerpo = {
        "parcela_id": parcela_id,
        "sensor_id": sensor_id,
        "fecha_hora": "2026-09-21T11:49:33",
        "humedad_suelo_pct": 7.7,
        "temperatura_suelo": 25.2,
        "bateria": 4.34,
    }
    cuerpo.update(cambios)
    return cuerpo


def _enviar(client, headers, cuerpo):
    return client.post("/logs/sensor/", json=cuerpo, headers=headers)


def test_un_reenvio_identico_no_duplica_y_devuelve_la_lectura_guardada(client, auth_headers, parcela_id, db_session):
    sensor = alta_sensor(client, auth_headers, parcela_id)
    primera = _enviar(client, auth_headers, _lectura(parcela_id, sensor["id"]))
    reenvio = _enviar(client, auth_headers, _lectura(parcela_id, sensor["id"]))

    assert primera.status_code == 201
    assert reenvio.status_code == 200
    assert reenvio.json()["id"] == primera.json()["id"]
    assert db_session.query(LogSensor).count() == 1


def test_una_lectura_con_un_valor_distinto_si_se_guarda(client, auth_headers, parcela_id, db_session):
    sensor = alta_sensor(client, auth_headers, parcela_id)
    _enviar(client, auth_headers, _lectura(parcela_id, sensor["id"]))
    otra = _enviar(client, auth_headers, _lectura(parcela_id, sensor["id"], humedad_suelo_pct=7.8))

    assert otra.status_code == 201
    assert db_session.query(LogSensor).count() == 2


def test_los_mismos_valores_a_otra_hora_son_otra_lectura(client, auth_headers, parcela_id, db_session):
    sensor = alta_sensor(client, auth_headers, parcela_id)
    _enviar(client, auth_headers, _lectura(parcela_id, sensor["id"]))
    otra = _enviar(client, auth_headers, _lectura(parcela_id, sensor["id"], fecha_hora="2026-09-21T15:49:33"))

    assert otra.status_code == 201
    assert db_session.query(LogSensor).count() == 2


def test_los_mismos_valores_de_otro_sensor_son_otra_lectura(client, auth_headers, parcela_id, db_session):
    s1 = alta_sensor(client, auth_headers, parcela_id)
    s2 = alta_sensor(client, auth_headers, parcela_id)
    _enviar(client, auth_headers, _lectura(parcela_id, s1["id"]))
    otra = _enviar(client, auth_headers, _lectura(parcela_id, s2["id"]))

    assert otra.status_code == 201
    assert db_session.query(LogSensor).count() == 2


def test_un_valor_ausente_cuenta_como_igual_solo_si_falta_en_las_dos(client, auth_headers, parcela_id, db_session):
    sensor = alta_sensor(client, auth_headers, parcela_id)
    _enviar(client, auth_headers, _lectura(parcela_id, sensor["id"], bateria=None))

    assert _enviar(client, auth_headers, _lectura(parcela_id, sensor["id"], bateria=None)).status_code == 200
    assert _enviar(client, auth_headers, _lectura(parcela_id, sensor["id"], bateria=4.34)).status_code == 201
    assert db_session.query(LogSensor).count() == 2


def test_la_misma_hora_escrita_en_utc_es_la_misma_lectura(client, auth_headers, parcela_id, db_session):
    # El firmware manda UTC con "Z"; el backend guarda hora de Madrid. Un
    # reenvio en UTC de una lectura ya guardada sigue siendo la misma.
    sensor = alta_sensor(client, auth_headers, parcela_id)
    _enviar(client, auth_headers, _lectura(parcela_id, sensor["id"], fecha_hora="2026-09-21T09:49:33Z"))
    reenvio = _enviar(client, auth_headers, _lectura(parcela_id, sensor["id"], fecha_hora="2026-09-21T09:49:33Z"))

    assert reenvio.status_code == 200
    assert db_session.query(LogSensor).count() == 1

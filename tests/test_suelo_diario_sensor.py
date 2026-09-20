"""
GET /parcelas/{id}/suelo/diario: una fila por dia y sensor, calculada al
momento desde log_sensores (sin tabla de agregados). Ver
docs/specs/2026-09-19-filtro-sensores-design.md.
"""
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.models import LogSensor, Sensor

HOY = datetime.now(ZoneInfo("Europe/Madrid")).date()


def _sensor(db, parcela_id, numero, profundidad=None, activo=True):
    s = Sensor(parcela_id=parcela_id, numero=numero, etiqueta=f"S{numero}",
               profundidad_cm=profundidad, activo=activo)
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


def _lectura(db, parcela_id, sensor, cuando, humedad, temperatura=20.0):
    db.add(LogSensor(parcela_id=parcela_id, sensor_id=sensor.id, fecha_hora=cuando,
                     humedad_suelo_pct=humedad, temperatura_suelo=temperatura))
    db.commit()


def _a_las(dias_atras, hora, minuto=0):
    return datetime.combine(HOY - timedelta(days=dias_atras), time(hora, minuto))


def _pedir(client, headers, parcela_id, **params):
    return client.get(f"/parcelas/{parcela_id}/suelo/diario", params=params, headers=headers)


def test_una_fila_por_dia_y_sensor_con_media_maximo_minimo_y_lecturas(client, auth_headers, parcela_id, db_session):
    s1 = _sensor(db_session, parcela_id, 1, 20.0)
    s2 = _sensor(db_session, parcela_id, 2, 40.0)
    _lectura(db_session, parcela_id, s1, _a_las(1, 8), 30.0, 18.0)
    _lectura(db_session, parcela_id, s1, _a_las(1, 9), 34.0, 20.0)
    _lectura(db_session, parcela_id, s2, _a_las(1, 8), 20.0, 16.0)

    filas = _pedir(client, auth_headers, parcela_id, dias=7).json()

    assert len(filas) == 2
    f1, f2 = filas
    assert f1["fecha"] == str(HOY - timedelta(days=1))
    assert (f1["sensor_id"], f1["sensor_numero"], f1["profundidad_cm"]) == (s1.id, 1, 20.0)
    assert f1["humedad_media"] == 32.0 and f1["humedad_max"] == 34.0 and f1["humedad_min"] == 30.0
    assert f1["temperatura_media"] == 19.0 and f1["temperatura_max"] == 20.0 and f1["temperatura_min"] == 18.0
    assert f1["n_lecturas"] == 2
    assert (f2["sensor_numero"], f2["n_lecturas"]) == (2, 1)


def test_el_dia_es_de_00_00_a_23_59_en_hora_de_madrid(client, auth_headers, parcela_id, db_session):
    s1 = _sensor(db_session, parcela_id, 1)
    _lectura(db_session, parcela_id, s1, _a_las(2, 23, 30), 10.0)
    _lectura(db_session, parcela_id, s1, _a_las(1, 0, 0), 50.0)

    filas = _pedir(client, auth_headers, parcela_id, dias=7).json()

    assert [(f["fecha"], f["humedad_media"]) for f in filas] == [
        (str(HOY - timedelta(days=2)), 10.0),
        (str(HOY - timedelta(days=1)), 50.0),
    ]


def test_incluye_el_dia_de_hoy(client, auth_headers, parcela_id, db_session):
    s1 = _sensor(db_session, parcela_id, 1)
    _lectura(db_session, parcela_id, s1, datetime.combine(HOY, time(0, 5)), 25.0)

    filas = _pedir(client, auth_headers, parcela_id, dias=1).json()

    assert [f["fecha"] for f in filas] == [str(HOY)]


def test_dias_filtra_incluido_el_borde(client, auth_headers, parcela_id, db_session):
    s1 = _sensor(db_session, parcela_id, 1)
    _lectura(db_session, parcela_id, s1, _a_las(10, 12), 10.0)
    _lectura(db_session, parcela_id, s1, _a_las(7, 0), 20.0)

    assert [f["humedad_media"] for f in _pedir(client, auth_headers, parcela_id, dias=7).json()] == [20.0]
    assert len(_pedir(client, auth_headers, parcela_id, dias=30).json()) == 2


def test_excluye_sensores_inactivos(client, auth_headers, parcela_id, db_session):
    activo = _sensor(db_session, parcela_id, 1)
    baja = _sensor(db_session, parcela_id, 2, activo=False)
    _lectura(db_session, parcela_id, activo, _a_las(1, 8), 30.0)
    _lectura(db_session, parcela_id, baja, _a_las(1, 8), 99.0)

    filas = _pedir(client, auth_headers, parcela_id, dias=7).json()

    assert [f["sensor_id"] for f in filas] == [activo.id]


def test_ordena_por_fecha_y_despues_por_numero(client, auth_headers, parcela_id, db_session):
    s2 = _sensor(db_session, parcela_id, 2)
    s1 = _sensor(db_session, parcela_id, 1)
    for s in (s2, s1):
        _lectura(db_session, parcela_id, s, _a_las(2, 8), 10.0)
        _lectura(db_session, parcela_id, s, _a_las(1, 8), 10.0)

    filas = _pedir(client, auth_headers, parcela_id, dias=7).json()

    assert [(f["fecha"][-2:], f["sensor_numero"]) for f in filas] == [
        (str(HOY - timedelta(days=2))[-2:], 1), (str(HOY - timedelta(days=2))[-2:], 2),
        (str(HOY - timedelta(days=1))[-2:], 1), (str(HOY - timedelta(days=1))[-2:], 2),
    ]


def test_dias_fuera_de_rango_da_422(client, auth_headers, parcela_id):
    assert _pedir(client, auth_headers, parcela_id, dias=0).status_code == 422
    assert _pedir(client, auth_headers, parcela_id, dias=367).status_code == 422


def test_ignora_lecturas_con_fecha_futura(db_session, client, auth_headers, parcela_id):
    s1 = _sensor(db_session, parcela_id, 1)
    _lectura(db_session, parcela_id, s1, datetime.combine(HOY, time(8, 0)), 30.0)
    _lectura(db_session, parcela_id, s1, datetime.combine(HOY + timedelta(days=3), time(8, 0)), 99.0)

    filas = _pedir(client, auth_headers, parcela_id, dias=7).json()

    assert len(filas) == 1
    assert filas[0]["fecha"] == str(HOY)
    assert filas[0]["humedad_media"] == 30.0

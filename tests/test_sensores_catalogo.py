from app.routers.sensores import _obtener_resumen
from tests.ayudas import alta_sensor


def test_alta_y_listado_de_sensores(client, auth_headers, parcela_id):
    creado = alta_sensor(client, auth_headers, parcela_id, etiqueta="Nodo 1")
    assert creado["etiqueta"] == "Nodo 1"
    assert creado["activo"] is True
    assert creado["parcela_id"] == parcela_id

    resp = client.get(f"/parcelas/{parcela_id}/sensores", headers=auth_headers)
    assert resp.status_code == 200
    lista = resp.json()
    assert len(lista) == 1
    assert lista[0]["etiqueta"] == "Nodo 1"


def test_dar_de_baja_sensor_no_contamina_la_media(client, auth_headers, parcela_id, db_session):
    from datetime import datetime

    s1 = alta_sensor(client, auth_headers, parcela_id)
    s2 = alta_sensor(client, auth_headers, parcela_id)

    for sensor, humedad in [(s1, 30.0), (s2, 80.0)]:
        resp = client.post(
            "/logs/sensor/",
            json={
                "parcela_id": parcela_id,
                "sensor_id": sensor["id"],
                "fecha_hora": "2026-08-17T10:00:00",
                "humedad_suelo_pct": humedad,
                "temperatura_suelo": 19.0,
            },
            headers=auth_headers,
        )
        assert resp.status_code == 201

    resp = client.patch(
        f"/parcelas/{parcela_id}/sensores/{s2['id']}",
        json={"activo": False},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["activo"] is False

    # El resumen que usa el panel de Estado deja fuera al sensor dado de baja.
    resumen = _obtener_resumen(
        parcela_id, datetime(2026, 8, 17, 0, 0), datetime(2026, 8, 17, 23, 59, 59), db_session
    )
    assert resumen.n_sensores == 1
    assert resumen.humedad_media == 30.0

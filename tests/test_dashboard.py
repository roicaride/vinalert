from tests.ayudas import alta_sensor


def test_dashboard_usa_resumen_agregado_de_sensores(client, auth_headers, parcela_id):
    sensor = alta_sensor(client, auth_headers, parcela_id, etiqueta="Nodo 1")
    from datetime import datetime, timezone
    ahora = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
    client.post(
        "/logs/sensor/",
        json={
            "parcela_id": parcela_id,
            "sensor_id": sensor["id"],
            "fecha_hora": ahora,
            "humedad_suelo_pct": 40.0,
        },
        headers=auth_headers,
    )

    resp = client.get(f"/parcelas/{parcela_id}/dashboard", headers=auth_headers)
    assert resp.status_code == 200
    estado = resp.json()["estado_suelo"]
    assert estado["n_sensores"] == 1
    assert estado["humedad_media"] == 40.0


def test_el_dashboard_usa_la_media_justa(client, auth_headers, parcela_id):
    """Un sensor que manda mas lecturas no pesa mas en la media de Estado."""
    from datetime import datetime, timedelta
    from zoneinfo import ZoneInfo

    a = alta_sensor(client, auth_headers, parcela_id)
    b = alta_sensor(client, auth_headers, parcela_id)
    ahora = datetime.now(ZoneInfo("Europe/Madrid")).replace(tzinfo=None)
    for i, (sensor, humedad) in enumerate([(a, 30.0), (a, 30.0), (a, 30.0), (b, 10.0)]):
        client.post(
            "/logs/sensor/",
            json={
                "parcela_id": parcela_id,
                "sensor_id": sensor["id"],
                "fecha_hora": (ahora - timedelta(minutes=10 + i)).isoformat(),
                "humedad_suelo_pct": humedad,
                "temperatura_suelo": 20.0 if sensor is a else 10.0,
            },
            headers=auth_headers,
        )

    estado = client.get(f"/parcelas/{parcela_id}/dashboard", headers=auth_headers).json()["estado_suelo"]

    assert estado["humedad_media"] == 20.0
    assert estado["temperatura_media"] == 15.0
    assert estado["n_lecturas"] == 4

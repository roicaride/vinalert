def test_crear_log_sensor_requiere_sensor_id(client, auth_headers, parcela_id):
    resp = client.post(
        "/logs/sensor/",
        json={
            "parcela_id": parcela_id,
            "fecha_hora": "2026-08-17T10:00:00",
            "humedad_suelo_pct": 32.5,
            "temperatura_suelo": 18.2,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 422  # falta sensor_id


def test_crear_log_sensor_ok(client, auth_headers, parcela_id):
    sensor = client.post(
        f"/parcelas/{parcela_id}/sensores",
        json={"etiqueta": "Nodo 1"},
        headers=auth_headers,
    ).json()

    resp = client.post(
        "/logs/sensor/",
        json={
            "parcela_id": parcela_id,
            "sensor_id": sensor["id"],
            "fecha_hora": "2026-08-17T10:00:00",
            "humedad_suelo_pct": 32.5,
            "temperatura_suelo": 18.2,
            "bateria": 90.0,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["sensor_id"] == sensor["id"]
    assert "nitrogeno" not in body


def test_crear_log_sensor_con_sensor_de_otra_parcela_falla(client, auth_headers, parcela_id):
    otra_parcela = client.post(
        "/parcelas/", json={"nombre": "Otra parcela"}, headers=auth_headers
    ).json()
    sensor_otra = client.post(
        f"/parcelas/{otra_parcela['id']}/sensores",
        json={"etiqueta": "Nodo ajeno"},
        headers=auth_headers,
    ).json()

    resp = client.post(
        "/logs/sensor/",
        json={
            "parcela_id": parcela_id,
            "sensor_id": sensor_otra["id"],
            "fecha_hora": "2026-08-17T10:00:00",
            "humedad_suelo_pct": 32.5,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 422

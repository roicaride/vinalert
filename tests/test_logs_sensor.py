from tests.ayudas import alta_sensor


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
    sensor = alta_sensor(client, auth_headers, parcela_id, etiqueta="Nodo 1")

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
    sensor_otra = alta_sensor(client, auth_headers, otra_parcela["id"], etiqueta="Nodo ajeno")

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


def test_fecha_con_zona_horaria_se_guarda_en_hora_de_madrid(client, auth_headers, parcela_id):
    # La BD guarda hora de Madrid sin zona. Una fecha con zona (UTC del
    # firmware, o con offset) se convierte; si no, en invierno quedaria una
    # hora corrida y cerca de medianoche caeria en el dia equivocado.
    sensor = alta_sensor(client, auth_headers, parcela_id)

    resp = client.post(
        "/logs/sensor/",
        json={
            "parcela_id": parcela_id,
            "sensor_id": sensor["id"],
            "fecha_hora": "2026-01-15T23:30:00Z",
            "humedad_suelo_pct": 30.0,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["fecha_hora"].startswith("2026-01-16T00:30:00")

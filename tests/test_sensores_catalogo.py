def test_alta_y_listado_de_sensores(client, auth_headers, parcela_id):
    resp = client.post(
        f"/parcelas/{parcela_id}/sensores",
        json={"etiqueta": "Nodo 1"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    creado = resp.json()
    assert creado["etiqueta"] == "Nodo 1"
    assert creado["activo"] is True
    assert creado["parcela_id"] == parcela_id

    resp = client.get(f"/parcelas/{parcela_id}/sensores", headers=auth_headers)
    assert resp.status_code == 200
    lista = resp.json()
    assert len(lista) == 1
    assert lista[0]["etiqueta"] == "Nodo 1"


def test_dar_de_baja_sensor_no_contamina_la_media(client, auth_headers, parcela_id):
    s1 = client.post(f"/parcelas/{parcela_id}/sensores", json={"etiqueta": "Nodo 1"}, headers=auth_headers).json()
    s2 = client.post(f"/parcelas/{parcela_id}/sensores", json={"etiqueta": "Nodo 2"}, headers=auth_headers).json()

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
    actualizado = resp.json()
    assert actualizado["activo"] is False
    assert actualizado["etiqueta"] == "Nodo 2"

    resp = client.get(
        f"/parcelas/{parcela_id}/sensores/resumen",
        params={"desde": "2026-08-17T00:00:00", "hasta": "2026-08-17T23:59:59"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["n_sensores"] == 1
    assert body["humedad_media"] == 30.0

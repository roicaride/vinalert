def test_resumen_agrega_varios_sensores(client, auth_headers, parcela_id):
    s1 = client.post(f"/parcelas/{parcela_id}/sensores", json={"etiqueta": "Nodo 1"}, headers=auth_headers).json()
    s2 = client.post(f"/parcelas/{parcela_id}/sensores", json={"etiqueta": "Nodo 2"}, headers=auth_headers).json()

    for sensor, humedad in [(s1, 30.0), (s2, 34.0)]:
        client.post(
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

    resp = client.get(
        f"/parcelas/{parcela_id}/sensores/resumen",
        params={"desde": "2026-08-17T00:00:00", "hasta": "2026-08-17T23:59:59"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["n_sensores"] == 2
    assert body["humedad_media"] == 32.0


def test_resumen_sin_lecturas_devuelve_nulos(client, auth_headers, parcela_id):
    resp = client.get(f"/parcelas/{parcela_id}/sensores/resumen", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["n_sensores"] == 0
    assert body["humedad_media"] is None

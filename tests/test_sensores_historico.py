def test_historico_de_un_sensor(client, auth_headers, parcela_id):
    sensor = client.post(
        f"/parcelas/{parcela_id}/sensores", json={"etiqueta": "Nodo 1"}, headers=auth_headers
    ).json()
    otro_sensor = client.post(
        f"/parcelas/{parcela_id}/sensores", json={"etiqueta": "Nodo 2"}, headers=auth_headers
    ).json()

    for hora, humedad in [("08:00:00", 30.0), ("09:00:00", 31.0)]:
        client.post(
            "/logs/sensor/",
            json={
                "parcela_id": parcela_id,
                "sensor_id": sensor["id"],
                "fecha_hora": f"2026-08-17T{hora}",
                "humedad_suelo_pct": humedad,
            },
            headers=auth_headers,
        )
    client.post(
        "/logs/sensor/",
        json={
            "parcela_id": parcela_id,
            "sensor_id": otro_sensor["id"],
            "fecha_hora": "2026-08-17T08:30:00",
            "humedad_suelo_pct": 99.0,
        },
        headers=auth_headers,
    )

    resp = client.get(
        f"/parcelas/{parcela_id}/sensores/{sensor['id']}/historico", headers=auth_headers
    )
    assert resp.status_code == 200
    lecturas = resp.json()
    assert len(lecturas) == 2
    assert all(l["sensor_id"] == sensor["id"] for l in lecturas)
    assert lecturas[0]["humedad_suelo_pct"] == 30.0
    assert lecturas[1]["humedad_suelo_pct"] == 31.0

def test_dashboard_no_expone_riesgo_ni_riego(client, auth_headers, parcela_id):
    resp = client.get(f"/parcelas/{parcela_id}/dashboard", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "ultima_recomendacion" not in body
    assert "ultimo_riesgo" not in body


def test_dashboard_usa_resumen_agregado_de_sensores(client, auth_headers, parcela_id):
    sensor = client.post(
        f"/parcelas/{parcela_id}/sensores", json={"etiqueta": "Nodo 1"}, headers=auth_headers
    ).json()
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

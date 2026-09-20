from tests.ayudas import alta_sensor


def _crear(client, headers, parcela_id):
    return alta_sensor(client, headers, parcela_id, etiqueta="A")


def test_configurar_los_campos_nuevos(client, auth_headers, parcela_id):
    sensor = _crear(client, auth_headers, parcela_id)

    resp = client.patch(
        f"/parcelas/{parcela_id}/sensores/{sensor['id']}",
        json={"profundidad_cm": 40.0, "latitud": 42.31, "longitud": -8.61, "modelo": "ACME-1000"},
        headers=auth_headers,
    )

    assert resp.status_code == 200
    cuerpo = resp.json()
    assert cuerpo["profundidad_cm"] == 40.0
    assert cuerpo["latitud"] == 42.31
    assert cuerpo["longitud"] == -8.61
    assert cuerpo["modelo"] == "ACME-1000"


def test_solo_se_modifican_los_campos_enviados(client, auth_headers, parcela_id):
    """La trampa: sembrar todo y enviar uno solo, comprobando que el resto sigue."""
    sensor = _crear(client, auth_headers, parcela_id)
    client.patch(
        f"/parcelas/{parcela_id}/sensores/{sensor['id']}",
        json={"profundidad_cm": 40.0, "modelo": "ACME-1000"},
        headers=auth_headers,
    )

    resp = client.patch(
        f"/parcelas/{parcela_id}/sensores/{sensor['id']}",
        json={"etiqueta": "Renombrado"},
        headers=auth_headers,
    )

    cuerpo = resp.json()
    assert cuerpo["etiqueta"] == "Renombrado"
    assert cuerpo["profundidad_cm"] == 40.0, "un PATCH parcial ha borrado otro campo"
    assert cuerpo["modelo"] == "ACME-1000"


def test_el_numero_no_es_editable(client, auth_headers, parcela_id):
    sensor = _crear(client, auth_headers, parcela_id)

    resp = client.patch(
        f"/parcelas/{parcela_id}/sensores/{sensor['id']}",
        json={"numero": 99},
        headers=auth_headers,
    )

    assert resp.status_code == 200
    assert resp.json()["numero"] == sensor["numero"]


def test_coordenadas_del_sensor_fuera_de_rango_dan_422(client, auth_headers, parcela_id):
    sensor = _crear(client, auth_headers, parcela_id)

    for cuerpo in ({"latitud": 91.0}, {"latitud": -91.0}, {"longitud": 181.0}, {"longitud": -181.0}):
        resp = client.patch(
            f"/parcelas/{parcela_id}/sensores/{sensor['id']}", json=cuerpo, headers=auth_headers
        )
        assert resp.status_code == 422, f"{cuerpo} deberia ser rechazado"


def test_null_explicito_en_coordenadas_no_da_422(client, auth_headers, parcela_id):
    """
    Camino distinto al de omitir el campo: aqui `latitud` llega PRESENTE con
    valor None, se valida, y solo despues la descarta el exclude_none del
    endpoint. Un formulario que serialice todos los campos hara justo esto.
    """
    sensor = _crear(client, auth_headers, parcela_id)

    resp = client.patch(
        f"/parcelas/{parcela_id}/sensores/{sensor['id']}",
        json={"latitud": None, "longitud": None, "etiqueta": "Sin posicion"},
        headers=auth_headers,
    )

    assert resp.status_code == 200
    assert resp.json()["etiqueta"] == "Sin posicion"


def test_borrar_sensor_y_sus_lecturas(client, auth_headers, parcela_id):
    sensor = _crear(client, auth_headers, parcela_id)
    sid = sensor["id"]

    # Añadir un log de sensor
    resp_log = client.post(
        "/logs/sensor/",
        json={
            "parcela_id": parcela_id,
            "sensor_id": sid,
            "fecha_hora": "2026-08-21T10:00:00",
            "humedad_suelo_pct": 25.0,
        },
        headers=auth_headers,
    )
    assert resp_log.status_code == 201

    # Borrar el sensor
    resp_del = client.delete(f"/parcelas/{parcela_id}/sensores/{sid}", headers=auth_headers)
    assert resp_del.status_code == 204

    # Comprobar que ya no aparece en el listado
    resp_list = client.get(f"/parcelas/{parcela_id}/sensores/", headers=auth_headers)
    assert resp_list.status_code == 200
    assert all(s["id"] != sid for s in resp_list.json())

    # Intentar borrar de nuevo da 404
    resp_del2 = client.delete(f"/parcelas/{parcela_id}/sensores/{sid}", headers=auth_headers)
    assert resp_del2.status_code == 404


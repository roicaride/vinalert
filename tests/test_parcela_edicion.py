def test_consultar_una_parcela(client, auth_headers, parcela_id):
    resp = client.get(f"/parcelas/{parcela_id}", headers=auth_headers)

    assert resp.status_code == 200
    assert resp.json()["id"] == parcela_id
    assert resp.json()["nombre"] == "Parcela Test"


def test_editar_las_coordenadas(client, auth_headers, parcela_id):
    """El motivo de ser de esta tarea: hoy un error al crear era permanente."""
    resp = client.patch(
        f"/parcelas/{parcela_id}",
        json={"latitud": 42.31, "longitud": -8.61},
        headers=auth_headers,
    )

    assert resp.status_code == 200
    assert resp.json()["latitud"] == 42.31
    assert resp.json()["longitud"] == -8.61


def test_solo_se_modifican_los_campos_enviados(client, auth_headers, parcela_id):
    """Trampa: sembrar varios campos y enviar uno; el resto debe sobrevivir."""
    client.patch(
        f"/parcelas/{parcela_id}",
        json={"variedad": "Albarino", "superficie_total_m2": 15000.0, "tipo_cultivo": "Vinedo"},
        headers=auth_headers,
    )

    resp = client.patch(f"/parcelas/{parcela_id}", json={"nombre": "Renombrada"}, headers=auth_headers)

    cuerpo = resp.json()
    assert cuerpo["nombre"] == "Renombrada"
    assert cuerpo["variedad"] == "Albarino", "un PATCH parcial ha borrado otro campo"
    assert cuerpo["superficie_total_m2"] == 15000.0
    assert cuerpo["tipo_cultivo"] == "Vinedo"


def test_un_patch_vacio_no_es_un_error(client, auth_headers, parcela_id):
    """Un formulario que no cambia nada no deberia fallar."""
    resp = client.patch(f"/parcelas/{parcela_id}", json={}, headers=auth_headers)

    assert resp.status_code == 200
    assert resp.json()["nombre"] == "Parcela Test"


def test_coordenadas_fuera_de_rango_dan_422_al_editar(client, auth_headers, parcela_id):
    for cuerpo in ({"latitud": 91.0}, {"latitud": -91.0}, {"longitud": 181.0}, {"longitud": -181.0}):
        resp = client.patch(f"/parcelas/{parcela_id}", json=cuerpo, headers=auth_headers)
        assert resp.status_code == 422, f"{cuerpo} deberia ser rechazado"


def test_coordenadas_fuera_de_rango_dan_422_al_crear(client, auth_headers):
    resp = client.post(
        "/parcelas/", json={"nombre": "Mala", "latitud": 999.0}, headers=auth_headers
    )
    assert resp.status_code == 422


def test_un_lector_no_puede_editar(client, auth_headers, parcela_id, db_session):
    from app.models import ParcelaUsuario, Usuario

    client.post(
        "/auth/register",
        json={"nombre": "L", "email": "lector@test.dev", "password": "clave12345"},
    )
    tok = client.post(
        "/auth/token", data={"username": "lector@test.dev", "password": "clave12345"}
    ).json()["access_token"]
    u = db_session.query(Usuario).filter_by(email="lector@test.dev").first()
    db_session.add(ParcelaUsuario(parcela_id=parcela_id, usuario_id=u.id, rol="lectura"))
    db_session.commit()
    cabeceras = {"Authorization": f"Bearer {tok}"}

    assert client.get(f"/parcelas/{parcela_id}", headers=cabeceras).status_code == 200
    assert client.patch(f"/parcelas/{parcela_id}", json={"nombre": "X"}, headers=cabeceras).status_code == 403


def test_null_explicito_en_coordenadas_no_da_422(client, auth_headers, parcela_id):
    """
    Camino distinto al de omitir el campo: aqui `latitud` llega PRESENTE con
    valor None, se valida contra Field(ge/le), y solo despues la descarta el
    exclude_none del endpoint. Un formulario que serialice todos los campos
    hara justo esto.
    """
    resp = client.patch(
        f"/parcelas/{parcela_id}",
        json={"latitud": None, "longitud": None, "nombre": "Sin coordenadas"},
        headers=auth_headers,
    )

    assert resp.status_code == 200
    assert resp.json()["nombre"] == "Sin coordenadas"


def test_borrar_parcela_y_cascada(client, auth_headers, parcela_id, db_session):
    # Añadir un sensor a la parcela
    client.post(f"/parcelas/{parcela_id}/sensores", json={"etiqueta": "S1"}, headers=auth_headers)

    # Borrar la parcela
    resp = client.delete(f"/parcelas/{parcela_id}", headers=auth_headers)
    assert resp.status_code == 204

    # Verificar que ya no existe
    assert client.get(f"/parcelas/{parcela_id}", headers=auth_headers).status_code == 404


def test_lector_no_puede_borrar_parcela(client, auth_headers, parcela_id, db_session):
    from app.models import ParcelaUsuario, Usuario

    client.post(
        "/auth/register",
        json={"nombre": "L2", "email": "lector2@test.dev", "password": "clave12345"},
    )
    tok = client.post(
        "/auth/token", data={"username": "lector2@test.dev", "password": "clave12345"}
    ).json()["access_token"]
    u = db_session.query(Usuario).filter_by(email="lector2@test.dev").first()
    db_session.add(ParcelaUsuario(parcela_id=parcela_id, usuario_id=u.id, rol="lectura"))
    db_session.commit()
    cabeceras = {"Authorization": f"Bearer {tok}"}

    assert client.delete(f"/parcelas/{parcela_id}", headers=cabeceras).status_code == 403


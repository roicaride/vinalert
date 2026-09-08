from app.models import ParcelaUsuario, Usuario


def _otro_usuario(client, email="otro@test.dev"):
    client.post("/auth/register", json={"nombre": "Otro", "email": email, "password": "clave12345"})
    resp = client.post("/auth/token", data={"username": email, "password": "clave12345"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def test_el_creador_queda_como_gestor(client, auth_headers, db_session):
    resp = client.post(
        "/parcelas/",
        json={"nombre": "Mia", "latitud": 41.0, "longitud": -3.0},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    parcela_id = resp.json()["id"]

    miembros = db_session.query(ParcelaUsuario).filter_by(parcela_id=parcela_id).all()
    assert len(miembros) == 1
    assert miembros[0].rol == "gestor"


def test_el_listado_solo_devuelve_las_parcelas_asociadas(client, auth_headers):
    client.post("/parcelas/", json={"nombre": "Mia"}, headers=auth_headers)
    otro = _otro_usuario(client)
    client.post("/parcelas/", json={"nombre": "Del otro"}, headers=otro)

    mias = client.get("/parcelas/", headers=auth_headers).json()
    assert [p["nombre"] for p in mias] == ["Mia"]

    del_otro = client.get("/parcelas/", headers=otro).json()
    assert [p["nombre"] for p in del_otro] == ["Del otro"]


def test_el_listado_incluye_las_parcelas_donde_solo_tengo_lectura(client, auth_headers, db_session):
    """Sin esto, un invitado no veria la parcela compartida en su lista."""
    otro = _otro_usuario(client)
    creada = client.post("/parcelas/", json={"nombre": "Compartida"}, headers=otro).json()

    yo = db_session.query(Usuario).filter_by(email="test@vinalert.dev").first()
    db_session.add(ParcelaUsuario(parcela_id=creada["id"], usuario_id=yo.id, rol="lectura"))
    db_session.commit()

    mias = client.get("/parcelas/", headers=auth_headers).json()
    assert [p["nombre"] for p in mias] == ["Compartida"]


def test_el_admin_ve_todas_las_parcelas(client, auth_headers, db_session):
    client.post("/parcelas/", json={"nombre": "Mia"}, headers=auth_headers)
    otro = _otro_usuario(client)
    client.post("/parcelas/", json={"nombre": "Del otro"}, headers=otro)

    admin_headers = _otro_usuario(client, email="admin@test.dev")
    admin = db_session.query(Usuario).filter_by(email="admin@test.dev").first()
    admin.rol = "admin"
    db_session.commit()

    todas = client.get("/parcelas/", headers=admin_headers).json()
    assert {p["nombre"] for p in todas} == {"Mia", "Del otro"}

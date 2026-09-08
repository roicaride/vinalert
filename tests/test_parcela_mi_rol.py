from app.models import ParcelaUsuario, Usuario


def _registrar(client, email):
    client.post("/auth/register", json={"nombre": email, "email": email, "password": "clave12345"})
    resp = client.post("/auth/token", data={"username": email, "password": "clave12345"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def test_el_creador_ve_mi_rol_gestor(client, auth_headers, parcela_id):
    resp = client.get(f"/parcelas/{parcela_id}", headers=auth_headers)

    assert resp.status_code == 200
    assert resp.json()["mi_rol"] == "gestor"


def test_un_lector_ve_mi_rol_lectura(client, auth_headers, parcela_id, db_session):
    lector = _registrar(client, "lector@test.dev")
    u = db_session.query(Usuario).filter_by(email="lector@test.dev").first()
    db_session.add(ParcelaUsuario(parcela_id=parcela_id, usuario_id=u.id, rol="lectura"))
    db_session.commit()

    resp = client.get(f"/parcelas/{parcela_id}", headers=lector)

    assert resp.json()["mi_rol"] == "lectura"


def test_el_admin_no_asociado_ve_mi_rol_gestor(client, auth_headers, parcela_id, db_session):
    """Responde a que PUEDE hacer, no a por que puede."""
    admin = _registrar(client, "admin@test.dev")
    u = db_session.query(Usuario).filter_by(email="admin@test.dev").first()
    u.rol = "admin"
    db_session.commit()

    resp = client.get(f"/parcelas/{parcela_id}", headers=admin)

    assert resp.json()["mi_rol"] == "gestor"


def test_el_listado_trae_mi_rol(client, auth_headers, parcela_id):
    parcelas = client.get("/parcelas/", headers=auth_headers).json()

    assert len(parcelas) == 1
    assert parcelas[0]["mi_rol"] == "gestor"


def test_el_listado_distingue_el_rol_de_cada_parcela(client, auth_headers, db_session):
    """Con una propia y una compartida en lectura, cada fila trae el suyo."""
    mia = client.post("/parcelas/", json={"nombre": "Mia"}, headers=auth_headers).json()
    otro = _registrar(client, "otro@test.dev")
    suya = client.post("/parcelas/", json={"nombre": "Suya"}, headers=otro).json()

    yo = db_session.query(Usuario).filter_by(email="test@vinalert.dev").first()
    db_session.add(ParcelaUsuario(parcela_id=suya["id"], usuario_id=yo.id, rol="lectura"))
    db_session.commit()

    por_nombre = {p["nombre"]: p["mi_rol"] for p in client.get("/parcelas/", headers=auth_headers).json()}

    assert por_nombre == {"Mia": "gestor", "Suya": "lectura"}


def test_al_crear_una_parcela_la_respuesta_trae_mi_rol(client, auth_headers):
    resp = client.post("/parcelas/", json={"nombre": "Nueva"}, headers=auth_headers)

    assert resp.status_code == 201
    assert resp.json()["mi_rol"] == "gestor"


def test_al_editar_una_parcela_la_respuesta_trae_mi_rol(client, auth_headers, parcela_id):
    resp = client.patch(f"/parcelas/{parcela_id}", json={"nombre": "Editada"}, headers=auth_headers)

    assert resp.json()["mi_rol"] == "gestor"


def test_el_dashboard_sigue_respondiendo_con_mi_rol(client, auth_headers, parcela_id):
    """
    El punto que mas facil se olvida: ParcelaResp va embebido en
    DashboardCompleto, asi que un mi_rol sin rellenar aqui da un 500.
    """
    resp = client.get(f"/parcelas/{parcela_id}/dashboard", headers=auth_headers)

    assert resp.status_code == 200, "el dashboard se ha roto al anadir mi_rol"
    assert resp.json()["parcela"]["mi_rol"] == "gestor"

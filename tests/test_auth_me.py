from app.models import Usuario


def test_me_devuelve_el_usuario_autenticado(client, auth_headers):
    resp = client.get("/auth/me", headers=auth_headers)

    assert resp.status_code == 200
    cuerpo = resp.json()
    assert cuerpo["email"] == "test@vinalert.dev"
    assert cuerpo["nombre"] == "Test User"
    assert cuerpo["rol"] == "agricultor"
    assert isinstance(cuerpo["id"], int)


def test_me_sin_token_da_401(client):
    assert client.get("/auth/me").status_code == 401


def test_me_con_token_invalido_da_401(client):
    resp = client.get("/auth/me", headers={"Authorization": "Bearer basura"})
    assert resp.status_code == 401


def test_me_refleja_el_rol_admin(client, auth_headers, db_session):
    """El frontend usa este campo para saber si entra en cualquier parcela."""
    u = db_session.query(Usuario).filter_by(email="test@vinalert.dev").first()
    u.rol = "admin"
    db_session.commit()

    resp = client.get("/auth/me", headers=auth_headers)

    assert resp.json()["rol"] == "admin"


def test_me_no_expone_la_contrasena(client, auth_headers):
    cuerpo = client.get("/auth/me", headers=auth_headers).json()
    assert "hashed_password" not in cuerpo
    assert "password" not in cuerpo


def test_el_token_dura_siete_dias():
    """
    Una semana en vez de un dia. El coste esta aceptado en el spec: un token
    robado sirve siete dias y no hay forma de revocarlo.
    """
    from app.auth import ACCESS_TOKEN_EXPIRE_MINUTES

    assert ACCESS_TOKEN_EXPIRE_MINUTES == 60 * 24 * 7


def test_token_con_sub_no_numerico_da_401_no_500(client):
    """
    El caso que destapo la duplicacion: `int(sub)` debe estar DENTRO del
    try/except. Si queda fuera, un token manipulado produce un 500 en vez del
    401 que garantiza el resto de la API.
    """
    from app.auth import crear_token_acceso

    token = crear_token_acceso({"sub": "abc"})
    resp = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert resp.status_code == 401

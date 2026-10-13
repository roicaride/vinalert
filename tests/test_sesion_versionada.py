"""
Las sesiones se pueden revocar: cada token lleva la version de sesion de la
cuenta, y subirla (al restablecer o cambiar la contrasena, o al cerrar sesion
en todos los dispositivos) invalida los tokens anteriores.
"""
from app.auth import crear_token_acceso
from app.models import Usuario
from tests.ayudas import registrar


def _headers(token):
    return {"Authorization": f"Bearer {token}"}


def _login(client, email, password="clave12345"):
    return client.post("/auth/token", data={"username": email, "password": password})


def test_subir_la_version_invalida_las_sesiones_abiertas(client, db_session):
    u = registrar(client, "ana@x.es")
    token = _login(client, "ana@x.es").json()["access_token"]
    assert client.get("/auth/me", headers=_headers(token)).status_code == 200

    u.token_version += 1
    db_session.commit()

    assert client.get("/auth/me", headers=_headers(token)).status_code == 401


def test_un_token_anterior_a_las_versiones_sigue_valiendo(client):
    # Los tokens emitidos antes de este cambio no llevan "ver": nadie debe
    # perder la sesion al desplegar.
    u = registrar(client, "ana@x.es")
    viejo = crear_token_acceso({"sub": str(u.id)})
    assert client.get("/auth/me", headers=_headers(viejo)).status_code == 200


def test_una_cuenta_pendiente_no_puede_entrar(client, db_session):
    db_session.add(Usuario(nombre="", email="pend@x.es", hashed_password=None))
    db_session.commit()
    resp = _login(client, "pend@x.es", password="cualquiera123")
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Email o contraseña incorrectos"


def test_un_token_de_una_cuenta_pendiente_no_vale(client, db_session):
    u = Usuario(nombre="", email="pend@x.es", hashed_password=None)
    db_session.add(u)
    db_session.commit()
    token = crear_token_acceso({"sub": str(u.id), "ver": 0})
    assert client.get("/auth/me", headers=_headers(token)).status_code == 401


def test_el_registro_publico_ya_no_existe(client):
    resp = client.post("/auth/register", json={"nombre": "X", "email": "x@x.es", "password": "clave12345"})
    assert resp.status_code in (404, 405)

"""
El superadmin es una marca en la BD, no un email. Antes bastaba con que la
cuenta se llamase admin@vinalert.dev, y como el registro es publico, el primero
que registrase ese email en una BD sin el (por ejemplo, una de produccion
sembrada con otro) se llevaba el listado de usuarios y los dispositivos.
"""
from app.models import Usuario
from tests.ayudas import hacer_superadmin, registrar


def _registrar_y_entrar(client, email):
    registrar(client, email, nombre="X", password="clave12345")
    resp = client.post("/auth/token", data={"username": email, "password": "clave12345"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def test_registrar_el_email_del_admin_no_da_superadmin(client, db_session):
    headers = _registrar_y_entrar(client, "admin@vinalert.dev")

    assert client.get("/auth/me", headers=headers).json()["es_superadmin"] is False
    assert client.get("/admin/usuarios", headers=headers).status_code == 403
    u = db_session.query(Usuario).filter_by(email="admin@vinalert.dev").one()
    assert u.es_superadmin is False


def test_la_marca_en_la_bd_da_superadmin_con_cualquier_email(client, db_session):
    headers = _registrar_y_entrar(client, "jefa@bodega.es")
    hacer_superadmin(db_session, "jefa@bodega.es")

    assert client.get("/auth/me", headers=headers).json()["es_superadmin"] is True
    assert client.get("/admin/usuarios", headers=headers).status_code == 200


def test_el_403_no_revela_cual_es_la_cuenta_de_admin(client):
    headers = _registrar_y_entrar(client, "curioso@vinalert.dev")

    resp = client.get("/admin/usuarios", headers=headers)
    assert resp.status_code == 403
    assert "@" not in resp.json()["detail"]

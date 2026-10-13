"""
Alta por invitacion. Un gestor invita a su parcela (POST /parcelas/{id}/usuarios
de siempre); el superadmin invita clientes nuevos sin parcela. La invitacion
crea la cuenta ya, pendiente (sin contrasena), y la persona la activa desde el
enlace del email poniendo su nombre y su contrasena.
"""
import pytest

from app.models import ParcelaUsuario, Usuario
from tests.ayudas import hacer_superadmin, registrar


def _entrar(client, email, password="clave12345"):
    tok = client.post("/auth/token", data={"username": email, "password": password}).json()["access_token"]
    return {"Authorization": f"Bearer {tok}"}


def _invitar(client, headers, pid, email, rol="lectura"):
    return client.post(f"/parcelas/{pid}/usuarios", json={"email": email, "rol": rol}, headers=headers)


def _aceptar(client, token, nombre="Ana Pérez", password="cepas-de-albariño"):
    return client.post("/auth/invitacion/aceptar", json={"token": token, "nombre": nombre, "password": password})


def _reenviar(client, headers, uid):
    return client.post(f"/auth/invitaciones/{uid}/reenviar", headers=headers)


def _uid(db_session, email):
    return db_session.query(Usuario).filter_by(email=email).one().id


@pytest.fixture()
def admin(client):
    registrar(client, "admin@vinalert.dev", nombre="Admin")
    hacer_superadmin(client.db, "admin@vinalert.dev")
    return _entrar(client, "admin@vinalert.dev")


# --- Un gestor invita a su parcela -----------------------------------------

def test_invitar_un_email_sin_cuenta_crea_la_cuenta_pendiente_y_envia_el_email(
    client, auth_headers, parcela_id, buzon, db_session,
):
    resp = _invitar(client, auth_headers, parcela_id, "Nueva@X.es ")

    assert resp.status_code == 201, resp.text
    assert resp.json()["pendiente"] is True
    assert resp.json()["email"] == "nueva@x.es"
    u = db_session.query(Usuario).filter_by(email="nueva@x.es").one()
    assert u.pendiente
    assert db_session.query(ParcelaUsuario).filter_by(usuario_id=u.id, parcela_id=parcela_id).one().rol == "lectura"
    (msg,) = buzon.mensajes
    assert msg["para"] == "nueva@x.es"
    assert "/invitacion?token=" in msg["texto"]
    assert "Test User" in msg["texto"] and "Parcela Test" in msg["texto"]


def test_invitar_una_cuenta_activa_solo_la_anade(client, auth_headers, parcela_id, buzon, db_session):
    registrar(client, "ana@x.es")
    resp = _invitar(client, auth_headers, parcela_id, "ANA@x.es")
    assert resp.status_code == 201
    assert resp.json()["pendiente"] is False
    assert buzon.mensajes == []
    assert db_session.query(Usuario).filter_by(email="ana@x.es").one().hashed_password is not None


def test_invitar_una_cuenta_pendiente_a_otra_parcela_reenvia(client, auth_headers, parcela_id, buzon):
    otra = client.post("/parcelas/", json={"nombre": "Otra"}, headers=auth_headers).json()["id"]
    _invitar(client, auth_headers, parcela_id, "nueva@x.es")
    primero = buzon.token()

    resp = _invitar(client, auth_headers, otra, "nueva@x.es")

    assert resp.status_code == 201
    assert len(buzon.mensajes) == 2
    assert _aceptar(client, primero).status_code == 400  # anulado por el nuevo
    assert _aceptar(client, buzon.token()).status_code == 200


def test_un_lector_no_puede_invitar(client, auth_headers, parcela_id, buzon):
    registrar(client, "lector@x.es")
    _invitar(client, auth_headers, parcela_id, "lector@x.es")
    resp = _invitar(client, _entrar(client, "lector@x.es"), parcela_id, "otro@x.es")
    assert resp.status_code == 403
    assert buzon.mensajes == []


def test_el_listado_de_miembros_marca_a_los_pendientes(client, auth_headers, parcela_id, buzon):
    _invitar(client, auth_headers, parcela_id, "nueva@x.es")
    filas = client.get(f"/parcelas/{parcela_id}/usuarios", headers=auth_headers).json()
    assert {f["email"]: f["pendiente"] for f in filas} == {"test@vinalert.dev": False, "nueva@x.es": True}


# --- Aceptar ----------------------------------------------------------------

def test_ver_la_invitacion_dice_quien_invita_y_a_que_parcela(client, auth_headers, parcela_id, buzon):
    _invitar(client, auth_headers, parcela_id, "nueva@x.es")
    resp = client.get("/auth/invitacion", params={"token": buzon.token()})
    assert resp.status_code == 200
    assert resp.json() == {"email": "nueva@x.es", "invitado_por": "Test User", "parcela": "Parcela Test"}


def test_aceptar_activa_la_cuenta_y_deja_la_sesion_iniciada(client, auth_headers, parcela_id, buzon):
    _invitar(client, auth_headers, parcela_id, "nueva@x.es")
    resp = _aceptar(client, buzon.token())
    assert resp.status_code == 200
    headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}
    assert client.get("/auth/me", headers=headers).json()["nombre"] == "Ana Pérez"
    assert len(client.get("/parcelas/", headers=headers).json()) == 1
    login = client.post("/auth/token", data={"username": "nueva@x.es", "password": "cepas-de-albariño"})
    assert login.status_code == 200


def test_aceptar_dos_veces_falla_la_segunda(client, auth_headers, parcela_id, buzon):
    _invitar(client, auth_headers, parcela_id, "nueva@x.es")
    token = buzon.token()
    assert _aceptar(client, token).status_code == 200
    resp = _aceptar(client, token, password="otra-clave-distinta")
    assert resp.status_code == 400
    assert resp.json()["detail"]["codigo"] == "enlace_invalido"


def test_un_enlace_inventado_no_muestra_nada(client):
    resp = client.get("/auth/invitacion", params={"token": "inventado"})
    assert resp.status_code == 400
    assert resp.json()["detail"]["codigo"] == "enlace_invalido"


def test_aceptar_exige_una_contrasena_valida_y_un_nombre(client, auth_headers, parcela_id, buzon):
    _invitar(client, auth_headers, parcela_id, "nueva@x.es")
    assert _aceptar(client, buzon.token(), password="corta").status_code == 422
    assert _aceptar(client, buzon.token(), nombre="   ").status_code == 422


# --- Reenviar ---------------------------------------------------------------

def test_un_gestor_reenvia_la_invitacion(client, auth_headers, parcela_id, buzon, db_session):
    _invitar(client, auth_headers, parcela_id, "nueva@x.es")
    assert _reenviar(client, auth_headers, _uid(db_session, "nueva@x.es")).status_code == 204
    assert len(buzon.mensajes) == 2


def test_alguien_ajeno_no_puede_reenviar(client, auth_headers, parcela_id, buzon, db_session):
    _invitar(client, auth_headers, parcela_id, "nueva@x.es")
    registrar(client, "ajeno@x.es")
    resp = _reenviar(client, _entrar(client, "ajeno@x.es"), _uid(db_session, "nueva@x.es"))
    assert resp.status_code == 404
    assert len(buzon.mensajes) == 1


def test_un_lector_de_la_parcela_no_puede_reenviar(client, auth_headers, parcela_id, buzon, db_session):
    registrar(client, "lector@x.es")
    _invitar(client, auth_headers, parcela_id, "lector@x.es")
    _invitar(client, auth_headers, parcela_id, "nueva@x.es")
    resp = _reenviar(client, _entrar(client, "lector@x.es"), _uid(db_session, "nueva@x.es"))
    assert resp.status_code == 404


def test_reenviar_a_una_cuenta_activa_da_409(client, auth_headers, parcela_id, buzon, db_session):
    registrar(client, "ana@x.es")
    _invitar(client, auth_headers, parcela_id, "ana@x.es")
    assert _reenviar(client, auth_headers, _uid(db_session, "ana@x.es")).status_code == 409


def test_el_superadmin_reenvia_cualquier_invitacion(client, admin, auth_headers, parcela_id, buzon, db_session):
    _invitar(client, auth_headers, parcela_id, "nueva@x.es")
    assert _reenviar(client, admin, _uid(db_session, "nueva@x.es")).status_code == 204


# --- El superadmin invita clientes -----------------------------------------

def test_el_superadmin_invita_un_cliente_sin_parcelas(client, admin, buzon):
    resp = client.post("/admin/invitaciones", json={"email": "Bodega@X.es", "nombre": "Bodega X"}, headers=admin)
    assert resp.status_code == 201, resp.text
    assert resp.json()["email"] == "bodega@x.es"
    assert resp.json()["pendiente"] is True
    assert resp.json()["n_parcelas"] == 0
    (msg,) = buzon.mensajes
    assert msg["para"] == "bodega@x.es"
    filas = client.get("/admin/usuarios", headers=admin).json()
    assert next(f for f in filas if f["email"] == "bodega@x.es")["pendiente"] is True


def test_invitar_un_cliente_que_ya_existe_da_409(client, admin, buzon):
    registrar(client, "ana@x.es")
    resp = client.post("/admin/invitaciones", json={"email": "ana@x.es", "nombre": "Ana"}, headers=admin)
    assert resp.status_code == 409


def test_un_gestor_no_invita_clientes(client, auth_headers, buzon):
    resp = client.post("/admin/invitaciones", json={"email": "x@x.es", "nombre": "X"}, headers=auth_headers)
    assert resp.status_code == 403


# --- Retirar a un invitado pendiente -----------------------------------------

def test_retirar_a_un_pendiente_anula_su_invitacion(client, auth_headers, parcela_id, buzon, db_session):
    # Un email mal escrito llega a un desconocido; el gestor lo ve y lo retira.
    _invitar(client, auth_headers, parcela_id, "juan@gmial.com")
    token = buzon.token()
    uid = _uid(db_session, "juan@gmial.com")

    assert client.delete(f"/parcelas/{parcela_id}/usuarios/{uid}", headers=auth_headers).status_code == 204

    assert _aceptar(client, token).status_code == 400
    assert db_session.query(Usuario).filter_by(email="juan@gmial.com").count() == 0


def test_retirar_a_un_pendiente_que_tiene_otra_parcela_no_borra_su_cuenta(client, auth_headers, parcela_id, buzon, db_session):
    otra = client.post("/parcelas/", json={"nombre": "Otra"}, headers=auth_headers).json()["id"]
    _invitar(client, auth_headers, parcela_id, "nueva@x.es")
    _invitar(client, auth_headers, otra, "nueva@x.es")
    uid = _uid(db_session, "nueva@x.es")

    client.delete(f"/parcelas/{parcela_id}/usuarios/{uid}", headers=auth_headers)

    assert _aceptar(client, buzon.token()).status_code == 200

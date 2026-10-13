"""
Gestion de cuentas desde el panel del superadmin: desactivar, eliminar
(derecho de supresion), superadmins y acceso a todas las parcelas. Todo lo
que antes exigia tocar la BD a mano.
"""
import pytest

from app.models import IntentoAcceso, Parcela, ParcelaUsuario, Tratamiento, Usuario
from tests.ayudas import hacer_superadmin, registrar


def _entrar(client, email, password="clave12345"):
    resp = client.post("/auth/token", data={"username": email, "password": password})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture()
def admin(client):
    registrar(client, "admin@vinalert.dev", nombre="Admin")
    hacer_superadmin(client.db, "admin@vinalert.dev")
    return _entrar(client, "admin@vinalert.dev")


def _uid(db, email):
    return db.query(Usuario).filter_by(email=email).one().id


def _patch(client, headers, uid, **cambios):
    return client.patch(f"/admin/usuarios/{uid}", json=cambios, headers=headers)


# --- Desactivar --------------------------------------------------------------

def test_desactivar_cierra_sus_sesiones_y_no_le_deja_entrar(client, admin, db_session):
    registrar(client, "ana@x.es")
    sesion = _entrar(client, "ana@x.es")

    resp = _patch(client, admin, _uid(db_session, "ana@x.es"), activo=False)

    assert resp.status_code == 200, resp.text
    assert resp.json()["activo"] is False
    assert client.get("/auth/me", headers=sesion).status_code == 401
    login = client.post("/auth/token", data={"username": "ana@x.es", "password": "clave12345"})
    assert login.status_code == 403
    assert login.json()["detail"]["codigo"] == "cuenta_desactivada"


def test_una_cuenta_desactivada_no_dice_nada_con_la_contrasena_mala(client, admin, db_session):
    registrar(client, "ana@x.es")
    _patch(client, admin, _uid(db_session, "ana@x.es"), activo=False)
    login = client.post("/auth/token", data={"username": "ana@x.es", "password": "mala"})
    assert login.status_code == 401


def test_reactivar_le_deja_entrar_otra_vez(client, admin, db_session):
    registrar(client, "ana@x.es")
    uid = _uid(db_session, "ana@x.es")
    _patch(client, admin, uid, activo=False)
    _patch(client, admin, uid, activo=True)
    assert client.post("/auth/token", data={"username": "ana@x.es", "password": "clave12345"}).status_code == 200


def test_una_cuenta_desactivada_no_recibe_enlaces_de_recuperacion(client, admin, db_session, buzon):
    registrar(client, "ana@x.es")
    _patch(client, admin, _uid(db_session, "ana@x.es"), activo=False)
    assert client.post("/auth/recuperar", json={"email": "ana@x.es"}).status_code == 202
    assert buzon.mensajes == []


def test_nadie_se_desactiva_a_si_mismo(client, admin, db_session):
    resp = _patch(client, admin, _uid(db_session, "admin@vinalert.dev"), activo=False)
    assert resp.status_code == 409


# --- Superadmin y acceso total ----------------------------------------------

def test_nombrar_a_otro_superadmin(client, admin, db_session):
    registrar(client, "jefa@x.es")
    resp = _patch(client, admin, _uid(db_session, "jefa@x.es"), es_superadmin=True)
    assert resp.status_code == 200
    assert resp.json()["es_superadmin"] is True
    assert client.get("/admin/usuarios", headers=_entrar(client, "jefa@x.es")).status_code == 200


def test_no_se_puede_quitar_al_ultimo_superadmin(client, admin, db_session):
    registrar(client, "jefa@x.es")
    hacer_superadmin(db_session, "jefa@x.es")
    jefa = _entrar(client, "jefa@x.es")
    # La jefa quita al admin: quedan uno.
    assert _patch(client, jefa, _uid(db_session, "admin@vinalert.dev"), es_superadmin=False).status_code == 200
    # Y nadie puede quitarse la marca a si mismo.
    assert _patch(client, jefa, _uid(db_session, "jefa@x.es"), es_superadmin=False).status_code == 409


def test_acceso_a_todas_las_parcelas(client, admin, db_session):
    registrar(client, "tecnica@x.es")
    registrar(client, "otro@x.es")
    p = client.post("/parcelas/", json={"nombre": "Ajena"}, headers=_entrar(client, "otro@x.es")).json()["id"]
    uid = _uid(db_session, "tecnica@x.es")

    resp = _patch(client, admin, uid, acceso_total=True)

    assert resp.json()["acceso_total"] is True
    assert client.get(f"/parcelas/{p}", headers=_entrar(client, "tecnica@x.es")).status_code == 200
    _patch(client, admin, uid, acceso_total=False)
    assert client.get(f"/parcelas/{p}", headers=_entrar(client, "tecnica@x.es")).status_code == 404


def test_un_gestor_no_gestiona_cuentas(client, auth_headers, db_session):
    registrar(client, "ana@x.es")
    resp = _patch(client, auth_headers, _uid(db_session, "ana@x.es"), activo=False)
    assert resp.status_code == 403


def test_una_cuenta_inexistente_da_404(client, admin):
    assert _patch(client, admin, 9999, activo=False).status_code == 404


# --- Eliminar ----------------------------------------------------------------

def test_eliminar_borra_los_datos_personales_y_conserva_la_explotacion(client, admin, auth_headers, parcela_id, db_session):
    registrar(client, "ana@x.es", nombre="Ana Pérez")
    uid = _uid(db_session, "ana@x.es")
    db_session.query(Usuario).filter_by(id=uid).one().telefono = "600000000"
    db_session.add(ParcelaUsuario(parcela_id=parcela_id, usuario_id=uid, rol="lectura"))
    db_session.commit()
    client.post("/auth/token", data={"username": "ana@x.es", "password": "mala"})
    client.post("/tratamientos/", json={"parcela_id": parcela_id, "fecha": "2026-08-17T09:30:00", "tipo": "fitosanitario"}, headers=auth_headers)

    resp = client.delete(f"/admin/usuarios/{uid}", headers=admin)

    assert resp.status_code == 204
    db_session.expire_all()
    u = db_session.query(Usuario).filter_by(id=uid).one()
    assert "ana" not in u.email and u.nombre != "Ana Pérez" and u.telefono is None
    assert u.activo is False and u.hashed_password is None
    assert db_session.query(ParcelaUsuario).filter_by(usuario_id=uid).count() == 0
    assert db_session.query(IntentoAcceso).filter_by(email="ana@x.es").count() == 0
    assert db_session.query(Parcela).filter_by(id=parcela_id).count() == 1
    assert db_session.query(Tratamiento).filter_by(parcela_id=parcela_id).count() == 1
    assert client.post("/auth/token", data={"username": "ana@x.es", "password": "clave12345"}).status_code == 401
    assert all(c["id"] != uid for c in client.get("/admin/usuarios", headers=admin).json())


def test_el_email_de_una_cuenta_eliminada_se_puede_volver_a_invitar(client, admin, db_session, buzon):
    registrar(client, "ana@x.es")
    client.delete(f"/admin/usuarios/{_uid(db_session, 'ana@x.es')}", headers=admin)
    resp = client.post("/admin/invitaciones", json={"email": "ana@x.es", "nombre": "Ana"}, headers=admin)
    assert resp.status_code == 201


def test_no_se_elimina_a_la_unica_gestora_de_una_parcela(client, admin, auth_headers, parcela_id, db_session):
    resp = client.delete(f"/admin/usuarios/{_uid(db_session, 'test@vinalert.dev')}", headers=admin)
    assert resp.status_code == 409
    assert "Parcela Test" in resp.json()["detail"]


def test_nadie_se_elimina_a_si_mismo(client, admin, db_session):
    assert client.delete(f"/admin/usuarios/{_uid(db_session, 'admin@vinalert.dev')}", headers=admin).status_code == 409


# --- Enlace de restablecer ---------------------------------------------------

def test_el_admin_envia_un_enlace_para_restablecer(client, admin, db_session, buzon):
    registrar(client, "ana@x.es")
    resp = client.post(f"/admin/usuarios/{_uid(db_session, 'ana@x.es')}/restablecer", headers=admin)
    assert resp.status_code == 202
    (msg,) = buzon.mensajes
    assert msg["para"] == "ana@x.es" and "/restablecer?token=" in msg["texto"]


def test_el_listado_dice_quien_esta_activo_y_quien_es_superadmin(client, admin, db_session):
    registrar(client, "ana@x.es")
    _patch(client, admin, _uid(db_session, "ana@x.es"), activo=False)
    filas = {c["email"]: c for c in client.get("/admin/usuarios", headers=admin).json()}
    assert filas["ana@x.es"]["activo"] is False
    assert filas["admin@vinalert.dev"]["es_superadmin"] is True

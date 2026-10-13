"""
Lo que una persona hace con su propia cuenta: cambiar la contrasena y cerrar
sesion en todos los dispositivos. Y la limpieza periodica de los registros de
acceso.
"""
from datetime import datetime, timedelta

from app.models import IntentoAcceso, TokenCuenta
from app.services import limites, reloj
from tests.ayudas import registrar


def _entrar(client, email="ana@x.es", password="clave12345"):
    return client.post("/auth/token", data={"username": email, "password": password})


def _h(token):
    return {"Authorization": f"Bearer {token}"}


def _cambiar(client, token, actual, nueva="cepas-de-albariño"):
    return client.post("/auth/cambiar-password", json={"actual": actual, "nueva": nueva}, headers=_h(token))


def test_cambiar_la_contrasena_cierra_las_otras_sesiones_y_da_una_nueva(client):
    registrar(client, "ana@x.es")
    movil = _entrar(client).json()["access_token"]
    portatil = _entrar(client).json()["access_token"]

    resp = _cambiar(client, portatil, "clave12345")

    assert resp.status_code == 200
    nueva = resp.json()["access_token"]
    assert client.get("/auth/me", headers=_h(nueva)).status_code == 200
    assert client.get("/auth/me", headers=_h(movil)).status_code == 401
    assert _entrar(client, password="cepas-de-albariño").status_code == 200
    assert _entrar(client, password="clave12345").status_code == 401


def test_con_la_actual_incorrecta_no_cambia(client):
    registrar(client, "ana@x.es")
    token = _entrar(client).json()["access_token"]
    resp = _cambiar(client, token, "no-es-esta")
    assert resp.status_code == 400
    assert _entrar(client).status_code == 200


def test_probar_la_actual_cuenta_como_intento_fallido(client):
    # Con una sesion robada tampoco se pueden probar contrasenas sin limite.
    registrar(client, "ana@x.es")
    token = _entrar(client).json()["access_token"]
    for _ in range(5):
        _cambiar(client, token, "no-es-esta")
    assert _entrar(client).status_code == 429


def test_la_nueva_cumple_la_politica(client):
    registrar(client, "ana@x.es")
    token = _entrar(client).json()["access_token"]
    assert _cambiar(client, token, "clave12345", nueva="corta").status_code == 422


def test_cerrar_sesion_en_todos_los_dispositivos(client):
    registrar(client, "ana@x.es")
    a = _entrar(client).json()["access_token"]
    b = _entrar(client).json()["access_token"]
    assert client.post("/auth/cerrar-sesiones", headers=_h(a)).status_code == 204
    assert client.get("/auth/me", headers=_h(a)).status_code == 401
    assert client.get("/auth/me", headers=_h(b)).status_code == 401
    assert _entrar(client).status_code == 200


def test_la_limpieza_borra_solo_lo_antiguo(client, db_session, monkeypatch):
    ahora = datetime(2026, 10, 13, 10, 0)
    monkeypatch.setattr(reloj, "ahora_utc", lambda: ahora)
    u = registrar(client, "ana@x.es")
    for dias in (91, 89):
        db_session.add(IntentoAcceso(momento=ahora - timedelta(days=dias), tipo="login",
                                     email="ana@x.es", ip="1.1.1.1", resultado="fallo"))
    for i, dias in enumerate((31, 29)):
        db_session.add(TokenCuenta(usuario_id=u.id, tipo="recuperacion", hash_token=str(i) * 64,
                                   creado_en=ahora - timedelta(days=dias + 1),
                                   caduca_en=ahora - timedelta(days=dias)))
    db_session.commit()

    limites.limpiar_antiguos(db_session)

    assert db_session.query(IntentoAcceso).count() == 1
    assert db_session.query(TokenCuenta).count() == 1


def test_el_job_de_limpieza_queda_programado():
    from apscheduler.schedulers.background import BackgroundScheduler

    from app.main import _programar_jobs

    scheduler = BackgroundScheduler()
    _programar_jobs(scheduler)
    assert scheduler.get_job("limpiar_accesos") is not None

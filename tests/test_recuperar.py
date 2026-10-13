"""
Recuperar la contrasena por email: enlace de un solo uso, que caduca en una
hora, guardado solo como hash. La respuesta no revela si el email tiene cuenta.
"""
import hashlib
from datetime import datetime, timedelta

import pytest

from app.models import TokenCuenta, Usuario
from app.services import reloj
from tests.ayudas import registrar

RESPUESTA = {"detail": "Si hay una cuenta con ese email, te hemos enviado un enlace."}


class RelojFijo:
    def __init__(self):
        self.t = datetime(2026, 10, 13, 10, 0, 0)

    def __call__(self):
        return self.t

    def avanzar(self, **kw):
        self.t += timedelta(**kw)


@pytest.fixture()
def hora(monkeypatch):
    r = RelojFijo()
    monkeypatch.setattr(reloj, "ahora_utc", r)
    return r


def _recuperar(client, email):
    return client.post("/auth/recuperar", json={"email": email})


def _restablecer(client, token, password="nueva-clave-segura"):
    return client.post("/auth/restablecer", json={"token": token, "password": password})


def _login(client, email, password):
    return client.post("/auth/token", data={"username": email, "password": password})


def test_la_respuesta_es_la_misma_exista_o_no_la_cuenta(client, buzon, hora):
    registrar(client, "ana@x.es")
    con = _recuperar(client, "ana@x.es")
    sin = _recuperar(client, "nadie@x.es")
    assert con.status_code == sin.status_code == 202
    assert con.json() == sin.json() == RESPUESTA
    assert [m["para"] for m in buzon.mensajes] == ["ana@x.es"]


def test_el_email_con_mayusculas_encuentra_la_cuenta(client, buzon, hora):
    registrar(client, "ana@x.es")
    _recuperar(client, "  ANA@x.es ")
    assert [m["para"] for m in buzon.mensajes] == ["ana@x.es"]


def test_en_la_bd_solo_esta_el_hash(client, buzon, hora, db_session):
    registrar(client, "ana@x.es")
    _recuperar(client, "ana@x.es")
    token = buzon.token()
    guardado = db_session.query(TokenCuenta).one()
    assert guardado.hash_token == hashlib.sha256(token.encode()).hexdigest()
    assert token not in guardado.hash_token


def test_restablecer_cambia_la_contrasena_y_cierra_las_sesiones(client, buzon, hora):
    registrar(client, "ana@x.es")
    vieja = _login(client, "ana@x.es", "clave12345").json()["access_token"]
    _recuperar(client, "ana@x.es")

    assert _restablecer(client, buzon.token()).status_code == 204

    assert client.get("/auth/me", headers={"Authorization": f"Bearer {vieja}"}).status_code == 401
    assert _login(client, "ana@x.es", "clave12345").status_code == 401
    assert _login(client, "ana@x.es", "nueva-clave-segura").status_code == 200


def test_el_enlace_solo_sirve_una_vez(client, buzon, hora):
    registrar(client, "ana@x.es")
    _recuperar(client, "ana@x.es")
    token = buzon.token()
    assert _restablecer(client, token).status_code == 204
    resp = _restablecer(client, token, password="otra-clave-distinta")
    assert resp.status_code == 400
    assert resp.json()["detail"]["codigo"] == "enlace_invalido"


def test_el_enlace_caduca_en_una_hora(client, buzon, hora):
    registrar(client, "ana@x.es")
    _recuperar(client, "ana@x.es")
    hora.avanzar(minutes=61)
    assert _restablecer(client, buzon.token()).json()["detail"]["codigo"] == "enlace_invalido"


def test_pedir_otro_enlace_anula_el_anterior(client, buzon, hora):
    registrar(client, "ana@x.es")
    _recuperar(client, "ana@x.es")
    primero = buzon.token()
    _recuperar(client, "ana@x.es")
    assert _restablecer(client, primero).status_code == 400
    assert _restablecer(client, buzon.token()).status_code == 204


def test_la_contrasena_nueva_cumple_la_politica(client, buzon, hora):
    registrar(client, "ana@x.es")
    _recuperar(client, "ana@x.es")
    assert _restablecer(client, buzon.token(), password="corta").status_code == 422


def test_restablecer_desbloquea_el_login(client, buzon, hora):
    registrar(client, "ana@x.es")
    for _ in range(5):
        _login(client, "ana@x.es", "mala")
    assert _login(client, "ana@x.es", "clave12345").status_code == 429
    _recuperar(client, "ana@x.es")
    _restablecer(client, buzon.token())
    assert _login(client, "ana@x.es", "nueva-clave-segura").status_code == 200


def test_el_cuarto_email_de_la_hora_no_se_envia_y_no_se_nota(client, buzon, hora):
    registrar(client, "ana@x.es")
    for _ in range(4):
        resp = _recuperar(client, "ana@x.es")
        assert resp.status_code == 202
        assert resp.json() == RESPUESTA
    assert len(buzon.mensajes) == 3


def test_una_ip_no_puede_pedir_mas_de_diez_por_hora(client, buzon, hora):
    for i in range(10):
        assert _recuperar(client, f"n{i}@x.es").status_code == 202
    assert _recuperar(client, "otro@x.es").status_code == 429


def test_una_cuenta_pendiente_recibe_la_invitacion(client, buzon, hora, db_session):
    db_session.add(Usuario(nombre="", email="pend@x.es", hashed_password=None))
    db_session.commit()
    _recuperar(client, "pend@x.es")
    (msg,) = buzon.mensajes
    assert "/invitacion?token=" in msg["texto"]
    assert "/restablecer" not in msg["texto"]


def test_un_enlace_de_invitacion_no_sirve_para_restablecer(client, hora, db_session):
    from app.services import tokens_cuenta

    u = registrar(client, "ana@x.es")
    token = tokens_cuenta.emitir(db_session, u, tokens_cuenta.INVITACION)
    assert _restablecer(client, token).status_code == 400


def test_insistir_con_la_ip_bloqueada_no_alarga_el_bloqueo(client, buzon, hora):
    for i in range(10):
        _recuperar(client, f"n{i}@x.es")
    for _ in range(20):
        hora.avanzar(minutes=2)
        _recuperar(client, "otro@x.es")
    hora.avanzar(minutes=21)  # 61 min desde la decima peticion valida
    assert _recuperar(client, "otro@x.es").status_code == 202


def test_restablecer_anula_los_demas_enlaces_de_recuperacion(client, buzon, hora, db_session):
    from app.services import tokens_cuenta

    u = registrar(client, "ana@x.es")
    otro = tokens_cuenta.emitir(db_session, u, tokens_cuenta.RECUPERACION)
    # Un segundo enlace emitido a la vez (dos peticiones concurrentes) sin
    # anular el primero: se simula volviendo a dejarlo sin usar.
    from app.models import TokenCuenta
    _recuperar(client, "ana@x.es")
    db_session.query(TokenCuenta).update({TokenCuenta.usado_en: None})
    db_session.commit()

    assert _restablecer(client, buzon.token()).status_code == 204
    assert _restablecer(client, otro, password="otra-clave-distinta").status_code == 400

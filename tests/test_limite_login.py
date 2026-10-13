"""
Limite de intentos de login: 5 fallos por cuenta en 15 min, 20 intentos por IP
en 15 min. El bloqueo es temporal a proposito: uno permanente dejaria a
cualquiera bloquear cuentas ajenas.
"""
from datetime import datetime, timedelta

import pytest

from app.models import IntentoAcceso
from app.services import reloj
from tests.ayudas import registrar


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


def _login(client, email, password):
    return client.post("/auth/token", data={"username": email, "password": password})


def test_el_sexto_fallo_de_una_cuenta_se_bloquea(client, hora):
    registrar(client, "ana@x.es")
    for _ in range(5):
        assert _login(client, "ana@x.es", "mala").status_code == 401
        hora.avanzar(seconds=10)

    resp = _login(client, "ana@x.es", "clave12345")  # ni la buena entra
    assert resp.status_code == 429
    assert resp.json()["detail"]["codigo"] == "demasiados_intentos"
    assert 1 <= resp.json()["detail"]["minutos"] <= 15
    assert int(resp.headers["Retry-After"]) == resp.json()["detail"]["minutos"] * 60


def test_el_bloqueo_caduca_a_los_quince_minutos(client, hora):
    registrar(client, "ana@x.es")
    for _ in range(5):
        _login(client, "ana@x.es", "mala")
    hora.avanzar(minutes=16)
    assert _login(client, "ana@x.es", "clave12345").status_code == 200


def test_insistir_durante_el_bloqueo_no_lo_alarga(client, hora):
    registrar(client, "ana@x.es")
    for _ in range(5):
        _login(client, "ana@x.es", "mala")
    for _ in range(10):
        hora.avanzar(minutes=1)
        assert _login(client, "ana@x.es", "mala").status_code == 429
    hora.avanzar(minutes=6)  # 16 min desde el quinto fallo
    assert _login(client, "ana@x.es", "clave12345").status_code == 200


def test_un_login_correcto_pone_el_recuento_a_cero(client, hora):
    registrar(client, "ana@x.es")
    for _ in range(4):
        _login(client, "ana@x.es", "mala")
    assert _login(client, "ana@x.es", "clave12345").status_code == 200
    for _ in range(4):
        assert _login(client, "ana@x.es", "mala").status_code == 401


def test_el_email_cuenta_igual_con_mayusculas_y_espacios(client, hora):
    registrar(client, "ana@x.es")
    for variante in ["ANA@x.es", " ana@X.ES ", "Ana@x.es", "ana@x.es", "aNa@x.es"]:
        _login(client, variante, "mala")
    assert _login(client, "ana@x.es", "clave12345").status_code == 429


def test_una_ip_no_puede_probar_mas_de_veinte_veces(client, hora):
    for i in range(20):
        assert _login(client, f"nadie{i}@x.es", "mala").status_code == 401
    resp = _login(client, "otro@x.es", "mala")
    assert resp.status_code == 429


def test_se_registran_los_intentos(client, hora, db_session):
    registrar(client, "ana@x.es")
    _login(client, "ana@x.es", "mala")
    _login(client, "ana@x.es", "clave12345")
    resultados = [i.resultado for i in db_session.query(IntentoAcceso).order_by(IntentoAcceso.id)]
    assert resultados == ["fallo", "exito"]

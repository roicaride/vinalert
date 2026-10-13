"""
Cuentas de usuario: lo que se valida al registrarse y lo que ve el admin.

El listado de /admin/usuarios es la forma de ver quien se ha dado de alta sin
entrar en la base de datos a mano. Es solo para el superadmin, igual que los
dispositivos ESP32, y nunca devuelve la huella de la contrasena.
"""
from datetime import datetime

from app.models import Parcela, ParcelaUsuario, Usuario
from tests.ayudas import hacer_superadmin, registrar


def _registrar(client, email, nombre="Persona", password="clave12345"):
    return registrar(client, email, nombre=nombre, password=password)


def _token(client, email, password="clave12345"):
    resp = client.post("/auth/token", data={"username": email, "password": password})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def _admin(client, db_session):
    _registrar(client, "admin@vinalert.dev", nombre="Admin")
    hacer_superadmin(db_session, "admin@vinalert.dev")
    return _token(client, "admin@vinalert.dev")


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------

def test_el_login_no_distingue_mayusculas_en_el_email(client):
    _registrar(client, "login@vinalert.dev")
    resp = client.post("/auth/token", data={"username": "Login@VinAlert.dev", "password": "clave12345"})
    assert resp.status_code == 200


def test_el_login_sigue_funcionando_para_cuentas_antiguas_con_mayusculas(client, db_session):
    """Cuentas creadas antes de normalizar el email pueden tenerlo en mayusculas."""
    from app.auth import obtener_password_hash

    db_session.add(Usuario(nombre="Vieja", email="Vieja@Vinalert.dev", hashed_password=obtener_password_hash("clave12345")))
    db_session.commit()

    resp = client.post("/auth/token", data={"username": "vieja@vinalert.dev", "password": "clave12345"})
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# /auth/me
# ---------------------------------------------------------------------------

def test_me_dice_si_eres_el_superadmin(client, db_session):
    admin = _admin(client, db_session)
    _registrar(client, "normal@vinalert.dev")
    normal = _token(client, "normal@vinalert.dev")

    assert client.get("/auth/me", headers=admin).json()["es_superadmin"] is True
    assert client.get("/auth/me", headers=normal).json()["es_superadmin"] is False


# ---------------------------------------------------------------------------
# /admin/usuarios
# ---------------------------------------------------------------------------

def test_sin_sesion_el_listado_da_401(client):
    assert client.get("/admin/usuarios").status_code == 401


def test_un_usuario_normal_no_ve_el_listado(client):
    _registrar(client, "normal@vinalert.dev")
    assert client.get("/admin/usuarios", headers=_token(client, "normal@vinalert.dev")).status_code == 403


def test_el_admin_ve_todas_las_cuentas_con_sus_parcelas(client, db_session):
    admin = _admin(client, db_session)
    _registrar(client, "ana@vinalert.dev", nombre="Ana")
    _registrar(client, "luis@vinalert.dev", nombre="Luis")

    ana = db_session.query(Usuario).filter_by(email="ana@vinalert.dev").one()
    for nombre in ("P1", "P2"):
        p = Parcela(nombre=nombre)
        db_session.add(p)
        db_session.flush()
        db_session.add(ParcelaUsuario(parcela_id=p.id, usuario_id=ana.id, rol="lectura"))
    db_session.commit()

    resp = client.get("/admin/usuarios", headers=admin)

    assert resp.status_code == 200
    por_email = {u["email"]: u for u in resp.json()}
    assert set(por_email) == {"admin@vinalert.dev", "ana@vinalert.dev", "luis@vinalert.dev"}
    assert por_email["ana@vinalert.dev"]["n_parcelas"] == 2
    assert por_email["luis@vinalert.dev"]["n_parcelas"] == 0
    assert por_email["ana@vinalert.dev"]["nombre"] == "Ana"
    assert por_email["ana@vinalert.dev"]["rol"] == "agricultor"
    assert por_email["ana@vinalert.dev"]["creado_en"] is not None


def test_el_listado_nunca_expone_la_contrasena(client, db_session):
    resp = client.get("/admin/usuarios", headers=_admin(client, db_session))
    assert resp.status_code == 200
    cuerpo = resp.json()
    assert cuerpo
    for u in cuerpo:
        assert "hashed_password" not in u
        assert "password" not in u


def test_el_listado_va_de_la_alta_mas_reciente_a_la_mas_antigua(client, db_session):
    admin = _admin(client, db_session)
    _registrar(client, "primera@vinalert.dev")
    _registrar(client, "segunda@vinalert.dev")
    # Una cuenta anterior a que existiera la fecha de alta: va al final.
    db_session.add(Usuario(nombre="Antigua", email="antigua@vinalert.dev", hashed_password="x"))
    db_session.flush()
    db_session.query(Usuario).filter_by(email="antigua@vinalert.dev").update({"creado_en": None})
    db_session.query(Usuario).filter_by(email="primera@vinalert.dev").update(
        {"creado_en": datetime(2026, 1, 1, 10, 0)}
    )
    db_session.commit()

    emails = [u["email"] for u in client.get("/admin/usuarios", headers=admin).json()]

    assert emails.index("segunda@vinalert.dev") < emails.index("primera@vinalert.dev")
    assert emails[-1] == "antigua@vinalert.dev"

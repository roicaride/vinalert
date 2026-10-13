"""Las piezas de datos de las cuentas por invitacion."""
from datetime import datetime, timedelta

from app.models import IntentoAcceso, TokenCuenta, Usuario
from app.services import reloj


def test_un_usuario_nuevo_empieza_en_la_version_cero_y_activo(db_session):
    u = Usuario(nombre="Ana", email="ana@x.es", hashed_password="h")
    db_session.add(u)
    db_session.commit()
    assert u.token_version == 0
    assert u.pendiente is False


def test_una_cuenta_sin_contrasena_esta_pendiente(db_session):
    u = Usuario(nombre="", email="nuevo@x.es", hashed_password=None)
    db_session.add(u)
    db_session.commit()
    assert u.pendiente is True


def test_se_guardan_tokens_e_intentos(db_session):
    u = Usuario(nombre="Ana", email="ana@x.es", hashed_password="h")
    db_session.add(u)
    db_session.commit()
    ahora = reloj.ahora_utc()
    db_session.add(TokenCuenta(
        usuario_id=u.id, tipo="recuperacion", hash_token="a" * 64,
        creado_en=ahora, caduca_en=ahora + timedelta(hours=1),
    ))
    db_session.add(IntentoAcceso(momento=ahora, tipo="login", email="ana@x.es", ip="1.2.3.4", resultado="fallo"))
    db_session.commit()
    assert db_session.query(TokenCuenta).one().usuario.email == "ana@x.es"
    assert db_session.query(IntentoAcceso).count() == 1


def test_el_reloj_da_utc_sin_zona():
    t = reloj.ahora_utc()
    assert t.tzinfo is None
    assert abs((datetime.utcnow() - t).total_seconds()) < 5

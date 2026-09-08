import pytest
from sqlalchemy.exc import IntegrityError

from app.models import Parcela, ParcelaUsuario, Usuario


def _usuario(db_session, email):
    u = Usuario(nombre="U", email=email, hashed_password="x")
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


def _parcela(db_session, nombre="P1"):
    p = Parcela(nombre=nombre)
    db_session.add(p)
    db_session.commit()
    db_session.refresh(p)
    return p


def test_asociar_usuario_a_parcela(db_session):
    u = _usuario(db_session, "a@test.dev")
    p = _parcela(db_session)

    db_session.add(ParcelaUsuario(parcela_id=p.id, usuario_id=u.id, rol="gestor"))
    db_session.commit()

    db_session.refresh(p)
    assert len(p.miembros) == 1
    assert p.miembros[0].rol == "gestor"
    assert p.miembros[0].usuario_id == u.id


def test_una_parcela_admite_varios_usuarios(db_session):
    u1 = _usuario(db_session, "a@test.dev")
    u2 = _usuario(db_session, "b@test.dev")
    p = _parcela(db_session)

    db_session.add_all([
        ParcelaUsuario(parcela_id=p.id, usuario_id=u1.id, rol="gestor"),
        ParcelaUsuario(parcela_id=p.id, usuario_id=u2.id, rol="lectura"),
    ])
    db_session.commit()

    db_session.refresh(p)
    assert {m.rol for m in p.miembros} == {"gestor", "lectura"}


def test_un_usuario_puede_estar_en_varias_parcelas(db_session):
    u = _usuario(db_session, "a@test.dev")
    p1 = _parcela(db_session, "P1")
    p2 = _parcela(db_session, "P2")

    db_session.add_all([
        ParcelaUsuario(parcela_id=p1.id, usuario_id=u.id, rol="gestor"),
        ParcelaUsuario(parcela_id=p2.id, usuario_id=u.id, rol="lectura"),
    ])
    db_session.commit()

    db_session.refresh(u)
    assert len(u.parcelas_asociadas) == 2


def test_la_clave_compuesta_impide_asociar_dos_veces_al_mismo_usuario(db_session):
    """Sin PK compuesta, el mismo usuario podria estar dos veces con roles
    distintos y la autorizacion dependeria de cual leyese primero."""
    u = _usuario(db_session, "a@test.dev")
    p = _parcela(db_session)

    db_session.add(ParcelaUsuario(parcela_id=p.id, usuario_id=u.id, rol="gestor"))
    db_session.commit()

    db_session.add(ParcelaUsuario(parcela_id=p.id, usuario_id=u.id, rol="lectura"))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_parcela_ya_no_tiene_usuario_id():
    """El acceso vive solo en parcela_usuarios: dos caminos serian dos sitios
    donde equivocarse."""
    assert not hasattr(Parcela, "usuario_id")

import pytest
from fastapi import HTTPException

from app.deps import parcela_con_gestion, parcela_con_lectura
from app.models import Parcela, ParcelaUsuario, Usuario


def _usuario(db_session, email, rol="agricultor"):
    u = Usuario(nombre="U", email=email, hashed_password="x", rol=rol)
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


def _parcela_con(db_session, usuario, rol):
    p = Parcela(nombre="P1")
    db_session.add(p)
    db_session.commit()
    db_session.refresh(p)
    db_session.add(ParcelaUsuario(parcela_id=p.id, usuario_id=usuario.id, rol=rol))
    db_session.commit()
    return p


def test_gestor_pasa_ambas_puertas(db_session):
    u = _usuario(db_session, "g@test.dev")
    p = _parcela_con(db_session, u, "gestor")

    assert parcela_con_lectura(p.id, u, db_session).id == p.id
    assert parcela_con_gestion(p.id, u, db_session).id == p.id


def test_lectura_pasa_la_de_lectura(db_session):
    u = _usuario(db_session, "l@test.dev")
    p = _parcela_con(db_session, u, "lectura")

    assert parcela_con_lectura(p.id, u, db_session).id == p.id


def test_lectura_recibe_403_al_intentar_gestionar(db_session):
    """403 y no 404: ya sabe que la parcela existe porque la esta viendo."""
    u = _usuario(db_session, "l@test.dev")
    p = _parcela_con(db_session, u, "lectura")

    with pytest.raises(HTTPException) as exc:
        parcela_con_gestion(p.id, u, db_session)
    assert exc.value.status_code == 403


def test_usuario_ajeno_recibe_404_en_ambas(db_session):
    """404 y no 403: un 403 confirmaria que la parcela existe."""
    duenio = _usuario(db_session, "d@test.dev")
    ajeno = _usuario(db_session, "x@test.dev")
    p = _parcela_con(db_session, duenio, "gestor")

    for puerta in (parcela_con_lectura, parcela_con_gestion):
        with pytest.raises(HTTPException) as exc:
            puerta(p.id, ajeno, db_session)
        assert exc.value.status_code == 404, f"{puerta.__name__} no devolvio 404"


def test_parcela_inexistente_da_404(db_session):
    u = _usuario(db_session, "u@test.dev")
    with pytest.raises(HTTPException) as exc:
        parcela_con_lectura(9999, u, db_session)
    assert exc.value.status_code == 404


def test_admin_entra_en_parcelas_ajenas_sin_estar_asociado(db_session):
    duenio = _usuario(db_session, "d@test.dev")
    admin = _usuario(db_session, "admin@test.dev", rol="admin")
    p = _parcela_con(db_session, duenio, "gestor")

    assert parcela_con_lectura(p.id, admin, db_session).id == p.id
    assert parcela_con_gestion(p.id, admin, db_session).id == p.id


def test_admin_no_puede_inventarse_una_parcela(db_session):
    """Ser admin da acceso a todo lo que existe, no a lo que no existe."""
    admin = _usuario(db_session, "admin@test.dev", rol="admin")
    with pytest.raises(HTTPException) as exc:
        parcela_con_lectura(9999, admin, db_session)
    assert exc.value.status_code == 404


def test_el_registro_publico_no_puede_fijar_el_rol(client, db_session):
    """
    Guarda contra escalada de privilegios: si alguien anade `rol` a
    UsuarioCreate, este test debe fallar.
    """
    resp = client.post(
        "/auth/register",
        json={
            "nombre": "Listillo",
            "email": "listillo@test.dev",
            "password": "clave12345",
            "rol": "admin",
        },
    )
    assert resp.status_code == 201

    creado = db_session.query(Usuario).filter_by(email="listillo@test.dev").first()
    assert creado.rol == "agricultor", "el registro publico ha fijado un rol"

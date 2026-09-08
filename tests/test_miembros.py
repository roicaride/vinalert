import app.routers.miembros as miembros_router
from app.models import ParcelaUsuario


def _registrar(client, email):
    client.post("/auth/register", json={"nombre": email, "email": email, "password": "clave12345"})
    resp = client.post("/auth/token", data={"username": email, "password": "clave12345"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def _uid(client, headers, pid, email):
    miembros = client.get(f"/parcelas/{pid}/usuarios", headers=headers).json()
    return next(m["usuario_id"] for m in miembros if m["email"] == email)


def test_el_creador_aparece_como_unico_miembro(client, auth_headers, parcela_id):
    resp = client.get(f"/parcelas/{parcela_id}/usuarios", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["rol"] == "gestor"
    assert resp.json()[0]["email"] == "test@vinalert.dev"


def test_anadir_por_email_y_que_aparezca_en_su_listado(client, auth_headers, parcela_id):
    invitado = _registrar(client, "invitado@test.dev")

    resp = client.post(
        f"/parcelas/{parcela_id}/usuarios",
        json={"email": "invitado@test.dev", "rol": "lectura"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["rol"] == "lectura"

    suyas = client.get("/parcelas/", headers=invitado).json()
    assert len(suyas) == 1


def test_email_sin_cuenta_da_404(client, auth_headers, parcela_id):
    resp = client.post(
        f"/parcelas/{parcela_id}/usuarios",
        json={"email": "nadie@test.dev", "rol": "lectura"},
        headers=auth_headers,
    )
    assert resp.status_code == 404
    assert "registr" in resp.json()["detail"].lower()


def test_anadir_dos_veces_da_409(client, auth_headers, parcela_id):
    _registrar(client, "invitado@test.dev")
    cuerpo = {"email": "invitado@test.dev", "rol": "lectura"}
    client.post(f"/parcelas/{parcela_id}/usuarios", json=cuerpo, headers=auth_headers)

    resp = client.post(f"/parcelas/{parcela_id}/usuarios", json=cuerpo, headers=auth_headers)
    assert resp.status_code == 409


def test_rol_invalido_da_422(client, auth_headers, parcela_id):
    _registrar(client, "invitado@test.dev")
    resp = client.post(
        f"/parcelas/{parcela_id}/usuarios",
        json={"email": "invitado@test.dev", "rol": "jefe supremo"},
        headers=auth_headers,
    )
    assert resp.status_code == 422


def test_un_lector_no_puede_anadir_a_nadie(client, auth_headers, parcela_id):
    lector = _registrar(client, "lector@test.dev")
    client.post(
        f"/parcelas/{parcela_id}/usuarios",
        json={"email": "lector@test.dev", "rol": "lectura"},
        headers=auth_headers,
    )
    _registrar(client, "tercero@test.dev")

    resp = client.post(
        f"/parcelas/{parcela_id}/usuarios",
        json={"email": "tercero@test.dev", "rol": "lectura"},
        headers=lector,
    )
    assert resp.status_code == 403


def test_cambiar_el_rol_de_un_miembro(client, auth_headers, parcela_id):
    _registrar(client, "invitado@test.dev")
    client.post(
        f"/parcelas/{parcela_id}/usuarios",
        json={"email": "invitado@test.dev", "rol": "lectura"},
        headers=auth_headers,
    )
    uid = _uid(client, auth_headers, parcela_id, "invitado@test.dev")

    resp = client.patch(
        f"/parcelas/{parcela_id}/usuarios/{uid}",
        json={"rol": "gestor"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["rol"] == "gestor"


def test_no_se_puede_degradar_al_ultimo_gestor(client, auth_headers, parcela_id):
    """Una parcela sin gestor seria inadministrable y nadie podria recuperarla."""
    uid = _uid(client, auth_headers, parcela_id, "test@vinalert.dev")

    resp = client.patch(
        f"/parcelas/{parcela_id}/usuarios/{uid}",
        json={"rol": "lectura"},
        headers=auth_headers,
    )
    assert resp.status_code == 409


def test_no_se_puede_retirar_al_ultimo_gestor(client, auth_headers, parcela_id):
    uid = _uid(client, auth_headers, parcela_id, "test@vinalert.dev")

    resp = client.delete(f"/parcelas/{parcela_id}/usuarios/{uid}", headers=auth_headers)
    assert resp.status_code == 409


def test_un_gestor_puede_retirarse_si_queda_otro(client, auth_headers, parcela_id):
    _registrar(client, "cogestor@test.dev")
    client.post(
        f"/parcelas/{parcela_id}/usuarios",
        json={"email": "cogestor@test.dev", "rol": "gestor"},
        headers=auth_headers,
    )
    uid = _uid(client, auth_headers, parcela_id, "test@vinalert.dev")

    resp = client.delete(f"/parcelas/{parcela_id}/usuarios/{uid}", headers=auth_headers)
    assert resp.status_code == 204
    assert client.get("/parcelas/", headers=auth_headers).json() == []


def test_el_admin_no_aparece_como_miembro(client, auth_headers, parcela_id, db_session):
    """Su acceso viene del rol global, no de una fila: el listado debe reflejar
    exactamente lo que hay en parcela_usuarios."""
    from app.models import Usuario

    _registrar(client, "admin@test.dev")
    admin = db_session.query(Usuario).filter_by(email="admin@test.dev").first()
    admin.rol = "admin"
    db_session.commit()

    miembros = client.get(f"/parcelas/{parcela_id}/usuarios", headers=auth_headers).json()
    assert [m["email"] for m in miembros] == ["test@vinalert.dev"]


def test_retirar_a_quien_no_es_miembro_da_404(client, auth_headers, parcela_id):
    otro = _registrar(client, "nomiembro@test.dev")  # noqa: F841
    resp = client.delete(f"/parcelas/{parcela_id}/usuarios/99999", headers=auth_headers)
    assert resp.status_code == 404


# --- Carrera en la guarda del ultimo gestor ---------------------------------
#
# SQLite en memoria es de un solo hilo/una sola conexion (via StaticPool): no
# hay forma de reproducir aqui dos peticiones concurrentes de verdad. Lo que
# SI se puede probar es que el codigo tiene una SEGUNDA comprobacion tras el
# flush y que esa comprobacion, cuando dispara, deshace el cambio entero
# (rollback), no solo lo rechaza a medias. Se fuerza el escenario haciendo
# que _cuantos_gestores mienta la segunda vez que se llama dentro del mismo
# endpoint -- exactamente lo que "veria" una peticion cuyo compañero
# concurrente acaba de retirar al otro gestor entre su lectura previa y su
# commit.


def test_carrera_al_retirar_deshace_el_cambio_si_el_recuento_posterior_cae_a_cero(
    client, auth_headers, parcela_id, db_session, monkeypatch
):
    _registrar(client, "cogestor@test.dev")
    client.post(
        f"/parcelas/{parcela_id}/usuarios",
        json={"email": "cogestor@test.dev", "rol": "gestor"},
        headers=auth_headers,
    )
    uid_cogestor = _uid(client, auth_headers, parcela_id, "cogestor@test.dev")

    llamadas = {"n": 0}
    original = miembros_router._cuantos_gestores

    def _cuantos_gestores_con_carrera(pid, db):
        llamadas["n"] += 1
        if llamadas["n"] == 1:
            # comprobacion previa: como si el otro gestor aun no se hubiera ido
            return 2
        # comprobacion posterior al flush: el "companero" concurrente ya
        # confirmo su propio cambio en este instante
        return 0

    monkeypatch.setattr(miembros_router, "_cuantos_gestores", _cuantos_gestores_con_carrera)

    resp = client.delete(f"/parcelas/{parcela_id}/usuarios/{uid_cogestor}", headers=auth_headers)
    assert resp.status_code == 409
    assert llamadas["n"] == 2, "la red de seguridad posterior al flush no se llego a invocar"

    monkeypatch.setattr(miembros_router, "_cuantos_gestores", original)

    # El rollback debe haber deshecho el delete: el cogestor sigue siendo miembro.
    miembros = client.get(f"/parcelas/{parcela_id}/usuarios", headers=auth_headers).json()
    assert "cogestor@test.dev" in [m["email"] for m in miembros]
    fila = db_session.query(ParcelaUsuario).filter_by(
        parcela_id=parcela_id, usuario_id=uid_cogestor
    ).first()
    assert fila is not None and fila.rol == "gestor"


def test_carrera_al_cambiar_rol_deshace_el_cambio_si_el_recuento_posterior_cae_a_cero(
    client, auth_headers, parcela_id, db_session, monkeypatch
):
    _registrar(client, "cogestor@test.dev")
    client.post(
        f"/parcelas/{parcela_id}/usuarios",
        json={"email": "cogestor@test.dev", "rol": "gestor"},
        headers=auth_headers,
    )
    uid_cogestor = _uid(client, auth_headers, parcela_id, "cogestor@test.dev")

    llamadas = {"n": 0}
    original = miembros_router._cuantos_gestores

    def _cuantos_gestores_con_carrera(pid, db):
        llamadas["n"] += 1
        if llamadas["n"] == 1:
            return 2
        return 0

    monkeypatch.setattr(miembros_router, "_cuantos_gestores", _cuantos_gestores_con_carrera)

    resp = client.patch(
        f"/parcelas/{parcela_id}/usuarios/{uid_cogestor}",
        json={"rol": "lectura"},
        headers=auth_headers,
    )
    assert resp.status_code == 409
    assert llamadas["n"] == 2, "la red de seguridad posterior al flush no se llego a invocar"

    monkeypatch.setattr(miembros_router, "_cuantos_gestores", original)

    # El rollback debe haber deshecho el cambio de rol: sigue siendo gestor.
    fila = db_session.query(ParcelaUsuario).filter_by(
        parcela_id=parcela_id, usuario_id=uid_cogestor
    ).first()
    assert fila is not None and fila.rol == "gestor"

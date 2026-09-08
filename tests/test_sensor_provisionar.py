def _provisionar(client, headers, parcela_id, cantidad):
    return client.post(
        f"/parcelas/{parcela_id}/sensores/provisionar",
        json={"cantidad": cantidad},
        headers=headers,
    )


def test_provisionar_crea_los_sensores_numerados(client, auth_headers, parcela_id):
    resp = _provisionar(client, auth_headers, parcela_id, 18)
    assert resp.status_code == 200

    sensores = resp.json()
    assert len(sensores) == 18
    assert [s["numero"] for s in sensores] == list(range(1, 19))


def test_provisionar_es_idempotente(client, auth_headers, parcela_id):
    """Repetir la misma cantidad no puede duplicar nada."""
    _provisionar(client, auth_headers, parcela_id, 18)
    resp = _provisionar(client, auth_headers, parcela_id, 18)

    assert resp.status_code == 200
    assert len(resp.json()) == 18


def test_ampliar_conserva_los_existentes_con_sus_datos(client, auth_headers, parcela_id):
    """
    La trampa importa: si el aprovisionamiento recreara los sensores en vez de
    completar los que faltan, la etiqueta editada se perderia y este test lo veria.
    """
    _provisionar(client, auth_headers, parcela_id, 3)
    sensores = client.get(f"/parcelas/{parcela_id}/sensores/", headers=auth_headers).json()
    segundo = next(s for s in sensores if s["numero"] == 2)
    client.patch(
        f"/parcelas/{parcela_id}/sensores/{segundo['id']}",
        json={"etiqueta": "Nodo bautizado"},
        headers=auth_headers,
    )

    resp = _provisionar(client, auth_headers, parcela_id, 6)

    assert len(resp.json()) == 6
    conservado = next(s for s in resp.json() if s["numero"] == 2)
    assert conservado["etiqueta"] == "Nodo bautizado"
    assert conservado["id"] == segundo["id"]


def test_una_cantidad_menor_no_borra_nada(client, auth_headers, parcela_id):
    """Reducir destruiria el historico de los sensores eliminados."""
    _provisionar(client, auth_headers, parcela_id, 5)

    resp = _provisionar(client, auth_headers, parcela_id, 2)

    assert resp.status_code == 200
    assert len(resp.json()) == 5


def test_se_puede_alternar_con_el_alta_de_uno_en_uno(client, auth_headers, parcela_id):
    _provisionar(client, auth_headers, parcela_id, 3)
    suelto = client.post(
        f"/parcelas/{parcela_id}/sensores/", json={"etiqueta": "Suelto"}, headers=auth_headers
    ).json()
    assert suelto["numero"] == 4

    resp = _provisionar(client, auth_headers, parcela_id, 6)
    assert [s["numero"] for s in resp.json()] == [1, 2, 3, 4, 5, 6]


def test_cantidad_fuera_de_rango_da_422(client, auth_headers, parcela_id):
    """El tope evita que un error de tecleo cree diez mil filas."""
    assert _provisionar(client, auth_headers, parcela_id, 0).status_code == 422
    assert _provisionar(client, auth_headers, parcela_id, 101).status_code == 422


def test_un_lector_no_puede_provisionar(client, auth_headers, parcela_id, db_session):
    from app.models import ParcelaUsuario, Usuario

    client.post(
        "/auth/register",
        json={"nombre": "L", "email": "lector@test.dev", "password": "clave12345"},
    )
    tok = client.post(
        "/auth/token", data={"username": "lector@test.dev", "password": "clave12345"}
    ).json()["access_token"]
    u = db_session.query(Usuario).filter_by(email="lector@test.dev").first()
    db_session.add(ParcelaUsuario(parcela_id=parcela_id, usuario_id=u.id, rol="lectura"))
    db_session.commit()

    resp = _provisionar(client, {"Authorization": f"Bearer {tok}"}, parcela_id, 5)
    assert resp.status_code == 403


def test_commit_fallido_por_carrera_da_409_no_500(client, auth_headers, parcela_id, monkeypatch):
    """
    Dos peticiones concurrentes en la misma parcela pueden leer el mismo
    numero maximo y violar la restriccion de unicidad al hacer commit. SQLite
    de un solo hilo no puede reproducir la carrera de verdad, asi que se
    simula parcheando el commit de la sesion para que lance IntegrityError
    la primera vez que se invoca.
    """
    from sqlalchemy.exc import IntegrityError

    import app.routers.sensores as sensores_router

    original_commit = sensores_router.Session.commit
    llamadas = {"n": 0}

    def commit_falla_una_vez(self, *args, **kwargs):
        llamadas["n"] += 1
        if llamadas["n"] == 1:
            raise IntegrityError("stmt", {}, Exception("uq_sensor_parcela_numero"))
        return original_commit(self, *args, **kwargs)

    monkeypatch.setattr(sensores_router.Session, "commit", commit_falla_una_vez)

    resp = _provisionar(client, auth_headers, parcela_id, 3)
    assert resp.status_code == 409

    # El camino normal (sin fallo) sigue funcionando en la siguiente llamada.
    resp2 = _provisionar(client, auth_headers, parcela_id, 3)
    assert resp2.status_code == 200
    assert len(resp2.json()) == 3

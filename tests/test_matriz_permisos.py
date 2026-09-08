import pytest

from app.models import DispositivoIoT, ParcelaUsuario, Usuario


# La matriz es EXPLICITA a proposito, no derivada de las rutas de FastAPI:
# asi, anadir un endpoint nuevo sin anadirlo aqui se ve en la revision. Un
# test que se auto-descubre no protege de lo que no conoce.
#
# Cobertura: los 27 puntos de autorizacion con ambito de parcela (ver
# task-4-report.md y test_matriz_cubre_todos_los_endpoints_con_ambito_de_parcela
# mas abajo, que falla en rojo si se anade un endpoint nuevo y se olvida
# registrarlo aqui). No hay exclusiones: incluso POST .../foliar/upload usa
# el fixture Excel real de tests/fixtures/Libro1.xlsx (ver _enviar), asi que
# el caso de gestor/admin ejercita el endpoint de verdad, no solo la puerta.
#
# (metodo, plantilla_de_ruta, escribe)
ENDPOINTS = [
    ("GET", "/parcelas/{pid}", False),
    ("PATCH", "/parcelas/{pid}", True),
    ("DELETE", "/parcelas/{pid}", True),
    ("GET", "/parcelas/{pid}/dashboard", False),

    ("GET", "/parcelas/{pid}/historico", False),
    ("GET", "/parcelas/{pid}/clima/diario", False),
    ("GET", "/parcelas/{pid}/suelo/diario", False),
    ("GET", "/parcelas/{pid}/sensores/", False),
    ("GET", "/parcelas/{pid}/sensores/resumen", False),
    ("GET", "/parcelas/{pid}/sensores/exportar", False),
    ("GET", "/parcelas/{pid}/sensores/{sid}/historico", False),
    ("GET", "/parcelas/{pid}/foliar/", False),
    ("GET", "/parcelas/{pid}/tratamientos", False),
    ("GET", "/parcelas/{pid}/clima/comprobar", True),
    ("POST", "/parcelas/{pid}/sensores/", True),
    ("POST", "/parcelas/{pid}/sensores/provisionar", True),
    ("PATCH", "/parcelas/{pid}/sensores/{sid}", True),
    ("DELETE", "/parcelas/{pid}/sensores/{sid}", True),
    ("POST", "/parcelas/{pid}/actualizar-clima", True),
    ("POST", "/parcelas/{pid}/clima/backfill", True),
    ("POST", "/parcelas/{pid}/foliar/upload", True),

    ("POST", "/logs/sensor/", True),
    ("POST", "/logs/clima/", True),
    ("POST", "/tratamientos/", True),
    ("DELETE", "/tratamientos/{tid}", True),
    ("GET", "/parcelas/{pid}/usuarios", False),
    ("POST", "/parcelas/{pid}/usuarios", True),
    ("PATCH", "/parcelas/{pid}/usuarios/{uid}", True),
    ("DELETE", "/parcelas/{pid}/usuarios/{uid}", True),
    ("GET", "/parcelas/{pid}/dispositivos", False),
    ("POST", "/parcelas/{pid}/dispositivos", True),
    ("PATCH", "/parcelas/{pid}/dispositivos/{did}", True),
    ("PATCH", "/parcelas/{pid}/dispositivos/{did}/revocar", True),
    ("DELETE", "/parcelas/{pid}/dispositivos/{did}", True),
]



@pytest.fixture(autouse=True)
def sin_red(monkeypatch):
    """
    Tres endpoints de la matriz pueden salir a red de verdad: los dos de
    Open-Meteo en clima_fetch.py, y POST /tratamientos/ via clima_en_momento
    (que intenta el pronostico/archivo si no hay una lectura reciente en
    log_clima). La autorizacion ocurre antes de la llamada, asi que los casos
    de 403/404 nunca la alcanzarian, pero los de gestor y admin si. La suite
    debe ser hermetica.
    """
    from datetime import datetime, timezone
    from unittest.mock import MagicMock

    import app.routers.clima_fetch as cf
    import app.routers.tratamientos as tr
    from app.models import LogClima

    proveedor = MagicMock()
    proveedor.fetch.return_value = {"temp_c": 20.0}
    proveedor.fetch_archivo.return_value = []
    monkeypatch.setattr(cf, "get_provider", lambda: proveedor)

    def _guardar_falso(parcela, db):
        # Imita el efecto de guardado de la version real (necesario porque el
        # endpoint relee el ultimo LogClima tras llamar a esta funcion), sin
        # tocar la red.
        db.add(LogClima(
            parcela_id=parcela.id,
            fecha_hora=datetime.now(timezone.utc).replace(tzinfo=None),
            temp_c=20.0,
        ))
        db.commit()
        return None

    monkeypatch.setattr(cf, "fetch_y_guardar_clima", _guardar_falso, raising=False)

    def _clima_en_momento_falso(parcela, momento, db):
        return (None, None, None, "no_disponible")

    monkeypatch.setattr(tr, "clima_en_momento", _clima_en_momento_falso)

    return proveedor


def _registrar(client, email):
    client.post("/auth/register", json={"nombre": email, "email": email, "password": "clave12345"})
    resp = client.post("/auth/token", data={"username": email, "password": "clave12345"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def _cuerpo(metodo, plantilla, escenario):
    """
    Cuerpo VALIDO para cada endpoint de escritura, el mismo para los tres
    actores (ajeno/lector/gestor/admin): la puerta de autorizacion es lo
    unico que varia entre ellos, asi que el cuerpo nunca debe ser la causa
    de un codigo de estado distinto de 403/404/200/201.
    """
    pid = escenario["pid"]
    sid = escenario.get("sid")

    if plantilla == "/parcelas/{pid}/sensores/" and metodo == "POST":
        return {"etiqueta": "Nodo nuevo"}
    if plantilla.endswith("/sensores/provisionar"):
        return {"cantidad": 2}
    if plantilla == "/parcelas/{pid}/sensores/{sid}" and metodo == "PATCH":
        return {"etiqueta": "Actualizado"}
    if plantilla == "/parcelas/{pid}/clima/backfill":
        return {"anios": 1}
    if plantilla == "/logs/sensor/":
        return {
            "parcela_id": pid,
            "sensor_id": sid,
            "fecha_hora": "2026-01-01T10:00:00",
            "humedad_suelo_pct": 30.0,
        }
    if plantilla == "/logs/clima/":
        return {
            "parcela_id": pid,
            "fecha_hora": "2026-01-01T10:00:00",
            "temp_c": 18.0,
        }
    if plantilla == "/tratamientos/":
        return {
            "parcela_id": pid,
            "fecha": "2026-01-01T10:00:00",
            "tipo": "fungicida",
        }
    if plantilla == "/parcelas/{pid}/usuarios" and metodo == "POST":
        # lector@test.dev ya es miembro de la parcela del escenario (ver
        # fixture `escenario`): el ajeno recibe 404 antes de leer el cuerpo,
        # el lector recibe 403 por no ser gestor, y gestor/admin obtienen 409
        # (ya es miembro) en vez de 201 -- ninguno de esos tres codigos
        # depende del cuerpo, asi que el mismo cuerpo vale para los tres.
        return {"email": "lector@test.dev", "rol": "lectura"}
    if plantilla == "/parcelas/{pid}/usuarios/{uid}" and metodo == "PATCH":
        # uid es el lector: degradarlo a "lectura" (su rol actual) nunca
        # roza la guarda del ultimo gestor, asi que gestor/admin dan 200 y
        # no un 409 espurio.
        return {"rol": "lectura"}
    if plantilla == "/parcelas/{pid}/dispositivos" and metodo == "POST":
        return {"nombre": "ESP32 Matriz"}
    if plantilla == "/parcelas/{pid}/dispositivos/{did}" and metodo == "PATCH":
        # Dentro del rango valido: asi el 403/404 que se comprueba viene de la
        # puerta de permisos y no de un 422 de validacion del cuerpo.
        return {"intervalo_ciclo_seg": 7200}
    if metodo == "PATCH" and plantilla == "/parcelas/{pid}":
        return {"nombre": "Editada por la matriz"}
    return {}


def _enviar(client, metodo, ruta, plantilla, headers, escenario):
    """
    Despacha la peticion. Un unico caso especial: la subida foliar es
    multipart, no JSON. Se usa el mismo fichero Excel valido que
    tests/test_foliar_upload.py para que el caso de gestor/admin tambien
    ejercite el endpoint completo (parseo incluido), no solo la puerta.
    """
    if plantilla == "/parcelas/{pid}/foliar/upload":
        with open("tests/fixtures/Libro1.xlsx", "rb") as f:
            return client.post(
                ruta,
                files={
                    "archivo": (
                        "Libro1.xlsx",
                        f,
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    )
                },
                headers=headers,
            )
    return client.request(metodo, ruta, headers=headers, json=_cuerpo(metodo, plantilla, escenario))


@pytest.fixture()
def escenario(client, auth_headers, db_session):
    """
    Una parcela del usuario de prueba (gestor), con un sensor y un
    tratamiento ya creados en ella (para los endpoints que necesitan un id
    secundario), mas un lector, un ajeno y un admin.
    """
    from datetime import datetime

    from app.models import Tratamiento

    pid = client.post(
        "/parcelas/", json={"nombre": "P", "latitud": 41.0, "longitud": -3.0},
        headers=auth_headers,
    ).json()["id"]

    sid = client.post(
        f"/parcelas/{pid}/sensores/", json={"etiqueta": "Sensor base"},
        headers=auth_headers,
    ).json()["id"]

    disp = DispositivoIoT(
        parcela_id=pid,
        nombre="Disp Base",
        token="token-test",
        activo=True,
        creado_en=datetime(2026, 1, 1, 10, 0, 0),
    )
    db_session.add(disp)
    db_session.commit()
    did = disp.id

    # Insertado directamente por ORM, no via POST /tratamientos/: ese
    # endpoint dispara clima_en_momento, que sin log_clima cercano intenta
    # salir a red. El fixture sin_red ya lo neutraliza para las llamadas que
    # hace la propia matriz, pero aqui evitamos depender del orden de
    # aplicacion de fixtures.
    tratamiento = Tratamiento(
        parcela_id=pid,
        fecha=datetime(2026, 1, 1, 10, 0, 0),
        tipo="fungicida",
        clima_fuente="no_disponible",
    )
    db_session.add(tratamiento)
    db_session.commit()
    tid = tratamiento.id

    lector = _registrar(client, "lector@test.dev")
    ajeno = _registrar(client, "ajeno@test.dev")
    admin = _registrar(client, "admin@vinalert.dev")

    u_lector = db_session.query(Usuario).filter_by(email="lector@test.dev").first()
    db_session.add(ParcelaUsuario(parcela_id=pid, usuario_id=u_lector.id, rol="lectura"))
    u_admin = db_session.query(Usuario).filter_by(email="admin@vinalert.dev").first()
    u_admin.rol = "admin"
    db_session.commit()

    return {
        "pid": pid, "sid": sid, "tid": tid, "uid": u_lector.id, "did": did,
        "gestor": auth_headers, "lector": lector, "ajeno": ajeno, "admin": admin,
    }


def _ruta(plantilla, escenario):
    return plantilla.format(
        pid=escenario["pid"], sid=escenario.get("sid"), tid=escenario.get("tid"),
        uid=escenario.get("uid"), did=escenario.get("did"),
    )



@pytest.mark.parametrize("metodo,plantilla,escribe", ENDPOINTS)
def test_usuario_ajeno_siempre_404(escenario, client, metodo, plantilla, escribe):
    ruta = _ruta(plantilla, escenario)
    resp = _enviar(client, metodo, ruta, plantilla, escenario["ajeno"], escenario)
    if "/dispositivos" in plantilla:
        assert resp.status_code == 403, f"{metodo} {ruta} debe dar 403 por no ser superadmin"
    else:
        assert resp.status_code == 404, f"{metodo} {ruta} filtro la existencia de la parcela"


@pytest.mark.parametrize("metodo,plantilla,escribe", ENDPOINTS)
def test_lector_consulta_pero_no_escribe(escenario, client, metodo, plantilla, escribe):
    ruta = _ruta(plantilla, escenario)
    resp = _enviar(client, metodo, ruta, plantilla, escenario["lector"], escenario)
    if escribe or "/dispositivos" in plantilla:
        assert resp.status_code == 403, f"{metodo} {ruta} dejo escribir o acceder a dispositivos a un usuario de lectura"
    else:
        assert resp.status_code not in (403, 404, 422), (
            f"{metodo} {ruta} bloqueo o rompio una consulta legitima ({resp.status_code})"
        )
        assert resp.status_code < 500, f"{metodo} {ruta} rompio con un error de servidor"


@pytest.mark.parametrize("metodo,plantilla,escribe", ENDPOINTS)
def test_admin_no_asociado_entra_como_gestor(escenario, client, metodo, plantilla, escribe):
    ruta = _ruta(plantilla, escenario)
    resp = _enviar(client, metodo, ruta, plantilla, escenario["admin"], escenario)
    assert resp.status_code not in (403, 404, 422), f"{metodo} {ruta} bloqueo o rompio al admin ({resp.status_code})"
    assert resp.status_code < 500, f"{metodo} {ruta} rompio con un error de servidor para el admin"



def test_no_queda_ninguna_llamada_a_la_funcion_antigua():
    """Si sobrevive una llamada, ese endpoint se queda con la autorizacion vieja."""
    import pathlib
    raiz = pathlib.Path(__file__).resolve().parent.parent / "app"
    restos = [
        f"{p}" for p in raiz.rglob("*.py")
        if "get_parcela_del_usuario" in p.read_text(encoding="utf-8")
    ]
    assert restos == [], f"quedan referencias a get_parcela_del_usuario en {restos}"


def test_ser_miembro_de_una_parcela_no_da_acceso_a_otra(client, auth_headers, escenario):
    """
    La suite actual cazaria un filtro de pertenencia roto "solo por parcela_id",
    pero no uno "solo por usuario_id". Con dos parcelas distintas, un miembro de
    la primera pidiendo la segunda tiene que recibir 404.
    """
    otra = client.post("/parcelas/", json={"nombre": "Otra"}, headers=escenario["ajeno"]).json()

    resp = client.get(f"/parcelas/{otra['id']}/dashboard", headers=escenario["gestor"])
    assert resp.status_code == 404


def test_matriz_cubre_todos_los_endpoints_con_ambito_de_parcela():
    """
    Guarda estructural: la matriz se ha quedado incompleta DOS VECES en esta
    misma rama (12/19 y luego 19/21), y las dos veces lo detecto solo un
    revisor enumerando rutas a mano. Este test compara el numero real de
    rutas con ambito de parcela contra len(ENDPOINTS) para que olvidarse de
    registrar una falle en rojo, sin convertir la matriz en autodescubierta
    (sigue siendo ENDPOINTS quien dice, a mano, quien es lectura y quien
    escritura).

    "Ambito de parcela" = la autorizacion se hace sobre una parcela concreta
    via parcela_con_lectura/parcela_con_gestion. Dos formas de tener ese
    ambito:

    1. La ruta lleva {parcela_id} en el path -- se cuentan iterando
       app.routes y quedandonos con las que empiezan por
       "/parcelas/{parcela_id}" (SIN barra final: GET/PATCH /parcelas/{id}
       de la Task 4 tienen justo ese path, sin nada detras, asi que una barra
       final los dejaria fuera). El prefijo sigue excluyendo GET/POST
       /parcelas/ a proposito: su path real es "/parcelas/" (parcela
       literal, sin nada tras la barra), que nunca empieza por
       "/parcelas/{parcela_id}" -- la barra que antes protegia esa exclusion
       no hacia falta, la protege la ausencia de "{parcela_id}" en el
       literal. Esas dos rutas no tienen ambito, son "listar las parcelas
       propias" y "crear una parcela nueva".

    2. La ruta NO lleva {parcela_id} en el path porque el id de la parcela
       llega por otra via, y por tanto no las encuentra el filtro anterior.
       Son exactamente 4, listadas aqui a mano porque no hay forma de
       descubrirlas por introspeccion de rutas:
         - POST /logs/sensor/    (parcela_id viene en el cuerpo)
         - POST /logs/clima/     (parcela_id viene en el cuerpo)
         - POST /tratamientos/   (parcela_id viene en el cuerpo)
         - DELETE /tratamientos/{tratamiento_id} (el tratamiento ya
           pertenece a una parcela; el endpoint la resuelve con un query
           previo, no hay {parcela_id} en el path)

    EXCLUSIONES sobre el filtro de path (hoy: ninguna). Si en el futuro se
    anade una ruta bajo /parcelas/{parcela_id}/... que deliberadamente no
    tenga ambito de parcela (dificil de imaginar, pero por si acaso), se
    documenta aqui por que se excluye en vez de silenciar el test.
    """
    from app.main import app

    ENDPOINTS_SIN_PARCELA_ID_EN_PATH = 4

    rutas_con_id_en_path = [
        route for route in app.routes
        if getattr(route, "path", "").startswith("/parcelas/{parcela_id}")
    ]
    n_con_id_en_path = sum(
        len(route.methods - {"HEAD", "OPTIONS"}) for route in rutas_con_id_en_path
    )

    total_real = n_con_id_en_path + ENDPOINTS_SIN_PARCELA_ID_EN_PATH

    assert len(ENDPOINTS) == total_real, (
        f"ENDPOINTS tiene {len(ENDPOINTS)} entradas pero se contaron {total_real} rutas "
        "con ambito de parcela en la app (path-based: "
        f"{n_con_id_en_path} + {ENDPOINTS_SIN_PARCELA_ID_EN_PATH} sin {{parcela_id}} en el path). "
        "Falta registrar (o sobra) algun endpoint en ENDPOINTS -- revisa el diff de rutas."
    )

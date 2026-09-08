from datetime import datetime

from app.models import Parcela, Usuario


def _crear_admin(client, db_session):
    client.post("/auth/register", json={"nombre": "Admin", "email": "admin@vinalert.dev", "password": "clave12345"})
    u = db_session.query(Usuario).filter_by(email="admin@vinalert.dev").first()
    u.rol = "admin"
    db_session.commit()
    resp = client.post("/auth/token", data={"username": "admin@vinalert.dev", "password": "clave12345"})
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}



def test_dispositivos_restringido_a_admin_vinalert(client, auth_headers, db_session, parcela_id):
    # Usuario regular (no admin@vinalert.dev) intenta acceder a dispositivos -> 403
    resp = client.get(f"/parcelas/{parcela_id}/dispositivos", headers=auth_headers)
    assert resp.status_code == 403
    assert "admin@vinalert.dev" in resp.json()["detail"]

    resp_post = client.post(
        f"/parcelas/{parcela_id}/dispositivos",
        json={"nombre": "ESP32 Regular"},
        headers=auth_headers,
    )
    assert resp_post.status_code == 403


def test_flujo_dispositivos_iot_100_anios_y_revocacion(client, db_session, parcela_id):
    admin_headers = _crear_admin(client, db_session)

    # 1. Crear un sensor en la parcela
    resp_s = client.post(f"/parcelas/{parcela_id}/sensores/", json={"etiqueta": "Sensor Raiz"}, headers=admin_headers)
    assert resp_s.status_code == 201
    sensor_id = resp_s.json()["id"]

    # 2. Crear un token de 100 años para el ESP32 Gateway (solo admin@vinalert.dev)
    resp_disp = client.post(
        f"/parcelas/{parcela_id}/dispositivos",
        json={"nombre": "ESP32 Gateway Concentrador"},
        headers=admin_headers,
    )
    assert resp_disp.status_code == 201
    disp = resp_disp.json()
    assert disp["nombre"] == "ESP32 Gateway Concentrador"
    assert disp["activo"] is True
    token_esp32 = disp["token"]
    disp_id = disp["id"]

    # 3. El ESP32 envía una lectura de sensor usando su token
    headers_esp = {"Authorization": f"Bearer {token_esp32}"}
    resp_lectura = client.post(
        "/logs/sensor/",
        json={
            "parcela_id": parcela_id,
            "sensor_id": sensor_id,
            "fecha_hora": datetime.now().isoformat(),
            "humedad_suelo_pct": 28.5,
            "temperatura_suelo": 21.0,
            "bateria": 3.95,
        },
        headers=headers_esp,
    )
    assert resp_lectura.status_code == 201
    assert resp_lectura.json()["humedad_suelo_pct"] == 28.5

    # 4. El admin cancela/revoca el acceso del dispositivo
    resp_revocar = client.patch(
        f"/parcelas/{parcela_id}/dispositivos/{disp_id}/revocar",
        headers=admin_headers,
    )
    assert resp_revocar.status_code == 200
    assert resp_revocar.json()["activo"] is False

    # 5. El ESP32 intenta enviar otra lectura -> RECHAZADO (401 Unauthorized)
    resp_rechazada = client.post(
        "/logs/sensor/",
        json={
            "parcela_id": parcela_id,
            "sensor_id": sensor_id,
            "fecha_hora": datetime.now().isoformat(),
            "humedad_suelo_pct": 29.0,
        },
        headers=headers_esp,
    )
    assert resp_rechazada.status_code == 401

    # 6. El admin reactiva el dispositivo
    resp_reactivar = client.patch(
        f"/parcelas/{parcela_id}/dispositivos/{disp_id}/revocar",
        headers=admin_headers,
    )
    assert resp_reactivar.status_code == 200
    assert resp_reactivar.json()["activo"] is True

    # 7. El ESP32 vuelve a tener acceso concedido
    resp_ok = client.post(
        "/logs/sensor/",
        json={
            "parcela_id": parcela_id,
            "sensor_id": sensor_id,
            "fecha_hora": datetime.now().isoformat(),
            "humedad_suelo_pct": 27.5,
        },
        headers=headers_esp,
    )
    assert resp_ok.status_code == 201

    # 8. Listar dispositivos
    resp_lista = client.get(f"/parcelas/{parcela_id}/dispositivos", headers=admin_headers)
    assert resp_lista.status_code == 200
    assert len(resp_lista.json()) >= 1

    # 9. Borrar dispositivo
    resp_del = client.delete(f"/parcelas/{parcela_id}/dispositivos/{disp_id}", headers=admin_headers)
    assert resp_del.status_code == 204


# ---------------------------------------------------------------------------
# Intervalo de ciclo configurable desde la web
# ---------------------------------------------------------------------------

def _crear_dispositivo(client, admin_headers, parcela_id, nombre="Maestro LoRa"):
    resp = client.post(
        f"/parcelas/{parcela_id}/dispositivos",
        json={"nombre": nombre},
        headers=admin_headers,
    )
    assert resp.status_code == 201
    return resp.json()


def test_dispositivo_nuevo_arranca_con_intervalo_de_cuatro_horas(client, db_session, parcela_id):
    admin_headers = _crear_admin(client, db_session)
    disp = _crear_dispositivo(client, admin_headers, parcela_id)
    assert disp["intervalo_ciclo_seg"] == 14400


def test_admin_cambia_el_intervalo_de_ciclo(client, db_session, parcela_id):
    admin_headers = _crear_admin(client, db_session)
    disp = _crear_dispositivo(client, admin_headers, parcela_id)

    resp = client.patch(
        f"/parcelas/{parcela_id}/dispositivos/{disp['id']}",
        json={"intervalo_ciclo_seg": 7200},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["intervalo_ciclo_seg"] == 7200

    listado = client.get(f"/parcelas/{parcela_id}/dispositivos", headers=admin_headers)
    assert listado.json()[0]["intervalo_ciclo_seg"] == 7200


def test_intervalo_por_debajo_del_minimo_rechazado(client, db_session, parcela_id):
    admin_headers = _crear_admin(client, db_session)
    disp = _crear_dispositivo(client, admin_headers, parcela_id)

    resp = client.patch(
        f"/parcelas/{parcela_id}/dispositivos/{disp['id']}",
        json={"intervalo_ciclo_seg": 10},
        headers=admin_headers,
    )
    assert resp.status_code == 422


def test_intervalo_por_encima_de_24h_rechazado(client, db_session, parcela_id):
    admin_headers = _crear_admin(client, db_session)
    disp = _crear_dispositivo(client, admin_headers, parcela_id)

    resp = client.patch(
        f"/parcelas/{parcela_id}/dispositivos/{disp['id']}",
        json={"intervalo_ciclo_seg": 90000},
        headers=admin_headers,
    )
    assert resp.status_code == 422


def test_usuario_regular_no_puede_cambiar_el_intervalo(client, db_session, auth_headers, parcela_id):
    admin_headers = _crear_admin(client, db_session)
    disp = _crear_dispositivo(client, admin_headers, parcela_id)

    resp = client.patch(
        f"/parcelas/{parcela_id}/dispositivos/{disp['id']}",
        json={"intervalo_ciclo_seg": 7200},
        headers=auth_headers,
    )
    assert resp.status_code == 403


def test_el_maestro_consulta_su_intervalo_con_su_propio_token(client, db_session, parcela_id):
    admin_headers = _crear_admin(client, db_session)
    disp = _crear_dispositivo(client, admin_headers, parcela_id)
    client.patch(
        f"/parcelas/{parcela_id}/dispositivos/{disp['id']}",
        json={"intervalo_ciclo_seg": 7200},
        headers=admin_headers,
    )

    headers_esp = {"Authorization": f"Bearer {disp['token']}"}
    resp = client.get("/dispositivos/configuracion", headers=headers_esp)
    assert resp.status_code == 200
    assert resp.json() == {
        "dispositivo_id": disp["id"],
        "parcela_id": parcela_id,
        "intervalo_ciclo_seg": 7200,
    }


def test_configuracion_rechaza_un_token_de_usuario_normal(client, auth_headers):
    resp = client.get("/dispositivos/configuracion", headers=auth_headers)
    assert resp.status_code == 403


def test_configuracion_rechaza_un_dispositivo_revocado(client, db_session, parcela_id):
    admin_headers = _crear_admin(client, db_session)
    disp = _crear_dispositivo(client, admin_headers, parcela_id)
    client.patch(
        f"/parcelas/{parcela_id}/dispositivos/{disp['id']}/revocar",
        headers=admin_headers,
    )

    headers_esp = {"Authorization": f"Bearer {disp['token']}"}
    resp = client.get("/dispositivos/configuracion", headers=headers_esp)
    assert resp.status_code == 401


def test_token_con_device_id_corrupto_da_401_y_no_revienta(client, parcela_id):
    """
    Un device_id no numerico llegaba a int() sin proteger: en vez del 401 que
    corresponde, la peticion moria con un ValueError -> 500, filtrando una
    traza. get_current_user ya se protegia de esto; get_current_dispositivo no.
    """
    from jose import jwt
    from app.auth import ALGORITHM, SECRET_KEY

    token = jwt.encode(
        {"sub": "1", "device_id": "no-soy-un-numero", "parcela_id": parcela_id,
         "tipo": "dispositivo_iot", "exp": 4940839848},
        SECRET_KEY,
        algorithm=ALGORITHM,
    )
    resp = client.get("/dispositivos/configuracion", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401

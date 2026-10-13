"""
El token de un ESP32 solo sirve para lo que hace el ESP32: subir lecturas de
SU parcela y leer su configuracion. Antes llevaba dentro la identidad del
superadmin que lo creo y valia como su sesion durante 100 anos: quien lo
sacase de un nodo del vinedo (volcando la flash, o con un WiFi falso, porque
el firmware no valida el certificado) podia listar las cuentas y borrar
parcelas ajenas.
"""
from datetime import datetime

import pytest
from jose import jwt

from app.auth import ALGORITHM, SECRET_KEY, crear_token_acceso
from app.models import LogSensor, Parcela, Usuario
from tests.ayudas import alta_sensor, hacer_superadmin


@pytest.fixture()
def admin_headers(client, db_session):
    client.post("/auth/register", json={"nombre": "Admin", "email": "admin@vinalert.dev", "password": "clave12345"})
    u = hacer_superadmin(db_session, "admin@vinalert.dev")
    u.rol = "admin"
    db_session.commit()
    resp = client.post("/auth/token", data={"username": "admin@vinalert.dev", "password": "clave12345"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture()
def dispositivo(client, admin_headers, parcela_id):
    resp = client.post(f"/parcelas/{parcela_id}/dispositivos", json={"nombre": "Maestro"}, headers=admin_headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.fixture()
def esp_headers(dispositivo):
    return {"Authorization": f"Bearer {dispositivo['token']}"}


def _lectura(parcela_id, sensor_id):
    return {
        "parcela_id": parcela_id,
        "sensor_id": sensor_id,
        "fecha_hora": datetime.now().isoformat(),
        "humedad_suelo_pct": 25.0,
    }


@pytest.mark.parametrize("metodo,ruta", [
    ("GET", "/auth/me"),
    ("GET", "/admin/usuarios"),
    ("GET", "/parcelas/"),
    ("POST", "/parcelas/"),
])
def test_el_token_del_esp32_no_vale_como_sesion_de_usuario(client, esp_headers, metodo, ruta):
    resp = client.request(metodo, ruta, headers=esp_headers, json={"nombre": "x"})
    assert resp.status_code == 401


def test_el_token_del_esp32_no_puede_borrar_parcelas(client, esp_headers, parcela_id, db_session):
    resp = client.delete(f"/parcelas/{parcela_id}", headers=esp_headers)
    assert resp.status_code == 401
    assert db_session.get(Parcela, parcela_id) is not None


def test_el_esp32_sube_lecturas_de_su_parcela(client, auth_headers, esp_headers, parcela_id):
    sensor = alta_sensor(client, auth_headers, parcela_id)
    resp = client.post("/logs/sensor/", json=_lectura(parcela_id, sensor["id"]), headers=esp_headers)
    assert resp.status_code == 201, resp.text


def test_el_esp32_no_sube_lecturas_a_otra_parcela(client, esp_headers, db_session):
    # Parcela de otra persona, con su propio sensor
    client.post("/auth/register", json={"nombre": "Otra", "email": "otra@vinalert.dev", "password": "clave12345"})
    tok = client.post("/auth/token", data={"username": "otra@vinalert.dev", "password": "clave12345"}).json()["access_token"]
    otra_headers = {"Authorization": f"Bearer {tok}"}
    otra_pid = client.post("/parcelas/", json={"nombre": "Ajena"}, headers=otra_headers).json()["id"]
    sensor_ajeno = alta_sensor(client, otra_headers, otra_pid)

    resp = client.post("/logs/sensor/", json=_lectura(otra_pid, sensor_ajeno["id"]), headers=esp_headers)

    assert resp.status_code == 404
    assert db_session.query(LogSensor).count() == 0


def test_el_token_nuevo_no_lleva_la_identidad_de_quien_lo_creo(dispositivo, db_session):
    payload = jwt.decode(dispositivo["token"], SECRET_KEY, algorithms=[ALGORITHM])
    ids_usuarios = {str(u.id) for u in db_session.query(Usuario).all()}
    assert payload["sub"] not in ids_usuarios
    assert payload["tipo"] == "dispositivo_iot"


def test_los_tokens_de_esp32_ya_emitidos_siguen_subiendo_pero_no_valen_como_sesion(
    client, auth_headers, dispositivo, parcela_id, db_session,
):
    """
    Los ESP32 ya instalados llevan un token con el formato antiguo
    (sub = id del admin). Deben seguir subiendo lecturas sin reflashearlos,
    pero ya no pueden usarse como sesion del admin.
    """
    admin = db_session.query(Usuario).filter_by(email="admin@vinalert.dev").one()
    token_antiguo = crear_token_acceso({
        "sub": str(admin.id),
        "device_id": dispositivo["id"],
        "parcela_id": parcela_id,
        "tipo": "dispositivo_iot",
    })
    headers = {"Authorization": f"Bearer {token_antiguo}"}
    sensor = alta_sensor(client, auth_headers, parcela_id)

    assert client.get("/admin/usuarios", headers=headers).status_code == 401
    assert client.post("/logs/sensor/", json=_lectura(parcela_id, sensor["id"]), headers=headers).status_code == 201

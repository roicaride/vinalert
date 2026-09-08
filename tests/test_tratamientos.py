from datetime import datetime
from unittest.mock import patch

import pytest

from app.models import LogClima


@pytest.fixture(autouse=True)
def _sin_red_por_defecto():
    """
    Con el cambio a clima_en_momento(), un tratamiento sin LogClima cercano
    dispara una llamada a la API de Open-Meteo. Los tests de este módulo no
    verifican esa llamada (eso lo cubre tests/test_clima_puntual.py), así que
    por defecto se simula que la API no responde: así ningún test aquí
    depende de red real, y "sin clima disponible" se resuelve de forma
    determinista. Un test que sí necesite mockear la API concreta puede
    hacerlo con su propio `with patch(...)`, que tiene prioridad mientras
    dura su bloque.
    """
    with patch("app.services.clima_puntual.requests.get", side_effect=RuntimeError("sin red en tests")):
        yield


def _cuerpo(parcela_id, tipo="fitosanitario"):
    return {
        "parcela_id": parcela_id,
        "fecha": "2026-08-17T09:30:00",
        "tipo": tipo,
        "producto": "Producto X",
        "materia_activa": "mancozeb",
        "dosis": 2.5,
        "unidad_dosis": "L/ha",
        "operador": "Roi",
        "maquinaria": "Atomizador",
    }


def test_crear_tratamiento_copia_el_clima(client, auth_headers, parcela_id, db_session):
    db_session.add(LogClima(
        parcela_id=parcela_id, fecha_hora=datetime(2026, 8, 17, 9, 0),
        temp_c=22.0, viento_vel_ms=1.8,
    ))
    db_session.commit()

    resp = client.post("/tratamientos/", json=_cuerpo(parcela_id), headers=auth_headers)
    assert resp.status_code == 201
    body = resp.json()
    assert body["temp_c_aplicacion"] == 22.0
    assert body["viento_ms_aplicacion"] == 1.8
    assert body["clima_fuente"] == "log_clima"


def test_crear_tratamiento_sin_clima_disponible(client, auth_headers, parcela_id):
    """Sin LogClima cercano y con la API caída (fixture autouse), el
    tratamiento se crea igualmente: un fallo de Open-Meteo no puede impedir
    registrar un tratamiento en campo."""
    resp = client.post("/tratamientos/", json=_cuerpo(parcela_id), headers=auth_headers)
    assert resp.status_code == 201
    body = resp.json()
    assert body["temp_c_aplicacion"] is None
    assert body["viento_ms_aplicacion"] is None
    assert body["clima_fuente"] == "no_disponible"
    assert body["clima_fecha_hora"] is None
    assert body["producto"] == "Producto X"


def test_listar_tratamientos_ordenados_y_filtrados(client, auth_headers, parcela_id):
    client.post("/tratamientos/", json={**_cuerpo(parcela_id), "fecha": "2026-08-10T09:00:00"}, headers=auth_headers)
    client.post("/tratamientos/", json={**_cuerpo(parcela_id, tipo="abonado"), "fecha": "2026-08-15T09:00:00"}, headers=auth_headers)

    resp = client.get(f"/parcelas/{parcela_id}/tratamientos", headers=auth_headers)
    assert resp.status_code == 200
    lista = resp.json()
    assert len(lista) == 2
    assert lista[0]["fecha"].startswith("2026-08-15"), "el más reciente primero"

    resp = client.get(f"/parcelas/{parcela_id}/tratamientos", params={"tipo": "abonado"}, headers=auth_headers)
    assert len(resp.json()) == 1


def test_borrar_tratamiento(client, auth_headers, parcela_id):
    creado = client.post("/tratamientos/", json=_cuerpo(parcela_id), headers=auth_headers).json()
    resp = client.delete(f"/tratamientos/{creado['id']}", headers=auth_headers)
    assert resp.status_code == 204
    assert client.get(f"/parcelas/{parcela_id}/tratamientos", headers=auth_headers).json() == []


def test_no_se_puede_borrar_un_tratamiento_de_otro_usuario(client, auth_headers, parcela_id):
    creado = client.post("/tratamientos/", json=_cuerpo(parcela_id), headers=auth_headers).json()

    client.post("/auth/register", json={"nombre": "Otro", "email": "otro@vinalert.dev", "password": "clave12345"})
    token = client.post("/auth/token", data={"username": "otro@vinalert.dev", "password": "clave12345"}).json()["access_token"]
    otros_headers = {"Authorization": f"Bearer {token}"}

    resp = client.delete(f"/tratamientos/{creado['id']}", headers=otros_headers)
    assert resp.status_code == 404

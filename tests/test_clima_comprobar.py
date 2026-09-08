from unittest.mock import MagicMock, patch

from app.models import LogClima

# Forma real de lo que devuelve OpenMeteoProvider.fetch(): las 25 claves de
# su contrato (ver _MAPA_CURRENT y las cuatro claves de pronostico en
# app/services/weather.py), presentes siempre aunque el proveedor no tenga
# datos utilizables para las coordenadas -- en ese caso llegan a None, pero
# el dict en si sigue siendo truthy. Un `{}` (como usaba este archivo antes)
# no es una respuesta que el proveedor real produzca jamas.
_DATOS_SIN_VALORES = {
    "temp_c": None,
    "humedad_relativa_pct": None,
    "presion_hpa": None,
    "viento_vel_ms": None,
    "lluvia_mm": None,
    "uv_index": None,
    "et0": None,
    "vpd_kpa": None,
    "punto_rocio_c": None,
    "radiacion_wm2": None,
    "nubosidad_pct": None,
    "viento_racha_ms": None,
    "viento_dir_deg": None,
    "duracion_sol_s": None,
    "suelo_temp_0cm": None,
    "suelo_temp_6cm": None,
    "suelo_temp_18cm": None,
    "suelo_hum_0_1cm": None,
    "suelo_hum_1_3cm": None,
    "suelo_hum_3_9cm": None,
    "suelo_hum_9_27cm": None,
    "lluvia_prev_24h_mm": None,
    "prob_lluvia_24h_pct": None,
    "lluvia_prev_48h_mm": None,
    "prob_lluvia_48h_pct": None,
}


def test_coordenadas_validas_dan_disponible(client, auth_headers, parcela_id):
    proveedor = MagicMock()
    proveedor.fetch.return_value = {"temp_c": 21.5}

    with patch("app.routers.clima_fetch.get_provider", return_value=proveedor):
        resp = client.get(f"/parcelas/{parcela_id}/clima/comprobar", headers=auth_headers)

    assert resp.status_code == 200
    assert resp.json()["disponible"] is True


def test_la_sonda_no_escribe_nada(client, auth_headers, parcela_id, db_session):
    """Es una comprobacion, no una lectura: no debe ensuciar log_clima."""
    proveedor = MagicMock()
    proveedor.fetch.return_value = {"temp_c": 21.5}

    with patch("app.routers.clima_fetch.get_provider", return_value=proveedor):
        client.get(f"/parcelas/{parcela_id}/clima/comprobar", headers=auth_headers)

    assert db_session.query(LogClima).filter_by(parcela_id=parcela_id).count() == 0


def test_proveedor_caido_da_200_con_disponible_false(client, auth_headers, parcela_id):
    """
    No es un 503: la pregunta "sirven estas coordenadas?" se ha respondido
    correctamente, y la respuesta es "ahora mismo no se puede saber".
    """
    proveedor = MagicMock()
    proveedor.fetch.side_effect = RuntimeError("sin respuesta del proveedor")

    with patch("app.routers.clima_fetch.get_provider", return_value=proveedor):
        resp = client.get(f"/parcelas/{parcela_id}/clima/comprobar", headers=auth_headers)

    assert resp.status_code == 200
    assert resp.json()["disponible"] is False
    assert resp.json()["motivo"]


def test_proveedor_sin_datos_da_disponible_false(client, auth_headers, parcela_id):
    """
    El proveedor responde 200 pero sin datos utilizables para esas
    coordenadas: la forma real es un dict con las 25 claves del contrato,
    todas a None (ver _DATOS_SIN_VALORES), no un `{}`.
    """
    proveedor = MagicMock()
    proveedor.fetch.return_value = dict(_DATOS_SIN_VALORES)

    with patch("app.routers.clima_fetch.get_provider", return_value=proveedor):
        resp = client.get(f"/parcelas/{parcela_id}/clima/comprobar", headers=auth_headers)

    assert resp.status_code == 200
    assert resp.json()["disponible"] is False
    assert resp.json()["motivo"]


def test_proveedor_con_temperatura_da_disponible_true(client, auth_headers, parcela_id):
    """Misma forma real que el caso anterior, pero con temp_c presente."""
    proveedor = MagicMock()
    datos = dict(_DATOS_SIN_VALORES)
    datos["temp_c"] = 21.5
    proveedor.fetch.return_value = datos

    with patch("app.routers.clima_fetch.get_provider", return_value=proveedor):
        resp = client.get(f"/parcelas/{parcela_id}/clima/comprobar", headers=auth_headers)

    assert resp.status_code == 200
    assert resp.json()["disponible"] is True


def test_parcela_sin_coordenadas_da_422(client, auth_headers):
    creada = client.post("/parcelas/", json={"nombre": "Sin coords"}, headers=auth_headers).json()

    resp = client.get(f"/parcelas/{creada['id']}/clima/comprobar", headers=auth_headers)

    assert resp.status_code == 422


def test_un_lector_no_puede_sondear(client, auth_headers, parcela_id, db_session):
    """Gasta cuota de Open-Meteo, que es un recurso compartido y limitado."""
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

    resp = client.get(
        f"/parcelas/{parcela_id}/clima/comprobar",
        headers={"Authorization": f"Bearer {tok}"},
    )
    assert resp.status_code == 403

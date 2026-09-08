from datetime import date, timedelta
from unittest.mock import patch

from app.models import ClimaDiario
from app.services.clima_diario_service import guardar_dias


def _fila(fecha, fuente, temp_max=30.0):
    return {"fecha": fecha, "temp_max": temp_max, "fuente": fuente, "suelo_modelo_capa": "0_to_7cm"}


def test_guardar_dias_inserta(db_session, parcela_id):
    filas = [_fila(date(2026, 8, 15), "archivo"), _fila(date(2026, 8, 16), "archivo")]
    res = guardar_dias(parcela_id, filas, db_session)
    assert res == {"insertados": 2, "actualizados": 0, "omitidos": 0}
    assert db_session.query(ClimaDiario).count() == 2


def test_reejecutar_actualiza_no_duplica(db_session, parcela_id):
    guardar_dias(parcela_id, [_fila(date(2026, 8, 15), "archivo", 30.0)], db_session)
    res = guardar_dias(parcela_id, [_fila(date(2026, 8, 15), "archivo", 31.5)], db_session)
    assert res == {"insertados": 0, "actualizados": 1, "omitidos": 0}
    assert db_session.query(ClimaDiario).count() == 1
    assert db_session.query(ClimaDiario).first().temp_max == 31.5


def test_archivo_no_pisa_datos_de_pronostico(db_session, parcela_id):
    guardar_dias(parcela_id, [_fila(date(2026, 8, 15), "pronostico", 30.0)], db_session)
    res = guardar_dias(parcela_id, [_fila(date(2026, 8, 15), "archivo", 99.0)], db_session)
    assert res == {"insertados": 0, "actualizados": 0, "omitidos": 1}
    fila = db_session.query(ClimaDiario).first()
    assert fila.temp_max == 30.0
    assert fila.fuente == "pronostico"


def test_pronostico_si_pisa_datos_de_archivo(db_session, parcela_id):
    guardar_dias(parcela_id, [_fila(date(2026, 8, 15), "archivo", 30.0)], db_session)
    res = guardar_dias(parcela_id, [_fila(date(2026, 8, 15), "pronostico", 31.5)], db_session)
    assert res == {"insertados": 0, "actualizados": 1, "omitidos": 0}
    fila = db_session.query(ClimaDiario).first()
    assert fila.temp_max == 31.5
    assert fila.fuente == "pronostico"


def test_endpoint_backfill(client, auth_headers, parcela_id):
    filas = [_fila(date(2025, 6, 1), "archivo"), _fila(date(2025, 6, 2), "archivo")]
    with patch("app.routers.clima_fetch.get_provider") as mock:
        mock.return_value.fetch_archivo.return_value = filas
        resp = client.post(
            f"/parcelas/{parcela_id}/clima/backfill",
            json={"desde": "2025-06-01", "hasta": "2025-06-02"},
            headers=auth_headers,
        )
    assert resp.status_code == 200
    assert resp.json()["insertados"] == 2


def test_backfill_recorta_hasta_a_hoy_menos_7(client, auth_headers, parcela_id):
    with patch("app.routers.clima_fetch.get_provider") as mock:
        mock.return_value.fetch_archivo.return_value = []
        resp = client.post(
            f"/parcelas/{parcela_id}/clima/backfill",
            json={"desde": "2025-06-01", "hasta": date.today().isoformat()},
            headers=auth_headers,
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["recortado"] is True
    assert body["hasta"] == (date.today() - timedelta(days=7)).isoformat()


def test_backfill_sin_coordenadas_da_422(client, auth_headers):
    sin_coords = client.post("/parcelas/", json={"nombre": "Sin coords"}, headers=auth_headers).json()
    resp = client.post(
        f"/parcelas/{sin_coords['id']}/clima/backfill",
        json={"desde": "2025-06-01", "hasta": "2025-06-02"},
        headers=auth_headers,
    )
    assert resp.status_code == 422


def test_restar_anios_caso_normal():
    from app.routers.clima_fetch import _restar_anios

    resultado = _restar_anios(date(2026, 8, 18), 3)
    assert resultado == date(2023, 8, 18)


def test_restar_anios_29_febrero_degrada_a_28():
    from app.routers.clima_fetch import _restar_anios

    # 29 de febrero en año bisiesto (2028) restando 1 año → año no bisiesto (2027)
    resultado = _restar_anios(date(2028, 2, 29), 1)
    assert resultado == date(2027, 2, 28)

    # 29 de febrero en año bisiesto (2028) restando 4 años → año bisiesto (2024)
    resultado = _restar_anios(date(2028, 2, 29), 4)
    assert resultado == date(2024, 2, 29)


def test_backfill_anios_endpoint(client, auth_headers, parcela_id):
    with patch("app.routers.clima_fetch.get_provider") as mock:
        mock.return_value.fetch_archivo.return_value = []
        resp = client.post(
            f"/parcelas/{parcela_id}/clima/backfill",
            json={"anios": 1},
            headers=auth_headers,
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["recortado"] is False

    # El desde tiene año = tope.year - 1 (controlamos que la rama anios funciona)
    tope = date.today() - timedelta(days=7)
    desde_esperado_year = tope.year - 1
    desde_actual = date.fromisoformat(body["desde"])
    assert desde_actual.year == desde_esperado_year

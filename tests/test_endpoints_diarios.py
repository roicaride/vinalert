from datetime import date, timedelta

from app.models import ClimaDiario


def test_clima_diario_devuelve_ordenado(client, auth_headers, parcela_id, db_session):
    hoy = date.today()
    db_session.add_all([
        ClimaDiario(parcela_id=parcela_id, fecha=hoy - timedelta(days=2), temp_max=30.0, fuente="archivo"),
        ClimaDiario(parcela_id=parcela_id, fecha=hoy - timedelta(days=1), temp_max=31.0, fuente="pronostico"),
    ])
    db_session.commit()

    resp = client.get(f"/parcelas/{parcela_id}/clima/diario", headers=auth_headers)
    assert resp.status_code == 200
    lista = resp.json()
    assert len(lista) == 2
    assert lista[0]["temp_max"] == 30.0, "el más antiguo primero"
    assert lista[0]["fuente"] == "archivo"


def test_clima_diario_filtra_por_dias(client, auth_headers, parcela_id, db_session):
    hoy = date.today()
    db_session.add_all([
        ClimaDiario(parcela_id=parcela_id, fecha=hoy - timedelta(days=40), temp_max=20.0, fuente="archivo"),
        ClimaDiario(parcela_id=parcela_id, fecha=hoy - timedelta(days=2), temp_max=31.0, fuente="archivo"),
    ])
    db_session.commit()

    resp = client.get(f"/parcelas/{parcela_id}/clima/diario", params={"dias": 7}, headers=auth_headers)
    assert len(resp.json()) == 1


def test_diarios_de_otra_parcela_dan_404(client, auth_headers):
    resp = client.get("/parcelas/99999/clima/diario", headers=auth_headers)
    assert resp.status_code == 404
    resp = client.get("/parcelas/99999/suelo/diario", headers=auth_headers)
    assert resp.status_code == 404


def test_clima_diario_respeta_el_limite(client, auth_headers, parcela_id, db_session):
    hoy = date.today()
    db_session.add_all([
        ClimaDiario(parcela_id=parcela_id, fecha=hoy - timedelta(days=i), temp_max=float(i), fuente="archivo")
        for i in range(5)
    ])
    db_session.commit()

    resp = client.get(f"/parcelas/{parcela_id}/clima/diario", params={"limite": 2}, headers=auth_headers)
    assert resp.status_code == 200
    lista = resp.json()
    assert len(lista) == 2
    # limite se aplica sobre los más recientes, no los más antiguos, y el
    # orden de salida sigue siendo ascendente (igual que sin limite).
    assert lista[0]["fecha"] < lista[1]["fecha"]
    assert lista[-1]["fecha"] == str(hoy)


def test_clima_diario_limite_fuera_de_rango_da_422(client, auth_headers, parcela_id):
    resp = client.get(f"/parcelas/{parcela_id}/clima/diario", params={"limite": 0}, headers=auth_headers)
    assert resp.status_code == 422
    resp = client.get(f"/parcelas/{parcela_id}/clima/diario", params={"limite": 5001}, headers=auth_headers)
    assert resp.status_code == 422


def test_clima_diario_filtra_dias_incluye_el_borde(client, auth_headers, parcela_id, db_session):
    hoy = date.today()
    db_session.add_all([
        ClimaDiario(parcela_id=parcela_id, fecha=hoy - timedelta(days=7), temp_max=25.0, fuente="archivo"),
        ClimaDiario(parcela_id=parcela_id, fecha=hoy - timedelta(days=6), temp_max=26.0, fuente="archivo"),
        ClimaDiario(parcela_id=parcela_id, fecha=hoy - timedelta(days=8), temp_max=24.0, fuente="archivo"),
    ])
    db_session.commit()

    resp = client.get(f"/parcelas/{parcela_id}/clima/diario", params={"dias": 7}, headers=auth_headers)
    lista = resp.json()
    assert len(lista) == 2, "el borde (hace 7 días) debe estar incluido"
    assert any(f["temp_max"] == 25.0 for f in lista), "registro de exactamente hace 7 días debe aparecer"
    assert not any(f["temp_max"] == 24.0 for f in lista), "registro de más de 7 días debe estar excluido"

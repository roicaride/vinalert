import csv
import io

import openpyxl


def test_exportar_csv(client, auth_headers, parcela_id):
    resp = client.get(
        f"/parcelas/{parcela_id}/sensores/exportar",
        params={"formato": "csv"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    filas = list(csv.reader(io.StringIO(resp.text)))
    assert filas[0] == [
        "parcela_id", "desde", "hasta", "n_sensores", "n_lecturas",
        "humedad_media", "humedad_sd", "temperatura_media", "temperatura_sd",
    ]
    assert len(filas) == 2


def test_exportar_xlsx(client, auth_headers, parcela_id):
    resp = client.get(
        f"/parcelas/{parcela_id}/sensores/exportar",
        params={"formato": "xlsx"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert "spreadsheet" in resp.headers["content-type"]
    wb = openpyxl.load_workbook(io.BytesIO(resp.content))
    filas = list(wb.active.iter_rows(values_only=True))
    assert filas[0][0] == "parcela_id"
    assert len(filas) == 2


def test_exportar_formato_invalido(client, auth_headers, parcela_id):
    resp = client.get(
        f"/parcelas/{parcela_id}/sensores/exportar",
        params={"formato": "pdf"},
        headers=auth_headers,
    )
    assert resp.status_code == 422

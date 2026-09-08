import openpyxl
import pytest


def test_subir_excel_foliar_guarda_los_grupos(client, auth_headers, parcela_id):
    with open("tests/fixtures/Libro1.xlsx", "rb") as f:
        resp = client.post(
            f"/parcelas/{parcela_id}/foliar/upload",
            files={"archivo": ("Libro1.xlsx", f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            headers=auth_headers,
        )
    assert resp.status_code == 201
    registros = resp.json()
    assert len(registros) == 6
    assert sorted(r["grupo"] for r in registros) == [1, 2, 3, 4, 5, 7]
    assert all(r["parcela_id"] == parcela_id for r in registros)
    assert all(r["archivo_origen"] == "Libro1.xlsx" for r in registros)


def test_subir_excel_con_formato_invalido_devuelve_422(client, auth_headers, parcela_id, tmp_path):
    ruta = tmp_path / "invalido.xlsx"
    wb = openpyxl.Workbook()
    wb.active.append(["a", "b"])
    wb.save(ruta)

    with open(ruta, "rb") as f:
        resp = client.post(
            f"/parcelas/{parcela_id}/foliar/upload",
            files={"archivo": ("invalido.xlsx", f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            headers=auth_headers,
        )
    assert resp.status_code == 422

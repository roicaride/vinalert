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


def test_un_archivo_de_mas_de_5_mb_se_rechaza_sin_procesarlo(client, auth_headers, parcela_id):
    enorme = b"0" * (5 * 1024 * 1024 + 1)
    resp = client.post(
        f"/parcelas/{parcela_id}/foliar/upload",
        files={"archivo": ("enorme.xlsx", enorme, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=auth_headers,
    )
    assert resp.status_code == 413
    assert "5 MB" in resp.json()["detail"]


def test_un_xlsx_que_descomprimido_ocupa_demasiado_se_rechaza(client, auth_headers, parcela_id):
    # Una "bomba zip": pocos KB comprimidos que al abrirse ocupan cientos de MB.
    import io
    import zipfile

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("xl/worksheets/sheet1.xml", b"<a>" + b" " * (120 * 1024 * 1024) + b"</a>")
    assert len(buf.getvalue()) < 5 * 1024 * 1024
    resp = client.post(
        f"/parcelas/{parcela_id}/foliar/upload",
        files={"archivo": ("bomba.xlsx", buf.getvalue(), "application/octet-stream")},
        headers=auth_headers,
    )
    assert resp.status_code == 422
    assert "demasiado grande" in resp.json()["detail"]


def test_un_archivo_que_no_es_excel_da_un_mensaje_claro(client, auth_headers, parcela_id):
    resp = client.post(
        f"/parcelas/{parcela_id}/foliar/upload",
        files={"archivo": ("foto.xlsx", b"esto no es un excel", "application/octet-stream")},
        headers=auth_headers,
    )
    assert resp.status_code == 422
    # Sin el texto interno de la libreria.
    assert "zip" not in resp.json()["detail"].lower()

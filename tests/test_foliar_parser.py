from datetime import date

import pytest

from app.services.foliar_parser import FormatoExcelInvalido, parsear_excel_foliar


def test_parsea_los_seis_grupos_del_ejemplo():
    resultados = parsear_excel_foliar("tests/fixtures/Libro1.xlsx")
    assert len(resultados) == 6
    grupos = sorted(r["grupo"] for r in resultados)
    assert grupos == [1, 2, 3, 4, 5, 7]


def test_primer_grupo_tiene_los_valores_esperados():
    resultados = parsear_excel_foliar("tests/fixtures/Libro1.xlsx")
    grupo_1 = next(r for r in resultados if r["grupo"] == 1)
    assert grupo_1["fecha"] == date(2026, 7, 28)
    assert grupo_1["n_mediciones"] == 61
    assert grupo_1["chl_medio"] is not None
    assert grupo_1["nbi_sd"] is not None


def test_archivo_con_formato_invalido_lanza_excepcion(tmp_path):
    import openpyxl

    ruta = tmp_path / "invalido.xlsx"
    wb = openpyxl.Workbook()
    wb.active.append(["columna_a", "columna_b"])
    wb.active.append([1, 2])
    wb.save(ruta)

    with pytest.raises(FormatoExcelInvalido):
        parsear_excel_foliar(str(ruta))

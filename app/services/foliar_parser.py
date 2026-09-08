from datetime import date, datetime
from typing import BinaryIO, Dict, List, Union

import openpyxl


class FormatoExcelInvalido(Exception):
    """El archivo subido no tiene el formato esperado del sensor foliar Dualex."""


def _num(valor):
    if valor is None:
        return None
    try:
        return float(valor)
    except (TypeError, ValueError):
        return None


def parsear_excel_foliar(archivo: Union[str, BinaryIO]) -> List[Dict]:
    """
    Parsea el .xlsx que exporta el medidor foliar Dualex Dx4.5.
    El archivo intercala, por cada "grupo" (punto/planta muestreada), un
    bloque de lecturas crudas seguido de un bloque-resumen de 2 filas:
    ("#Grupo", "Chl", "Chl_sd", "Flav", "Flav_sd", "NBI", "NBI_sd", ...)
    seguido de la fila de valores agregados de ese grupo. Solo se guarda
    el resumen: el propio dispositivo ya calcula media y desviación.
    """
    try:
        wb = openpyxl.load_workbook(archivo, data_only=True)
        filas = list(wb.worksheets[0].iter_rows(values_only=True))
    except Exception as exc:
        raise FormatoExcelInvalido(f"No se pudo abrir el archivo: {exc}") from exc

    fecha_archivo = None
    conteo_por_grupo: Dict[int, int] = {}
    for fila in filas:
        if isinstance(fila[0], datetime):
            if fecha_archivo is None:
                fecha_archivo = fila[0].date()
            grupo_crudo = fila[7] if len(fila) > 7 else None
            if isinstance(grupo_crudo, int):
                conteo_por_grupo[grupo_crudo] = conteo_por_grupo.get(grupo_crudo, 0) + 1

    resultados: List[Dict] = []
    for i, fila in enumerate(filas):
        if fila[0] == "#Grupo" and len(fila) > 1 and fila[1] == "Chl":
            if i + 1 >= len(filas):
                continue
            valores = filas[i + 1]
            grupo = valores[0]
            if not isinstance(grupo, int):
                continue
            resultados.append({
                "grupo": grupo,
                "chl_medio": _num(valores[1]),
                "chl_sd": _num(valores[2]),
                "flav_medio": _num(valores[3]),
                "flav_sd": _num(valores[4]),
                "nbi_medio": _num(valores[5]),
                "nbi_sd": _num(valores[6]),
                "n_mediciones": conteo_por_grupo.get(grupo, 0),
            })

    if fecha_archivo is None or not resultados:
        raise FormatoExcelInvalido(
            "No se encontraron bloques de resumen '#Grupo' con el formato esperado."
        )

    for r in resultados:
        r["fecha"] = fecha_archivo

    return resultados

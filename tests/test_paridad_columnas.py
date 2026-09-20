"""
Hallazgo 9 (review final, diferido #3 del ledger): red automática que fija la
paridad entre lo que produce el código de agregación y las columnas de los
modelos correspondientes. Sin esto, la comprobación se hacía a mano cada vez.

Usa una respuesta vacía a propósito: `_pedir_diario` siempre emite una clave
por cada entrada de `_MAPA_DAILY` (con valor `None` si la API no trae el
dato ese día), así que el conjunto de claves no depende de qué variables
responda la API en la llamada de prueba — solo del propio mapa. Eso es
justo lo que hace útil este test como red: si alguien añade una columna al
modelo sin tocar el mapa, o al revés, falla aquí sin necesidad de red.
"""
from unittest.mock import patch

from app.models import ClimaDiario
from app.services.weather import OpenMeteoProvider


class _RespVacia:
    status_code = 200

    def raise_for_status(self):
        pass

    def json(self):
        return {"daily": {"time": ["2026-08-15"]}}


def test_claves_de_pedir_diario_cubren_exactamente_las_columnas_de_clima_diario():
    with patch("app.services.weather.requests.get", return_value=_RespVacia()):
        filas = OpenMeteoProvider().fetch_diario(41.65, -4.72, past_days=1)

    claves = set(filas[0].keys())
    columnas = {c.name for c in ClimaDiario.__table__.columns} - {"id", "parcela_id"}
    faltan = columnas - claves
    sobran = claves - columnas
    assert not faltan, f"columnas de ClimaDiario que nadie rellena: {faltan}"
    assert not sobran, f"claves del mapa que no son columna de ClimaDiario: {sobran}"

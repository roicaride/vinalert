"""guardar_dias: la escritura de clima_diario que usa la consolidacion nocturna."""
from datetime import date

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



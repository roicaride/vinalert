from datetime import date

import pytest
from sqlalchemy.exc import IntegrityError

from app.models import ClimaDiario, SueloDiario


def test_clima_diario_se_guarda(db_session, parcela_id):
    fila = ClimaDiario(
        parcela_id=parcela_id,
        fecha=date(2026, 8, 17),
        temp_max=31.2, temp_min=14.8, temp_media=22.4,
        humedad_relativa_media=48.0, humedad_relativa_max=82.0, humedad_relativa_min=26.0,
        punto_rocio_medio=12.6,
        vpd_max=1.94,
        precipitacion_total_mm=0.0,
        et0_total_dia=6.18,
        radiacion_total_mj_m2=30.6,
        horas_sol=14.4,
        viento_vel_media=2.06, viento_racha_max=14.1,
        viento_dir_dominante=45.0,
        humectacion_foliar_pct=12.0,
        suelo_modelo_humedad=0.139,
        suelo_modelo_temp=26.1,
        fuente="pronostico",
        suelo_modelo_capa="3_to_9cm",
    )
    db_session.add(fila)
    db_session.commit()
    db_session.refresh(fila)
    assert fila.id is not None
    assert fila.fuente == "pronostico"


def test_clima_diario_no_admite_dos_filas_del_mismo_dia(db_session, parcela_id):
    db_session.add(ClimaDiario(parcela_id=parcela_id, fecha=date(2026, 8, 17), fuente="pronostico"))
    db_session.commit()
    db_session.add(ClimaDiario(parcela_id=parcela_id, fecha=date(2026, 8, 17), fuente="archivo"))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_suelo_diario_se_guarda(db_session, parcela_id):
    fila = SueloDiario(
        parcela_id=parcela_id,
        fecha=date(2026, 8, 17),
        humedad_media=32.0, humedad_sd=2.83, humedad_max=34.0, humedad_min=30.0,
        temperatura_media=19.0, temperatura_sd=1.41, temperatura_max=20.0, temperatura_min=18.0,
        n_sensores=2, n_lecturas=4,
    )
    db_session.add(fila)
    db_session.commit()
    db_session.refresh(fila)
    assert fila.id is not None
    assert fila.n_sensores == 2


def test_suelo_diario_no_admite_dos_filas_del_mismo_dia(db_session, parcela_id):
    db_session.add(SueloDiario(parcela_id=parcela_id, fecha=date(2026, 8, 17)))
    db_session.commit()
    db_session.add(SueloDiario(parcela_id=parcela_id, fecha=date(2026, 8, 17)))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()

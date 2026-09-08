from datetime import datetime

from app.models import LogClima

CAMPOS_NUEVOS = [
    "vpd_kpa", "punto_rocio_c", "radiacion_wm2", "nubosidad_pct",
    "viento_racha_ms", "viento_dir_deg", "duracion_sol_s",
    "suelo_temp_0cm", "suelo_temp_6cm", "suelo_temp_18cm",
    "suelo_hum_0_1cm", "suelo_hum_1_3cm", "suelo_hum_3_9cm", "suelo_hum_9_27cm",
]


def test_log_clima_tiene_los_campos_nuevos(db_session, parcela_id):
    valores = {campo: 1.5 for campo in CAMPOS_NUEVOS}
    log = LogClima(
        parcela_id=parcela_id,
        fecha_hora=datetime(2026, 8, 17, 12, 0),
        temp_c=24.3,
        **valores,
    )
    db_session.add(log)
    db_session.commit()
    db_session.refresh(log)
    for campo in CAMPOS_NUEVOS:
        assert getattr(log, campo) == 1.5, f"{campo} no se guardó"


def test_log_clima_conserva_los_campos_previos(db_session, parcela_id):
    log = LogClima(
        parcela_id=parcela_id,
        fecha_hora=datetime(2026, 8, 17, 12, 0),
        temp_c=24.3, humedad_relativa_pct=48.0, presion_hpa=939.4,
        viento_vel_ms=2.06, lluvia_mm=0.0, et0=0.31, uv_index=6.0,
        lluvia_prev_24h_mm=1.2, prob_lluvia_24h_pct=30.0,
        lluvia_prev_48h_mm=0.4, prob_lluvia_48h_pct=10.0,
    )
    db_session.add(log)
    db_session.commit()
    db_session.refresh(log)
    assert log.temp_c == 24.3
    assert log.prob_lluvia_48h_pct == 10.0

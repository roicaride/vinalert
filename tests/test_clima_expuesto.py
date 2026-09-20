"""
El clima que llega de Open-Meteo sale entero hacia la web: el panel de Estado
ensena la prevision de lluvia, y cada lectura del historico lleva todo el
clima de su momento para que la exportacion a Excel/CSV no pierda nada.
"""
from datetime import datetime, timedelta

from app.models import LogClima, LogSensor
from tests.ayudas import alta_sensor

CLIMA = dict(
    temp_c=25.3, humedad_relativa_pct=44.0, presion_hpa=1002.3, viento_vel_ms=4.33,
    lluvia_mm=0.0, et0=0.06, uv_index=1.2,
    lluvia_prev_24h_mm=3.4, prob_lluvia_24h_pct=70.0, lluvia_prev_48h_mm=0.2, prob_lluvia_48h_pct=15.0,
    vpd_kpa=1.8, punto_rocio_c=12.1, radiacion_wm2=227.0, nubosidad_pct=11.0,
    viento_racha_ms=9.6, viento_dir_deg=7.0, duracion_sol_s=900.0,
    suelo_temp_0cm=22.5, suelo_temp_6cm=24.1, suelo_temp_18cm=21.2,
    suelo_hum_0_1cm=0.199, suelo_hum_1_3cm=0.206, suelo_hum_3_9cm=0.22, suelo_hum_9_27cm=0.244,
)


def _sembrar_clima(db_session, parcela_id, momento):
    db_session.add(LogClima(parcela_id=parcela_id, fecha_hora=momento, **CLIMA))
    db_session.commit()


def test_el_panel_trae_la_prevision_de_lluvia_y_el_clima_completo(client, auth_headers, parcela_id, db_session):
    _sembrar_clima(db_session, parcela_id, datetime.now())

    clima = client.get(f"/parcelas/{parcela_id}/dashboard", headers=auth_headers).json()["clima_actual"]

    # Mañana y pasado mañana, cada uno con su cantidad y su probabilidad.
    assert clima["lluvia_prev_24h_mm"] == 3.4
    assert clima["prob_lluvia_24h_pct"] == 70.0
    assert clima["lluvia_prev_48h_mm"] == 0.2
    assert clima["prob_lluvia_48h_pct"] == 15.0
    # Lo que antes se guardaba pero no salia hacia la web.
    assert clima["presion_hpa"] == 1002.3
    assert clima["viento_vel_ms"] == 4.33
    assert clima["uv_index"] == 1.2


def test_cada_lectura_del_historico_lleva_todo_el_clima_de_su_momento(client, auth_headers, parcela_id, db_session):
    sensor = alta_sensor(client, auth_headers, parcela_id)
    momento = datetime(2026, 9, 17, 19, 0)
    _sembrar_clima(db_session, parcela_id, momento - timedelta(minutes=10))
    db_session.add(LogSensor(parcela_id=parcela_id, sensor_id=sensor["id"], fecha_hora=momento,
                             humedad_suelo_pct=2.4, temperatura_suelo=26.5))
    db_session.commit()

    [lectura] = client.get(f"/parcelas/{parcela_id}/historico", headers=auth_headers).json()

    assert lectura["uv_index"] == 1.2
    assert lectura["duracion_sol_s"] == 900.0
    assert lectura["suelo_temp_0cm"] == 22.5
    assert lectura["suelo_temp_6cm"] == 24.1
    assert lectura["suelo_temp_18cm"] == 21.2
    assert lectura["suelo_hum_0_1cm"] == 0.199
    assert lectura["suelo_hum_1_3cm"] == 0.206
    assert lectura["suelo_hum_3_9cm"] == 0.22
    assert lectura["suelo_hum_9_27cm"] == 0.244

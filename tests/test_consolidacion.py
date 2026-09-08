from datetime import date, datetime
from unittest.mock import patch

from app.models import ClimaDiario, LogSensor, Parcela, Sensor, SueloDiario
from tests.conftest import SesionSinCierre


def _preparar(db_session):
    parcela = Parcela(nombre="P1", latitud=41.65, longitud=-4.72)
    db_session.add(parcela)
    db_session.commit()
    db_session.refresh(parcela)

    s1 = Sensor(parcela_id=parcela.id, numero=1, etiqueta="Nodo 1", activo=True)
    s2 = Sensor(parcela_id=parcela.id, numero=2, etiqueta="Nodo 2", activo=True)
    db_session.add_all([s1, s2])
    db_session.commit()

    db_session.add_all([
        LogSensor(parcela_id=parcela.id, sensor_id=s1.id, fecha_hora=datetime(2026, 8, 17, 8, 0),
                  humedad_suelo_pct=30.0, temperatura_suelo=18.0),
        LogSensor(parcela_id=parcela.id, sensor_id=s2.id, fecha_hora=datetime(2026, 8, 17, 9, 0),
                  humedad_suelo_pct=34.0, temperatura_suelo=20.0),
    ])
    db_session.commit()
    return parcela


FILA_CLIMA = {
    "fecha": date(2026, 8, 17), "temp_max": 31.2, "temp_min": 14.8,
    "precipitacion_total_mm": 12.5, "fuente": "pronostico", "suelo_modelo_capa": "0_to_7cm",
}


def test_consolida_ambas_tablas(db_session, monkeypatch):
    from app.services import consolidacion

    parcela = _preparar(db_session)
    monkeypatch.setattr(consolidacion, "SessionLocal", lambda: SesionSinCierre(db_session))

    with patch("app.services.consolidacion.get_provider") as mock:
        mock.return_value.fetch_diario.return_value = [FILA_CLIMA]
        consolidacion.consolidar_datos_diarios(parcela.id, date(2026, 8, 17))

    clima = db_session.query(ClimaDiario).filter_by(parcela_id=parcela.id).first()
    assert clima is not None
    assert clima.temp_max == 31.2

    suelo = db_session.query(SueloDiario).filter_by(parcela_id=parcela.id).first()
    assert suelo is not None
    assert suelo.humedad_media == 32.0
    assert suelo.humedad_max == 34.0
    assert suelo.humedad_min == 30.0
    assert suelo.n_sensores == 2


def test_fallo_del_clima_no_impide_consolidar_el_suelo(db_session, monkeypatch):
    from app.services import consolidacion

    parcela = _preparar(db_session)
    monkeypatch.setattr(consolidacion, "SessionLocal", lambda: SesionSinCierre(db_session))

    with patch("app.services.consolidacion.get_provider") as mock:
        mock.return_value.fetch_diario.side_effect = RuntimeError("proveedor caido")
        consolidacion.consolidar_datos_diarios(parcela.id, date(2026, 8, 17))

    assert db_session.query(ClimaDiario).count() == 0
    suelo = db_session.query(SueloDiario).filter_by(parcela_id=parcela.id).first()
    assert suelo is not None, "el suelo debe consolidarse aunque falle el clima"
    assert suelo.n_sensores == 2


def test_fallo_del_suelo_no_impide_consolidar_el_clima(db_session, monkeypatch):
    from app.services import consolidacion

    parcela = _preparar(db_session)
    monkeypatch.setattr(consolidacion, "SessionLocal", lambda: SesionSinCierre(db_session))

    with patch("app.services.consolidacion.get_provider") as mock, \
         patch("app.services.consolidacion.calcular_resumen", side_effect=RuntimeError("fallo agregando")):
        mock.return_value.fetch_diario.return_value = [FILA_CLIMA]
        consolidacion.consolidar_datos_diarios(parcela.id, date(2026, 8, 17))

    assert db_session.query(SueloDiario).count() == 0
    assert db_session.query(ClimaDiario).filter_by(parcela_id=parcela.id).first() is not None


def test_consolidar_suelo_ignora_sensores_inactivos(db_session, monkeypatch):
    """
    _consolidar_suelo filtra por Sensor.activo.is_(True). La lectura del sensor
    inactivo lleva un valor deliberadamente extremo (99.0, muy por encima de las
    lecturas activas 30.0/34.0): si el filtro se rompiera, humedad_media y
    humedad_max cambiarían de forma visible, y n_sensores pasaría de 2 a 3.
    """
    from app.services import consolidacion

    parcela = _preparar(db_session)

    inactivo = Sensor(parcela_id=parcela.id, numero=3, etiqueta="Nodo dado de baja", activo=False)
    db_session.add(inactivo)
    db_session.commit()

    db_session.add(
        LogSensor(parcela_id=parcela.id, sensor_id=inactivo.id, fecha_hora=datetime(2026, 8, 17, 10, 0),
                  humedad_suelo_pct=99.0, temperatura_suelo=99.0),
    )
    db_session.commit()

    monkeypatch.setattr(consolidacion, "SessionLocal", lambda: SesionSinCierre(db_session))
    with patch("app.services.consolidacion.get_provider") as mock:
        mock.return_value.fetch_diario.return_value = [FILA_CLIMA]
        consolidacion.consolidar_datos_diarios(parcela.id, date(2026, 8, 17))

    suelo = db_session.query(SueloDiario).filter_by(parcela_id=parcela.id).first()
    assert suelo is not None
    assert suelo.n_sensores == 2, "el sensor inactivo no debe contarse"
    assert suelo.humedad_media == 32.0, "la media no debe arrastrar la lectura del sensor inactivo"
    assert suelo.humedad_max == 34.0, "el máximo no debe ser el 99.0 del sensor inactivo"


def test_ventana_dia_civil_dia_normal_dura_24h():
    """Un día normal (sin cambio de hora) cubre exactamente 24h en UTC, pero
    desplazadas por el offset local: en verano español (UTC+2) el día civil
    17/8 empieza a las 22:00 UTC del 16/8 y termina a las 22:00 UTC del 17/8."""
    from datetime import datetime, timedelta

    from app.services.consolidacion import _ventana_dia_civil

    inicio_utc, fin_utc = _ventana_dia_civil(date(2026, 8, 17))

    assert inicio_utc == datetime(2026, 8, 16, 22, 0)
    assert fin_utc == datetime(2026, 8, 17, 22, 0)
    assert fin_utc - inicio_utc == timedelta(hours=24)


def test_ventana_dia_civil_cambio_de_hora_marzo_dura_23h():
    """Último domingo de marzo (2026-03-29): España pasa de UTC+1 a UTC+2 a
    las 02:00 local, así que ese día civil dura solo 23h reales."""
    from datetime import datetime, timedelta

    from app.services.consolidacion import _ventana_dia_civil

    inicio_utc, fin_utc = _ventana_dia_civil(date(2026, 3, 29))

    assert inicio_utc == datetime(2026, 3, 28, 23, 0)
    assert fin_utc == datetime(2026, 3, 29, 22, 0)
    assert fin_utc - inicio_utc == timedelta(hours=23)


def test_ventana_dia_civil_cambio_de_hora_octubre_dura_25h():
    """Último domingo de octubre (2026-10-25): España pasa de UTC+2 a UTC+1 a
    las 03:00 local, así que ese día civil dura 25h reales."""
    from datetime import datetime, timedelta

    from app.services.consolidacion import _ventana_dia_civil

    inicio_utc, fin_utc = _ventana_dia_civil(date(2026, 10, 25))

    assert inicio_utc == datetime(2026, 10, 24, 22, 0)
    assert fin_utc == datetime(2026, 10, 25, 23, 0)
    assert fin_utc - inicio_utc == timedelta(hours=25)


def test_consolidar_suelo_alinea_con_el_dia_civil_espanol(db_session, monkeypatch):
    """
    No-regresión del desfase clima_diario/suelo_diario: antes la ventana de
    suelo_diario era el día civil UTC (00:00->23:59:59 UTC), no el día civil
    español. Una lectura a las 23:30 UTC del día anterior cae, en verano
    español (UTC+2), dentro del día local siguiente (01:30 local) — debe
    contarse en el `fecha` de ese día siguiente, no en el del día anterior.
    Simétricamente, una lectura justo en el instante de cierre de la ventana
    (fin_utc exacto) pertenece ya al día siguiente y debe excluirse (ventana
    semiabierta).
    """
    from app.services import consolidacion

    parcela = Parcela(nombre="P1", latitud=41.65, longitud=-4.72)
    db_session.add(parcela)
    db_session.commit()
    db_session.refresh(parcela)

    sensor = Sensor(parcela_id=parcela.id, numero=1, etiqueta="Nodo 1", activo=True)
    db_session.add(sensor)
    db_session.commit()

    db_session.add_all([
        # Fuera de la ventana: antes de las 22:00 UTC del día anterior.
        LogSensor(parcela_id=parcela.id, sensor_id=sensor.id,
                  fecha_hora=datetime(2026, 8, 16, 21, 59), humedad_suelo_pct=999.0),
        # Dentro: justo tras el inicio de la ventana (22:00 UTC del día anterior).
        LogSensor(parcela_id=parcela.id, sensor_id=sensor.id,
                  fecha_hora=datetime(2026, 8, 16, 23, 30), humedad_suelo_pct=10.0),
        # Dentro: mediodía del propio día.
        LogSensor(parcela_id=parcela.id, sensor_id=sensor.id,
                  fecha_hora=datetime(2026, 8, 17, 12, 0), humedad_suelo_pct=20.0),
        # Fuera: instante exacto de cierre de la ventana (ya es el día siguiente).
        LogSensor(parcela_id=parcela.id, sensor_id=sensor.id,
                  fecha_hora=datetime(2026, 8, 17, 22, 0), humedad_suelo_pct=888.0),
    ])
    db_session.commit()

    monkeypatch.setattr(consolidacion, "SessionLocal", lambda: SesionSinCierre(db_session))
    with patch("app.services.consolidacion.get_provider") as mock:
        mock.return_value.fetch_diario.return_value = [FILA_CLIMA]
        consolidacion.consolidar_datos_diarios(parcela.id, date(2026, 8, 17))

    suelo = db_session.query(SueloDiario).filter_by(parcela_id=parcela.id, fecha=date(2026, 8, 17)).first()
    assert suelo is not None
    assert suelo.n_lecturas == 2, "solo las dos lecturas dentro de la ventana del día civil español"
    assert suelo.humedad_media == 15.0
    assert suelo.humedad_max == 20.0
    assert suelo.humedad_min == 10.0


def test_la_precipitacion_viene_de_la_api_no_de_sumar_log_clima(db_session, monkeypatch):
    """No-regresión del bug: sumar lluvia_mm de muestras cada 3h infravalora el día."""
    from app.services import consolidacion
    from app.models import LogClima

    parcela = _preparar(db_session)
    db_session.add_all([
        LogClima(parcela_id=parcela.id, fecha_hora=datetime(2026, 8, 17, h, 0), lluvia_mm=1.0)
        for h in (0, 3, 6, 9)
    ])
    db_session.commit()

    monkeypatch.setattr(consolidacion, "SessionLocal", lambda: SesionSinCierre(db_session))
    with patch("app.services.consolidacion.get_provider") as mock:
        mock.return_value.fetch_diario.return_value = [FILA_CLIMA]  # 12.5 mm
        consolidacion.consolidar_datos_diarios(parcela.id, date(2026, 8, 17))

    clima = db_session.query(ClimaDiario).filter_by(parcela_id=parcela.id).first()
    assert clima.precipitacion_total_mm == 12.5, "debe ganar el agregado diario de la API, no la suma (4.0) de log_clima"

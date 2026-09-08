from datetime import date, datetime, timedelta
from unittest.mock import patch

from apscheduler.schedulers.background import BackgroundScheduler

from app.models import ClimaDiario, LogSensor, Parcela, Sensor, SueloDiario
from tests.conftest import SesionSinCierre


def _parcela(db_session, nombre, con_coordenadas=True):
    p = Parcela(
        nombre=nombre,
        latitud=42.3 if con_coordenadas else None,
        longitud=-8.6 if con_coordenadas else None,
    )
    db_session.add(p)
    db_session.commit()
    db_session.refresh(p)
    return p


def _lectura_de_hace(db_session, parcela, dias, humedad):
    """Siembra una lectura de sensor a mediodía UTC de hace `dias` días."""
    sensor = Sensor(parcela_id=parcela.id, numero=1, etiqueta=f"Nodo {parcela.id}", activo=True)
    db_session.add(sensor)
    db_session.commit()
    momento = datetime.combine(date.today() - timedelta(days=dias), datetime.min.time()).replace(hour=12)
    db_session.add(LogSensor(
        parcela_id=parcela.id, sensor_id=sensor.id, fecha_hora=momento,
        humedad_suelo_pct=humedad, temperatura_suelo=18.0,
    ))
    db_session.commit()
    return sensor


def _filas_ventana(dias=8):
    """Lo que devuelve fetch_diario: los `dias` días que la API ya manda en una sola respuesta."""
    hoy = date.today()
    return [
        {
            "fecha": hoy - timedelta(days=n),
            "temp_max": 30.0 + n,
            "temp_min": 15.0,
            "fuente": "pronostico",
            "suelo_modelo_capa": "0_to_7cm",
        }
        for n in range(dias - 1, -1, -1)
    ]


def test_consolida_todas_las_parcelas(db_session, monkeypatch):
    from app.services import consolidacion

    p1 = _parcela(db_session, "P1")
    p2 = _parcela(db_session, "P2")
    _lectura_de_hace(db_session, p1, dias=1, humedad=30.0)
    _lectura_de_hace(db_session, p2, dias=1, humedad=40.0)
    monkeypatch.setattr(consolidacion, "SessionLocal", lambda: SesionSinCierre(db_session))

    with patch("app.services.consolidacion.get_provider") as mock:
        mock.return_value.fetch_diario.return_value = _filas_ventana()
        consolidacion.consolidar_todas_parcelas()

    for p, humedad in ((p1, 30.0), (p2, 40.0)):
        assert db_session.query(ClimaDiario).filter_by(parcela_id=p.id).count() > 0
        suelo = db_session.query(SueloDiario).filter_by(
            parcela_id=p.id, fecha=date.today() - timedelta(days=1)).first()
        assert suelo is not None, f"parcela {p.nombre} sin suelo consolidado"
        assert suelo.humedad_media == humedad


def test_una_parcela_que_falla_no_impide_las_demas(db_session, monkeypatch):
    from app.services import consolidacion

    p1 = _parcela(db_session, "La que revienta")
    p2 = _parcela(db_session, "La que debe salir bien")
    monkeypatch.setattr(consolidacion, "SessionLocal", lambda: SesionSinCierre(db_session))

    def fetch_segun_parcela(lat, lon, past_days=7):
        raise RuntimeError("la API falla para esta parcela")

    with patch("app.services.consolidacion.get_provider") as mock:
        mock.return_value.fetch_diario.side_effect = [
            RuntimeError("la API falla para la primera"),
            _filas_ventana(),
        ]
        consolidacion.consolidar_todas_parcelas()

    assert db_session.query(ClimaDiario).filter_by(parcela_id=p1.id).count() == 0
    assert db_session.query(ClimaDiario).filter_by(parcela_id=p2.id).count() > 0


def test_la_ventana_guarda_todos_los_dias_con_una_sola_llamada(db_session, monkeypatch):
    """
    El motivo de ser de la ventana: fetch_diario ya devuelve 8 días en UNA
    respuesta. Guardarlos todos no cuesta ni una llamada extra a la API.
    """
    from app.services import consolidacion

    p = _parcela(db_session, "P1")
    monkeypatch.setattr(consolidacion, "SessionLocal", lambda: SesionSinCierre(db_session))

    with patch("app.services.consolidacion.get_provider") as mock:
        mock.return_value.fetch_diario.return_value = _filas_ventana(dias=8)
        consolidacion.consolidar_todas_parcelas()
        assert mock.return_value.fetch_diario.call_count == 1, "una sola llamada por parcela"

    assert db_session.query(ClimaDiario).filter_by(parcela_id=p.id).count() == 8


def test_ejecutar_dos_veces_no_duplica_ni_cambia_valores(db_session, monkeypatch):
    """La idempotencia es lo que sostiene la ventana: sin ella, rehacer días ensucia."""
    from app.services import consolidacion

    p = _parcela(db_session, "P1")
    _lectura_de_hace(db_session, p, dias=2, humedad=33.0)
    monkeypatch.setattr(consolidacion, "SessionLocal", lambda: SesionSinCierre(db_session))

    with patch("app.services.consolidacion.get_provider") as mock:
        mock.return_value.fetch_diario.return_value = _filas_ventana()
        consolidacion.consolidar_todas_parcelas()
        consolidacion.consolidar_todas_parcelas()

    assert db_session.query(ClimaDiario).filter_by(parcela_id=p.id).count() == 8
    suelos = db_session.query(SueloDiario).filter_by(parcela_id=p.id).all()
    assert len(suelos) == 1
    assert suelos[0].humedad_media == 33.0


def test_no_escribe_filas_de_suelo_para_dias_sin_lecturas(db_session, monkeypatch):
    """
    Sin esto, la ventana crearía cada noche 8 filas fantasma por parcela sin
    sensores, indistinguibles a simple vista de días realmente medidos.
    """
    from app.services import consolidacion

    p = _parcela(db_session, "Parcela sin sensores")
    monkeypatch.setattr(consolidacion, "SessionLocal", lambda: SesionSinCierre(db_session))

    with patch("app.services.consolidacion.get_provider") as mock:
        mock.return_value.fetch_diario.return_value = _filas_ventana()
        consolidacion.consolidar_todas_parcelas()

    assert db_session.query(SueloDiario).filter_by(parcela_id=p.id).count() == 0


def test_parcela_sin_coordenadas_consolida_suelo_igualmente(db_session, monkeypatch):
    """Las dos tablas son independientes: que no haya clima no debe costar el suelo."""
    from app.services import consolidacion

    p = _parcela(db_session, "Sin coordenadas", con_coordenadas=False)
    _lectura_de_hace(db_session, p, dias=1, humedad=25.0)
    monkeypatch.setattr(consolidacion, "SessionLocal", lambda: SesionSinCierre(db_session))

    with patch("app.services.consolidacion.get_provider") as mock:
        consolidacion.consolidar_todas_parcelas()
        assert mock.return_value.fetch_diario.call_count == 0, "sin coordenadas no se llama a la API"

    assert db_session.query(ClimaDiario).filter_by(parcela_id=p.id).count() == 0
    suelo = db_session.query(SueloDiario).filter_by(parcela_id=p.id).first()
    assert suelo is not None
    assert suelo.humedad_media == 25.0


def test_el_job_de_consolidacion_queda_programado():
    """Si el job no se registra al arrancar, las tablas diarias no se llenan nunca."""
    from app.main import _programar_jobs

    scheduler = BackgroundScheduler()
    _programar_jobs(scheduler)

    job = scheduler.get_job("consolidar_diario")
    assert job is not None, "el job de consolidacion diaria no esta registrado"
    assert str(job.trigger.timezone) == "Europe/Madrid"

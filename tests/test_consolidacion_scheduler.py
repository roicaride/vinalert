from datetime import date, timedelta
from unittest.mock import patch

from apscheduler.schedulers.background import BackgroundScheduler

from app.models import ClimaDiario, Parcela
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


def test_consolida_el_clima_de_todas_las_parcelas(db_session, monkeypatch):
    from app.services import consolidacion

    p1 = _parcela(db_session, "P1")
    p2 = _parcela(db_session, "P2")
    monkeypatch.setattr(consolidacion, "SessionLocal", lambda: SesionSinCierre(db_session))

    with patch("app.services.consolidacion.get_provider") as mock:
        mock.return_value.fetch_diario.return_value = _filas_ventana()
        consolidacion.consolidar_todas_parcelas()

    for p in (p1, p2):
        assert db_session.query(ClimaDiario).filter_by(parcela_id=p.id).count() == 8


def test_una_parcela_que_falla_no_impide_las_demas(db_session, monkeypatch):
    from app.services import consolidacion

    p1 = _parcela(db_session, "La que revienta")
    p2 = _parcela(db_session, "La que debe salir bien")
    monkeypatch.setattr(consolidacion, "SessionLocal", lambda: SesionSinCierre(db_session))

    with patch("app.services.consolidacion.get_provider") as mock:
        mock.return_value.fetch_diario.side_effect = [
            RuntimeError("la API falla para la primera"),
            _filas_ventana(),
        ]
        consolidacion.consolidar_todas_parcelas()

    assert db_session.query(ClimaDiario).filter_by(parcela_id=p1.id).count() == 0
    assert db_session.query(ClimaDiario).filter_by(parcela_id=p2.id).count() > 0


def test_la_ventana_guarda_todos_los_dias_con_una_sola_llamada(db_session, monkeypatch):
    """fetch_diario ya devuelve 8 días en UNA respuesta: guardarlos todos no cuesta otra llamada."""
    from app.services import consolidacion

    p = _parcela(db_session, "P1")
    monkeypatch.setattr(consolidacion, "SessionLocal", lambda: SesionSinCierre(db_session))

    with patch("app.services.consolidacion.get_provider") as mock:
        mock.return_value.fetch_diario.return_value = _filas_ventana(dias=8)
        consolidacion.consolidar_todas_parcelas()
        assert mock.return_value.fetch_diario.call_count == 1, "una sola llamada por parcela"
        assert mock.return_value.fetch_diario.call_args.kwargs["past_days"] == 7

    assert db_session.query(ClimaDiario).filter_by(parcela_id=p.id).count() == 8


def test_una_ventana_mayor_pide_esos_dias_con_el_tope_de_la_api(db_session, monkeypatch):
    """`python worker.py 30` pide 30 dias; Open-Meteo no da mas de 92 hacia atras."""
    from app.services import consolidacion

    _parcela(db_session, "P1")
    monkeypatch.setattr(consolidacion, "SessionLocal", lambda: SesionSinCierre(db_session))

    with patch("app.services.consolidacion.get_provider") as mock:
        mock.return_value.fetch_diario.return_value = []
        consolidacion.consolidar_todas_parcelas(30)
        assert mock.return_value.fetch_diario.call_args.kwargs["past_days"] == 30
        consolidacion.consolidar_todas_parcelas(365)
        assert mock.return_value.fetch_diario.call_args.kwargs["past_days"] == 92


def test_ejecutar_dos_veces_no_duplica(db_session, monkeypatch):
    """La idempotencia es lo que sostiene la ventana: sin ella, rehacer días ensucia."""
    from app.services import consolidacion

    p = _parcela(db_session, "P1")
    monkeypatch.setattr(consolidacion, "SessionLocal", lambda: SesionSinCierre(db_session))

    with patch("app.services.consolidacion.get_provider") as mock:
        mock.return_value.fetch_diario.return_value = _filas_ventana()
        consolidacion.consolidar_todas_parcelas()
        consolidacion.consolidar_todas_parcelas()

    assert db_session.query(ClimaDiario).filter_by(parcela_id=p.id).count() == 8


def test_parcela_sin_coordenadas_no_llama_a_la_api(db_session, monkeypatch):
    from app.services import consolidacion

    p = _parcela(db_session, "Sin coordenadas", con_coordenadas=False)
    monkeypatch.setattr(consolidacion, "SessionLocal", lambda: SesionSinCierre(db_session))

    with patch("app.services.consolidacion.get_provider") as mock:
        consolidacion.consolidar_todas_parcelas()
        assert mock.return_value.fetch_diario.call_count == 0

    assert db_session.query(ClimaDiario).filter_by(parcela_id=p.id).count() == 0


def test_el_job_de_consolidacion_queda_programado():
    """Si el job no se registra al arrancar, clima_diario no se llena nunca."""
    from app.main import _programar_jobs

    scheduler = BackgroundScheduler()
    _programar_jobs(scheduler)

    job = scheduler.get_job("consolidar_diario")
    assert job is not None, "el job de consolidacion diaria no esta registrado"


def test_la_consolidacion_corre_al_arrancar_y_cada_hora():
    """
    Solo a las 02:00 no basta: la API corre en un ordenador que a esa hora
    puede estar apagado, y APScheduler guarda los jobs en memoria. Paso de
    verdad: del 20-08 al 18-09-2026 no se consolido ni un dia.
    """
    from app.main import _programar_jobs

    scheduler = BackgroundScheduler()
    _programar_jobs(scheduler)

    job = scheduler.get_job("consolidar_diario")
    assert getattr(job, "next_run_time", None) is not None, "no se ejecuta al arrancar"
    assert job.trigger.interval == timedelta(hours=1)

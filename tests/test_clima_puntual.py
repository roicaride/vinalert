from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from app.models import LogClima, Parcela
from app.services.clima_puntual import clima_en_momento


def _parcela(db_session, lat=41.65, lon=-4.72):
    parcela = Parcela(nombre="P1", latitud=lat, longitud=lon)
    db_session.add(parcela)
    db_session.commit()
    db_session.refresh(parcela)
    return parcela


class _Resp:
    status_code = 200

    def __init__(self, data):
        self._data = data

    def raise_for_status(self):
        pass

    def json(self):
        return self._data


def _resp_horaria(hora_txt, temp, viento):
    return _Resp({"hourly": {"time": [hora_txt], "temperature_2m": [temp], "wind_speed_10m": [viento]}})


def test_usa_el_log_clima_mas_cercano_no_el_mas_reciente(db_session):
    """
    La trampa: hay una lectura MÁS RECIENTE en el tiempo (18/8) con valores muy
    distintos (99.0) que la lectura que realmente corresponde a `momento`
    (13/8, 15:20). Si el código volviera al comportamiento viejo de coger
    "la última lectura", este test falla de forma visible con 99.0.
    """
    parcela = _parcela(db_session)
    momento = datetime(2026, 8, 13, 15, 0)

    db_session.add(LogClima(
        parcela_id=parcela.id, fecha_hora=datetime(2026, 8, 18, 9, 0),
        temp_c=99.0, viento_vel_ms=99.0,
    ))
    db_session.add(LogClima(
        parcela_id=parcela.id, fecha_hora=datetime(2026, 8, 13, 15, 20),
        temp_c=21.5, viento_vel_ms=2.4,
    ))
    db_session.commit()

    temp, viento, fecha_usada, fuente = clima_en_momento(parcela, momento, db_session)

    assert temp == 21.5
    assert viento == 2.4
    assert fecha_usada == datetime(2026, 8, 13, 15, 20)
    assert fuente == "log_clima"


def test_log_clima_a_mas_de_90_min_no_se_usa(db_session):
    """Una lectura a 91 minutos de `momento` está fuera de la ventana de
    tolerancia (mitad del intervalo del scheduler, 3h) y debe descartarse,
    cayendo a la API."""
    parcela = _parcela(db_session)
    momento = datetime(2026, 8, 13, 15, 0)

    db_session.add(LogClima(
        parcela_id=parcela.id, fecha_hora=momento + timedelta(minutes=91),
        temp_c=50.0, viento_vel_ms=50.0,
    ))
    db_session.commit()

    with patch(
        "app.services.clima_puntual.requests.get",
        return_value=_resp_horaria("2026-08-13T15:00", 19.0, 3.3),
    ):
        temp, viento, fecha_usada, fuente = clima_en_momento(parcela, momento, db_session)

    assert temp == 19.0
    assert viento == 3.3
    assert fuente != "log_clima"


def test_alta_retroactiva_sin_log_clima_cercano_resuelve_por_api(db_session):
    parcela = _parcela(db_session)
    momento = datetime(2025, 6, 1, 10, 0)  # antiguo -> archivo

    with patch(
        "app.services.clima_puntual.requests.get",
        return_value=_resp_horaria("2025-06-01T10:00", 18.2, 1.1),
    ) as mock_get:
        temp, viento, fecha_usada, fuente = clima_en_momento(parcela, momento, db_session)

    assert temp == 18.2
    assert viento == 1.1
    assert fuente == "archivo"
    assert "archive" in mock_get.call_args.args[0]


def test_seleccion_de_endpoint_reciente_va_a_pronostico(db_session):
    parcela = _parcela(db_session)
    ahora = datetime.now(timezone.utc).replace(tzinfo=None)
    reciente = ahora - timedelta(days=1)
    hora_objetivo = reciente.replace(minute=0, second=0, microsecond=0)
    hora_txt = hora_objetivo.strftime("%Y-%m-%dT%H:%M")

    with patch(
        "app.services.clima_puntual.requests.get",
        return_value=_resp_horaria(hora_txt, 20.0, 2.0),
    ) as mock_get:
        temp, viento, fecha_usada, fuente = clima_en_momento(parcela, reciente, db_session)

    assert fuente == "pronostico"
    assert temp == 20.0
    assert "archive" not in mock_get.call_args.args[0]


def test_seleccion_de_endpoint_antiguo_va_a_archivo(db_session):
    parcela = _parcela(db_session)
    momento = datetime(2020, 1, 1, 10, 0)

    with patch(
        "app.services.clima_puntual.requests.get",
        return_value=_resp_horaria("2020-01-01T10:00", 5.0, 4.0),
    ) as mock_get:
        temp, viento, fecha_usada, fuente = clima_en_momento(parcela, momento, db_session)

    assert fuente == "archivo"
    assert temp == 5.0
    assert "archive" in mock_get.call_args.args[0]


def test_fallo_de_la_api_degrada_a_no_disponible(db_session):
    parcela = _parcela(db_session)
    momento = datetime(2025, 6, 1, 10, 0)

    with patch(
        "app.services.clima_puntual.requests.get",
        side_effect=RuntimeError("proveedor caido"),
    ):
        temp, viento, fecha_usada, fuente = clima_en_momento(parcela, momento, db_session)

    assert temp is None
    assert viento is None
    assert fecha_usada is None
    assert fuente == "no_disponible"


def test_sin_coordenadas_y_sin_log_clima_da_no_disponible(db_session):
    parcela = Parcela(nombre="Sin coords")
    db_session.add(parcela)
    db_session.commit()
    db_session.refresh(parcela)

    temp, viento, fecha_usada, fuente = clima_en_momento(parcela, datetime(2026, 1, 1), db_session)

    assert (temp, viento, fecha_usada, fuente) == (None, None, None, "no_disponible")

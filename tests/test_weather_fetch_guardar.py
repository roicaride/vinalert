from unittest.mock import patch

from app.models import LogClima, Parcela
from app.services.weather import fetch_y_guardar_clima


def test_fetch_y_guardar_clima_sin_coordenadas(db_session):
    parcela = Parcela(nombre="Sin coords")
    db_session.add(parcela)
    db_session.commit()
    db_session.refresh(parcela)

    aviso = fetch_y_guardar_clima(parcela, db_session)
    assert aviso == "La parcela no tiene coordenadas."


def test_fetch_y_guardar_clima_ok(db_session):
    parcela = Parcela(nombre="Con coords", latitud=41.0, longitud=-3.0)
    db_session.add(parcela)
    db_session.commit()
    db_session.refresh(parcela)

    datos_falsos = {
        "temp_c": 22.0, "humedad_relativa_pct": 55.0, "presion_hpa": 1013.0,
        "viento_vel_ms": 2.1, "lluvia_mm": 0.0, "uv_index": 4.0, "et0": 3.2,
        "lluvia_prev_24h_mm": 0.0, "prob_lluvia_24h_pct": 10.0,
        "lluvia_prev_48h_mm": 0.0, "prob_lluvia_48h_pct": 5.0,
    }
    with patch("app.services.weather.get_provider") as mock_provider:
        mock_provider.return_value.fetch.return_value = datos_falsos
        aviso = fetch_y_guardar_clima(parcela, db_session)

    assert aviso is None
    log = db_session.query(LogClima).filter(LogClima.parcela_id == parcela.id).first()
    assert log is not None
    assert log.temp_c == 22.0

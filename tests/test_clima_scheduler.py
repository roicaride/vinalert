from datetime import datetime
from unittest.mock import patch

from app.database import Base
from app.models import LogClima, Parcela
from app.services.clima_scheduler import refrescar_clima_todas_parcelas
from tests.conftest import SesionSinCierre


def test_refresca_solo_parcelas_con_coordenadas(db_session, monkeypatch):
    con_coords = Parcela(nombre="Con coords", latitud=41.0, longitud=-3.0)
    sin_coords = Parcela(nombre="Sin coords")
    db_session.add_all([con_coords, sin_coords])
    db_session.commit()

    # El scheduler abre su propia sesión (SessionLocal) — para el test,
    # apuntamos SessionLocal al mismo engine en memoria que usa db_session.
    import app.services.clima_scheduler as mod
    monkeypatch.setattr(mod, "SessionLocal", lambda: SesionSinCierre(db_session))

    datos_falsos = {
        "temp_c": 20.0, "humedad_relativa_pct": 50.0, "presion_hpa": None,
        "viento_vel_ms": None, "lluvia_mm": None, "uv_index": None, "et0": None,
        "lluvia_prev_24h_mm": None, "prob_lluvia_24h_pct": None,
        "lluvia_prev_48h_mm": None, "prob_lluvia_48h_pct": None,
    }
    with patch("app.services.weather.get_provider") as mock_provider:
        mock_provider.return_value.fetch.return_value = datos_falsos
        refrescar_clima_todas_parcelas()

    logs = db_session.query(LogClima).all()
    assert len(logs) == 1
    assert logs[0].parcela_id == con_coords.id


def test_fallo_en_una_parcela_no_bloquea_las_demas(db_session, monkeypatch):
    """
    Si fetch_y_guardar_clima lanza una excepción inesperada (p. ej. un fallo de
    BD) para una parcela, el resto de parcelas del mismo run deben seguir
    procesándose en vez de abortar todo el job por una sesión compartida rota.
    """
    rota = Parcela(nombre="Rota", latitud=41.0, longitud=-3.0)
    ok = Parcela(nombre="OK", latitud=42.0, longitud=-4.0)
    db_session.add_all([rota, ok])
    db_session.commit()

    import app.services.clima_scheduler as mod
    monkeypatch.setattr(mod, "SessionLocal", lambda: SesionSinCierre(db_session))

    def _fake_fetch(parcela, db):
        if parcela.id == rota.id:
            raise RuntimeError("fallo simulado de BD")
        db.add(LogClima(parcela_id=parcela.id, fecha_hora=datetime(2026, 8, 17, 10, 0)))
        db.commit()
        return None

    monkeypatch.setattr(mod, "fetch_y_guardar_clima", _fake_fetch)

    # No debe propagar la excepción de la parcela rota.
    refrescar_clima_todas_parcelas()

    logs = db_session.query(LogClima).all()
    assert len(logs) == 1
    assert logs[0].parcela_id == ok.id

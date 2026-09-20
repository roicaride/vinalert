"""
La lluvia hora a hora: las 48 horas pasadas y las 48 siguientes, pedidas a
Open-Meteo en una sola consulta y sin guardarlas.

Sustituye a la lluvia "de cada lectura" en la vista de 48 horas, que en
realidad era la de los 15 minutos anteriores a la ultima consulta del clima
repetida en todas las lecturas cercanas —y que las cifras del periodo
sumaban como si fueran lluvias distintas.
"""
from datetime import datetime, timedelta
from unittest.mock import patch

from app.services.weather import OpenMeteoProvider

HORARIO = {
    "hourly": {
        "time": ["2026-09-18T10:00", "2026-09-18T11:00"],
        "precipitation": [0.4, 1.1],
        "precipitation_probability": [60, 85],
        "et0_fao_evapotranspiration": [0.21, 0.30],
        "temperature_2m": [18.2, 19.0],
    }
}


class _Resp:
    status_code = 200

    def raise_for_status(self):
        pass

    def json(self):
        return HORARIO


def test_fetch_horario_pide_48_horas_atras_y_48_adelante_en_una_consulta():
    with patch("app.services.weather.requests.get", return_value=_Resp()) as get:
        filas = OpenMeteoProvider().fetch_horario(42.3, -8.6, horas_atras=48, horas_adelante=48)

    params = get.call_args.kwargs["params"]
    assert params["past_hours"] == 48
    assert params["forecast_hours"] == 48
    assert "precipitation" in params["hourly"]
    assert get.call_count == 1

    assert filas[0] == {
        "fecha_hora": datetime(2026, 9, 18, 10, 0),
        "lluvia_mm": 0.4,
        "prob_lluvia_pct": 60.0,
        "et0_mm": 0.21,
        "temp_c": 18.2,
    }
    assert filas[1]["lluvia_mm"] == 1.1


def test_el_endpoint_marca_que_horas_son_prevision(client, auth_headers, parcela_id):
    ahora = datetime.now().replace(minute=0, second=0, microsecond=0)
    filas = [
        {"fecha_hora": ahora - timedelta(hours=5), "lluvia_mm": 0.4, "prob_lluvia_pct": None, "et0_mm": 0.2, "temp_c": 18.0},
        {"fecha_hora": ahora + timedelta(hours=5), "lluvia_mm": 2.0, "prob_lluvia_pct": 80.0, "et0_mm": 0.1, "temp_c": 16.0},
    ]
    with patch("app.routers.clima_fetch.get_provider") as mock:
        mock.return_value.fetch_horario.return_value = filas
        resp = client.get(f"/parcelas/{parcela_id}/clima/horario", headers=auth_headers)

    assert resp.status_code == 200
    horas = resp.json()
    assert [h["prevision"] for h in horas] == [False, True]
    assert horas[1]["lluvia_mm"] == 2.0
    assert horas[1]["prob_lluvia_pct"] == 80.0


def test_sin_coordenadas_el_horario_da_422(client, auth_headers):
    sin = client.post("/parcelas/", json={"nombre": "Sin coords"}, headers=auth_headers).json()
    resp = client.get(f"/parcelas/{sin['id']}/clima/horario", headers=auth_headers)
    assert resp.status_code == 422


def test_si_open_meteo_falla_el_horario_da_503(client, auth_headers, parcela_id):
    with patch("app.routers.clima_fetch.get_provider") as mock:
        mock.return_value.fetch_horario.side_effect = RuntimeError("sin red")
        resp = client.get(f"/parcelas/{parcela_id}/clima/horario", headers=auth_headers)
    assert resp.status_code == 503

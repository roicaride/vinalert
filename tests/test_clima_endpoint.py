"""Integration tests for the climate endpoint (POST /parcelas/{parcela_id}/actualizar-clima)"""

from unittest.mock import patch


def test_actualizar_clima_sin_coordenadas(client, auth_headers):
    """Parcela sin coordenadas should return 422."""
    # Create a parcela without coordinates
    resp = client.post(
        "/parcelas/",
        json={"nombre": "Sin coords"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    parcela_id = resp.json()["id"]

    # Try to fetch climate for parcela without coordinates
    resp = client.post(
        f"/parcelas/{parcela_id}/actualizar-clima",
        headers=auth_headers,
    )
    assert resp.status_code == 422
    assert "coordenadas" in resp.json()["detail"].lower()


def test_actualizar_clima_provider_error(client, auth_headers):
    """Provider failure should return 503."""
    # Create a parcela with coordinates
    resp = client.post(
        "/parcelas/",
        json={
            "nombre": "Con coords",
            "latitud": 41.0,
            "longitud": -3.0,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    parcela_id = resp.json()["id"]

    # Mock provider to raise an exception
    with patch("app.services.weather.get_provider") as mock_provider:
        mock_provider.return_value.fetch.side_effect = Exception("Network error")

        resp = client.post(
            f"/parcelas/{parcela_id}/actualizar-clima",
            headers=auth_headers,
        )

    assert resp.status_code == 503
    assert "meteorológico" in resp.json()["detail"].lower()

def test_registro_login_y_parcela(client, auth_headers, parcela_id):
    resp = client.get("/parcelas/", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["id"] == parcela_id

def test_analizar_ya_no_existe(client, auth_headers, parcela_id):
    resp = client.post(f"/analizar/{parcela_id}", headers=auth_headers)
    assert resp.status_code == 404

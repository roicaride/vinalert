def test_listar_lecturas_foliares(client, auth_headers, parcela_id):
    with open("tests/fixtures/Libro1.xlsx", "rb") as f:
        client.post(
            f"/parcelas/{parcela_id}/foliar/upload",
            files={"archivo": ("Libro1.xlsx", f)},
            headers=auth_headers,
        )

    resp = client.get(f"/parcelas/{parcela_id}/foliar/", headers=auth_headers)
    assert resp.status_code == 200
    lista = resp.json()
    assert len(lista) == 6
    assert [r["grupo"] for r in lista] == [1, 2, 3, 4, 5, 7]

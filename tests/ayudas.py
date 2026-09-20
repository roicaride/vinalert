"""Ayudas compartidas por los tests que necesitan datos de partida."""


def alta_sensor(client, headers, parcela_id, etiqueta=None):
    """
    Da de alta el siguiente sensor de la parcela igual que la web: pidiendo a
    /provisionar un sensor mas de los que ya hay. Si se pasa `etiqueta`, se
    le pone despues con un PATCH. Devuelve el sensor creado (dict).
    """
    ya = client.get(f"/parcelas/{parcela_id}/sensores/", headers=headers).json()
    resp = client.post(
        f"/parcelas/{parcela_id}/sensores/provisionar",
        json={"cantidad": len(ya) + 1},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    sensor = resp.json()[-1]
    if etiqueta is not None:
        resp = client.patch(
            f"/parcelas/{parcela_id}/sensores/{sensor['id']}",
            json={"etiqueta": etiqueta},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        sensor = resp.json()
    return sensor

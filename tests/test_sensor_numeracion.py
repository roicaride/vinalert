import pytest
from sqlalchemy.exc import IntegrityError

from app.models import Parcela, Sensor


def _parcela(db_session, nombre="P1"):
    p = Parcela(nombre=nombre)
    db_session.add(p)
    db_session.commit()
    db_session.refresh(p)
    return p


def test_el_primer_sensor_de_una_parcela_es_el_numero_1(client, auth_headers, parcela_id):
    resp = client.post(
        f"/parcelas/{parcela_id}/sensores/",
        json={"etiqueta": "Nodo A"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["numero"] == 1


def test_la_numeracion_es_consecutiva(client, auth_headers, parcela_id):
    numeros = []
    for i in range(3):
        resp = client.post(
            f"/parcelas/{parcela_id}/sensores/",
            json={"etiqueta": f"Nodo {i}"},
            headers=auth_headers,
        )
        numeros.append(resp.json()["numero"])
    assert numeros == [1, 2, 3]


def test_dos_parcelas_pueden_tener_ambas_un_sensor_numero_1(client, auth_headers, parcela_id):
    """El numero es unico DENTRO de la parcela, no globalmente."""
    otra = client.post("/parcelas/", json={"nombre": "Otra"}, headers=auth_headers).json()["id"]

    a = client.post(f"/parcelas/{parcela_id}/sensores/", json={"etiqueta": "A"}, headers=auth_headers)
    b = client.post(f"/parcelas/{otra}/sensores/", json={"etiqueta": "B"}, headers=auth_headers)

    assert a.json()["numero"] == 1
    assert b.json()["numero"] == 1


def test_desactivar_un_sensor_no_libera_su_numero(client, auth_headers, parcela_id):
    """
    Reutilizar el numero mezclaria bajo un mismo identificador las lecturas
    historicas del nodo viejo y las del nuevo.
    """
    primero = client.post(
        f"/parcelas/{parcela_id}/sensores/", json={"etiqueta": "A"}, headers=auth_headers
    ).json()
    client.patch(
        f"/parcelas/{parcela_id}/sensores/{primero['id']}",
        json={"activo": False},
        headers=auth_headers,
    )

    segundo = client.post(
        f"/parcelas/{parcela_id}/sensores/", json={"etiqueta": "B"}, headers=auth_headers
    ).json()
    assert segundo["numero"] == 2, "el numero del sensor desactivado se ha reutilizado"


def test_el_cliente_no_puede_fijar_el_numero(client, auth_headers, parcela_id):
    """SensorCreate no declara `numero`: enviarlo se ignora."""
    resp = client.post(
        f"/parcelas/{parcela_id}/sensores/",
        json={"etiqueta": "Listillo", "numero": 99},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["numero"] == 1


def test_la_restriccion_impide_dos_sensores_con_el_mismo_numero(db_session):
    p = _parcela(db_session)
    db_session.add(Sensor(parcela_id=p.id, numero=1, etiqueta="A", activo=True))
    db_session.commit()

    db_session.add(Sensor(parcela_id=p.id, numero=1, etiqueta="B", activo=True))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_los_campos_de_configuracion_se_guardan(db_session):
    p = _parcela(db_session)
    s = Sensor(
        parcela_id=p.id, numero=1, etiqueta="A", activo=True,
        profundidad_cm=30.0, latitud=42.31, longitud=-8.61, modelo="ACME-1000",
    )
    db_session.add(s)
    db_session.commit()
    db_session.refresh(s)

    assert s.profundidad_cm == 30.0
    assert s.latitud == 42.31
    assert s.longitud == -8.61
    assert s.modelo == "ACME-1000"

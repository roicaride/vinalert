import pytest
from sqlalchemy.exc import IntegrityError

from app.models import Parcela, Sensor
from tests.ayudas import alta_sensor


def _parcela(db_session, nombre="P1"):
    p = Parcela(nombre=nombre)
    db_session.add(p)
    db_session.commit()
    db_session.refresh(p)
    return p


def test_el_primer_sensor_de_una_parcela_es_el_numero_1(client, auth_headers, parcela_id):
    assert alta_sensor(client, auth_headers, parcela_id)["numero"] == 1


def test_la_numeracion_es_consecutiva(client, auth_headers, parcela_id):
    numeros = [alta_sensor(client, auth_headers, parcela_id)["numero"] for _ in range(3)]
    assert numeros == [1, 2, 3]


def test_dos_parcelas_pueden_tener_ambas_un_sensor_numero_1(client, auth_headers, parcela_id):
    """El numero es unico DENTRO de la parcela, no globalmente."""
    otra = client.post("/parcelas/", json={"nombre": "Otra"}, headers=auth_headers).json()["id"]

    assert alta_sensor(client, auth_headers, parcela_id)["numero"] == 1
    assert alta_sensor(client, auth_headers, otra)["numero"] == 1


def test_desactivar_un_sensor_no_libera_su_numero(client, auth_headers, parcela_id):
    """
    Reutilizar el numero mezclaria bajo un mismo identificador las lecturas
    historicas del nodo viejo y las del nuevo.
    """
    primero = alta_sensor(client, auth_headers, parcela_id)
    client.patch(
        f"/parcelas/{parcela_id}/sensores/{primero['id']}",
        json={"activo": False},
        headers=auth_headers,
    )

    segundo = alta_sensor(client, auth_headers, parcela_id)
    assert segundo["numero"] == 2, "el numero del sensor desactivado se ha reutilizado"


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

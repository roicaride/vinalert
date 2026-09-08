from datetime import datetime

from app.models import Tratamiento


def test_cue_actividad_ya_no_existe():
    import app.models as models
    assert not hasattr(models, "CueActividad")


def test_clima_diario_historico_ya_no_existe():
    import app.models as models
    assert not hasattr(models, "ClimaDiarioHistorico")


def test_endpoint_actividades_ya_no_existe(client, auth_headers, parcela_id):
    resp = client.get(f"/parcelas/{parcela_id}/actividades", headers=auth_headers)
    assert resp.status_code == 404


def test_endpoint_historico_diario_ya_no_existe(client, auth_headers, parcela_id):
    resp = client.get(f"/parcelas/{parcela_id}/historico-diario", headers=auth_headers)
    assert resp.status_code == 404


def test_tratamiento_se_guarda(db_session, parcela_id):
    t = Tratamiento(
        parcela_id=parcela_id,
        fecha=datetime(2026, 8, 17, 9, 30),
        tipo="fitosanitario",
        producto="Producto X",
        materia_activa="mancozeb",
        dosis=2.5,
        unidad_dosis="L/ha",
        cantidad_total=12.0,
        unidad_cantidad="L",
        operador="Roi",
        maquinaria="Atomizador",
        notas="Tras la lluvia",
        temp_c_aplicacion=22.0,
        viento_ms_aplicacion=1.8,
    )
    db_session.add(t)
    db_session.commit()
    db_session.refresh(t)
    assert t.id is not None
    assert t.tipo == "fitosanitario"

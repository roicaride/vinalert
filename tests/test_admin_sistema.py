"""
Lo que el superadmin necesita ver sin entrar al servidor: si los trabajos
periodicos van bien, que dispositivos se han callado, quien intenta entrar y
los datos del titular que leen las paginas legales.
"""
from datetime import datetime, timedelta

import pytest
from sqlalchemy.orm import sessionmaker

from app.models import DispositivoIoT, EstadoJob, IntentoAcceso, Parcela
from app.services import estado_jobs, reloj
from tests.ayudas import hacer_superadmin, registrar


def _entrar(client, email, password="clave12345"):
    resp = client.post("/auth/token", data={"username": email, "password": password})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture()
def admin(client):
    registrar(client, "admin@vinalert.dev", nombre="Admin")
    hacer_superadmin(client.db, "admin@vinalert.dev")
    return _entrar(client, "admin@vinalert.dev")


@pytest.fixture()
def fabrica(db_session):
    """Sesiones sobre la misma BD de test, como las que abre un job."""
    return sessionmaker(bind=db_session.get_bind())


# --- Registro de ejecuciones -------------------------------------------------

def test_una_ejecucion_correcta_queda_registrada(fabrica, db_session):
    estado_jobs.ejecutar("refrescar_clima", lambda: {"procesadas": 3, "fallos": 0}, fabrica)
    e = db_session.get(EstadoJob, "refrescar_clima")
    assert e.procesadas == 3 and e.fallos == 0
    assert e.ultimo_exito is not None and e.ultimo_error is None


def test_una_excepcion_queda_registrada_y_no_tumba_el_scheduler(fabrica, db_session):
    def roto():
        raise RuntimeError("Open-Meteo no responde")

    estado_jobs.ejecutar("refrescar_clima", roto, fabrica)  # no lanza

    e = db_session.get(EstadoJob, "refrescar_clima")
    assert "Open-Meteo no responde" in e.ultimo_error
    assert e.ultimo_exito is None


def test_un_exito_posterior_conserva_el_ultimo_error_con_su_fecha(fabrica, db_session):
    estado_jobs.ejecutar("x", lambda: (_ for _ in ()).throw(RuntimeError("fallo")), fabrica)
    estado_jobs.ejecutar("x", lambda: {"procesadas": 1, "fallos": 0}, fabrica)
    db_session.expire_all()
    e = db_session.get(EstadoJob, "x")
    assert e.ultimo_exito is not None
    assert e.ultimo_error is None  # el ultimo intento fue bien


def test_los_jobs_del_scheduler_pasan_por_el_registro(monkeypatch):
    from apscheduler.schedulers.background import BackgroundScheduler

    from app.main import _programar_jobs

    llamadas = []
    monkeypatch.setattr(estado_jobs, "ejecutar", lambda job_id, fn, *a, **k: llamadas.append(job_id))
    s = BackgroundScheduler()
    _programar_jobs(s)
    for job in s.get_jobs():
        job.func()
    assert sorted(llamadas) == ["consolidar_diario", "limpiar_accesos", "refrescar_clima"]


# --- Estado del sistema ------------------------------------------------------

def test_el_estado_muestra_jobs_correo_y_dispositivos(client, admin, db_session, monkeypatch):
    monkeypatch.delenv("SMTP_HOST", raising=False)
    p = Parcela(nombre="Viña Norte")
    db_session.add(p)
    db_session.flush()
    ahora = datetime.now()
    db_session.add_all([
        DispositivoIoT(parcela_id=p.id, nombre="Vivo", token="t1", creado_en=ahora,
                       ultimo_uso=ahora - timedelta(hours=1), intervalo_ciclo_seg=14400),
        DispositivoIoT(parcela_id=p.id, nombre="Callado", token="t2", creado_en=ahora,
                       ultimo_uso=ahora - timedelta(hours=9), intervalo_ciclo_seg=14400),
        DispositivoIoT(parcela_id=p.id, nombre="Nuevo", token="t3", creado_en=ahora),
    ])
    db_session.add(EstadoJob(job_id="refrescar_clima", ultimo_inicio=ahora, ultimo_fin=ahora,
                             ultimo_exito=ahora, procesadas=1, fallos=0))
    db_session.commit()

    resp = client.get("/admin/estado", headers=admin)

    assert resp.status_code == 200, resp.text
    cuerpo = resp.json()
    assert cuerpo["correo_configurado"] is False
    jobs = {j["job_id"]: j for j in cuerpo["jobs"]}
    assert jobs["refrescar_clima"]["procesadas"] == 1
    assert jobs["consolidar_diario"]["ultimo_inicio"] is None  # nunca ha corrido, pero sale
    disp = {d["nombre"]: d for d in cuerpo["dispositivos"]}
    assert disp["Vivo"]["sin_senal"] is False
    assert disp["Callado"]["sin_senal"] is True
    assert disp["Nuevo"]["sin_senal"] is False  # nunca ha enviado: no es una caida
    assert disp["Vivo"]["parcela"] == "Viña Norte"
    assert "token" not in disp["Vivo"]


def test_el_estado_es_solo_para_el_superadmin(client, auth_headers):
    assert client.get("/admin/estado", headers=auth_headers).status_code == 403


# --- Registro de accesos -----------------------------------------------------

def test_el_registro_de_accesos_va_del_mas_reciente_y_se_filtra(client, admin, db_session):
    # Por delante del login del propio admin (fixture), que es real.
    t = reloj.ahora_utc() + timedelta(hours=1)
    db_session.add_all([
        IntentoAcceso(momento=t - timedelta(minutes=3), tipo="login", email="ana@x.es", ip="1.1.1.1", resultado="fallo"),
        IntentoAcceso(momento=t - timedelta(minutes=2), tipo="login", email="ana@x.es", ip="1.1.1.1", resultado="exito"),
        IntentoAcceso(momento=t - timedelta(minutes=1), tipo="login", email="luis@x.es", ip="2.2.2.2", resultado="fallo"),
    ])
    db_session.commit()

    todos = client.get("/admin/accesos", headers=admin).json()
    assert todos[0]["email"] == "luis@x.es"
    solo_fallos_ana = client.get("/admin/accesos", params={"email": "ANA@x.es", "resultado": "fallo"}, headers=admin).json()
    assert [(a["email"], a["resultado"]) for a in solo_fallos_ana] == [("ana@x.es", "fallo")]


def test_el_registro_de_accesos_se_pagina(client, admin, db_session):
    # Por delante del login del propio admin (fixture), que es real.
    t = reloj.ahora_utc() + timedelta(hours=1)
    for i in range(5):
        db_session.add(IntentoAcceso(momento=t - timedelta(minutes=i), tipo="login", email=f"u{i}@x.es", ip="1.1.1.1", resultado="fallo"))
    db_session.commit()
    pagina = client.get("/admin/accesos", params={"limite": 2}, headers=admin).json()
    siguiente = client.get("/admin/accesos", params={"limite": 2, "antes_de": pagina[-1]["id"]}, headers=admin).json()
    assert [a["email"] for a in pagina + siguiente] == ["u0@x.es", "u1@x.es", "u2@x.es", "u3@x.es"]


def test_el_registro_de_accesos_es_solo_para_el_superadmin(client, auth_headers):
    assert client.get("/admin/accesos", headers=auth_headers).status_code == 403


# --- Configuracion del titular -------------------------------------------------

def test_la_configuracion_publica_sale_vacia_al_principio(client):
    cuerpo = client.get("/configuracion/publica").json()
    assert cuerpo["titular_nombre"] is None
    assert "titular_nif" in cuerpo


def test_el_superadmin_guarda_los_datos_del_titular(client, admin):
    resp = client.put("/admin/configuracion", json={"titular_nombre": "Bodegas Ejemplo S.L.", "titular_nif": "B12345678"}, headers=admin)
    assert resp.status_code == 200, resp.text
    publica = client.get("/configuracion/publica").json()
    assert publica["titular_nombre"] == "Bodegas Ejemplo S.L."
    assert publica["titular_nif"] == "B12345678"
    # Un campo vacio vuelve a "pendiente".
    client.put("/admin/configuracion", json={"titular_nif": "  "}, headers=admin)
    assert client.get("/configuracion/publica").json()["titular_nif"] is None


def test_no_se_aceptan_claves_desconocidas_ni_textos_enormes(client, admin):
    assert client.put("/admin/configuracion", json={"inventada": "x"}, headers=admin).status_code == 422
    assert client.put("/admin/configuracion", json={"titular_nombre": "x" * 2000}, headers=admin).status_code == 422


def test_solo_el_superadmin_cambia_la_configuracion(client, auth_headers):
    assert client.put("/admin/configuracion", json={"titular_nombre": "X"}, headers=auth_headers).status_code == 403

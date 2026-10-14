"""
Genera los datos de la parcela de ejemplo de la landing.

Monta el backend real contra una base de datos SQLite en memoria, siembra una
parcela inventada con dos meses de datos coherentes y guarda lo que responde la
API en `vinalert-front/src/demo/datos.json`. Asi la demo del navegador tiene
exactamente la forma que espera la web: si la API cambia, se vuelve a ejecutar
este script y la demo no se desincroniza.

Las fechas son relativas al dia en que se genera; la web las desplaza para que
siempre parezcan recientes (ver vinalert-front/src/demo/api.js).

Uso, desde la raiz del repositorio:
    python scripts/generar_demo.py
"""
import json
import math
import os
import random
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from unittest.mock import patch
from zoneinfo import ZoneInfo

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))
os.environ.setdefault("SECRET_KEY", "generador-de-la-demo-no-es-un-secreto-0123456789")
os.environ.pop("SMTP_HOST", None)

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.auth import crear_token_sesion, obtener_password_hash  # noqa: E402
from app.database import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    ClimaDiario,
    LecturaFoliar,
    LogClima,
    LogSensor,
    Parcela,
    ParcelaUsuario,
    Sensor,
    Tratamiento,
    Usuario,
)

DESTINO = RAIZ / "vinalert-front" / "src" / "demo" / "datos.json"
TZ = ZoneInfo("Europe/Madrid")
DIAS = 60
SEMILLA = 2026

# Unos bancales de viña en la Ribeira Sacra (zona de Doade, Sober): elegidos
# mirando la ortofoto del PNOA para que el mapa de la demo enseñe viñedo y no
# monte. Los sensores se reparten por la ladera, de arriba abajo.
LAT, LON = 42.45085, -7.63327
SENSORES = [
    # etiqueta, profundidad, desplazamiento (lat, lon) desde el centro
    ("Cabecera alta", 20, (0.00028, -0.00030)),
    ("Cabecera honda", 60, (0.00026, -0.00022)),
    ("Centro alta", 20, (0.00002, 0.00004)),
    ("Centro media", 40, (-0.00002, 0.00012)),
    ("Pie alta", 20, (-0.00026, 0.00032)),
    ("Pie honda", 60, (-0.00028, 0.00040)),
]


def _r(v, n=2):
    return None if v is None else round(v, n)


def _clima_horario(t: datetime, dia_idx: int, lluvia_dia: float, rnd: random.Random) -> dict:
    """Clima plausible de otoño en el interior de Galicia para la hora `t`."""
    hora = t.hour + t.minute / 60
    estacional = 19 - dia_idx * 0.13  # se va enfriando hacia noviembre
    diario = 6.5 * math.sin((hora - 9) / 24 * 2 * math.pi)
    nublado = lluvia_dia > 0
    temp = estacional + diario * (0.55 if nublado else 1) + rnd.uniform(-0.6, 0.6)
    hr = min(99, max(38, 78 - diario * 4.5 + (14 if nublado else 0) + rnd.uniform(-4, 4)))
    sol = max(0.0, math.sin((hora - 7.5) / 11 * math.pi)) if 7.5 <= hora <= 18.5 else 0.0
    radiacion = sol * (180 if nublado else 520) * (1 - dia_idx / 160)
    rocio = temp - (100 - hr) / 5
    es = 0.6108 * math.exp(17.27 * temp / (temp + 237.3))
    lluvia_h = lluvia_dia / 8 if nublado and rnd.random() < 0.45 else 0.0
    return {
        "temp_c": temp,
        "humedad_relativa_pct": hr,
        "presion_hpa": 1016 - (9 if nublado else 0) + rnd.uniform(-3, 3),
        "viento_vel_ms": max(0.2, rnd.gauss(2.4 if nublado else 1.6, 0.8)),
        "viento_racha_ms": max(0.8, rnd.gauss(5.5 if nublado else 3.8, 1.2)),
        "viento_dir_deg": (220 if nublado else 60) + rnd.uniform(-35, 35),
        "lluvia_mm": lluvia_h,
        "et0": radiacion * 0.0009,
        "radiacion_wm2": radiacion,
        "vpd_kpa": max(0.0, es * (1 - hr / 100)),
        "punto_rocio_c": rocio,
        "nubosidad_pct": 85 + rnd.uniform(-10, 10) if nublado else 20 + rnd.uniform(-15, 25),
        "uv_index": sol * (2 if nublado else 4.5),
    }


def sembrar(db, ahora: datetime) -> tuple:
    rnd = random.Random(SEMILLA)
    gestor = Usuario(nombre="Visitante", email="demo@vinalert.es", hashed_password=obtener_password_hash("x" * 16))
    lectora = Usuario(nombre="Lucía Pereira", email="lucia@ejemplo.es", hashed_password=obtener_password_hash("x" * 16))
    invitado = Usuario(nombre="", email="tecnico@ejemplo.es", hashed_password=None)
    db.add_all([gestor, lectora, invitado])
    parcela = Parcela(
        nombre="Viña de ejemplo · Ribeira Sacra",
        tipo_cultivo="Viñedo",
        variedad="Mencía",
        superficie_total_m2=12500,
        latitud=LAT,
        longitud=LON,
    )
    db.add(parcela)
    db.flush()
    db.add_all([
        ParcelaUsuario(parcela_id=parcela.id, usuario_id=gestor.id, rol="gestor"),
        ParcelaUsuario(parcela_id=parcela.id, usuario_id=lectora.id, rol="lectura"),
        ParcelaUsuario(parcela_id=parcela.id, usuario_id=invitado.id, rol="lectura"),
    ])

    sensores = []
    for numero, (etiqueta, prof, (dlat, dlon)) in enumerate(SENSORES, start=1):
        s = Sensor(
            parcela_id=parcela.id, numero=numero, etiqueta=etiqueta, activo=True,
            profundidad_cm=prof, latitud=round(LAT + dlat, 5), longitud=round(LON + dlon, 5),
            modelo="RS-485 · humedad y temperatura",
        )
        db.add(s)
        sensores.append(s)
    db.flush()

    hoy = ahora.date()
    inicio = hoy - timedelta(days=DIAS - 1)
    # Lluvias del periodo: unos frentes atlanticos con dias secos entre medias.
    lluvia_por_dia = {}
    for d in range(DIAS):
        dia = inicio + timedelta(days=d)
        frente = rnd.random() < (0.22 if d < 35 else 0.38)
        lluvia_por_dia[dia] = rnd.uniform(3, 22) if frente else 0.0

    # Clima cada 3 h y su resumen diario.
    for d in range(DIAS):
        dia = inicio + timedelta(days=d)
        horas = []
        for h in range(0, 24, 3):
            t = datetime(dia.year, dia.month, dia.day, h)
            if t > ahora:
                break
            c = _clima_horario(t, d, lluvia_por_dia[dia], rnd)
            db.add(LogClima(parcela_id=parcela.id, fecha_hora=t, **{k: _r(v) for k, v in c.items()}))
            horas.append(c)
        if not horas:
            continue
        temps = [c["temp_c"] for c in horas]
        hrs = [c["humedad_relativa_pct"] for c in horas]
        db.add(ClimaDiario(
            parcela_id=parcela.id, fecha=dia, fuente="open_meteo",
            temp_max=_r(max(temps) + 1.2), temp_min=_r(min(temps) - 1.0), temp_media=_r(sum(temps) / len(temps)),
            humedad_relativa_media=_r(sum(hrs) / len(hrs)), humedad_relativa_max=_r(max(hrs)), humedad_relativa_min=_r(min(hrs)),
            punto_rocio_medio=_r(sum(c["punto_rocio_c"] for c in horas) / len(horas)),
            vpd_max=_r(max(c["vpd_kpa"] for c in horas)),
            precipitacion_total_mm=_r(lluvia_por_dia[dia], 1),
            et0_total_dia=_r(sum(c["et0"] for c in horas) * 3 * 0.85),
            radiacion_total_mj_m2=_r(sum(c["radiacion_wm2"] for c in horas) * 3 * 0.0036),
            horas_sol=_r(2.5 if lluvia_por_dia[dia] else rnd.uniform(6, 9.5), 1),
            viento_vel_media=_r(sum(c["viento_vel_ms"] for c in horas) / len(horas)),
            viento_racha_max=_r(max(c["viento_racha_ms"] for c in horas)),
            viento_dir_dominante=_r(horas[len(horas) // 2]["viento_dir_deg"], 0),
            humectacion_foliar_pct=_r(70 if lluvia_por_dia[dia] else rnd.uniform(5, 30), 0),
        ))

    # Lecturas de suelo cada 4 h: la humedad sube con la lluvia (mas y antes
    # cerca de la superficie) y baja con la evapotranspiracion.
    base = {20: 24.0, 40: 27.0, 60: 29.5}
    for s in sensores:
        hum = base[s.profundidad_cm] + rnd.uniform(-1.5, 1.5)
        for d in range(DIAS):
            dia = inicio + timedelta(days=d)
            llueve = lluvia_por_dia[dia]
            respuesta = {20: 0.55, 40: 0.32, 60: 0.18}[s.profundidad_cm]
            for h in range(2, 24, 4):
                t = datetime(dia.year, dia.month, dia.day, h, rnd.randint(0, 9))
                if t > ahora - timedelta(minutes=50):
                    break
                hum += llueve / 6 * respuesta
                hum -= {20: 0.11, 40: 0.06, 60: 0.035}[s.profundidad_cm] * (1 - d / 120)
                hum = min(42, max(12, hum + rnd.uniform(-0.15, 0.15)))
                prof = s.profundidad_cm
                temp_suelo = (16.5 - d * 0.11) + (2.4 if prof == 20 else 1.1 if prof == 40 else 0.4) * math.sin((h - 13) / 24 * 2 * math.pi)
                db.add(LogSensor(
                    parcela_id=parcela.id, sensor_id=s.id, fecha_hora=t,
                    humedad_suelo_pct=_r(hum, 1), temperatura_suelo=_r(temp_suelo + rnd.uniform(-0.2, 0.2), 1),
                    bateria=_r(4.25 - d * 0.003 + rnd.uniform(-0.02, 0.02)),
                ))

    # Cuaderno de tratamientos, con el clima del momento copiado como hace la API.
    tratamientos = [
        (6, 9, "Fungicida", "Cobre 50 WP", "oxicloruro de cobre", 2.0, "kg/ha", "Atomizador arrastrado"),
        (17, 8, "Fungicida", "Azufre mojable 80", "azufre", 3.0, "kg/ha", "Atomizador arrastrado"),
        (28, 10, "Abono foliar", "Aminoácidos + Mg", "magnesio", 2.5, "L/ha", "Mochila"),
        (41, 9, "Fungicida", "Cobre 50 WP", "oxicloruro de cobre", 2.0, "kg/ha", "Atomizador arrastrado"),
        (52, 11, "Otro", "Deshojado manual", None, None, None, None),
    ]
    for d, hora, tipo, producto, materia, dosis, unidad, maquinaria in tratamientos:
        dia = inicio + timedelta(days=d)
        momento = datetime(dia.year, dia.month, dia.day, hora, 30)
        c = _clima_horario(momento, d, lluvia_por_dia[dia], rnd)
        db.add(Tratamiento(
            parcela_id=parcela.id, fecha=momento, tipo=tipo, producto=producto, materia_activa=materia,
            dosis=dosis, unidad_dosis=unidad, cantidad_total=_r(dosis * 1.25, 1) if dosis else None,
            unidad_cantidad=(unidad or "").split("/")[0] or None, operador="Brais Novo", maquinaria=maquinaria,
            notas="Cara norte primero, por el viento." if tipo == "Fungicida" else None,
            temp_c_aplicacion=_r(c["temp_c"]), viento_ms_aplicacion=_r(c["viento_vel_ms"]),
            humedad_relativa_aplicacion=_r(c["humedad_relativa_pct"]), lluvia_mm_aplicacion=0.0,
            et0_aplicacion=_r(c["et0"]), viento_racha_ms_aplicacion=_r(c["viento_racha_ms"]),
            viento_dir_deg_aplicacion=_r(c["viento_dir_deg"], 0), radiacion_wm2_aplicacion=_r(c["radiacion_wm2"]),
            presion_hpa_aplicacion=_r(c["presion_hpa"]), vpd_kpa_aplicacion=_r(c["vpd_kpa"]),
            punto_rocio_c_aplicacion=_r(c["punto_rocio_c"]), nubosidad_pct_aplicacion=_r(c["nubosidad_pct"], 0),
            clima_fecha_hora=momento.replace(minute=0, hour=hora - hora % 3), clima_fuente="log_clima",
        ))

    # Tres campañas del medidor foliar, seis puntos cada una.
    for d, chl in [(10, 31.0), (31, 28.5), (54, 25.0)]:
        dia = inicio + timedelta(days=d)
        for grupo in range(1, 7):
            db.add(LecturaFoliar(
                parcela_id=parcela.id, fecha=dia, grupo=grupo,
                chl_medio=_r(chl + rnd.uniform(-2.5, 2.5)), chl_sd=_r(rnd.uniform(1.5, 3.5)),
                flav_medio=_r(1.6 + d * 0.008 + rnd.uniform(-0.12, 0.12)), flav_sd=_r(rnd.uniform(0.05, 0.15)),
                nbi_medio=_r(chl / 1.9 + rnd.uniform(-1.5, 1.5)), nbi_sd=_r(rnd.uniform(0.6, 1.8)),
                n_mediciones=10, archivo_origen=f"dualex_{dia.isoformat()}.xlsx",
            ))
    db.commit()
    return parcela, gestor, lluvia_por_dia


def _horario(ahora: datetime, rnd: random.Random):
    """Lo que devolveria el proveedor: 48 h atras y 48 h de prevision."""
    filas = []
    for i in range(-48, 48):
        t = (ahora + timedelta(hours=i)).replace(minute=0, second=0, microsecond=0)
        lluvia = rnd.uniform(0.2, 1.8) if 20 <= i <= 32 else 0.0
        filas.append({
            "fecha_hora": t,
            "lluvia_mm": round(lluvia, 1),
            "prob_lluvia_pct": round(min(95, 70 + rnd.uniform(-10, 20)) if 16 <= i <= 34 else rnd.uniform(0, 15)),
            "et0_mm": round(max(0.0, math.sin((t.hour - 7.5) / 11 * math.pi)) * 0.18, 2) if 7 <= t.hour <= 19 else 0.0,
            "temp_c": round(12 + 5.5 * math.sin((t.hour - 9) / 24 * 2 * math.pi) - (2 if 20 <= i <= 32 else 0), 1),
        })
    return filas


def generar() -> dict:
    ahora = datetime.now(TZ).replace(tzinfo=None, second=0, microsecond=0)
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    db = sessionmaker(bind=engine)()
    parcela, gestor, _ = sembrar(db, ahora)

    app.dependency_overrides[get_db] = lambda: (yield db)
    cliente = TestClient(app)
    cabeceras = {"Authorization": f"Bearer {crear_token_sesion(gestor)}"}
    pid = parcela.id

    class Proveedor:
        def fetch_horario(self, *a, **k):
            return _horario(ahora, random.Random(SEMILLA + 1))

    def pedir(ruta, **params):
        resp = cliente.get(ruta, params=params, headers=cabeceras)
        assert resp.status_code == 200, (ruta, resp.status_code, resp.text[:300])
        return resp.json()

    with patch("app.routers.clima_fetch.get_provider", lambda: Proveedor()):
        respuestas = {
            "me": pedir("/auth/me"),
            "parcela": pedir(f"/parcelas/{pid}"),
            "dashboard": pedir(f"/parcelas/{pid}/dashboard"),
            # Las mas recientes bastan: Estado pide como mucho 100 y Analisis las
            # de 48 h. Guardarlas todas multiplicaria por siete el JSON.
            "historico": pedir(f"/parcelas/{pid}/historico", limite=300),
            "climaHorario": pedir(f"/parcelas/{pid}/clima/horario"),
            "sueloDiario": pedir(f"/parcelas/{pid}/suelo/diario", dias=366),
            "climaDiario": pedir(f"/parcelas/{pid}/clima/diario", limite=5000),
            "sensores": pedir(f"/parcelas/{pid}/sensores/"),
            "foliar": pedir(f"/parcelas/{pid}/foliar/"),
            "tratamientos": pedir(f"/parcelas/{pid}/tratamientos"),
            "miembros": pedir(f"/parcelas/{pid}/usuarios"),
        }
    app.dependency_overrides.clear()
    db.close()
    return {"generado": ahora.isoformat(timespec="minutes"), "parcelaId": pid, "respuestas": respuestas}


if __name__ == "__main__":
    datos = generar()
    DESTINO.parent.mkdir(parents=True, exist_ok=True)
    DESTINO.write_text(json.dumps(datos, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    r = datos["respuestas"]
    print(f"Escrito {DESTINO.relative_to(RAIZ)} ({DESTINO.stat().st_size // 1024} KB): "
          f"{len(r['historico'])} lecturas, {len(r['climaDiario'])} dias de clima, "
          f"{len(r['tratamientos'])} tratamientos, {len(r['foliar'])} medidas foliares.")

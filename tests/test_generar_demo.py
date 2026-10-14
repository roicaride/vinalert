"""
La parcela de ejemplo de la landing sale de respuestas reales de la API
(scripts/generar_demo.py). Si un endpoint cambia o deja de responder, este
test falla y avisa de que hay que regenerar vinalert-front/src/demo/datos.json.
"""
import importlib.util
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]


def _generador():
    spec = importlib.util.spec_from_file_location("generar_demo", RAIZ / "scripts" / "generar_demo.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_el_generador_produce_todas_las_respuestas_de_la_demo():
    datos = _generador().generar()
    r = datos["respuestas"]
    assert set(r) == {
        "me", "parcela", "dashboard", "historico", "climaHorario", "sueloDiario",
        "climaDiario", "sensores", "foliar", "tratamientos", "miembros",
    }
    assert r["parcela"]["mi_rol"] == "gestor"
    assert r["me"]["es_superadmin"] is False
    assert len(r["historico"]) == 300
    assert len(r["sensores"]) == 6
    assert r["dashboard"]["clima_actual"] is not None
    # Las lecturas tienen que estar dentro de los rangos que acepta la ingesta.
    for lectura in r["historico"]:
        assert 0 <= lectura["humedad_suelo_pct"] <= 100
        assert -30 <= lectura["temperatura_suelo"] <= 70


def test_el_json_de_la_demo_esta_al_dia_con_la_api():
    import json

    guardado = json.loads((RAIZ / "vinalert-front" / "src" / "demo" / "datos.json").read_text(encoding="utf-8"))
    nuevo = _generador().generar()
    for clave, valor in nuevo["respuestas"].items():
        muestra = valor[0] if isinstance(valor, list) and valor else valor
        guardada = guardado["respuestas"][clave]
        guardada = guardada[0] if isinstance(guardada, list) and guardada else guardada
        if isinstance(muestra, dict):
            assert set(muestra) == set(guardada), f"«{clave}» ha cambiado de forma: ejecuta python scripts/generar_demo.py"

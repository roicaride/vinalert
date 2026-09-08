import pytest


def test_riesgo_enfermedad_ya_no_existe():
    import app.models as models
    assert not hasattr(models, "RiesgoEnfermedad")


def test_recomendacion_riego_ya_no_existe():
    import app.models as models
    assert not hasattr(models, "RecomendacionRiego")


def test_paquete_logic_ya_no_existe():
    import os
    assert not os.path.isdir("app/logic")

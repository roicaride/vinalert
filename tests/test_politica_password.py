import pytest

from app.services.politica_password import validar


def test_rechaza_menos_de_diez_caracteres():
    with pytest.raises(ValueError, match="10"):
        validar("a1b2c3d4e")


@pytest.mark.parametrize("comun", ["Vinalert123", "contraseña123", "1234567890", "qwertyuiop"])
def test_rechaza_contrasenas_comunes(comun):
    with pytest.raises(ValueError, match="común"):
        validar(comun)


def test_acepta_una_contrasena_razonable():
    validar("cepas-de-albariño-2026")

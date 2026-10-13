"""
La clave que firma los JWT no puede tener valor por defecto: si faltase en el
.env de produccion, cualquiera podria firmarse un token de admin con la clave
publicada en el repositorio. Mejor que la API no arranque.
"""
import pytest

from app.auth import validar_secret_key


@pytest.mark.parametrize("valor", [None, "", "   "])
def test_sin_clave_no_arranca(valor):
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        validar_secret_key(valor)


@pytest.mark.parametrize("valor", [
    "cambia_esta_clave_antes_de_produccion",
    "generate_a_secure_key_with_openssl_rand_hex_32",
])
def test_clave_publicada_en_el_repo_no_arranca(valor):
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        validar_secret_key(valor)


def test_clave_corta_no_arranca():
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        validar_secret_key("a" * 31)


def test_clave_valida_se_acepta():
    clave = "f" * 64
    assert validar_secret_key(clave) == clave

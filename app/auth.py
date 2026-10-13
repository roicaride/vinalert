import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from dotenv import load_dotenv
from jose import jwt
from passlib.context import CryptContext

load_dotenv()

# Valores que han estado publicados en el repositorio (el antiguo valor por
# defecto y el ejemplo de .env.example). Con cualquiera de ellos, cualquiera
# podria firmarse un token de admin.
_CLAVES_PUBLICADAS = {
    "cambia_esta_clave_antes_de_produccion",
    "generate_a_secure_key_with_openssl_rand_hex_32",
}
LONGITUD_MINIMA_CLAVE = 32


def validar_secret_key(valor: Optional[str]) -> str:
    """
    Sin valor por defecto a proposito: si la clave falta o es una conocida, la
    API no arranca. Un fallo ruidoso al desplegar es mejor que tokens
    falsificables en produccion.
    """
    valor = (valor or "").strip()
    if not valor:
        raise RuntimeError("Falta SECRET_KEY en el entorno. Genera una con: openssl rand -hex 32")
    if valor in _CLAVES_PUBLICADAS:
        raise RuntimeError("SECRET_KEY es el valor de ejemplo del repositorio. Genera una con: openssl rand -hex 32")
    if len(valor) < LONGITUD_MINIMA_CLAVE:
        raise RuntimeError(f"SECRET_KEY debe tener al menos {LONGITUD_MINIMA_CLAVE} caracteres.")
    return valor


SECRET_KEY = validar_secret_key(os.getenv("SECRET_KEY"))
ALGORITHM = "HS256"
# Una semana. Alargarlo reduce cuantas veces te echa, pero NO elimina el fallo:
# el interceptor del 401 en el frontend es lo que convierte la caducidad en un
# mensaje en vez de en pantallas vacias.
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def obtener_password_hash(password: str) -> str:
    return pwd_context.hash(password)


# Contra este hash se verifica cuando la cuenta no existe o esta pendiente: el
# login tarda lo mismo en todos los casos y el tiempo de respuesta no delata
# que emails tienen cuenta.
_HASH_FICTICIO = pwd_context.hash("cuenta-inexistente-para-igualar-tiempos")


def verificar_password(plain_password: str, hashed_password: Optional[str]) -> bool:
    if hashed_password is None:
        pwd_context.verify(plain_password, _HASH_FICTICIO)
        return False
    return pwd_context.verify(plain_password, hashed_password)


def crear_token_sesion(usuario) -> str:
    """
    El token de sesion de una persona. Lleva su token_version: subirla la
    invalida (ver deps.get_current_user).
    """
    return crear_token_acceso({"sub": str(usuario.id), "ver": usuario.token_version})


def crear_token_acceso(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

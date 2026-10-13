"""
Enlaces de invitacion y de recuperacion de contrasena.

El token va en claro solo en el email; en la BD se guarda su SHA-256. Sin sal
porque es aleatorio de 256 bits, no una contrasena. Un solo uso, con
caducidad, y pedir uno nuevo anula los anteriores del mismo tipo: solo vale el
ultimo email recibido.
"""
import hashlib
import secrets
from datetime import timedelta
from typing import Optional

from fastapi import BackgroundTasks
from sqlalchemy.orm import Session

from ..models import Parcela, TokenCuenta, Usuario
from . import correo, reloj

INVITACION = "invitacion"
RECUPERACION = "recuperacion"

DURACION = {
    INVITACION: timedelta(days=7),
    RECUPERACION: timedelta(hours=1),
}


class TokenInvalido(Exception):
    """No existe, ha caducado, ya se uso o es de otro tipo. Siempre el mismo
    error: distinguirlos no ayuda a quien lo usa bien y si a quien tantea."""


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def anular(db: Session, usuario: Usuario, tipo: str) -> None:
    """Deja sin efecto los enlaces vivos de ese tipo. No hace commit."""
    db.query(TokenCuenta).filter(
        TokenCuenta.usuario_id == usuario.id,
        TokenCuenta.tipo == tipo,
        TokenCuenta.usado_en.is_(None),
    ).update({TokenCuenta.usado_en: reloj.ahora_utc()}, synchronize_session=False)


def emitir(
    db: Session,
    usuario: Usuario,
    tipo: str,
    creado_por: Optional[Usuario] = None,
    parcela: Optional[Parcela] = None,
) -> str:
    ahora = reloj.ahora_utc()
    anular(db, usuario, tipo)

    token = secrets.token_urlsafe(32)
    db.add(TokenCuenta(
        usuario_id=usuario.id,
        tipo=tipo,
        hash_token=_hash(token),
        creado_en=ahora,
        caduca_en=ahora + DURACION[tipo],
        creado_por_id=creado_por.id if creado_por else None,
        parcela_id=parcela.id if parcela else None,
    ))
    db.commit()
    return token


def consultar(db: Session, token: str, tipo: str) -> TokenCuenta:
    fila = db.query(TokenCuenta).filter(
        TokenCuenta.hash_token == _hash(token or ""),
        TokenCuenta.tipo == tipo,
    ).first()
    if fila is None or fila.usado_en is not None or fila.caduca_en <= reloj.ahora_utc():
        raise TokenInvalido()
    return fila


def consumir(db: Session, token: str, tipo: str) -> Usuario:
    """
    Marca el token como usado y devuelve su usuario. El UPDATE condicionado a
    usado_en IS NULL hace que, si dos peticiones llegan a la vez con el mismo
    enlace, solo una lo consuma. No hace commit: lo hace quien llama, junto
    con el cambio que el token autoriza.
    """
    fila = consultar(db, token, tipo)
    n = db.query(TokenCuenta).filter(
        TokenCuenta.id == fila.id,
        TokenCuenta.usado_en.is_(None),
    ).update({TokenCuenta.usado_en: reloj.ahora_utc()}, synchronize_session=False)
    if n != 1:
        raise TokenInvalido()
    return fila.usuario


def enviar_invitacion_a(
    db: Session,
    usuario: Usuario,
    background: BackgroundTasks,
    creado_por: Optional[Usuario] = None,
    parcela: Optional[Parcela] = None,
) -> None:
    token = emitir(db, usuario, INVITACION, creado_por=creado_por, parcela=parcela)
    enlace = f"{correo.url_web()}/invitacion?token={token}"
    background.add_task(
        correo.enviar_invitacion,
        usuario.email,
        enlace,
        creado_por.nombre if creado_por else None,
        parcela.nombre if parcela else None,
    )


def enviar_recuperacion_a(db: Session, usuario: Usuario, background: BackgroundTasks) -> None:
    token = emitir(db, usuario, RECUPERACION)
    enlace = f"{correo.url_web()}/restablecer?token={token}"
    background.add_task(correo.enviar_recuperacion, usuario.email, enlace)

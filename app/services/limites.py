"""
Limites de intentos de acceso, contados en la tabla intentos_acceso.

En PostgreSQL y no en memoria: sobreviven a reinicios, valen con varios
procesos y permiten limitar por cuenta, no solo por IP. Ver la spec
docs/specs/2026-10-13-cuentas-invitacion-design.md, seccion "Limites".
"""
import math
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from ..models import IntentoAcceso, TokenCuenta
from . import reloj

VENTANA_LOGIN = timedelta(minutes=15)
MAX_FALLOS_CUENTA = 5
MAX_INTENTOS_IP = 20

VENTANA_RECUPERACION = timedelta(hours=1)
MAX_RECUPERACION_IP = 10
MAX_RECUPERACION_EMAIL = 3

RETENCION_INTENTOS = timedelta(days=90)
RETENCION_TOKENS_CADUCADOS = timedelta(days=30)


def normalizar_email(email: Optional[str]) -> str:
    return (email or "").strip().lower()


def registrar_intento(db: Session, tipo: str, email: str, ip: str, resultado: str) -> None:
    db.add(IntentoAcceso(
        momento=reloj.ahora_utc(), tipo=tipo, email=normalizar_email(email), ip=ip, resultado=resultado,
    ))
    db.commit()


def _minutos_hasta_que_salga(momento: datetime, ahora: datetime, ventana: timedelta) -> int:
    segundos = (momento + ventana - ahora).total_seconds()
    return max(1, math.ceil(segundos / 60))


def bloqueo_login(db: Session, email: str, ip: str) -> Optional[int]:
    """
    Minutos que hay que esperar para volver a intentar, o None si se puede.

    Los intentos rechazados por el propio limite (resultado "bloqueado") no
    cuentan: insistir durante el bloqueo no lo alarga.
    """
    ahora = reloj.ahora_utc()
    desde = ahora - VENTANA_LOGIN

    por_ip = (
        db.query(IntentoAcceso.momento)
        .filter(
            IntentoAcceso.ip == ip,
            IntentoAcceso.tipo == "login",
            IntentoAcceso.resultado.in_(["exito", "fallo"]),
            IntentoAcceso.momento > desde,
        )
        .order_by(IntentoAcceso.momento.desc())
        .limit(MAX_INTENTOS_IP)
        .all()
    )
    if len(por_ip) >= MAX_INTENTOS_IP:
        return _minutos_hasta_que_salga(por_ip[-1].momento, ahora, VENTANA_LOGIN)

    email = normalizar_email(email)
    # Un login correcto o un restablecimiento de contrasena ponen la cuenta a
    # cero: solo cuentan los fallos posteriores.
    ultimo_reinicio = (
        db.query(func.max(IntentoAcceso.momento))
        .filter(
            IntentoAcceso.email == email,
            or_(
                and_(IntentoAcceso.tipo == "login", IntentoAcceso.resultado == "exito"),
                IntentoAcceso.tipo == "restablecimiento",
            ),
        )
        .scalar()
    )
    corte = max(desde, ultimo_reinicio) if ultimo_reinicio else desde

    fallos = (
        db.query(IntentoAcceso.momento)
        .filter(
            IntentoAcceso.email == email,
            IntentoAcceso.tipo == "login",
            IntentoAcceso.resultado == "fallo",
            IntentoAcceso.momento > corte,
        )
        .order_by(IntentoAcceso.momento.desc())
        .limit(MAX_FALLOS_CUENTA)
        .all()
    )
    if len(fallos) >= MAX_FALLOS_CUENTA:
        return _minutos_hasta_que_salga(fallos[-1].momento, ahora, VENTANA_LOGIN)
    return None


def bloqueo_recuperacion_ip(db: Session, ip: str) -> bool:
    desde = reloj.ahora_utc() - VENTANA_RECUPERACION
    n = db.query(IntentoAcceso).filter(
        IntentoAcceso.ip == ip,
        IntentoAcceso.tipo == "recuperacion",
        IntentoAcceso.resultado != "bloqueado",
        IntentoAcceso.momento > desde,
    ).count()
    return n >= MAX_RECUPERACION_IP


def recuperacion_email_agotada(db: Session, email: str) -> bool:
    """Si ya se enviaron los emails de recuperacion permitidos esta hora."""
    desde = reloj.ahora_utc() - VENTANA_RECUPERACION
    n = db.query(IntentoAcceso).filter(
        IntentoAcceso.email == normalizar_email(email),
        IntentoAcceso.tipo == "recuperacion",
        IntentoAcceso.resultado == "exito",
        IntentoAcceso.momento > desde,
    ).count()
    return n >= MAX_RECUPERACION_EMAIL


def marcar_restablecimiento(db: Session, email: str, ip: str) -> None:
    """La contrasena se ha restablecido: desbloquea el login de la cuenta."""
    registrar_intento(db, "restablecimiento", email, ip, "exito")


def limpiar_antiguos(db: Session) -> None:
    """Intentos de mas de 90 dias y enlaces caducados hace mas de 30."""
    ahora = reloj.ahora_utc()
    db.query(IntentoAcceso).filter(IntentoAcceso.momento < ahora - RETENCION_INTENTOS).delete()
    db.query(TokenCuenta).filter(TokenCuenta.caduca_en < ahora - RETENCION_TOKENS_CADUCADOS).delete()
    db.commit()

from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from .auth import SECRET_KEY, ALGORITHM
from .database import get_db
from .models import DispositivoIoT, Parcela, ParcelaUsuario, Usuario

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Usuario:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudieron validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        sub: Optional[str] = payload.get("sub")
        if sub is None:
            raise credentials_exception
        user_id = int(sub)
    except (JWTError, ValueError):
        raise credentials_exception

    # Si es un token asignado a un dispositivo IoT de 100 años, verificar que siga activo y no haya sido revocado
    device_id = payload.get("device_id")
    if device_id is not None:
        dispositivo = db.query(DispositivoIoT).filter(DispositivoIoT.id == int(device_id)).first()
        if dispositivo is None or not dispositivo.activo:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="El token de este dispositivo ha sido cancelado o revocado.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        dispositivo.ultimo_uso = datetime.now(timezone.utc).replace(tzinfo=None)
        db.commit()

    user = db.query(Usuario).filter(Usuario.id == user_id).first()
    if user is None:
        raise credentials_exception
    return user



def get_current_dispositivo(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> DispositivoIoT:
    """
    Resuelve el dispositivo IoT dueño del token, para los endpoints que
    consume el propio firmware. A diferencia de get_current_user, aquí lo
    que importa es qué aparato llama, no qué usuario lo dio de alta.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudieron validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise credentials_exception

    device_id = payload.get("device_id")
    if payload.get("tipo") != "dispositivo_iot" or device_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Este endpoint solo lo pueden usar los dispositivos IoT con su propio token.",
        )

    try:
        device_id = int(device_id)
    except (TypeError, ValueError):
        raise credentials_exception

    dispositivo = db.query(DispositivoIoT).filter(DispositivoIoT.id == device_id).first()
    if dispositivo is None or not dispositivo.activo:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="El token de este dispositivo ha sido cancelado o revocado.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    dispositivo.ultimo_uso = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    return dispositivo


ROL_ADMIN = "admin"
ROL_GESTOR = "gestor"
ROL_LECTURA = "lectura"

EMAIL_SUPERADMIN = "admin@vinalert.dev"


def es_superadmin(user: Usuario) -> bool:
    """Comprueba si el usuario es el administrador maestro del sistema."""
    return user.email.strip().lower() == EMAIL_SUPERADMIN or (user.rol == ROL_ADMIN and user.email.strip().lower() == EMAIL_SUPERADMIN)


def require_superadmin(current_user: Usuario = Depends(get_current_user)) -> Usuario:
    """Exige que el usuario autenticado sea admin@vinalert.dev."""
    if not es_superadmin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso restringido exclusivamente al administrador (admin@vinalert.dev).",
        )
    return current_user



def _parcela_o_404(parcela_id: int, db: Session) -> Parcela:
    parcela = db.query(Parcela).filter(Parcela.id == parcela_id).first()
    if parcela is None:
        raise HTTPException(status_code=404, detail="Parcela no encontrada")
    return parcela


def _miembro(parcela_id: int, usuario_id: int, db: Session) -> Optional[ParcelaUsuario]:
    return db.query(ParcelaUsuario).filter(
        ParcelaUsuario.parcela_id == parcela_id,
        ParcelaUsuario.usuario_id == usuario_id,
    ).first()


def parcela_con_lectura(parcela_id: int, current_user: Usuario, db: Session) -> Parcela:
    """
    Devuelve la parcela si el usuario esta asociado con cualquier rol, o si es
    admin. 404 en cualquier otro caso: un 403 aqui confirmaria que la parcela
    existe a alguien que no tiene por que saberlo.
    """
    if current_user.rol == ROL_ADMIN:
        return _parcela_o_404(parcela_id, db)

    if _miembro(parcela_id, current_user.id, db) is None:
        raise HTTPException(status_code=404, detail="Parcela no encontrada")
    return _parcela_o_404(parcela_id, db)


def parcela_con_gestion(parcela_id: int, current_user: Usuario, db: Session) -> Parcela:
    """
    Devuelve la parcela si el usuario esta asociado como gestor, o si es admin.

    El ORDEN de las comprobaciones es parte del contrato: primero se determina
    si el usuario ve la parcela (miembro o admin) y solo entonces se distingue
    entre 403 y 404. Comprobar el rol antes que la pertenencia filtraria la
    existencia de parcelas ajenas por el codigo de estado.
    """
    if current_user.rol == ROL_ADMIN:
        return _parcela_o_404(parcela_id, db)

    miembro = _miembro(parcela_id, current_user.id, db)
    if miembro is None:
        raise HTTPException(status_code=404, detail="Parcela no encontrada")
    if miembro.rol != ROL_GESTOR:
        raise HTTPException(
            status_code=403,
            detail="Necesitas permiso de gestion sobre esta parcela",
        )
    return _parcela_o_404(parcela_id, db)

from datetime import datetime, timezone
from typing import Optional, Union

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from .auth import SECRET_KEY, ALGORITHM
from .database import get_db
from .models import DispositivoIoT, Parcela, ParcelaUsuario, Usuario

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")


TIPO_TOKEN_DISPOSITIVO = "dispositivo_iot"


def _credenciales_invalidas() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudieron validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _decodificar(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise _credenciales_invalidas()


def _es_token_de_dispositivo(payload: dict) -> bool:
    # Los tokens antiguos de ESP32 llevaban sub = id del admin que los creo;
    # el tipo (o el device_id) es lo que los distingue de una sesion.
    return payload.get("tipo") == TIPO_TOKEN_DISPOSITIVO or payload.get("device_id") is not None


def _usuario_del_token(payload: dict, db: Session) -> Usuario:
    try:
        user_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        raise _credenciales_invalidas()
    user = db.query(Usuario).filter(Usuario.id == user_id).first()
    if user is None:
        raise _credenciales_invalidas()
    return user


def _dispositivo_del_token(payload: dict, db: Session) -> DispositivoIoT:
    try:
        device_id = int(payload.get("device_id"))
    except (TypeError, ValueError):
        raise _credenciales_invalidas()

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


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Usuario:
    """
    La persona que ha iniciado sesion. Un token de ESP32 NUNCA vale aqui: va
    grabado en un aparato que esta en el campo, y quien lo sacase entraria
    como el admin que lo creo (para eso estan get_current_dispositivo y
    get_emisor_lecturas).
    """
    payload = _decodificar(token)
    if _es_token_de_dispositivo(payload):
        raise _credenciales_invalidas()
    return _usuario_del_token(payload, db)


def get_current_dispositivo(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> DispositivoIoT:
    """
    Resuelve el dispositivo IoT dueño del token, para los endpoints que
    consume el propio firmware. A diferencia de get_current_user, aquí lo
    que importa es qué aparato llama, no qué usuario lo dio de alta.
    """
    payload = _decodificar(token)
    if not _es_token_de_dispositivo(payload):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Este endpoint solo lo pueden usar los dispositivos IoT con su propio token.",
        )
    return _dispositivo_del_token(payload, db)


def get_emisor_lecturas(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Union[Usuario, DispositivoIoT]:
    """
    Quien sube una lectura de sensor: el ESP32 con su token (lo normal) o una
    persona con sesion (cargas manuales, scripts). El endpoint decide despues
    a que parcela puede escribir cada uno.
    """
    payload = _decodificar(token)
    if _es_token_de_dispositivo(payload):
        return _dispositivo_del_token(payload, db)
    return _usuario_del_token(payload, db)


ROL_ADMIN = "admin"
ROL_GESTOR = "gestor"
ROL_LECTURA = "lectura"

def es_superadmin(user: Usuario) -> bool:
    """
    Si el usuario es el administrador del sistema. Lo dice la marca de la BD,
    nunca el email: el registro es publico y cualquiera podria registrar el
    email "del admin" en una BD donde esa cuenta aun no exista.
    """
    return bool(user.es_superadmin)


def require_superadmin(current_user: Usuario = Depends(get_current_user)) -> Usuario:
    """Exige que el usuario autenticado sea el superadmin."""
    if not es_superadmin(current_user):
        # Sin nombrar la cuenta de admin: seria regalar a quien tantea el
        # objetivo de un ataque de contrasenas.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso restringido al administrador del sistema.",
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

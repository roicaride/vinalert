from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import crear_token_sesion, verificar_password
from ..database import get_db
from ..deps import es_superadmin, get_current_user
from ..models import Usuario
from ..schemas import Token, UsuarioMeResp
from ..services import limites

router = APIRouter(prefix="/auth", tags=["auth"])


def ip_cliente(request: Request) -> str:
    # Detras de un proxy, la API debe arrancarse con --proxy-headers para que
    # esto sea la IP real y no la del proxy (README, "Despliegue").
    return request.client.host if request.client else "desconocida"


def _demasiados_intentos(minutos: int) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail={"codigo": "demasiados_intentos", "minutos": minutos},
        headers={"Retry-After": str(minutos * 60)},
    )


@router.post("/token", response_model=Token)
def login_for_access_token(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
) -> Any:
    email = limites.normalizar_email(form_data.username)
    ip = ip_cliente(request)

    minutos = limites.bloqueo_login(db, email, ip)
    if minutos is not None:
        limites.registrar_intento(db, "login", email, ip, "bloqueado")
        raise _demasiados_intentos(minutos)

    user = db.query(Usuario).filter(func.lower(Usuario.email) == email).first()
    # Sin cuenta o con la cuenta pendiente se verifica igualmente (contra un
    # hash ficticio): mismo tiempo de respuesta en todos los casos.
    if not verificar_password(form_data.password, user.hashed_password if user else None):
        limites.registrar_intento(db, "login", email, ip, "fallo")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    limites.registrar_intento(db, "login", email, ip, "exito")
    return Token(access_token=crear_token_sesion(user), token_type="bearer")


@router.get("/me", response_model=UsuarioMeResp)
def usuario_actual(current_user: Usuario = Depends(get_current_user)) -> Any:
    """
    Quien soy. Sin esto la aplicacion web no puede saber, tras recargar la
    pagina, ni tu nombre ni si eres admin — y por tanto no puede decidir que
    acciones mostrarte.
    """
    return UsuarioMeResp(
        id=current_user.id,
        nombre=current_user.nombre,
        email=current_user.email,
        rol=current_user.rol,
        es_superadmin=es_superadmin(current_user),
    )

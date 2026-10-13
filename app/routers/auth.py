from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import crear_token_sesion, obtener_password_hash, verificar_password
from ..database import get_db
from ..deps import es_superadmin, get_current_user
from ..models import Usuario
from ..schemas import RecuperarPassword, RestablecerPassword, Token, UsuarioMeResp
from ..services import limites, tokens_cuenta

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


RESPUESTA_RECUPERAR = {"detail": "Si hay una cuenta con ese email, te hemos enviado un enlace."}


def enlace_invalido() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={"codigo": "enlace_invalido", "mensaje": "El enlace no es válido: ha caducado o ya se ha usado."},
    )


@router.post("/recuperar", status_code=202)
def recuperar_password(
    body: RecuperarPassword,
    request: Request,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
) -> Any:
    """
    Siempre la misma respuesta, exista o no la cuenta, y el email sale en
    segundo plano: ni el contenido ni el tiempo de respuesta delatan que emails
    estan registrados. El limite por email tampoco se nota: un 429 aqui
    confirmaria que la cuenta existe. El de IP si, porque no revela nada.
    """
    ip = ip_cliente(request)
    if limites.bloqueo_recuperacion_ip(db, ip):
        limites.registrar_intento(db, "recuperacion", body.email, ip, "bloqueado")
        raise _demasiados_intentos(60)

    user = db.query(Usuario).filter(func.lower(Usuario.email) == body.email).first()
    if user is None:
        limites.registrar_intento(db, "recuperacion", body.email, ip, "fallo")
    elif limites.recuperacion_email_agotada(db, body.email):
        limites.registrar_intento(db, "recuperacion", body.email, ip, "bloqueado")
    else:
        limites.registrar_intento(db, "recuperacion", body.email, ip, "exito")
        if user.pendiente:
            # Aun no ha aceptado la invitacion: lo que necesita es ese enlace.
            tokens_cuenta.enviar_invitacion_a(db, user, background)
        else:
            tokens_cuenta.enviar_recuperacion_a(db, user, background)
    return RESPUESTA_RECUPERAR


@router.post("/restablecer", status_code=204)
def restablecer_password(
    body: RestablecerPassword,
    request: Request,
    db: Session = Depends(get_db),
) -> Response:
    try:
        user = tokens_cuenta.consumir(db, body.token, tokens_cuenta.RECUPERACION)
    except tokens_cuenta.TokenInvalido:
        raise enlace_invalido()

    user.hashed_password = obtener_password_hash(body.password)
    # Cierra todas las sesiones abiertas: si alguien tenia la contrasena
    # vieja, tambien tenia una sesion.
    user.token_version += 1
    db.commit()
    limites.marcar_restablecimiento(db, user.email, ip_cliente(request))
    return Response(status_code=204)

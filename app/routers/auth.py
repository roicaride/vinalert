from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import crear_token_sesion, obtener_password_hash, verificar_password
from ..database import get_db
from ..deps import ROL_GESTOR, es_superadmin, get_current_user
from ..models import ParcelaUsuario, Usuario
from ..schemas import (
    AceptarInvitacion,
    CambiarPassword,
    InvitacionInfo,
    RecuperarPassword,
    RestablecerPassword,
    Token,
    UsuarioMeResp,
)
from ..services import limites, tokens_cuenta

router = APIRouter(prefix="/auth", tags=["auth"])


LONGITUD_MAXIMA_EMAIL = 254


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
    # Un email no pasa de 254 caracteres. Sin este tope, cualquiera podria
    # guardar megas en intentos_acceso con cada peticion.
    if len(form_data.username) > LONGITUD_MAXIMA_EMAIL:
        raise HTTPException(status_code=422, detail="El email es demasiado largo.")
    email = limites.normalizar_email(form_data.username)
    ip = ip_cliente(request)

    # Lo rechazado por el limite no se guarda: no cuenta para nada y
    # guardarlo dejaria llenar la tabla sin autenticarse.
    minutos = limites.bloqueo_login(db, email, ip)
    if minutos is not None:
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
    if not user.activo:
        # Solo se dice con la contrasena correcta: a quien la prueba sin
        # saberla no se le revela que la cuenta existe.
        limites.registrar_intento(db, "login", email, ip, "fallo")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"codigo": "cuenta_desactivada", "mensaje": "Esta cuenta está desactivada. Habla con el administrador."},
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
        raise _demasiados_intentos(60)

    user = db.query(Usuario).filter(func.lower(Usuario.email) == body.email).first()
    if user is None or not user.activo:
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
    # vieja, tambien tenia una sesion. Y cualquier otro enlace de
    # recuperacion que siguiera vivo.
    user.token_version += 1
    tokens_cuenta.anular(db, user, tokens_cuenta.RECUPERACION)
    db.commit()
    limites.marcar_restablecimiento(db, user.email, ip_cliente(request))
    return Response(status_code=204)


@router.get("/invitacion", response_model=InvitacionInfo)
def ver_invitacion(token: str, db: Session = Depends(get_db)) -> Any:
    """Para la pantalla de bienvenida: a quien se invita, quien y a donde."""
    try:
        fila = tokens_cuenta.consultar(db, token, tokens_cuenta.INVITACION)
    except tokens_cuenta.TokenInvalido:
        raise enlace_invalido()
    return InvitacionInfo(
        email=fila.usuario.email,
        invitado_por=fila.creado_por.nombre if fila.creado_por else None,
        parcela=fila.parcela.nombre if fila.parcela else None,
    )


@router.post("/invitacion/aceptar", response_model=Token)
def aceptar_invitacion(body: AceptarInvitacion, db: Session = Depends(get_db)) -> Any:
    """Activa la cuenta y deja la sesion iniciada: no hace falta otro login."""
    try:
        user = tokens_cuenta.consumir(db, body.token, tokens_cuenta.INVITACION)
    except tokens_cuenta.TokenInvalido:
        raise enlace_invalido()
    if not user.pendiente or not user.activo:
        db.rollback()
        raise enlace_invalido()

    user.nombre = body.nombre
    user.hashed_password = obtener_password_hash(body.password)
    db.commit()
    return Token(access_token=crear_token_sesion(user), token_type="bearer")


@router.post("/invitaciones/{usuario_id}/reenviar", status_code=204)
def reenviar_invitacion(
    usuario_id: int,
    background: BackgroundTasks,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """
    Lo puede hacer el superadmin o un gestor de alguna parcela de esa persona.
    A cualquier otro, 404: como con una parcela ajena, no se confirma que la
    cuenta exista.
    """
    invitado = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if invitado is None:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    parcela = None
    if not es_superadmin(current_user):
        parcelas_del_invitado = db.query(ParcelaUsuario.parcela_id).filter(ParcelaUsuario.usuario_id == invitado.id)
        comun = (
            db.query(ParcelaUsuario)
            .filter(
                ParcelaUsuario.usuario_id == current_user.id,
                ParcelaUsuario.rol == ROL_GESTOR,
                ParcelaUsuario.parcela_id.in_(parcelas_del_invitado),
            )
            .first()
        )
        if comun is None:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        parcela = comun.parcela

    if not invitado.pendiente:
        raise HTTPException(status_code=409, detail="Esa persona ya ha activado su cuenta.")

    tokens_cuenta.enviar_invitacion_a(db, invitado, background, creado_por=current_user, parcela=parcela)
    return Response(status_code=204)


@router.post("/cambiar-password", response_model=Token)
def cambiar_password(
    body: CambiarPassword,
    request: Request,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    """
    Cierra las demas sesiones y devuelve una nueva, para que quien la cambia
    siga dentro. Fallar la contrasena actual cuenta como un login fallido: con
    una sesion robada tampoco se pueden probar contrasenas sin limite.
    """
    ip = ip_cliente(request)
    minutos = limites.bloqueo_login(db, current_user.email, ip)
    if minutos is not None:
        raise _demasiados_intentos(minutos)
    if not verificar_password(body.actual, current_user.hashed_password):
        limites.registrar_intento(db, "login", current_user.email, ip, "fallo")
        raise HTTPException(status_code=400, detail="La contraseña actual no es correcta.")

    current_user.hashed_password = obtener_password_hash(body.nueva)
    current_user.token_version += 1
    # Quien cambia la contraseña por si se la han robado espera que los
    # enlaces de recuperacion que haya por ahi dejen de valer.
    tokens_cuenta.anular(db, current_user, tokens_cuenta.RECUPERACION)
    db.commit()
    return Token(access_token=crear_token_sesion(current_user), token_type="bearer")


@router.post("/cerrar-sesiones", status_code=204)
def cerrar_sesiones(
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Cerrar sesion en todos los dispositivos, este incluido."""
    current_user.token_version += 1
    db.commit()
    return Response(status_code=204)

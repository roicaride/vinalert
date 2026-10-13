from datetime import datetime, timedelta
from typing import Any, List, Optional
from zoneinfo import ZoneInfo
import os

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import ROL_ADMIN, ROL_GESTOR, require_superadmin
from ..models import DispositivoIoT, EstadoJob, IntentoAcceso, Parcela, ParcelaUsuario, TokenCuenta, Usuario
from ..schemas import (
    CuentaAdminUpdate,
    DispositivoEstadoResp,
    EstadoJobResp,
    EstadoSistemaResp,
    IntentoAccesoResp,
    InvitacionAdminCreate,
    UsuarioAdminResp,
)
from ..services import estado_jobs, limites, reloj, tokens_cuenta

router = APIRouter(prefix="/admin", tags=["admin"])


def _fila(u: Usuario, n_parcelas: int) -> UsuarioAdminResp:
    return UsuarioAdminResp(
        id=u.id,
        nombre=u.nombre,
        email=u.email,
        telefono=u.telefono,
        rol=u.rol,
        creado_en=u.creado_en,
        n_parcelas=n_parcelas,
        pendiente=u.pendiente,
        activo=u.activo,
        es_superadmin=u.es_superadmin,
        acceso_total=u.rol == ROL_ADMIN,
    )


def _cuenta_o_404(usuario_id: int, db: Session) -> Usuario:
    u = db.query(Usuario).filter(Usuario.id == usuario_id, Usuario.eliminado_en.is_(None)).first()
    if u is None:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")
    return u


def _n_parcelas(usuario_id: int, db: Session) -> int:
    return db.query(ParcelaUsuario).filter(ParcelaUsuario.usuario_id == usuario_id).count()


def _superadmins_activos(db: Session) -> int:
    return db.query(Usuario).filter(Usuario.es_superadmin.is_(True), Usuario.activo.is_(True)).count()


@router.get("/usuarios", response_model=List[UsuarioAdminResp])
def listar_usuarios(
    _admin: Usuario = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> Any:
    """
    Todas las cuentas, de la alta mas reciente a la mas antigua, con cuantas
    parcelas tiene cada una. Las cuentas sin fecha de alta (anteriores a que se
    guardase) van al final.

    Solo para el superadmin: es un listado de datos personales (nombre y
    email) y no lo puede ver nadie mas.
    """
    n_parcelas = (
        db.query(ParcelaUsuario.usuario_id, func.count(ParcelaUsuario.parcela_id).label("n"))
        .group_by(ParcelaUsuario.usuario_id)
        .subquery()
    )
    filas = (
        db.query(Usuario, func.coalesce(n_parcelas.c.n, 0))
        .outerjoin(n_parcelas, n_parcelas.c.usuario_id == Usuario.id)
        .filter(Usuario.eliminado_en.is_(None))
        .order_by(Usuario.creado_en.is_(None), Usuario.creado_en.desc(), Usuario.id.desc())
        .all()
    )
    return [_fila(u, n) for u, n in filas]


@router.post("/invitaciones", response_model=UsuarioAdminResp, status_code=201)
def invitar_cliente(
    body: InvitacionAdminCreate,
    background: BackgroundTasks,
    admin: Usuario = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> Any:
    """
    Da de alta a un cliente nuevo: una cuenta pendiente, sin parcelas, y el
    email de invitacion. El cliente crea despues sus parcelas e invita a su
    gente.
    """
    if db.query(Usuario).filter(func.lower(Usuario.email) == body.email).first() is not None:
        raise HTTPException(status_code=409, detail="Ya hay una cuenta con ese email.")

    usuario = Usuario(nombre=body.nombre, email=body.email, hashed_password=None, rol="agricultor")
    db.add(usuario)
    db.commit()
    tokens_cuenta.enviar_invitacion_a(db, usuario, background, creado_por=admin)
    return _fila(usuario, 0)


@router.patch("/usuarios/{usuario_id}", response_model=UsuarioAdminResp)
def editar_cuenta(
    usuario_id: int,
    body: CuentaAdminUpdate,
    admin: Usuario = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> Any:
    """
    Desactivar o reactivar, conceder o quitar el superadmin y el acceso a
    todas las parcelas. Nadie se desactiva ni se quita el superadmin a si
    mismo: asi nunca se queda el sistema sin nadie que lo administre.
    """
    u = _cuenta_o_404(usuario_id, db)
    propia = u.id == admin.id

    if body.activo is False and propia:
        raise HTTPException(status_code=409, detail="No puedes desactivar tu propia cuenta.")
    if body.es_superadmin is False and propia:
        raise HTTPException(status_code=409, detail="No puedes quitarte el superadmin a ti mismo: pídeselo a otro superadmin.")
    quita_superadmin = u.es_superadmin and (body.es_superadmin is False or body.activo is False)
    if quita_superadmin and _superadmins_activos(db) <= 1:
        raise HTTPException(status_code=409, detail="Tiene que quedar al menos un superadmin.")

    if body.activo is not None and body.activo != u.activo:
        u.activo = body.activo
        if not body.activo:
            u.token_version += 1  # fuera todas sus sesiones abiertas
    if body.es_superadmin is not None:
        u.es_superadmin = body.es_superadmin
    if body.acceso_total is not None:
        u.rol = ROL_ADMIN if body.acceso_total else "agricultor"
    db.commit()
    return _fila(u, _n_parcelas(u.id, db))


@router.delete("/usuarios/{usuario_id}", status_code=204)
def eliminar_cuenta(
    usuario_id: int,
    admin: Usuario = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> Response:
    """
    Derecho de supresion: borra nombre, email, telefono, contrasena, accesos a
    parcelas, enlaces pendientes y su registro de accesos. Las parcelas, sus
    lecturas y sus tratamientos se quedan: son de la explotacion y el cuaderno
    fitosanitario se conserva tres anos.
    """
    u = _cuenta_o_404(usuario_id, db)
    if u.id == admin.id:
        raise HTTPException(status_code=409, detail="No puedes eliminar tu propia cuenta.")
    if u.es_superadmin and _superadmins_activos(db) <= 1:
        raise HTTPException(status_code=409, detail="Tiene que quedar al menos un superadmin.")

    # Una parcela sin gestor no la puede administrar nadie mas que el admin.
    huerfanas = []
    for m in db.query(ParcelaUsuario).filter(ParcelaUsuario.usuario_id == u.id, ParcelaUsuario.rol == ROL_GESTOR):
        gestores = db.query(ParcelaUsuario).filter(
            ParcelaUsuario.parcela_id == m.parcela_id, ParcelaUsuario.rol == ROL_GESTOR,
        ).count()
        if gestores == 1:
            huerfanas.append(db.get(Parcela, m.parcela_id).nombre)
    if huerfanas:
        raise HTTPException(
            status_code=409,
            detail="Es la única gestora de: " + ", ".join(huerfanas) + ". Nombra antes a otra persona gestora.",
        )

    email_original = u.email
    db.query(ParcelaUsuario).filter(ParcelaUsuario.usuario_id == u.id).delete(synchronize_session=False)
    db.query(TokenCuenta).filter(TokenCuenta.usuario_id == u.id).delete(synchronize_session=False)
    db.query(TokenCuenta).filter(TokenCuenta.creado_por_id == u.id).update(
        {TokenCuenta.creado_por_id: None}, synchronize_session=False,
    )
    db.query(IntentoAcceso).filter(func.lower(IntentoAcceso.email) == email_original.lower()).delete(
        synchronize_session=False,
    )
    u.nombre = "Cuenta eliminada"
    u.email = f"eliminada-{u.id}@cuentas.invalid"
    u.telefono = None
    u.hashed_password = None
    u.activo = False
    u.es_superadmin = False
    u.rol = "agricultor"
    u.token_version += 1
    u.eliminado_en = reloj.ahora_utc()
    db.commit()
    return Response(status_code=204)


@router.post("/usuarios/{usuario_id}/restablecer", status_code=202)
def enviar_restablecer(
    usuario_id: int,
    background: BackgroundTasks,
    admin: Usuario = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> Any:
    """Envia a esa persona un enlace para elegir contrasena (o su invitacion, si esta pendiente)."""
    u = _cuenta_o_404(usuario_id, db)
    if not u.activo:
        raise HTTPException(status_code=409, detail="La cuenta está desactivada: reactívala antes.")
    if u.pendiente:
        tokens_cuenta.enviar_invitacion_a(db, u, background, creado_por=admin)
    else:
        tokens_cuenta.enviar_recuperacion_a(db, u, background)
    return {"detail": f"Enlace enviado a {u.email}."}


@router.get("/estado", response_model=EstadoSistemaResp)
def estado_del_sistema(
    _admin: Usuario = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> Any:
    """Lo que antes solo se sabia mirando los logs: si los jobs corren y que aparatos se han callado."""
    guardados = {e.job_id: e for e in db.query(EstadoJob).all()}
    jobs = []
    for job_id in sorted(set(estado_jobs.JOBS_CONOCIDOS) | set(guardados)):
        e = guardados.get(job_id)
        jobs.append(EstadoJobResp(
            job_id=job_id,
            nombre=estado_jobs.JOBS_CONOCIDOS.get(job_id, job_id),
            ultimo_inicio=e.ultimo_inicio if e else None,
            ultimo_fin=e.ultimo_fin if e else None,
            ultimo_exito=e.ultimo_exito if e else None,
            procesadas=e.procesadas if e else None,
            fallos=e.fallos if e else None,
            ultimo_error=e.ultimo_error if e else None,
        ))

    # ultimo_uso se guarda en UTC sin zona (deps._dispositivo_del_token).
    ahora_utc = reloj.ahora_utc()
    dispositivos = []
    filas = (
        db.query(DispositivoIoT, Parcela.nombre)
        .join(Parcela, Parcela.id == DispositivoIoT.parcela_id)
        .order_by(Parcela.nombre, DispositivoIoT.nombre)
        .all()
    )
    for d, parcela in filas:
        sin_senal = (
            d.activo
            and d.ultimo_uso is not None
            and ahora_utc - d.ultimo_uso > timedelta(seconds=2 * d.intervalo_ciclo_seg)
        )
        dispositivos.append(DispositivoEstadoResp(
            id=d.id, nombre=d.nombre, parcela_id=d.parcela_id, parcela=parcela, activo=d.activo,
            ultimo_uso=d.ultimo_uso, intervalo_ciclo_seg=d.intervalo_ciclo_seg, sin_senal=bool(sin_senal),
        ))

    return EstadoSistemaResp(
        hora_servidor=datetime.now(ZoneInfo("Europe/Madrid")).replace(tzinfo=None),
        correo_configurado=bool(os.getenv("SMTP_HOST")),
        proveedor_clima=os.getenv("WEATHER_PROVIDER", "open_meteo"),
        jobs=jobs,
        dispositivos=dispositivos,
    )


@router.get("/accesos", response_model=List[IntentoAccesoResp])
def registro_de_accesos(
    email: Optional[str] = Query(None, max_length=254),
    resultado: Optional[str] = Query(None, pattern="^(exito|fallo|bloqueado)$"),
    antes_de: Optional[int] = Query(None, ge=1, description="id del ultimo de la pagina anterior"),
    limite: int = Query(100, ge=1, le=500),
    _admin: Usuario = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> Any:
    """Intentos de login y de recuperacion, del mas reciente al mas antiguo (se guardan 90 dias)."""
    q = db.query(IntentoAcceso)
    if email:
        q = q.filter(IntentoAcceso.email == limites.normalizar_email(email))
    if resultado:
        q = q.filter(IntentoAcceso.resultado == resultado)
    if antes_de:
        # Cursor (momento, id): estable aunque dos intentos compartan instante.
        ref = db.get(IntentoAcceso, antes_de)
        if ref is not None:
            q = q.filter(or_(
                IntentoAcceso.momento < ref.momento,
                and_(IntentoAcceso.momento == ref.momento, IntentoAcceso.id < ref.id),
            ))
    return q.order_by(IntentoAcceso.momento.desc(), IntentoAcceso.id.desc()).limit(limite).all()

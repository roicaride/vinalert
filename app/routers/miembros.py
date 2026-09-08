from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import ROL_GESTOR, get_current_user, parcela_con_gestion, parcela_con_lectura
from ..models import ParcelaUsuario, Usuario
from ..schemas import MiembroCreate, MiembroResp, MiembroUpdate

router = APIRouter(prefix="/parcelas/{parcela_id}/usuarios", tags=["miembros"])


def _a_resp(miembro: ParcelaUsuario, usuario: Usuario) -> MiembroResp:
    return MiembroResp(
        usuario_id=usuario.id, nombre=usuario.nombre, email=usuario.email, rol=miembro.rol
    )


def _cuantos_gestores(parcela_id: int, db: Session) -> int:
    return db.query(ParcelaUsuario).filter(
        ParcelaUsuario.parcela_id == parcela_id,
        ParcelaUsuario.rol == ROL_GESTOR,
    ).count()


def _miembro_o_404(parcela_id: int, usuario_id: int, db: Session) -> ParcelaUsuario:
    miembro = db.query(ParcelaUsuario).filter(
        ParcelaUsuario.parcela_id == parcela_id,
        ParcelaUsuario.usuario_id == usuario_id,
    ).first()
    if miembro is None:
        raise HTTPException(status_code=404, detail="Ese usuario no tiene acceso a esta parcela")
    return miembro


@router.get("", response_model=List[MiembroResp])
def listar_miembros(
    parcela_id: int,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    """Cualquier miembro puede ver con quien comparte la parcela: le concierne."""
    parcela_con_lectura(parcela_id, current_user, db)
    filas = db.query(ParcelaUsuario, Usuario).join(
        Usuario, Usuario.id == ParcelaUsuario.usuario_id
    ).filter(ParcelaUsuario.parcela_id == parcela_id).all()
    return [_a_resp(m, u) for m, u in filas]


@router.post("", response_model=MiembroResp, status_code=201)
def anadir_miembro(
    parcela_id: int,
    body: MiembroCreate,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    parcela_con_gestion(parcela_id, current_user, db)

    usuario = db.query(Usuario).filter(Usuario.email == body.email).first()
    if usuario is None:
        # Error mas probable en uso real: el frontend necesita poder explicarlo.
        raise HTTPException(
            status_code=404,
            detail="No hay ninguna cuenta con ese email. Esa persona debe registrarse primero.",
        )

    ya = db.query(ParcelaUsuario).filter(
        ParcelaUsuario.parcela_id == parcela_id,
        ParcelaUsuario.usuario_id == usuario.id,
    ).first()
    if ya is not None:
        raise HTTPException(status_code=409, detail="Ese usuario ya tiene acceso a esta parcela")

    miembro = ParcelaUsuario(parcela_id=parcela_id, usuario_id=usuario.id, rol=body.rol)
    db.add(miembro)
    db.commit()
    return _a_resp(miembro, usuario)


@router.patch("/{usuario_id}", response_model=MiembroResp)
def cambiar_rol(
    parcela_id: int,
    usuario_id: int,
    body: MiembroUpdate,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    parcela_con_gestion(parcela_id, current_user, db)
    miembro = _miembro_o_404(parcela_id, usuario_id, db)

    if miembro.rol == ROL_GESTOR and body.rol != ROL_GESTOR and _cuantos_gestores(parcela_id, db) == 1:
        raise HTTPException(
            status_code=409,
            detail="No puedes dejar la parcela sin ningun gestor: nombra a otro antes.",
        )

    miembro.rol = body.rol
    db.flush()
    # Red de seguridad contra la carrera: dos peticiones concurrentes sobre
    # DOS gestores distintos pueden pasar la comprobacion de arriba a la vez
    # (cada una ve "count == 2" antes de que la otra confirme su cambio).
    # Se vuelve a contar despues del flush, dentro de la misma transaccion
    # que va a hacer commit; si cae a 0, se deshace TODO el cambio.
    if _cuantos_gestores(parcela_id, db) == 0:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="No puedes dejar la parcela sin ningun gestor: nombra a otro antes.",
        )
    db.commit()
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    return _a_resp(miembro, usuario)


@router.delete("/{usuario_id}", status_code=204)
def retirar_miembro(
    parcela_id: int,
    usuario_id: int,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    parcela_con_gestion(parcela_id, current_user, db)
    miembro = _miembro_o_404(parcela_id, usuario_id, db)

    if miembro.rol == ROL_GESTOR and _cuantos_gestores(parcela_id, db) == 1:
        raise HTTPException(
            status_code=409,
            detail="No puedes dejar la parcela sin ningun gestor: nombra a otro antes.",
        )

    db.delete(miembro)
    db.flush()
    # Misma red de seguridad que en cambiar_rol: ver el comentario alli.
    if _cuantos_gestores(parcela_id, db) == 0:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="No puedes dejar la parcela sin ningun gestor: nombra a otro antes.",
        )
    db.commit()

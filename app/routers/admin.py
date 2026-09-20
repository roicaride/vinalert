from typing import Any, List

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_superadmin
from ..models import ParcelaUsuario, Usuario
from ..schemas import UsuarioAdminResp

router = APIRouter(prefix="/admin", tags=["admin"])


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
        .order_by(Usuario.creado_en.is_(None), Usuario.creado_en.desc(), Usuario.id.desc())
        .all()
    )
    return [
        UsuarioAdminResp(
            id=u.id,
            nombre=u.nombre,
            email=u.email,
            telefono=u.telefono,
            rol=u.rol,
            creado_en=u.creado_en,
            n_parcelas=n,
        )
        for u, n in filas
    ]

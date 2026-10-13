from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_superadmin
from ..models import Configuracion, Usuario
from ..schemas import ConfiguracionPublica, ConfiguracionUpdate

router = APIRouter(tags=["configuracion"])


def leer(db: Session) -> ConfiguracionPublica:
    guardado = {c.clave: c.valor for c in db.query(Configuracion).all()}
    return ConfiguracionPublica(**{k: guardado.get(k) for k in ConfiguracionPublica.model_fields})


@router.get("/configuracion/publica", response_model=ConfiguracionPublica)
def configuracion_publica(db: Session = Depends(get_db)) -> Any:
    """
    Sin sesion: la leen la portada y las paginas legales. Solo contiene datos
    que la ley obliga a publicar (titular, contacto, encargado, proveedores).
    """
    return leer(db)


@router.put("/admin/configuracion", response_model=ConfiguracionPublica)
def guardar_configuracion(
    body: ConfiguracionUpdate,
    _admin: Usuario = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> Any:
    """Solo cambia los campos enviados. Un texto vacio vuelve a dejar el dato pendiente."""
    for clave, valor in body.model_dump(exclude_unset=True).items():
        limpio = (valor or "").strip() or None
        fila = db.get(Configuracion, clave) or Configuracion(clave=clave)
        fila.valor = limpio
        db.add(fila)
    db.commit()
    return leer(db)

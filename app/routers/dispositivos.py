from datetime import datetime, timedelta, timezone
from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException
from jose import jwt
from sqlalchemy.orm import Session

from ..auth import ALGORITHM, SECRET_KEY
from ..database import get_db
from ..deps import (
    get_current_dispositivo,
    parcela_con_gestion,
    parcela_con_lectura,
    require_superadmin,
)
from ..models import DispositivoIoT, Usuario
from ..schemas import (
    DispositivoConfigResp,
    DispositivoIoTCreate,
    DispositivoIoTResp,
    DispositivoIoTUpdate,
)

router = APIRouter(tags=["dispositivos"])


@router.get("/parcelas/{parcela_id}/dispositivos", response_model=List[DispositivoIoTResp])
def listar_dispositivos(
    parcela_id: int,
    current_user: Usuario = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> Any:
    parcela_con_lectura(parcela_id, current_user, db)
    return db.query(DispositivoIoT).filter(DispositivoIoT.parcela_id == parcela_id).order_by(DispositivoIoT.id.desc()).all()


@router.post("/parcelas/{parcela_id}/dispositivos", response_model=DispositivoIoTResp, status_code=201)
def crear_dispositivo(
    parcela_id: int,
    body: DispositivoIoTCreate,
    current_user: Usuario = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> Any:
    parcela_con_gestion(parcela_id, current_user, db)

    ahora = datetime.now(timezone.utc)
    # Token con 100 años de duración (100 * 365 días)
    expira_100_anios = ahora + timedelta(days=365 * 100)

    # 1. Crear el registro en la base de datos
    dispositivo = DispositivoIoT(
        parcela_id=parcela_id,
        nombre=body.nombre,
        token="", # Se actualiza inmediatamente tras obtener el id
        activo=True,
        creado_en=ahora.replace(tzinfo=None),
    )
    db.add(dispositivo)
    db.flush()

    # 2. Generar el JWT firmado incluyendo el device_id para permitir revocación
    payload = {
        "sub": str(current_user.id),
        "device_id": dispositivo.id,
        "parcela_id": parcela_id,
        "tipo": "dispositivo_iot",
        "exp": expira_100_anios,
    }
    token_jwt = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

    dispositivo.token = token_jwt
    db.commit()
    db.refresh(dispositivo)
    return dispositivo


@router.get("/dispositivos/configuracion", response_model=DispositivoConfigResp)
def configuracion_del_dispositivo(
    dispositivo: DispositivoIoT = Depends(get_current_dispositivo),
) -> Any:
    """
    Lo consulta el maestro LoRa al principio de cada ciclo, con su propio
    token, para saber cada cuánto debe despertar. El firmware aplica el valor
    en el ciclo siguiente, que es cuando ya puede anunciarlo en el beacon y
    mantener a los esclavos sincronizados.
    """
    return DispositivoConfigResp(
        dispositivo_id=dispositivo.id,
        parcela_id=dispositivo.parcela_id,
        intervalo_ciclo_seg=dispositivo.intervalo_ciclo_seg,
    )


@router.patch("/parcelas/{parcela_id}/dispositivos/{dispositivo_id}", response_model=DispositivoIoTResp)
def actualizar_dispositivo(
    parcela_id: int,
    dispositivo_id: int,
    body: DispositivoIoTUpdate,
    current_user: Usuario = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> Any:
    parcela_con_gestion(parcela_id, current_user, db)

    dispositivo = db.query(DispositivoIoT).filter(
        DispositivoIoT.id == dispositivo_id,
        DispositivoIoT.parcela_id == parcela_id,
    ).first()

    if dispositivo is None:
        raise HTTPException(status_code=404, detail="Dispositivo no encontrado.")

    dispositivo.intervalo_ciclo_seg = body.intervalo_ciclo_seg
    db.commit()
    db.refresh(dispositivo)
    return dispositivo


@router.patch("/parcelas/{parcela_id}/dispositivos/{dispositivo_id}/revocar", response_model=DispositivoIoTResp)
def cambiar_estado_dispositivo(
    parcela_id: int,
    dispositivo_id: int,
    current_user: Usuario = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> Any:
    parcela_con_gestion(parcela_id, current_user, db)

    dispositivo = db.query(DispositivoIoT).filter(
        DispositivoIoT.id == dispositivo_id,
        DispositivoIoT.parcela_id == parcela_id,
    ).first()

    if dispositivo is None:
        raise HTTPException(status_code=404, detail="Dispositivo no encontrado.")

    # Alternar estado (activo / revocado)
    dispositivo.activo = not dispositivo.activo
    db.commit()
    db.refresh(dispositivo)
    return dispositivo


@router.delete("/parcelas/{parcela_id}/dispositivos/{dispositivo_id}", status_code=204)
def borrar_dispositivo(
    parcela_id: int,
    dispositivo_id: int,
    current_user: Usuario = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> None:
    parcela_con_gestion(parcela_id, current_user, db)

    dispositivo = db.query(DispositivoIoT).filter(
        DispositivoIoT.id == dispositivo_id,
        DispositivoIoT.parcela_id == parcela_id,
    ).first()

    if dispositivo is None:
        raise HTTPException(status_code=404, detail="Dispositivo no encontrado.")

    db.delete(dispositivo)
    db.commit()
    return None

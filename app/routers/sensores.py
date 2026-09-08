import csv
import io
from datetime import datetime, timedelta
from typing import Any, List, Optional
from zoneinfo import ZoneInfo


import openpyxl
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, parcela_con_gestion, parcela_con_lectura
from ..models import LogSensor, Sensor, Usuario
from ..schemas import (
    LogSensorResp,
    ProvisionarSensores,
    ResumenSensoresResp,
    SensorCreate,
    SensorResp,
    SensorUpdate,
)
from ..services.sensor_stats import calcular_resumen

router = APIRouter(prefix="/parcelas/{parcela_id}/sensores", tags=["sensores"])


def _siguiente_numero(parcela_id: int, db: Session) -> int:
    return (
        db.query(func.coalesce(func.max(Sensor.numero), 0))
        .filter(Sensor.parcela_id == parcela_id)
        .scalar()
    ) + 1


@router.post("/", response_model=SensorResp, status_code=201)
def crear_sensor(
    parcela_id: int,
    body: SensorCreate,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    parcela_con_gestion(parcela_id, current_user, db)
    siguiente = _siguiente_numero(parcela_id, db)
    sensor = Sensor(parcela_id=parcela_id, numero=siguiente, etiqueta=body.etiqueta, activo=True)
    db.add(sensor)
    try:
        db.commit()
    except IntegrityError:
        # Catch-all seguro hoy: Sensor solo tiene la restriccion unica
        # (parcela_id, numero); la clave ajena a parcela ya la valido
        # parcela_con_gestion() y etiqueta/activo siempre se rellenan arriba.
        # Si el modelo gana otra restriccion, revisa este except.
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Otra peticion creo un sensor a la vez; reintenta la operacion.",
        ) from None
    db.refresh(sensor)
    return sensor


@router.post("/provisionar", response_model=List[SensorResp])
def provisionar_sensores(
    parcela_id: int,
    body: ProvisionarSensores,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    """
    Crea las filas que falten hasta `cantidad`. Idempotente: repetir la misma
    cantidad no hace nada, y una cantidad menor NO borra sensores -- reducir
    destruiria el historico de los eliminados. Para quitar uno se desactiva.
    """
    parcela_con_gestion(parcela_id, current_user, db)

    siguiente = _siguiente_numero(parcela_id, db)
    for n in range(siguiente, body.cantidad + 1):
        db.add(Sensor(parcela_id=parcela_id, numero=n, etiqueta=f"Nodo {n}", activo=True))
    try:
        db.commit()
    except IntegrityError:
        # Catch-all seguro hoy: Sensor solo tiene la restriccion unica
        # (parcela_id, numero); la clave ajena a parcela ya la valido
        # parcela_con_gestion() y etiqueta/activo siempre se rellenan arriba.
        # Si el modelo gana otra restriccion, revisa este except.
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Otra peticion creo sensores a la vez; reintenta la operacion.",
        ) from None

    return (
        db.query(Sensor)
        .filter(Sensor.parcela_id == parcela_id)
        .order_by(Sensor.numero.asc())
        .all()
    )


@router.patch("/{sensor_id}", response_model=SensorResp)
def actualizar_sensor(
    parcela_id: int,
    sensor_id: int,
    body: SensorUpdate,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    parcela_con_gestion(parcela_id, current_user, db)
    sensor = db.query(Sensor).filter(Sensor.id == sensor_id, Sensor.parcela_id == parcela_id).first()
    if sensor is None:
        raise HTTPException(status_code=404, detail="Sensor no encontrado")

    datos = body.model_dump(exclude_unset=True, exclude_none=True)
    for campo, valor in datos.items():
        setattr(sensor, campo, valor)

    db.commit()
    db.refresh(sensor)
    return sensor


@router.delete("/{sensor_id}", status_code=204)
def borrar_sensor(
    parcela_id: int,
    sensor_id: int,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    parcela_con_gestion(parcela_id, current_user, db)
    sensor = db.query(Sensor).filter(Sensor.id == sensor_id, Sensor.parcela_id == parcela_id).first()
    if sensor is None:
        raise HTTPException(status_code=404, detail="Sensor no encontrado")

    # Eliminar las lecturas asociadas para mantener integridad
    db.query(LogSensor).filter(LogSensor.sensor_id == sensor_id).delete(synchronize_session=False)
    db.delete(sensor)
    db.commit()
    return None



@router.get("/", response_model=List[SensorResp])
def listar_sensores(
    parcela_id: int,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    parcela_con_lectura(parcela_id, current_user, db)
    return db.query(Sensor).filter(Sensor.parcela_id == parcela_id).order_by(Sensor.numero).all()


def _obtener_resumen(parcela_id, desde, hasta, db) -> ResumenSensoresResp:
    if hasta is None:
        hasta = datetime.now(ZoneInfo("Europe/Madrid")).replace(tzinfo=None)
    if desde is None:
        desde = hasta - timedelta(hours=24)


    lecturas = (
        db.query(LogSensor)
        .join(Sensor, LogSensor.sensor_id == Sensor.id)
        .filter(
            LogSensor.parcela_id == parcela_id,
            Sensor.activo.is_(True),
            LogSensor.fecha_hora >= desde,
            LogSensor.fecha_hora <= hasta,
        )
        .all()
    )
    resumen = calcular_resumen(lecturas)
    return ResumenSensoresResp(parcela_id=parcela_id, desde=desde, hasta=hasta, **resumen)


@router.get("/resumen", response_model=ResumenSensoresResp)
def resumen_sensores(
    parcela_id: int,
    desde: Optional[datetime] = None,
    hasta: Optional[datetime] = None,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    parcela_con_lectura(parcela_id, current_user, db)
    return _obtener_resumen(parcela_id, desde, hasta, db)


@router.get("/exportar")
def exportar_resumen_sensores(
    parcela_id: int,
    formato: str = "csv",
    desde: Optional[datetime] = None,
    hasta: Optional[datetime] = None,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    parcela_con_lectura(parcela_id, current_user, db)
    if formato not in ("csv", "xlsx"):
        raise HTTPException(status_code=422, detail="formato debe ser 'csv' o 'xlsx'")

    resumen = _obtener_resumen(parcela_id, desde, hasta, db)
    datos_resumen = resumen.model_dump()
    columnas = list(datos_resumen.keys())
    valores = ["" if v is None else str(v) for v in datos_resumen.values()]

    if formato == "csv":
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(columnas)
        writer.writerow(valores)
        return StreamingResponse(
            iter([buffer.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=resumen_parcela_{parcela_id}.csv"},
        )

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(columnas)
    ws.append(valores)
    buffer_bin = io.BytesIO()
    wb.save(buffer_bin)
    buffer_bin.seek(0)
    return StreamingResponse(
        buffer_bin,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=resumen_parcela_{parcela_id}.xlsx"},
    )


@router.get("/{sensor_id}/historico", response_model=List[LogSensorResp])
def historico_sensor(
    parcela_id: int,
    sensor_id: int,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    parcela_con_lectura(parcela_id, current_user, db)
    return (
        db.query(LogSensor)
        .filter(LogSensor.parcela_id == parcela_id, LogSensor.sensor_id == sensor_id)
        .order_by(LogSensor.fecha_hora.asc())
        .all()
    )

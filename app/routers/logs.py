from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, parcela_con_gestion
from ..models import LogClima, LogSensor, Sensor, Usuario
from ..schemas import LogSensorCreate, LogSensorResp
from ..services.weather import TZ_LOCAL, fetch_y_guardar_clima

router = APIRouter(prefix="/logs", tags=["logs"])



@router.post("/sensor/", response_model=LogSensorResp, status_code=201)
def crear_log_sensor(
    body: LogSensorCreate,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    parcela_con_gestion(body.parcela_id, current_user, db)

    sensor = db.query(Sensor).filter(Sensor.id == body.sensor_id).first()
    if sensor is None or sensor.parcela_id != body.parcela_id:
        raise HTTPException(
            status_code=422,
            detail="El sensor indicado no existe o no pertenece a esta parcela.",
        )

    log = LogSensor(**body.model_dump())
    db.add(log)
    db.commit()
    db.refresh(log)

    log.sensor_etiqueta = sensor.etiqueta
    log.sensor_profundidad_cm = sensor.profundidad_cm

    # Si la parcela tiene coordenadas, verificar si hay clima fresco (< 15 min); si no, consultar la API meteorológica
    ahora_local = datetime.now(TZ_LOCAL).replace(tzinfo=None)
    quince_min_atras = ahora_local - timedelta(minutes=15)
    clima_reciente = (
        db.query(LogClima)
        .filter(LogClima.parcela_id == body.parcela_id, LogClima.fecha_hora >= quince_min_atras)
        .order_by(LogClima.fecha_hora.desc())
        .first()
    )


    if clima_reciente is None and sensor.parcela and sensor.parcela.latitud is not None and sensor.parcela.longitud is not None:
        try:
            fetch_y_guardar_clima(sensor.parcela, db)
            clima_reciente = (
                db.query(LogClima)
                .filter(LogClima.parcela_id == body.parcela_id)
                .order_by(LogClima.fecha_hora.desc())
                .first()
            )
        except Exception:
            pass

    if clima_reciente:
        log.temp_ambiente_c = clima_reciente.temp_c
        log.humedad_aire_pct = clima_reciente.humedad_relativa_pct
        log.lluvia_mm = clima_reciente.lluvia_mm
        log.et0 = clima_reciente.et0
        log.viento_ms = clima_reciente.viento_vel_ms
        log.viento_racha_ms = clima_reciente.viento_racha_ms
        log.viento_dir_deg = clima_reciente.viento_dir_deg
        log.radiacion_wm2 = clima_reciente.radiacion_wm2
        log.presion_hpa = clima_reciente.presion_hpa
        log.vpd_kpa = clima_reciente.vpd_kpa
        log.punto_rocio_c = clima_reciente.punto_rocio_c
        log.nubosidad_pct = clima_reciente.nubosidad_pct

    return log

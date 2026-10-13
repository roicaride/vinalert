from datetime import datetime, timedelta
from typing import Any, Union

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_emisor_lecturas, parcela_con_gestion
from ..models import DispositivoIoT, LogClima, LogSensor, Sensor, Usuario
from ..schemas import LogSensorCreate, LogSensorResp
from ..services.weather import TZ_LOCAL, fetch_y_guardar_clima

router = APIRouter(prefix="/logs", tags=["logs"])



_CAMPOS_LECTURA = ("parcela_id", "sensor_id", "fecha_hora", "humedad_suelo_pct", "temperatura_suelo", "bateria")


def _lectura_identica(body: LogSensorCreate, db: Session):
    """
    La lectura ya guardada que es EXACTAMENTE igual a esta: mismo sensor, misma
    hora y los mismos valores, con un valor ausente igual solo a otro ausente.
    Cualquier diferencia hace que sea otra lectura.
    """
    q = db.query(LogSensor)
    for campo in _CAMPOS_LECTURA:
        valor = getattr(body, campo)
        columna = getattr(LogSensor, campo)
        q = q.filter(columna.is_(None) if valor is None else columna == valor)
    return q.order_by(LogSensor.id).first()


@router.post("/sensor/", response_model=LogSensorResp, status_code=201)
def crear_log_sensor(
    body: LogSensorCreate,
    response: Response,
    emisor: Union[Usuario, DispositivoIoT] = Depends(get_emisor_lecturas),
    db: Session = Depends(get_db),
) -> Any:
    if isinstance(emisor, DispositivoIoT):
        # Un ESP32 solo escribe en la parcela a la que se dio de alta, diga
        # lo que diga el cuerpo. 404 igual que para una parcela ajena.
        if body.parcela_id != emisor.parcela_id:
            raise HTTPException(status_code=404, detail="Parcela no encontrada")
    else:
        parcela_con_gestion(body.parcela_id, emisor, db)

    sensor = db.query(Sensor).filter(Sensor.id == body.sensor_id).first()
    if sensor is None or sensor.parcela_id != body.parcela_id:
        raise HTTPException(
            status_code=422,
            detail="El sensor indicado no existe o no pertenece a esta parcela.",
        )

    log = _lectura_identica(body, db)
    if log is not None:
        # Reenvio de una lectura ya guardada (el ESP32 no recibio la respuesta
        # a tiempo y la volvio a mandar): no se duplica, y el 200 le dice al
        # aparato que ya esta subida para que la saque de su buffer.
        response.status_code = 200
    else:
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

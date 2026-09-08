from datetime import date, datetime, timedelta
from typing import Any, List, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query

from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, parcela_con_gestion, parcela_con_lectura, ROL_ADMIN, ROL_GESTOR, ROL_LECTURA
from ..models import (
    ClimaDiario,
    LecturaFoliar,
    LogClima,
    LogSensor,
    Parcela,
    ParcelaUsuario,
    Sensor,
    SueloDiario,
    Tratamiento,
    Usuario,
)
from ..schemas import (
    ClimaDiarioResp,
    DashboardCompleto,
    LogSensorResp,
    ParcelaCreate,
    ParcelaResp,
    ParcelaUpdate,
    LogClimaResp,
    SueloDiarioResp,
)
from .sensores import _obtener_resumen

router = APIRouter(tags=["parcelas"])


def _rol_en_parcela(parcela_id: int, current_user: Usuario, db: Session) -> str:
    """
    Que puede hacer este usuario en esta parcela. El admin es gestor en todas.
    Llegar aqui exige haber pasado por parcela_con_lectura o
    parcela_con_gestion, asi que el caso "no es miembro" no puede darse.
    """
    if current_user.rol == ROL_ADMIN:
        return ROL_GESTOR

    miembro = db.query(ParcelaUsuario).filter(
        ParcelaUsuario.parcela_id == parcela_id,
        ParcelaUsuario.usuario_id == current_user.id,
    ).first()
    return miembro.rol if miembro else ROL_LECTURA


def _con_mi_rol(parcela: Parcela, mi_rol: str) -> Parcela:
    """
    Adjunta mi_rol al objeto ORM para que ParcelaResp lo recoja via
    from_attributes. SQLAlchemy ignora los atributos que no mapea, asi que
    esto no toca la base de datos.
    """
    parcela.mi_rol = mi_rol
    return parcela


@router.get("/parcelas/", response_model=List[ParcelaResp])
def listar_parcelas(
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    if current_user.rol == ROL_ADMIN:
        # Sin esto el admin tendria acceso a todas las parcelas pero ninguna
        # forma de llegar a ellas desde la aplicacion.
        parcelas = db.query(Parcela).all()
        return [_con_mi_rol(p, ROL_GESTOR) for p in parcelas]

    # Una sola consulta para todas las membresias: una por parcela seria un
    # N+1 gratuito.
    roles = dict(
        db.query(ParcelaUsuario.parcela_id, ParcelaUsuario.rol)
        .filter(ParcelaUsuario.usuario_id == current_user.id)
        .all()
    )
    parcelas = (
        db.query(Parcela)
        .join(ParcelaUsuario, ParcelaUsuario.parcela_id == Parcela.id)
        .filter(ParcelaUsuario.usuario_id == current_user.id)
        .all()
    )
    return [_con_mi_rol(p, roles[p.id]) for p in parcelas]


@router.post("/parcelas/", response_model=ParcelaResp, status_code=201)
def crear_parcela(
    body: ParcelaCreate,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    parcela = Parcela(**body.model_dump())
    try:
        db.add(parcela)
        db.flush()
        # En la misma transaccion: una parcela sin ningun gestor seria
        # inadministrable, y nadie podria recuperarla.
        db.add(ParcelaUsuario(
            parcela_id=parcela.id,
            usuario_id=current_user.id,
            rol=ROL_GESTOR,
        ))
        db.commit()
        db.refresh(parcela)
        return _con_mi_rol(parcela, ROL_GESTOR)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al crear parcela: {e}")


@router.get("/parcelas/{parcela_id}", response_model=ParcelaResp)
def obtener_parcela(
    parcela_id: int,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    parcela = parcela_con_lectura(parcela_id, current_user, db)
    return _con_mi_rol(parcela, _rol_en_parcela(parcela_id, current_user, db))


@router.patch("/parcelas/{parcela_id}", response_model=ParcelaResp)
def editar_parcela(
    parcela_id: int,
    body: ParcelaUpdate,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    parcela = parcela_con_gestion(parcela_id, current_user, db)

    # Mismo patron que el PATCH de sensor: enviar null no vacia un campo, se
    # ignora. Dos semanticas distintas de PATCH en la misma app serian peores.
    datos = body.model_dump(exclude_unset=True, exclude_none=True)
    for campo, valor in datos.items():
        setattr(parcela, campo, valor)

    db.commit()
    db.refresh(parcela)
    return _con_mi_rol(parcela, _rol_en_parcela(parcela_id, current_user, db))


@router.delete("/parcelas/{parcela_id}", status_code=204)
def borrar_parcela(
    parcela_id: int,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    parcela = parcela_con_gestion(parcela_id, current_user, db)

    # Borrado en cascada de dependencias
    db.query(LogSensor).filter(LogSensor.parcela_id == parcela_id).delete(synchronize_session=False)
    db.query(Sensor).filter(Sensor.parcela_id == parcela_id).delete(synchronize_session=False)
    db.query(LogClima).filter(LogClima.parcela_id == parcela_id).delete(synchronize_session=False)
    db.query(ClimaDiario).filter(ClimaDiario.parcela_id == parcela_id).delete(synchronize_session=False)
    db.query(SueloDiario).filter(SueloDiario.parcela_id == parcela_id).delete(synchronize_session=False)
    db.query(Tratamiento).filter(Tratamiento.parcela_id == parcela_id).delete(synchronize_session=False)
    db.query(LecturaFoliar).filter(LecturaFoliar.parcela_id == parcela_id).delete(synchronize_session=False)
    db.query(ParcelaUsuario).filter(ParcelaUsuario.parcela_id == parcela_id).delete(synchronize_session=False)

    db.delete(parcela)
    db.commit()
    return None



@router.get("/parcelas/{parcela_id}/dashboard", response_model=DashboardCompleto)
def obtener_dashboard(
    parcela_id: int,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    parcela = parcela_con_lectura(parcela_id, current_user, db)

    resumen_suelo = _obtener_resumen(parcela_id, desde=None, hasta=None, db=db)

    u_clima = db.query(LogClima).filter(LogClima.parcela_id == parcela_id).order_by(LogClima.fecha_hora.desc()).first()

    return {
        "parcela": _con_mi_rol(parcela, _rol_en_parcela(parcela_id, current_user, db)),
        "estado_suelo": resumen_suelo,
        "clima_actual": u_clima,
    }


@router.get("/parcelas/{parcela_id}/historico", response_model=List[LogSensorResp])
def obtener_historico(
    parcela_id: int,
    limite: int = Query(25, ge=1, le=5000),
    horas: Optional[int] = None,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    parcela_con_lectura(parcela_id, current_user, db)
    q = db.query(LogSensor).filter(LogSensor.parcela_id == parcela_id)
    if horas is not None:
        desde = datetime.now(ZoneInfo("Europe/Madrid")).replace(tzinfo=None) - timedelta(hours=horas)
        q = q.filter(LogSensor.fecha_hora >= desde)
    logs = q.order_by(LogSensor.fecha_hora.desc()).limit(limite).all()

    sensores_map = {s.id: s for s in db.query(Sensor).filter(Sensor.parcela_id == parcela_id).all()}
    logs_clima = db.query(LogClima).filter(LogClima.parcela_id == parcela_id).order_by(LogClima.fecha_hora.desc()).limit(1000).all()

    resultado = []
    for log in logs[::-1]:
        s = sensores_map.get(log.sensor_id)
        # Buscar el LogClima mas cercano en el tiempo (ventana de +/- 3 horas)
        clima_cercano = None
        min_diff = None
        for c in logs_clima:
            diff = abs((c.fecha_hora - log.fecha_hora).total_seconds())
            if diff <= 10800 and (min_diff is None or diff < min_diff):
                min_diff = diff
                clima_cercano = c


        resultado.append({
            "id": log.id,
            "parcela_id": log.parcela_id,
            "sensor_id": log.sensor_id,
            "fecha_hora": log.fecha_hora,
            "humedad_suelo_pct": log.humedad_suelo_pct,
            "temperatura_suelo": log.temperatura_suelo,
            "bateria": log.bateria,
            "sensor_etiqueta": s.etiqueta if s else None,
            "sensor_profundidad_cm": s.profundidad_cm if s else None,
            "temp_ambiente_c": clima_cercano.temp_c if clima_cercano else None,
            "humedad_aire_pct": clima_cercano.humedad_relativa_pct if clima_cercano else None,
            "lluvia_mm": clima_cercano.lluvia_mm if clima_cercano else None,
            "et0": clima_cercano.et0 if clima_cercano else None,
            "viento_ms": clima_cercano.viento_vel_ms if clima_cercano else None,
            "viento_racha_ms": clima_cercano.viento_racha_ms if clima_cercano else None,
            "viento_dir_deg": clima_cercano.viento_dir_deg if clima_cercano else None,
            "radiacion_wm2": clima_cercano.radiacion_wm2 if clima_cercano else None,
            "presion_hpa": clima_cercano.presion_hpa if clima_cercano else None,
            "vpd_kpa": clima_cercano.vpd_kpa if clima_cercano else None,
            "punto_rocio_c": clima_cercano.punto_rocio_c if clima_cercano else None,
            "nubosidad_pct": clima_cercano.nubosidad_pct if clima_cercano else None,
        })

    return resultado




@router.get("/parcelas/{parcela_id}/clima/diario", response_model=List[ClimaDiarioResp])
def obtener_clima_diario(
    parcela_id: int,
    dias: Optional[int] = None,
    limite: int = Query(365, ge=1, le=5000),
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    parcela_con_lectura(parcela_id, current_user, db)
    q = db.query(ClimaDiario).filter(ClimaDiario.parcela_id == parcela_id)
    if dias is not None:
        q = q.filter(ClimaDiario.fecha >= date.today() - timedelta(days=dias))
    filas = q.order_by(ClimaDiario.fecha.desc()).limit(limite).all()
    return filas[::-1]


@router.get("/parcelas/{parcela_id}/suelo/diario", response_model=List[SueloDiarioResp])
def obtener_suelo_diario(
    parcela_id: int,
    dias: Optional[int] = None,
    limite: int = Query(365, ge=1, le=5000),
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    parcela_con_lectura(parcela_id, current_user, db)
    q = db.query(SueloDiario).filter(SueloDiario.parcela_id == parcela_id)
    if dias is not None:
        q = q.filter(SueloDiario.fecha >= date.today() - timedelta(days=dias))
    filas = q.order_by(SueloDiario.fecha.desc()).limit(limite).all()
    return filas[::-1]

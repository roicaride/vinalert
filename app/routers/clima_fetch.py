import logging
from datetime import datetime
from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, parcela_con_gestion, parcela_con_lectura
from ..models import LogClima, Usuario
from ..schemas import ClimaHorarioResp, ComprobacionClimaResp, LogClimaResp
from ..services.weather import TZ_LOCAL, fetch_y_guardar_clima, get_provider

logger = logging.getLogger(__name__)

router = APIRouter(tags=["clima"])

@router.post(
    "/parcelas/{parcela_id}/actualizar-clima",
    response_model=LogClimaResp,
    status_code=201,
    summary="Obtiene el clima actual de Open-Meteo y lo guarda en log_clima",
)
def actualizar_clima(
    parcela_id: int,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    parcela = parcela_con_gestion(parcela_id, current_user, db)

    if parcela.latitud is None or parcela.longitud is None:
        raise HTTPException(
            status_code=422,
            detail="La parcela no tiene coordenadas (latitud/longitud). Edítala antes de pedir datos meteorológicos.",
        )

    aviso = fetch_y_guardar_clima(parcela, db)
    if aviso:
        raise HTTPException(status_code=503, detail=f"Error al contactar el proveedor meteorológico: {aviso}")

    return db.query(LogClima).filter(LogClima.parcela_id == parcela_id).order_by(LogClima.fecha_hora.desc()).first()


@router.get(
    "/parcelas/{parcela_id}/clima/comprobar",
    response_model=ComprobacionClimaResp,
    summary="Comprueba si el proveedor meteorologico devuelve datos para estas coordenadas",
)
def comprobar_clima(
    parcela_id: int,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    """
    Sonda de configuracion: NO escribe nada. Es de gestion y no de lectura
    porque cada llamada gasta cuota de Open-Meteo, que es compartida y limitada.
    """
    parcela = parcela_con_gestion(parcela_id, current_user, db)

    if parcela.latitud is None or parcela.longitud is None:
        raise HTTPException(
            status_code=422,
            detail="La parcela no tiene coordenadas. Editala antes de comprobarlas.",
        )

    provider = get_provider()
    try:
        datos = provider.fetch(parcela.latitud, parcela.longitud)
    except Exception as exc:
        logger.exception(
            "Fallo comprobando el proveedor meteorologico para la parcela %s: %s",
            parcela_id, exc,
        )
        return ComprobacionClimaResp(
            disponible=False,
            latitud=parcela.latitud,
            longitud=parcela.longitud,
            motivo=f"El proveedor no respondio: {exc}",
        )

    # OpenMeteoProvider.fetch() siempre devuelve las 25 claves de su contrato
    # (construidas por comprension sobre _MAPA_CURRENT mas las cuatro del
    # pronostico), aunque el proveedor no tenga datos para las coordenadas:
    # en ese caso las claves quedan con valor None, pero el dict sigue siendo
    # truthy. `not datos` nunca detecta ese caso con el proveedor real; hay
    # que mirar si la clave de temperatura tiene un valor utilizable.
    if datos.get("temp_c") is None:
        return ComprobacionClimaResp(
            disponible=False,
            latitud=parcela.latitud,
            longitud=parcela.longitud,
            motivo="El proveedor respondio sin datos utilizables para esas coordenadas.",
        )

    return ComprobacionClimaResp(
        disponible=True, latitud=parcela.latitud, longitud=parcela.longitud
    )


@router.get(
    "/parcelas/{parcela_id}/clima/horario",
    response_model=List[ClimaHorarioResp],
    summary="Lluvia, ET0 y temperatura hora a hora: 48 h atras y 48 h de prevision",
)
def clima_horario(
    parcela_id: int,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    """
    Se pide a Open-Meteo cada vez, sin guardarlo: es una sola consulta y el
    dato de una hora pasada no cambia. `prevision` marca las horas que aun no
    han llegado, para que la web las separe de lo ya medido.
    """
    parcela = parcela_con_lectura(parcela_id, current_user, db)
    if parcela.latitud is None or parcela.longitud is None:
        raise HTTPException(
            status_code=422,
            detail="La parcela no tiene coordenadas: sin ellas no se puede pedir el clima.",
        )
    try:
        filas = get_provider().fetch_horario(parcela.latitud, parcela.longitud)
    except Exception as exc:
        logger.warning("Open-Meteo no devolvio el horario de la parcela %s: %s", parcela_id, exc)
        raise HTTPException(status_code=503, detail="El proveedor meteorologico no responde.")

    ahora = datetime.now(TZ_LOCAL).replace(tzinfo=None)
    return [ClimaHorarioResp(**fila, prevision=fila["fecha_hora"] > ahora) for fila in filas]

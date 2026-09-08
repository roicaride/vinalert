import logging
from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, parcela_con_gestion
from ..models import LogClima, Usuario
from ..schemas import BackfillRequest, BackfillResp, ComprobacionClimaResp, LogClimaResp
from ..services.clima_diario_service import guardar_dias
from ..services.weather import fetch_y_guardar_clima, get_provider

logger = logging.getLogger(__name__)

router = APIRouter(tags=["clima"])

# El archivo va con varios días de desfase respecto a hoy.
DIAS_DESFASE_ARCHIVO = 7


def _restar_anios(fecha: date, anios: int) -> date:
    """
    Resta años a una fecha. El 29 de febrero degrada al 28 cuando el año
    destino no es bisiesto (convención habitual, evita un ValueError).
    """
    try:
        return fecha.replace(year=fecha.year - anios)
    except ValueError:
        return fecha.replace(year=fecha.year - anios, day=28)


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
    "/clima/ping",
    summary="Verifica la conectividad con el proveedor meteorológico configurado",
)
def ping_clima() -> dict:
    provider = get_provider()
    ok = provider.ping()
    return {
        "proveedor": type(provider).__name__,
        "conectado": ok,
        "estado": "OK" if ok else "ERROR — sin respuesta del proveedor",
    }


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


@router.post(
    "/parcelas/{parcela_id}/clima/backfill",
    response_model=BackfillResp,
    summary="Rellena clima_diario hacia atrás desde el archivo histórico",
)
def backfill_clima(
    parcela_id: int,
    body: BackfillRequest,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    parcela = parcela_con_gestion(parcela_id, current_user, db)

    if parcela.latitud is None or parcela.longitud is None:
        raise HTTPException(
            status_code=422,
            detail="La parcela no tiene coordenadas (latitud/longitud). Edítala antes de rellenar el histórico.",
        )

    tope = date.today() - timedelta(days=DIAS_DESFASE_ARCHIVO)

    if body.anios:
        hasta = tope
        desde = _restar_anios(hasta, body.anios)
    else:
        if body.desde is None or body.hasta is None:
            raise HTTPException(status_code=422, detail="Indica 'anios' o bien 'desde' y 'hasta'.")
        desde, hasta = body.desde, body.hasta

    recortado = hasta > tope
    if recortado:
        hasta = tope

    if desde > hasta:
        raise HTTPException(status_code=422, detail="El rango pedido queda vacío tras recortar al desfase del archivo.")

    try:
        filas = get_provider().fetch_archivo(parcela.latitud, parcela.longitud, desde, hasta)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Error al contactar el archivo meteorológico: {exc}")

    resumen = guardar_dias(parcela_id, filas, db)

    return BackfillResp(
        desde=desde,
        hasta=hasta,
        recortado=recortado,
        dias_solicitados=(hasta - desde).days + 1,
        **resumen,
    )

import logging

from sqlalchemy.orm import Session

from ..database import SessionLocal
from ..models import Parcela
from .clima_diario_service import guardar_dias
from .weather import get_provider

logger = logging.getLogger(__name__)

# Cada ejecucion rehace los ultimos DIAS_VENTANA dias de clima en vez de solo
# el anterior. No cuesta ni una llamada extra: fetch_diario ya devuelve esa
# ventana entera en una sola respuesta, y los huecos por caidas del servidor
# se recuperan solos.
#
# Solo clima: las medias diarias del suelo ya no se guardan, se calculan al
# momento desde log_sensores (GET /parcelas/{id}/suelo/diario).
DIAS_VENTANA = 7

# Open-Meteo no devuelve mas de 92 dias hacia atras en el pronostico.
MAX_PAST_DAYS = 92


def _consolidar_clima_ventana(parcela: Parcela, db: Session, dias: int = DIAS_VENTANA) -> int:
    """
    Guarda de una vez todos los dias que devuelve la API. `guardar_dias` es un
    upsert por (parcela, fecha): rehacer dias ya consolidados los reescribe en
    vez de duplicarlos.
    """
    if parcela.latitud is None or parcela.longitud is None:
        logger.info("Parcela %s sin coordenadas; se omite el clima", parcela.id)
        return 0

    filas = get_provider().fetch_diario(
        parcela.latitud, parcela.longitud, past_days=min(dias, MAX_PAST_DAYS)
    )
    if not filas:
        logger.warning("La API no devolvio dias para la parcela %s", parcela.id)
        return 0

    guardar_dias(parcela.id, filas, db)
    return len(filas)


def consolidar_parcela(parcela: Parcela, db: Session, dias: int = DIAS_VENTANA) -> None:
    """Consolida el clima diario de una parcela; un fallo no sale de aqui."""
    try:
        _consolidar_clima_ventana(parcela, db, dias)
    except Exception as e:
        db.rollback()
        logger.exception("Fallo consolidando el clima de la parcela %s: %s", parcela.id, e)


def consolidar_todas_parcelas(dias: int = DIAS_VENTANA) -> None:
    """
    Punto de entrada del scheduler y del lanzador manual (`worker.py`), para
    que ambos hagan exactamente lo mismo. Aisla el fallo de cada parcela: una
    rota no puede dejar sin consolidar a las demas.
    """
    db: Session = SessionLocal()
    try:
        parcelas = db.query(Parcela).all()
        logger.info("Consolidando %s parcela(s), ventana de %s dias", len(parcelas), dias)
        for parcela in parcelas:
            try:
                consolidar_parcela(parcela, db, dias)
            except Exception as e:
                db.rollback()
                logger.exception("Fallo consolidando la parcela %s: %s", parcela.id, e)
    finally:
        db.close()

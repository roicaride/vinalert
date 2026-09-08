import logging

from ..database import SessionLocal
from ..models import Parcela
from .weather import fetch_y_guardar_clima

logger = logging.getLogger(__name__)


def refrescar_clima_todas_parcelas() -> None:
    """Refresca el clima de todas las parcelas con coordenadas. Pensada para el scheduler."""
    db = SessionLocal()
    try:
        parcelas = db.query(Parcela).filter(
            Parcela.latitud.isnot(None),
            Parcela.longitud.isnot(None),
        ).all()
        for parcela in parcelas:
            try:
                aviso = fetch_y_guardar_clima(parcela, db)
                if aviso:
                    logger.warning("No se pudo actualizar clima de parcela %s: %s", parcela.id, aviso)
            except Exception as exc:
                db.rollback()
                logger.exception("Fallo al refrescar clima de parcela %s: %s", parcela.id, exc)
    finally:
        db.close()

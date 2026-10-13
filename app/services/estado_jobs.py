"""
Registro de la ultima ejecucion de cada trabajo periodico, para que el panel
de administracion diga si el clima y la consolidacion van bien sin tener que
mirar los logs del servidor.

Un job que lanza una excepcion no tumba el scheduler: se registra el error y
la siguiente ejecucion lo vuelve a intentar.
"""
import logging
import traceback
from typing import Callable, Optional

from ..database import SessionLocal
from ..models import EstadoJob
from . import reloj

logger = logging.getLogger(__name__)

# Los trabajos que el panel muestra aunque todavia no hayan corrido nunca.
JOBS_CONOCIDOS = {
    "refrescar_clima": "Refresco del clima",
    "consolidar_diario": "Consolidación diaria",
    "limpiar_accesos": "Limpieza de accesos",
}


def _guardar(fabrica, job_id: str, **campos) -> None:
    db = fabrica()
    try:
        fila = db.get(EstadoJob, job_id) or EstadoJob(job_id=job_id)
        for k, v in campos.items():
            setattr(fila, k, v)
        db.add(fila)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("No se pudo guardar el estado del job %s", job_id)
    finally:
        db.close()


def ejecutar(job_id: str, fn: Callable[[], Optional[dict]], fabrica=SessionLocal) -> None:
    """
    Ejecuta `fn` y guarda como fue. `fn` puede devolver
    {"procesadas": n, "fallos": k}: los fallos por parcela que el propio job
    aisla no son una excepcion, pero el panel debe contarlos.
    """
    _guardar(fabrica, job_id, ultimo_inicio=reloj.ahora_utc())
    try:
        resumen = fn() or {}
    except Exception as exc:
        logger.exception("El job %s ha fallado", job_id)
        mensaje = "".join(traceback.format_exception_only(type(exc), exc)).strip()
        _guardar(fabrica, job_id, ultimo_fin=reloj.ahora_utc(), ultimo_error=mensaje[:2000])
        return
    _guardar(
        fabrica,
        job_id,
        ultimo_fin=reloj.ahora_utc(),
        ultimo_exito=reloj.ahora_utc(),
        procesadas=resumen.get("procesadas"),
        fallos=resumen.get("fallos"),
        ultimo_error=None,
    )

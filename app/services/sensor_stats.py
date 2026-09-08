import statistics
from typing import Iterable, Optional

from ..models import LogSensor


def _media(valores: list) -> Optional[float]:
    return sum(valores) / len(valores) if valores else None


def _desviacion(valores: list) -> Optional[float]:
    return statistics.stdev(valores) if len(valores) >= 2 else None


def _extremo(valores: list, funcion) -> Optional[float]:
    return funcion(valores) if valores else None


def calcular_resumen(lecturas: Iterable[LogSensor]) -> dict:
    """
    Agrega humedad y temperatura de un conjunto de lecturas de log_sensores.
    Puro: no toca la base de datos, recibe las filas ya consultadas.
    """
    lecturas = list(lecturas)
    humedades = [l.humedad_suelo_pct for l in lecturas if l.humedad_suelo_pct is not None]
    temperaturas = [l.temperatura_suelo for l in lecturas if l.temperatura_suelo is not None]
    sensores_ids = {l.sensor_id for l in lecturas if l.sensor_id is not None}

    return {
        "n_sensores": len(sensores_ids),
        "n_lecturas": len(lecturas),
        "humedad_media": _media(humedades),
        "humedad_sd": _desviacion(humedades),
        "temperatura_media": _media(temperaturas),
        "temperatura_sd": _desviacion(temperaturas),
        "humedad_max": _extremo(humedades, max),
        "humedad_min": _extremo(humedades, min),
        "temperatura_max": _extremo(temperaturas, max),
        "temperatura_min": _extremo(temperaturas, min),
    }

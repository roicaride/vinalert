import statistics
from typing import Iterable, Optional

from ..models import LogSensor


def _media(valores: list) -> Optional[float]:
    return sum(valores) / len(valores) if valores else None


def _desviacion(valores: list) -> Optional[float]:
    return statistics.stdev(valores) if len(valores) >= 2 else None


def _extremo(valores: list, funcion) -> Optional[float]:
    return funcion(valores) if valores else None


def media_justa(entradas: Iterable[tuple]) -> Optional[float]:
    """
    Media de las medias de cada sensor. `entradas` son tuplas
    (sensor_id, valor) o (sensor_id, valor, peso); el peso, por defecto 1,
    solo pondera DENTRO de cada sensor (p. ej. dias con su numero de
    lecturas). Asi un sensor que manda mas lecturas no pesa mas que otro, y
    uno que falta en un envio no mueve la media.
    """
    por_sensor: dict = {}
    for entrada in entradas:
        sensor_id, valor = entrada[0], entrada[1]
        peso = entrada[2] if len(entrada) > 2 else 1
        if valor is None or not peso:
            continue
        suma, total = por_sensor.get(sensor_id, (0.0, 0))
        por_sensor[sensor_id] = (suma + valor * peso, total + peso)
    if not por_sensor:
        return None
    medias = [suma / total for suma, total in por_sensor.values()]
    return sum(medias) / len(medias)


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

from typing import List

from sqlalchemy.orm import Session

from ..models import ClimaDiario

# Un dato propio (pronóstico, de nuestra ubicación y cadencia) no se pisa con
# una reconstrucción del archivo. Al revés sí: el pronóstico es más fiable.
_PRIORIDAD = {"archivo": 0, "pronostico": 1}


def guardar_dias(parcela_id: int, filas: List[dict], db: Session) -> dict:
    """
    Inserta o actualiza filas de clima_diario, una por fecha.
    Idempotente: reejecutar con las mismas fechas actualiza en vez de duplicar.
    Devuelve el recuento de insertados / actualizados / omitidos.
    """
    insertados = actualizados = omitidos = 0

    for fila in filas:
        fecha = fila["fecha"]
        existente = (
            db.query(ClimaDiario)
            .filter(ClimaDiario.parcela_id == parcela_id, ClimaDiario.fecha == fecha)
            .first()
        )

        if existente is None:
            db.add(ClimaDiario(parcela_id=parcela_id, **fila))
            insertados += 1
            continue

        nueva_fuente = fila.get("fuente", "archivo")
        if _PRIORIDAD.get(nueva_fuente, 0) < _PRIORIDAD.get(existente.fuente, 0):
            omitidos += 1
            continue

        for campo, valor in fila.items():
            setattr(existente, campo, valor)
        actualizados += 1

    db.commit()
    return {"insertados": insertados, "actualizados": actualizados, "omitidos": omitidos}

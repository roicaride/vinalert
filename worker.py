"""
Lanzador manual de la consolidacion diaria.

Ejecuta exactamente lo mismo que el job nocturno del scheduler (ver
`_programar_jobs` en `app/main.py`): la logica vive en
`app/services/consolidacion.py` y aqui solo se invoca. Que el camino manual y
el automatico compartan funcion es deliberado — cuando difieren es cuando
aparecen los fallos que solo se ven en produccion.

Uso:
    python worker.py           # ventana por defecto (DIAS_VENTANA)
    python worker.py 30        # rehace los ultimos 30 dias
"""
import logging
import sys

from app.services.consolidacion import DIAS_VENTANA, consolidar_todas_parcelas

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    dias = int(sys.argv[1]) if len(sys.argv) > 1 else DIAS_VENTANA
    print(f"Consolidando todas las parcelas, ventana de {dias} dias...")
    consolidar_todas_parcelas(dias)
    print("Hecho.")

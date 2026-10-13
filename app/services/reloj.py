"""
La hora de las piezas de seguridad de las cuentas (intentos de acceso, enlaces
de invitacion y de recuperacion), en un solo sitio para que los tests puedan
moverla sin esperar.

UTC sin zona, a diferencia del resto de la BD (hora de Madrid): con hora local,
la noche del cambio de hora de octubre la franja 02:00-03:00 se repite y "los
ultimos 15 minutos" contarian fallos que ya han salido de la ventana.
"""
from datetime import datetime, timezone


def ahora_utc() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)

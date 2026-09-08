import logging
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from ..database import SessionLocal
from ..models import LogSensor, Parcela, Sensor, SueloDiario
from .clima_diario_service import guardar_dias
from .sensor_stats import calcular_resumen
from .weather import get_provider

logger = logging.getLogger(__name__)

# Cada ejecucion nocturna rehace los ultimos DIAS_VENTANA dias en vez de solo
# el anterior. No cuesta ni una llamada extra: fetch_diario ya devuelve esa
# ventana entera en una sola respuesta. A cambio, los huecos por caidas del
# servidor y las lecturas de sensores que llegan tarde se recuperan solos.
DIAS_VENTANA = 7

# DECISIÓN DE PRODUCTO (no una limitación técnica): de momento se trabaja
# solo con parcelas en España, así que el "día civil" que usa suelo_diario
# —igual que clima_diario, que ya lo hace de facto vía timezone=auto de
# Open-Meteo— es el día civil español. Si algún día hay parcelas fuera de
# España, esta constante ya no basta: haría falta una zona horaria POR
# PARCELA (p.ej. una columna en Parcela) y pasarla a _ventana_dia_civil()
# en vez de esta constante fija.
TZ_LOCAL = ZoneInfo("Europe/Madrid")


def _ventana_dia_civil(fecha: date) -> tuple[datetime, datetime]:
    """
    Devuelve (inicio_utc, fin_utc), ambos datetime naive en UTC (convención
    del proyecto), que delimitan la ventana semiabierta [inicio, fin) del
    día civil español `fecha`. Semiabierta a propósito: evita que la lectura
    de medianoche exacta caiga en dos días a la vez.

    La duración de esta ventana en UTC NO es siempre 24h: en los días de
    cambio de hora dura 23h (marzo) o 25h (octubre), porque lo que se fija
    es el día civil local, no un número fijo de horas UTC.
    """
    inicio_local = datetime.combine(fecha, time.min, tzinfo=TZ_LOCAL)
    fin_local = inicio_local + timedelta(days=1)
    inicio_utc = inicio_local.astimezone(timezone.utc).replace(tzinfo=None)
    fin_utc = fin_local.astimezone(timezone.utc).replace(tzinfo=None)
    return inicio_utc, fin_utc


def _consolidar_clima(parcela_id: int, fecha: date, db: Session) -> None:
    """Pide a la API los agregados diarios y los guarda. Ver el spec: no se
    agregan desde log_clima porque las muestras cada 3 h infravaloran las sumas."""
    parcela = db.query(Parcela).filter(Parcela.id == parcela_id).first()
    if parcela is None or parcela.latitud is None or parcela.longitud is None:
        logger.info("Parcela %s sin coordenadas; se omite el clima", parcela_id)
        return

    filas = get_provider().fetch_diario(parcela.latitud, parcela.longitud, past_days=7)
    del_dia = [f for f in filas if f.get("fecha") == fecha]
    if not del_dia:
        logger.warning("La API no devolvio datos para %s", fecha)
        return

    guardar_dias(parcela_id, del_dia, db)
    logger.info("Clima consolidado %s para parcela %s", fecha, parcela_id)


def _consolidar_suelo(parcela_id: int, fecha: date, db: Session) -> None:
    inicio_utc, fin_utc = _ventana_dia_civil(fecha)

    lecturas = (
        db.query(LogSensor)
        .join(Sensor, LogSensor.sensor_id == Sensor.id)
        .filter(
            LogSensor.parcela_id == parcela_id,
            Sensor.activo.is_(True),
            LogSensor.fecha_hora >= inicio_utc,
            LogSensor.fecha_hora < fin_utc,
        )
        .all()
    )
    resumen = calcular_resumen(lecturas)
    if resumen["n_lecturas"] == 0:
        # Sin lecturas no hay nada que resumir. Escribir la fila igualmente
        # llenaria la tabla de dias fantasma indistinguibles de dias medidos,
        # y con la ventana nocturna serian 8 por parcela y noche.
        return

    existente = db.query(SueloDiario).filter_by(parcela_id=parcela_id, fecha=fecha).first()
    if existente:
        for campo, valor in resumen.items():
            setattr(existente, campo, valor)
    else:
        db.add(SueloDiario(parcela_id=parcela_id, fecha=fecha, **resumen))

    db.commit()
    logger.info("Suelo consolidado %s para parcela %s", fecha, parcela_id)


def consolidar_datos_diarios(parcela_id: int, fecha: date):
    """
    Consolida el día en clima_diario y suelo_diario. Cada tabla va en su propio
    try/except: un fallo en una fuente no impide consolidar la otra — que es
    justamente el motivo por el que se partió la tabla original.

    `clima_diario.fecha` y `suelo_diario.fecha` cubren la MISMA ventana
    horaria real: el día civil español. Ya no hay discrepancia entre ambas
    tablas (antes sí la había — ver el historial de este archivo — porque
    `suelo_diario` usaba el día civil UTC en vez del local):

      - `clima_diario.fecha` viene de Open-Meteo con `timezone: "auto"` (ver
        `app/services/weather.py`), que de facto es el día local español
        porque hoy todas las parcelas están en España.
      - `suelo_diario.fecha` se calcula aquí con `_ventana_dia_civil()`, que
        construye explícitamente el día civil de `TZ_LOCAL` (Europe/Madrid,
        ver esa constante) y lo convierte a UTC naive para filtrar
        `LogSensor.fecha_hora`.

      Esto es una decisión de producto, no una coincidencia técnica: se fija
      a propósito a España porque es donde se trabaja hoy y donde se prevé
      seguir trabajando. Un `JOIN clima_diario c ON s.parcela_id =
      c.parcela_id AND s.fecha = c.fecha` compara ahora agregados del mismo
      día real.

      SI ALGÚN DÍA HAY PARCELAS FUERA DE ESPAÑA: `clima_diario.fecha` seguiría
      siendo el día local de cada parcela (Open-Meteo ya resuelve eso solo,
      vía `timezone: "auto"`), pero `_ventana_dia_civil()` en este archivo
      usa una zona fija (`TZ_LOCAL`) para TODAS las parcelas — habría que
      generalizarla a una zona horaria por parcela (p. ej. una columna nueva
      en `Parcela`) y pasarla como parámetro en vez de usar la constante.
    """
    db: Session = SessionLocal()
    try:
        try:
            _consolidar_clima(parcela_id, fecha, db)
        except Exception as e:
            db.rollback()
            logger.exception("Fallo consolidando clima de %s parcela %s: %s", fecha, parcela_id, e)

        try:
            _consolidar_suelo(parcela_id, fecha, db)
        except Exception as e:
            db.rollback()
            logger.exception("Fallo consolidando suelo de %s parcela %s: %s", fecha, parcela_id, e)
    finally:
        db.close()


def _consolidar_clima_ventana(parcela: Parcela, db: Session) -> int:
    """
    Guarda de una vez todos los dias que devuelve la API.

    `fetch_diario` ya pide `past_days=DIAS_VENTANA` y responde con esa ventana
    entera, asi que guardarla completa no cuesta ninguna llamada adicional:
    quedarse solo con un dia seria tirar datos ya pedidos. `guardar_dias` es un
    upsert por (parcela, fecha), de modo que rehacer dias ya consolidados los
    reescribe en vez de duplicarlos.
    """
    if parcela.latitud is None or parcela.longitud is None:
        logger.info("Parcela %s sin coordenadas; se omite el clima", parcela.id)
        return 0

    filas = get_provider().fetch_diario(parcela.latitud, parcela.longitud, past_days=DIAS_VENTANA)
    if not filas:
        logger.warning("La API no devolvio dias para la parcela %s", parcela.id)
        return 0

    guardar_dias(parcela.id, filas, db)
    return len(filas)


def consolidar_parcela(parcela: Parcela, db: Session, dias: int = DIAS_VENTANA) -> None:
    """
    Consolida la ventana de una parcela. Clima y suelo van en bloques
    independientes, por el mismo motivo por el que se partio la tabla original:
    que falle una fuente no puede costar la otra.
    """
    try:
        _consolidar_clima_ventana(parcela, db)
    except Exception as e:
        db.rollback()
        logger.exception("Fallo consolidando el clima de la parcela %s: %s", parcela.id, e)

    hoy = date.today()
    for n in range(dias, -1, -1):
        fecha = hoy - timedelta(days=n)
        try:
            _consolidar_suelo(parcela.id, fecha, db)
        except Exception as e:
            db.rollback()
            logger.exception("Fallo consolidando suelo de %s parcela %s: %s", fecha, parcela.id, e)


def consolidar_todas_parcelas(dias: int = DIAS_VENTANA) -> None:
    """
    Punto de entrada del scheduler nocturno y del lanzador manual (`worker.py`),
    para que ambos hagan exactamente lo mismo. Recorre todas las parcelas
    aislando el fallo de cada una: una parcela rota no puede dejar sin
    consolidar a las demas.
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

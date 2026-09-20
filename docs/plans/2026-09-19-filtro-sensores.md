# Filtro de sensores y medias diarias por sensor — plan de implementación

> **Para quien lo ejecute:** sub-skill obligatoria: `superpowers:subagent-driven-development` (recomendada) o `superpowers:executing-plans`, tarea a tarea. Los pasos llevan casillas (`- [ ]`) para seguir el avance.

**Objetivo:** que en Análisis se pueda ver la media de todos los sensores (por defecto), un sensor, la media de varios o varios comparados, en 48 horas y en vistas diarias, con las medias diarias por sensor calculadas al momento desde las lecturas.

**Arquitectura:**
- **Servidor:**
  - `GET /parcelas/{id}/suelo/diario` pasa a agrupar `log_sensores` por día y sensor en SQL, con un índice nuevo;
  - `suelo_diario` y la consolidación de suelo desaparecen;
  - `/dashboard` usa la media justa.
- **Web:**
  - funciones puras (`series.js`) combinan las filas por sensor según la selección;
  - un hook guarda la selección;
  - un componente dibuja las gráficas de suelo, con eje de tiempo real en 48 horas.

**Stack:** FastAPI + SQLAlchemy 2 + Pydantic 2 (tests con pytest sobre SQLite en memoria) · React 19 + Recharts 3 + Tailwind 4 (tests con Vitest + Testing Library).

**Diseño:** [docs/specs/2026-09-19-filtro-sensores-design.md](../specs/2026-09-19-filtro-sensores-design.md). Se lee junto a este plan.

## Restricciones globales

- **Media justa** en todo el proyecto: media de las medias de cada sensor. En periodos, cada sensor se pondera por sus lecturas dentro de sí mismo, no frente a los demás.
- **Días:** día civil de Madrid; `log_sensores.fecha_hora` ya se guarda en esa hora, sin zona.
- **Solo sensores activos** (`Sensor.activo`) en series, selector y medias.
- **Tintas de sensor** por número, en ciclo: S1 `#4B98E3`, S2 `#C7832D`, S3 `#C1558A`, S4 `#69A81C`, S5 `#A979DD`, S6 `#27A6A3`.
- **Trazo por profundidad:** 20 cm continuo, 40 cm `6 3`, 60 cm `2 3`, sin profundidad (o cualquier otra) continuo.
- **Textos en castellano**, con el estilo de la aplicación (Mono versal para rótulos). Botones de estado con `aria-pressed`.
- **Commits:** en este proyecto **no se hace commit salvo que el usuario lo pida**. Los pasos «Checkpoint» pasan las pruebas en lugar de hacer commit.
- **Comandos** desde la raíz del repo (`vinalert_api/`). Servidor: `python -m pytest -q -p no:warnings`. Web: `cd vinalert-front && npx vitest run`.
- **Migraciones:** no se ejecuta ningún SQL contra la base de datos sin permiso explícito del usuario, y antes siempre hay copia con `pg_dump`.

---

## Mapa de ficheros

| Fichero | Qué hace |
|---|---|
| `app/services/sensor_stats.py` | + `media_justa()` |
| `app/routers/sensores.py` | `_obtener_resumen` usa `media_justa` para las medias |
| `app/models.py` | índice en `LogSensor`; fuera `SueloDiario` y su relación |
| `app/schemas.py` | + `SueloDiarioSensorResp`; fuera `SueloDiarioResp` |
| `app/routers/parcelas.py` | endpoint `/suelo/diario` nuevo; `borrar_parcela` sin `SueloDiario` |
| `app/services/consolidacion.py` | solo clima |
| `app/main.py` | comentario del job |
| `migracion_2026_09_19_suelo_por_sensor.sql` | índice + `DROP TABLE suelo_diario` |
| `README.md` | lista de migraciones y tabla de la API |
| `tests/test_sensor_stats.py`, `tests/test_dashboard.py` | media justa |
| `tests/test_suelo_diario_sensor.py` (nuevo) | endpoint nuevo |
| `tests/test_endpoints_diarios.py`, `test_modelos_diarios.py`, `test_paridad_columnas.py`, `test_consolidacion_scheduler.py` | quitar suelo |
| `tests/test_consolidacion.py` | se borra (probaba solo la consolidación de un día y el suelo) |
| `vinalert-front/src/pantallas/analisis/tema.js` | tintas y trazos de sensor |
| `vinalert-front/src/pantallas/analisis/series.js` (nuevo) | cálculo de series, puro |
| `vinalert-front/src/pantallas/analisis/series.test.js` (nuevo) | pruebas de lo anterior |
| `vinalert-front/src/pantallas/analisis/useSeleccionSensores.js` (nuevo) | hook de selección |
| `vinalert-front/src/pantallas/analisis/SelectorSensores.jsx` (nuevo) | banda del selector |
| `vinalert-front/src/pantallas/analisis/useSeleccionSensores.test.jsx` (nuevo) | pruebas del hook |
| `vinalert-front/src/pantallas/analisis/GraficaSuelo.jsx` (nuevo) | gráficas de suelo en los modos Media y Comparar |
| `vinalert-front/src/pantallas/analisis/Detalle.jsx` | «tus sondas y el modelo» sigue la selección |
| `vinalert-front/src/pantallas/Analisis.jsx` | carga de sensores, selector, series, cifras |
| `vinalert-front/src/pantallas/Analisis.test.jsx` | mock de sensores y pruebas nuevas |
| `vinalert-front/src/componentes/ModalExportar.jsx` | media justa diaria y pestaña «Suelo por sensor» |
| `vinalert-front/src/componentes/ModalExportar.test.jsx` (nuevo) | pruebas de la exportación |
| `vinalert-front/src/test/respuestas.js` | `SUELO_DIARIO` por sensor y `SENSORES_PARCELA` |

---

### Tarea 1: media justa en el servidor y en `/dashboard`

**Ficheros:**
- Modificar: `app/services/sensor_stats.py`, `app/routers/sensores.py` (función `_obtener_resumen`)
- Pruebas: `tests/test_sensor_stats.py`, `tests/test_dashboard.py`

**Interfaces:**
- Produce: `media_justa(entradas: Iterable[tuple]) -> Optional[float]` en `app.services.sensor_stats`. Cada tupla es `(sensor_id, valor)` o `(sensor_id, valor, peso)`, y el peso por defecto es 1.

- [ ] **Paso 1: pruebas que fallan.** Al final de `tests/test_sensor_stats.py`:

```python


def test_media_justa_es_la_media_de_las_medias_de_cada_sensor():
    from app.services.sensor_stats import media_justa

    # A manda 3 lecturas (30, 30, 30) y B una (10). Por lectura saldria 25;
    # la media justa es (30 + 10) / 2 = 20.
    assert media_justa([(1, 30.0), (1, 30.0), (1, 30.0), (2, 10.0)]) == 20.0


def test_media_justa_ignora_los_nulos_y_sin_datos_devuelve_none():
    from app.services.sensor_stats import media_justa

    assert media_justa([(1, None), (2, 12.0)]) == 12.0
    assert media_justa([]) is None
    assert media_justa([(1, None)]) is None


def test_media_justa_pondera_dentro_de_cada_sensor():
    from app.services.sensor_stats import media_justa

    # Sensor 1: un dia a 30 con 100 lecturas y otro a 32 con 100 -> 31.
    # Sensor 2: 20 con 10 lecturas y 22 con 10 -> 21. Justa: 26.
    assert media_justa([(1, 30.0, 100), (1, 32.0, 100), (2, 20.0, 10), (2, 22.0, 10)]) == 26.0
```

Al final de `tests/test_dashboard.py`:

```python


def test_el_dashboard_usa_la_media_justa(client, auth_headers, parcela_id):
    """Un sensor que manda mas lecturas no pesa mas en la media de Estado."""
    from datetime import datetime, timedelta
    from zoneinfo import ZoneInfo

    a = alta_sensor(client, auth_headers, parcela_id)
    b = alta_sensor(client, auth_headers, parcela_id)
    ahora = datetime.now(ZoneInfo("Europe/Madrid")).replace(tzinfo=None)
    for i, (sensor, humedad) in enumerate([(a, 30.0), (a, 30.0), (a, 30.0), (b, 10.0)]):
        client.post(
            "/logs/sensor/",
            json={
                "parcela_id": parcela_id,
                "sensor_id": sensor["id"],
                "fecha_hora": (ahora - timedelta(minutes=10 + i)).isoformat(),
                "humedad_suelo_pct": humedad,
                "temperatura_suelo": 20.0 if sensor is a else 10.0,
            },
            headers=auth_headers,
        )

    estado = client.get(f"/parcelas/{parcela_id}/dashboard", headers=auth_headers).json()["estado_suelo"]

    assert estado["humedad_media"] == 20.0
    assert estado["temperatura_media"] == 15.0
    assert estado["n_lecturas"] == 4
```

- [ ] **Paso 2: comprobar que fallan.**
Ejecutar: `python -m pytest -q -p no:warnings tests/test_sensor_stats.py tests/test_dashboard.py`
Esperado: FALLAN por `ImportError: cannot import name 'media_justa'` y `assert 25.0 == 20.0`.

- [ ] **Paso 3: implementación.** En `app/services/sensor_stats.py`, tras `_extremo`:

```python
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
```

En `app/routers/sensores.py`, el import pasa a:

```python
from ..services.sensor_stats import calcular_resumen, media_justa
```

y el final de `_obtener_resumen` a:

```python
    resumen = calcular_resumen(lecturas)
    # Las medias que ensena Estado son las justas (ver media_justa); el resto
    # del resumen (n, desviaciones) sigue siendo sobre todas las lecturas.
    resumen["humedad_media"] = media_justa((l.sensor_id, l.humedad_suelo_pct) for l in lecturas)
    resumen["temperatura_media"] = media_justa((l.sensor_id, l.temperatura_suelo) for l in lecturas)
    return ResumenSensoresResp(parcela_id=parcela_id, desde=desde, hasta=hasta, **resumen)
```

- [ ] **Paso 4: comprobar que pasan.**
Ejecutar: `python -m pytest -q -p no:warnings tests/test_sensor_stats.py tests/test_dashboard.py tests/test_sensores_catalogo.py`
Esperado: todo en verde.

- [ ] **Paso 5: checkpoint.** `python -m pytest -q -p no:warnings`. Esperado: todo en verde.

---

### Tarea 2: índice y `GET /parcelas/{id}/suelo/diario` por sensor

**Ficheros:**
- Modificar: `app/models.py` (clase `LogSensor`), `app/schemas.py`, `app/routers/parcelas.py` (endpoint `obtener_suelo_diario` e imports)
- Crear: `tests/test_suelo_diario_sensor.py`
- Modificar: `tests/test_endpoints_diarios.py` (quitar las pruebas de suelo)

**Interfaces:**
- Produce: `SueloDiarioSensorResp` en `app.schemas`, con los campos `fecha: date`, `sensor_id: int`, `sensor_numero: int`, `profundidad_cm: Optional[float]`, `humedad_media|humedad_max|humedad_min|temperatura_media|temperatura_max|temperatura_min: Optional[float]` y `n_lecturas: int`.
- Produce: `GET /parcelas/{id}/suelo/diario?dias=N` (`dias` entre 1 y 366, por defecto 30), que devuelve `List[SueloDiarioSensorResp]` ordenada por fecha y número de sensor.

- [ ] **Paso 1: pruebas que fallan.** Crear `tests/test_suelo_diario_sensor.py`:

```python
"""
GET /parcelas/{id}/suelo/diario: una fila por dia y sensor, calculada al
momento desde log_sensores (sin tabla de agregados). Ver
docs/specs/2026-09-19-filtro-sensores-design.md.
"""
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.models import LogSensor, Sensor

HOY = datetime.now(ZoneInfo("Europe/Madrid")).date()


def _sensor(db, parcela_id, numero, profundidad=None, activo=True):
    s = Sensor(parcela_id=parcela_id, numero=numero, etiqueta=f"S{numero}",
               profundidad_cm=profundidad, activo=activo)
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


def _lectura(db, parcela_id, sensor, cuando, humedad, temperatura=20.0):
    db.add(LogSensor(parcela_id=parcela_id, sensor_id=sensor.id, fecha_hora=cuando,
                     humedad_suelo_pct=humedad, temperatura_suelo=temperatura))
    db.commit()


def _a_las(dias_atras, hora, minuto=0):
    return datetime.combine(HOY - timedelta(days=dias_atras), time(hora, minuto))


def _pedir(client, headers, parcela_id, **params):
    return client.get(f"/parcelas/{parcela_id}/suelo/diario", params=params, headers=headers)


def test_una_fila_por_dia_y_sensor_con_media_maximo_minimo_y_lecturas(client, auth_headers, parcela_id, db_session):
    s1 = _sensor(db_session, parcela_id, 1, 20.0)
    s2 = _sensor(db_session, parcela_id, 2, 40.0)
    _lectura(db_session, parcela_id, s1, _a_las(1, 8), 30.0, 18.0)
    _lectura(db_session, parcela_id, s1, _a_las(1, 9), 34.0, 20.0)
    _lectura(db_session, parcela_id, s2, _a_las(1, 8), 20.0, 16.0)

    filas = _pedir(client, auth_headers, parcela_id, dias=7).json()

    assert len(filas) == 2
    f1, f2 = filas
    assert f1["fecha"] == str(HOY - timedelta(days=1))
    assert (f1["sensor_id"], f1["sensor_numero"], f1["profundidad_cm"]) == (s1.id, 1, 20.0)
    assert f1["humedad_media"] == 32.0 and f1["humedad_max"] == 34.0 and f1["humedad_min"] == 30.0
    assert f1["temperatura_media"] == 19.0 and f1["temperatura_max"] == 20.0 and f1["temperatura_min"] == 18.0
    assert f1["n_lecturas"] == 2
    assert (f2["sensor_numero"], f2["n_lecturas"]) == (2, 1)


def test_el_dia_es_de_00_00_a_23_59_en_hora_de_madrid(client, auth_headers, parcela_id, db_session):
    s1 = _sensor(db_session, parcela_id, 1)
    _lectura(db_session, parcela_id, s1, _a_las(2, 23, 30), 10.0)
    _lectura(db_session, parcela_id, s1, _a_las(1, 0, 0), 50.0)

    filas = _pedir(client, auth_headers, parcela_id, dias=7).json()

    assert [(f["fecha"], f["humedad_media"]) for f in filas] == [
        (str(HOY - timedelta(days=2)), 10.0),
        (str(HOY - timedelta(days=1)), 50.0),
    ]


def test_incluye_el_dia_de_hoy(client, auth_headers, parcela_id, db_session):
    s1 = _sensor(db_session, parcela_id, 1)
    _lectura(db_session, parcela_id, s1, datetime.combine(HOY, time(0, 5)), 25.0)

    filas = _pedir(client, auth_headers, parcela_id, dias=1).json()

    assert [f["fecha"] for f in filas] == [str(HOY)]


def test_dias_filtra_incluido_el_borde(client, auth_headers, parcela_id, db_session):
    s1 = _sensor(db_session, parcela_id, 1)
    _lectura(db_session, parcela_id, s1, _a_las(10, 12), 10.0)
    _lectura(db_session, parcela_id, s1, _a_las(7, 0), 20.0)

    assert [f["humedad_media"] for f in _pedir(client, auth_headers, parcela_id, dias=7).json()] == [20.0]
    assert len(_pedir(client, auth_headers, parcela_id, dias=30).json()) == 2


def test_excluye_sensores_inactivos(client, auth_headers, parcela_id, db_session):
    activo = _sensor(db_session, parcela_id, 1)
    baja = _sensor(db_session, parcela_id, 2, activo=False)
    _lectura(db_session, parcela_id, activo, _a_las(1, 8), 30.0)
    _lectura(db_session, parcela_id, baja, _a_las(1, 8), 99.0)

    filas = _pedir(client, auth_headers, parcela_id, dias=7).json()

    assert [f["sensor_id"] for f in filas] == [activo.id]


def test_ordena_por_fecha_y_despues_por_numero(client, auth_headers, parcela_id, db_session):
    s2 = _sensor(db_session, parcela_id, 2)
    s1 = _sensor(db_session, parcela_id, 1)
    for s in (s2, s1):
        _lectura(db_session, parcela_id, s, _a_las(2, 8), 10.0)
        _lectura(db_session, parcela_id, s, _a_las(1, 8), 10.0)

    filas = _pedir(client, auth_headers, parcela_id, dias=7).json()

    assert [(f["fecha"][-2:], f["sensor_numero"]) for f in filas] == [
        (str(HOY - timedelta(days=2))[-2:], 1), (str(HOY - timedelta(days=2))[-2:], 2),
        (str(HOY - timedelta(days=1))[-2:], 1), (str(HOY - timedelta(days=1))[-2:], 2),
    ]


def test_dias_fuera_de_rango_da_422(client, auth_headers, parcela_id):
    assert _pedir(client, auth_headers, parcela_id, dias=0).status_code == 422
    assert _pedir(client, auth_headers, parcela_id, dias=367).status_code == 422
```

En `tests/test_endpoints_diarios.py`, borrar las funciones `test_suelo_diario_devuelve_ordenado`, `test_suelo_diario_filtra_por_dias` y `test_suelo_diario_respeta_el_limite`. Cambiar el import `from app.models import ClimaDiario, SueloDiario` por `from app.models import ClimaDiario`. La prueba `test_diarios_de_otra_parcela_dan_404` se queda: el endpoint sigue existiendo.

- [ ] **Paso 2: comprobar que fallan.**
Ejecutar: `python -m pytest -q -p no:warnings tests/test_suelo_diario_sensor.py`
Esperado: FALLAN, porque la respuesta es la antigua, sin `sensor_id`: `KeyError` o listas vacías.

- [ ] **Paso 3: implementación.**

En `app/models.py`, añadir `Index` al import de SQLAlchemy:

```python
from sqlalchemy import Column, Integer, String, Float, DateTime, Date, ForeignKey, Text, Boolean, Index, UniqueConstraint
```

y en `class LogSensor(Base):`, justo tras `__tablename__ = "log_sensores"`:

```python
    # Todas las consultas de lecturas van por parcela y rango de fechas: sin
    # este indice, agrupar un ano de lecturas recorreria la tabla entera.
    __table_args__ = (Index("ix_log_sensores_parcela_fecha", "parcela_id", "fecha_hora"),)
```

En `app/schemas.py`, justo antes de `class SueloDiarioResp(BaseModel):`:

```python
class SueloDiarioSensorResp(BaseModel):
    """Un dia de un sensor en GET /parcelas/{id}/suelo/diario."""
    fecha: date
    sensor_id: int
    sensor_numero: int
    profundidad_cm: Optional[float] = None
    humedad_media: Optional[float] = None
    humedad_max: Optional[float] = None
    humedad_min: Optional[float] = None
    temperatura_media: Optional[float] = None
    temperatura_max: Optional[float] = None
    temperatura_min: Optional[float] = None
    n_lecturas: int


```

En `app/routers/parcelas.py`:
- la primera línea pasa a `from datetime import date, datetime, time, timedelta`;
- tras `from fastapi import APIRouter, Depends, HTTPException, Query`, añadir `from sqlalchemy import func`;
- en el import de esquemas, añadir `SueloDiarioSensorResp` (dejando `SueloDiarioResp` por ahora: lo quita la tarea 3);
- tras `from .sensores import _obtener_resumen`, añadir `from ..services.weather import TZ_LOCAL`.

Sustituir la función `obtener_suelo_diario` entera, con su decorador, por:

```python
@router.get("/parcelas/{parcela_id}/suelo/diario", response_model=List[SueloDiarioSensorResp])
def obtener_suelo_diario(
    parcela_id: int,
    dias: int = Query(30, ge=1, le=366),
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    """
    Una fila por dia y sensor activo, desde las 00:00 de hace `dias` dias
    hasta ahora (hoy incluido). Se agrupa al momento desde log_sensores: no
    hay tabla de agregados que pueda quedarse sin rellenar. `fecha_hora` ya
    esta en hora de Madrid, asi que date() da el dia civil espanol.
    """
    parcela_con_lectura(parcela_id, current_user, db)
    hoy = datetime.now(TZ_LOCAL).date()
    desde = datetime.combine(hoy - timedelta(days=dias), time.min)
    dia = func.date(LogSensor.fecha_hora)

    filas = (
        db.query(
            dia.label("fecha"),
            Sensor.id, Sensor.numero, Sensor.profundidad_cm,
            func.avg(LogSensor.humedad_suelo_pct), func.max(LogSensor.humedad_suelo_pct),
            func.min(LogSensor.humedad_suelo_pct),
            func.avg(LogSensor.temperatura_suelo), func.max(LogSensor.temperatura_suelo),
            func.min(LogSensor.temperatura_suelo),
            func.count(LogSensor.id),
        )
        .join(Sensor, LogSensor.sensor_id == Sensor.id)
        .filter(
            LogSensor.parcela_id == parcela_id,
            Sensor.activo.is_(True),
            LogSensor.fecha_hora >= desde,
        )
        .group_by(dia, Sensor.id, Sensor.numero, Sensor.profundidad_cm)
        .order_by(dia, Sensor.numero)
        .all()
    )
    return [
        SueloDiarioSensorResp(
            fecha=f[0], sensor_id=f[1], sensor_numero=f[2], profundidad_cm=f[3],
            humedad_media=f[4], humedad_max=f[5], humedad_min=f[6],
            temperatura_media=f[7], temperatura_max=f[8], temperatura_min=f[9],
            n_lecturas=f[10],
        )
        for f in filas
    ]
```

- [ ] **Paso 4: comprobar que pasan.**
Ejecutar: `python -m pytest -q -p no:warnings tests/test_suelo_diario_sensor.py tests/test_endpoints_diarios.py tests/test_matriz_permisos.py`
Esperado: todo en verde. La matriz incluye `("GET", "/parcelas/{pid}/suelo/diario", False)`, que sigue siendo cierto.

- [ ] **Paso 5: checkpoint.** `python -m pytest -q -p no:warnings`. Esperado: todo en verde.

---

### Tarea 3: retirar `suelo_diario`, migración y README

**Ficheros:**
- Modificar: `app/models.py`, `app/schemas.py`, `app/routers/parcelas.py`, `app/services/consolidacion.py`, `app/main.py`, `README.md`
- Crear: `migracion_2026_09_19_suelo_por_sensor.sql`
- Borrar: `tests/test_consolidacion.py`
- Modificar: `tests/test_consolidacion_scheduler.py` (reescritura completa), `tests/test_paridad_columnas.py`, `tests/test_modelos_diarios.py`

**Interfaces:**
- Produce: `consolidar_parcela(parcela, db, dias=DIAS_VENTANA)` y `consolidar_todas_parcelas(dias=DIAS_VENTANA)`, que solo consolidan clima, con `past_days=min(dias, 92)`. `worker.py` no cambia.

- [ ] **Paso 1: reescribir las pruebas de consolidación.** Sustituir el contenido completo de `tests/test_consolidacion_scheduler.py` por:

```python
from datetime import date, timedelta
from unittest.mock import patch

from apscheduler.schedulers.background import BackgroundScheduler

from app.models import ClimaDiario, Parcela
from tests.conftest import SesionSinCierre


def _parcela(db_session, nombre, con_coordenadas=True):
    p = Parcela(
        nombre=nombre,
        latitud=42.3 if con_coordenadas else None,
        longitud=-8.6 if con_coordenadas else None,
    )
    db_session.add(p)
    db_session.commit()
    db_session.refresh(p)
    return p


def _filas_ventana(dias=8):
    """Lo que devuelve fetch_diario: los `dias` días que la API ya manda en una sola respuesta."""
    hoy = date.today()
    return [
        {
            "fecha": hoy - timedelta(days=n),
            "temp_max": 30.0 + n,
            "temp_min": 15.0,
            "fuente": "pronostico",
            "suelo_modelo_capa": "0_to_7cm",
        }
        for n in range(dias - 1, -1, -1)
    ]


def test_consolida_el_clima_de_todas_las_parcelas(db_session, monkeypatch):
    from app.services import consolidacion

    p1 = _parcela(db_session, "P1")
    p2 = _parcela(db_session, "P2")
    monkeypatch.setattr(consolidacion, "SessionLocal", lambda: SesionSinCierre(db_session))

    with patch("app.services.consolidacion.get_provider") as mock:
        mock.return_value.fetch_diario.return_value = _filas_ventana()
        consolidacion.consolidar_todas_parcelas()

    for p in (p1, p2):
        assert db_session.query(ClimaDiario).filter_by(parcela_id=p.id).count() == 8


def test_una_parcela_que_falla_no_impide_las_demas(db_session, monkeypatch):
    from app.services import consolidacion

    p1 = _parcela(db_session, "La que revienta")
    p2 = _parcela(db_session, "La que debe salir bien")
    monkeypatch.setattr(consolidacion, "SessionLocal", lambda: SesionSinCierre(db_session))

    with patch("app.services.consolidacion.get_provider") as mock:
        mock.return_value.fetch_diario.side_effect = [
            RuntimeError("la API falla para la primera"),
            _filas_ventana(),
        ]
        consolidacion.consolidar_todas_parcelas()

    assert db_session.query(ClimaDiario).filter_by(parcela_id=p1.id).count() == 0
    assert db_session.query(ClimaDiario).filter_by(parcela_id=p2.id).count() > 0


def test_la_ventana_guarda_todos_los_dias_con_una_sola_llamada(db_session, monkeypatch):
    """fetch_diario ya devuelve 8 días en UNA respuesta: guardarlos todos no cuesta otra llamada."""
    from app.services import consolidacion

    p = _parcela(db_session, "P1")
    monkeypatch.setattr(consolidacion, "SessionLocal", lambda: SesionSinCierre(db_session))

    with patch("app.services.consolidacion.get_provider") as mock:
        mock.return_value.fetch_diario.return_value = _filas_ventana(dias=8)
        consolidacion.consolidar_todas_parcelas()
        assert mock.return_value.fetch_diario.call_count == 1, "una sola llamada por parcela"
        assert mock.return_value.fetch_diario.call_args.kwargs["past_days"] == 7

    assert db_session.query(ClimaDiario).filter_by(parcela_id=p.id).count() == 8


def test_una_ventana_mayor_pide_esos_dias_con_el_tope_de_la_api(db_session, monkeypatch):
    """`python worker.py 30` pide 30 dias; Open-Meteo no da mas de 92 hacia atras."""
    from app.services import consolidacion

    _parcela(db_session, "P1")
    monkeypatch.setattr(consolidacion, "SessionLocal", lambda: SesionSinCierre(db_session))

    with patch("app.services.consolidacion.get_provider") as mock:
        mock.return_value.fetch_diario.return_value = []
        consolidacion.consolidar_todas_parcelas(30)
        assert mock.return_value.fetch_diario.call_args.kwargs["past_days"] == 30
        consolidacion.consolidar_todas_parcelas(365)
        assert mock.return_value.fetch_diario.call_args.kwargs["past_days"] == 92


def test_ejecutar_dos_veces_no_duplica(db_session, monkeypatch):
    """La idempotencia es lo que sostiene la ventana: sin ella, rehacer días ensucia."""
    from app.services import consolidacion

    p = _parcela(db_session, "P1")
    monkeypatch.setattr(consolidacion, "SessionLocal", lambda: SesionSinCierre(db_session))

    with patch("app.services.consolidacion.get_provider") as mock:
        mock.return_value.fetch_diario.return_value = _filas_ventana()
        consolidacion.consolidar_todas_parcelas()
        consolidacion.consolidar_todas_parcelas()

    assert db_session.query(ClimaDiario).filter_by(parcela_id=p.id).count() == 8


def test_parcela_sin_coordenadas_no_llama_a_la_api(db_session, monkeypatch):
    from app.services import consolidacion

    p = _parcela(db_session, "Sin coordenadas", con_coordenadas=False)
    monkeypatch.setattr(consolidacion, "SessionLocal", lambda: SesionSinCierre(db_session))

    with patch("app.services.consolidacion.get_provider") as mock:
        consolidacion.consolidar_todas_parcelas()
        assert mock.return_value.fetch_diario.call_count == 0

    assert db_session.query(ClimaDiario).filter_by(parcela_id=p.id).count() == 0


def test_el_job_de_consolidacion_queda_programado():
    """Si el job no se registra al arrancar, clima_diario no se llena nunca."""
    from app.main import _programar_jobs

    scheduler = BackgroundScheduler()
    _programar_jobs(scheduler)

    job = scheduler.get_job("consolidar_diario")
    assert job is not None, "el job de consolidacion diaria no esta registrado"


def test_la_consolidacion_corre_al_arrancar_y_cada_hora():
    """
    Solo a las 02:00 no basta: la API corre en un ordenador que a esa hora
    puede estar apagado, y APScheduler guarda los jobs en memoria. Paso de
    verdad: del 20-08 al 18-09-2026 no se consolido ni un dia.
    """
    from app.main import _programar_jobs

    scheduler = BackgroundScheduler()
    _programar_jobs(scheduler)

    job = scheduler.get_job("consolidar_diario")
    assert getattr(job, "next_run_time", None) is not None, "no se ejecuta al arrancar"
    assert job.trigger.interval == timedelta(hours=1)
```

Borrar `tests/test_consolidacion.py`: `git rm tests/test_consolidacion.py`. Probaba `consolidar_datos_diarios`, `_consolidar_suelo` y `_ventana_dia_civil`, que desaparecen. La del día civil la cubre ahora `test_el_dia_es_de_00_00_a_23_59_en_hora_de_madrid` (tarea 2).

En `tests/test_paridad_columnas.py`:
- el import de modelos pasa a `from app.models import ClimaDiario`;
- borrar la línea `from app.services.sensor_stats import calcular_resumen`;
- borrar la función `test_calcular_resumen_cubre_exactamente_las_columnas_de_suelo_diario` entera.

En `tests/test_modelos_diarios.py`:
- el import pasa a `from app.models import ClimaDiario`;
- borrar las funciones `test_suelo_diario_se_guarda` y `test_suelo_diario_no_admite_dos_filas_del_mismo_dia`.

- [ ] **Paso 2: comprobar que falla.**
Ejecutar: `python -m pytest -q -p no:warnings tests/test_consolidacion_scheduler.py`
Esperado: FALLA `test_una_ventana_mayor_pide_esos_dias_con_el_tope_de_la_api`, porque hoy `past_days` siempre es 7.

- [ ] **Paso 3: implementación.**

`app/services/consolidacion.py`: sustituir **el fichero entero** por:

```python
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
```

`app/models.py`:
- borrar la línea `    suelo_diario = relationship("SueloDiario", back_populates="parcela")` de `Parcela`;
- borrar la clase `SueloDiario` entera, desde `class SueloDiario(Base):` hasta la línea `parcela = relationship("Parcela", back_populates="suelo_diario")` incluida.

`app/schemas.py`: borrar la clase `SueloDiarioResp` entera.

`app/routers/parcelas.py`:
- borrar `SueloDiario,` y `SueloDiarioResp,` de los imports;
- borrar en `borrar_parcela` la línea `db.query(SueloDiario).filter(SueloDiario.parcela_id == parcela_id).delete(synchronize_session=False)`;
- `date` deja de usarse si ningún otro sitio lo usa: comprobarlo con `python -m pyflakes app/routers/parcelas.py` y quitarlo del import si sale.

`app/main.py`: en el docstring de `_programar_jobs`, la frase «si el de consolidacion no se registra, clima_diario y suelo_diario no se llenan nunca y el fallo es silencioso» pasa a «si el de consolidacion no se registra, clima_diario no se llena nunca y el fallo es silencioso».

Crear `migracion_2026_09_19_suelo_por_sensor.sql`:

```sql
-- ============================================================================
-- Migracion: medias diarias del suelo por sensor, calculadas al momento
-- Fecha: 2026-09-19
--
-- 1. Indice (parcela_id, fecha_hora) en log_sensores: GET
--    /parcelas/{id}/suelo/diario agrupa las lecturas por dia y sensor en cada
--    peticion, y sin indice recorreria la tabla entera.
-- 2. Se borra suelo_diario: guardaba una fila por parcela y dia, sin sensor,
--    y la rellenaba una consolidacion que llego a pasar un mes sin ejecutarse.
--    Sus datos son derivables de log_sensores.
--
-- Ejecutar DESPUES de desplegar el codigo que ya no usa suelo_diario.
--
-- NO ejecutar este script contra ninguna base de datos sin confirmacion
-- explicita del usuario. Hacer antes una copia (pg_dump).
--
-- Idempotente (IF NOT EXISTS / IF EXISTS). Destructivo solo para suelo_diario.
-- ============================================================================

CREATE INDEX IF NOT EXISTS ix_log_sensores_parcela_fecha ON log_sensores (parcela_id, fecha_hora);

DROP TABLE IF EXISTS suelo_diario;

-- ============================================================================
-- VERIFICACION (ejecutar despues):
--
--   SELECT indexname FROM pg_indexes WHERE tablename = 'log_sensores';
--   -- debe incluir ix_log_sensores_parcela_fecha
--   SELECT to_regclass('public.suelo_diario');
--   -- debe devolver NULL
-- ============================================================================
```

`README.md`:
- en la lista de migraciones, tras la línea de `migracion_2026_09_18_quitar_riego.sql`, añadir `psql "$DATABASE_URL" -f migracion_2026_09_19_suelo_por_sensor.sql`;
- en la tabla de la API, la fila `/parcelas/{id}/suelo/diario` pasa a `| \`GET\` | \`/parcelas/{id}/suelo/diario\` | Daily soil averages per sensor, computed from the readings. |`.

- [ ] **Paso 4: comprobar que pasa todo.**
Ejecutar: `python -m pytest -q -p no:warnings` y `python -m pyflakes app | grep -v __init__`
Esperado: todo en verde y pyflakes sin salida. `grep -rn "SueloDiario\|suelo_diario" app` solo debe encontrar comentarios.

- [ ] **Paso 5: checkpoint.** El mismo del paso 4.

---

### Tarea 4: tintas de sensor y cálculo de series en la web

**Ficheros:**
- Modificar: `vinalert-front/src/pantallas/analisis/tema.js`
- Crear: `vinalert-front/src/pantallas/analisis/series.js`, `vinalert-front/src/pantallas/analisis/series.test.js`

**Interfaces:**
- Produce, en `tema.js`: `COLORES_SENSOR: string[]`, `colorSensor(numero: number): string` y `trazoProfundidad(cm: number|null): string|undefined`.
- Produce, en `series.js`:
  - `claveHumedad(id)` y `claveTemperatura(id)`, que devuelven `'hum_s<id>'` y `'tem_s<id>'`;
  - `mediaJusta(entradas: [id, valor, peso?][]): number|null`;
  - `diarioSuelo(filas, ids)`: devuelve `[{fecha, humedad_media, temperatura_suelo, hum_s<id>, tem_s<id>}]` ordenado por fecha;
  - `horasSuelo(lecturas, ids)`: devuelve `{ media: [{t, humedad, temperatura}], porSensor: {[id]: [{t, humedad, temperatura}]} }`, con `t` en milisegundos;
  - `cortarHuecos(puntos)`: puntos `{t, ...}`; devuelve los mismos con `{t, humedad: null, temperatura: null}` insertado donde el salto supera 3 veces la mediana;
  - `rellenarDias(filas)`: filas `{fecha: 'YYYY-MM-DD'}`; devuelve las mismas con `{fecha}` en los días que faltan;
  - `mediaPeriodoDiaria(filas, ids, campo)` y `mediaPeriodoHoras(lecturas, ids, campo)`: `number|null`.

- [ ] **Paso 1: pruebas que fallan.** Crear `vinalert-front/src/pantallas/analisis/series.test.js`:

```js
import { expect, test } from 'vitest';

import {
  cortarHuecos,
  diarioSuelo,
  horasSuelo,
  mediaJusta,
  mediaPeriodoDiaria,
  mediaPeriodoHoras,
  rellenarDias,
} from './series';

const fila = (fecha, sensor_id, humedad_media, temperatura_media, n_lecturas = 10) => ({
  fecha, sensor_id, humedad_media, temperatura_media, n_lecturas,
});
const lectura = (fecha_hora, sensor_id, humedad_suelo_pct, temperatura_suelo = 20) => ({
  fecha_hora, sensor_id, humedad_suelo_pct, temperatura_suelo,
});

test('mediaJusta hace la media de las medias de cada sensor', () => {
  expect(mediaJusta([[1, 30], [1, 30], [1, 30], [2, 10]])).toBe(20);
  expect(mediaJusta([[1, null], [2, 12]])).toBe(12);
  expect(mediaJusta([])).toBeNull();
  // El peso solo cuenta dentro de cada sensor.
  expect(mediaJusta([[1, 30, 100], [1, 32, 100], [2, 20, 10], [2, 22, 10]])).toBe(26);
});

test('diarioSuelo da por dia la media justa de los elegidos y la serie de cada uno', () => {
  const filas = [
    fila('2026-09-18', 1, 30, 18), fila('2026-09-18', 2, 20, 16), fila('2026-09-18', 3, 99, 99),
    fila('2026-09-19', 1, 32, 20),
  ];

  const serie = diarioSuelo(filas, [1, 2]);

  expect(serie).toEqual([
    { fecha: '2026-09-18', humedad_media: 25, temperatura_suelo: 17, hum_s1: 30, tem_s1: 18, hum_s2: 20, tem_s2: 16 },
    { fecha: '2026-09-19', humedad_media: 32, temperatura_suelo: 20, hum_s1: 32, tem_s1: 20 },
  ]);
});

test('horasSuelo no da punto de media en un envio incompleto (caso de las 12:25)', () => {
  const lecturas = [
    lectura('2026-09-19T12:20:00', 1, 27), lectura('2026-09-19T12:20:00', 4, 27),
    lectura('2026-09-19T12:25:00', 4, 23), // falta el nodo del sensor 1
    lectura('2026-09-19T12:30:00', 1, 27), lectura('2026-09-19T12:30:00', 4, 27),
  ];

  const { media, porSensor } = horasSuelo(lecturas, [1, 4]);

  expect(media.map((p) => p.t)).toEqual([Date.parse('2026-09-19T12:20:00'), Date.parse('2026-09-19T12:30:00')]);
  expect(media[0].humedad).toBe(27);
  expect(porSensor[4].map((p) => p.humedad)).toEqual([27, 23, 27]);
  expect(porSensor[1]).toHaveLength(2);
});

test('horasSuelo: un sensor elegido que nunca manda no deja sin media', () => {
  const lecturas = [lectura('2026-09-19T12:20:00', 1, 27), lectura('2026-09-19T12:25:00', 1, 28)];

  const { media, porSensor } = horasSuelo(lecturas, [1, 6]);

  expect(media).toHaveLength(2);
  expect(porSensor[6]).toBeUndefined();
});

test('cortarHuecos corta 14 horas sin datos y no toca los envios seguidos', () => {
  const t = (hhmm, dia = '18') => Date.parse(`2026-09-${dia}T${hhmm}:00`);
  const puntos = ['21:55', '22:00', '22:05', '22:10'].map((h) => ({ t: t(h), humedad: 26 }))
    .concat(['12:14', '12:19', '12:24'].map((h) => ({ t: t(h, '19'), humedad: 25 })));

  const cortado = cortarHuecos(puntos);

  expect(cortado).toHaveLength(puntos.length + 1);
  expect(cortado[4]).toEqual({ t: t('22:10') + 1, humedad: null, temperatura: null });
});

test('rellenarDias mete los dias que faltan para que la linea se corte', () => {
  const filas = [{ fecha: '2026-09-16', humedad_media: 20 }, { fecha: '2026-09-19', humedad_media: 22 }];

  expect(rellenarDias(filas).map((f) => f.fecha)).toEqual(['2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19']);
  expect(rellenarDias(filas)[1]).toEqual({ fecha: '2026-09-17' });
});

test('medias del periodo: justas y solo de los elegidos', () => {
  const filas = [fila('2026-09-18', 1, 30, 18, 100), fila('2026-09-19', 1, 32, 20, 100), fila('2026-09-18', 2, 20, 16, 10), fila('2026-09-19', 2, 22, 16, 10)];
  expect(mediaPeriodoDiaria(filas, [1, 2], 'humedad_media')).toBe(26);
  expect(mediaPeriodoDiaria(filas, [1], 'humedad_media')).toBe(31);

  const lecturas = [lectura('a', 1, 30), lectura('b', 1, 30), lectura('c', 1, 30), lectura('d', 2, 10)];
  expect(mediaPeriodoHoras(lecturas, [1, 2], 'humedad_suelo_pct')).toBe(20);
});
```

- [ ] **Paso 2: comprobar que fallan.**
Ejecutar: `cd vinalert-front && npx vitest run src/pantallas/analisis/series.test.js`
Esperado: FALLA al importar `./series`, que no existe.

- [ ] **Paso 3: implementación.** Crear `vinalert-front/src/pantallas/analisis/series.js`:

```js
/**
 * Las series de suelo de Analisis, a partir de lo que devuelve la API y de los
 * sensores elegidos. Funciones puras: ni React ni peticiones.
 *
 * Todas usan la MEDIA JUSTA: primero la media de cada sensor y despues la de
 * esas medias. Un sensor que manda mas lecturas no pesa mas, y uno que falta
 * en un envio no mueve la media (docs/specs/2026-09-19-filtro-sensores-design.md).
 */

export const claveHumedad = (id) => `hum_s${id}`;
export const claveTemperatura = (id) => `tem_s${id}`;

const redondear = (v) => (v == null ? null : Number(v.toFixed(1)));

/** `entradas`: [sensorId, valor, peso?]. El peso (1 por defecto) solo pondera dentro de cada sensor. */
export function mediaJusta(entradas) {
  const porSensor = new Map();
  for (const [id, valor, peso = 1] of entradas) {
    if (valor == null || !peso) continue;
    const acc = porSensor.get(id) ?? { suma: 0, peso: 0 };
    acc.suma += valor * peso;
    acc.peso += peso;
    porSensor.set(id, acc);
  }
  if (!porSensor.size) return null;
  let total = 0;
  for (const { suma, peso } of porSensor.values()) total += suma / peso;
  return total / porSensor.size;
}

/** Filas de /suelo/diario -> una fila por fecha con la media justa y la serie de cada sensor elegido. */
export function diarioSuelo(filas, ids) {
  const elegidos = new Set(ids);
  const porFecha = new Map();
  for (const f of filas) {
    if (!elegidos.has(f.sensor_id)) continue;
    const delDia = porFecha.get(f.fecha) ?? [];
    delDia.push(f);
    porFecha.set(f.fecha, delDia);
  }
  return [...porFecha.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, delDia]) => {
      const fila = {
        fecha,
        humedad_media: redondear(mediaJusta(delDia.map((f) => [f.sensor_id, f.humedad_media]))),
        temperatura_suelo: redondear(mediaJusta(delDia.map((f) => [f.sensor_id, f.temperatura_media]))),
      };
      for (const f of delDia) {
        fila[claveHumedad(f.sensor_id)] = redondear(f.humedad_media);
        fila[claveTemperatura(f.sensor_id)] = redondear(f.temperatura_media);
      }
      return fila;
    });
}

/**
 * Lecturas de 48 h -> la media por envio y la serie de cada sensor, con `t`
 * en milisegundos para un eje de tiempo real. Un envio da punto de media solo
 * si trae a TODOS los elegidos que han mandado algo en el periodo: asi un
 * nodo que falla un envio no mueve la media, y uno roto no la deja vacia.
 */
export function horasSuelo(lecturas, ids) {
  const elegidos = new Set(ids);
  const propias = lecturas.filter((l) => elegidos.has(l.sensor_id));
  const presentes = new Set(propias.map((l) => l.sensor_id));

  const porEnvio = new Map();
  const porSensor = {};
  for (const l of propias) {
    const t = Date.parse(l.fecha_hora);
    const envio = porEnvio.get(t) ?? [];
    envio.push(l);
    porEnvio.set(t, envio);
    (porSensor[l.sensor_id] ??= []).push({ t, humedad: l.humedad_suelo_pct, temperatura: l.temperatura_suelo });
  }

  const media = [...porEnvio.entries()]
    .filter(([, ls]) => new Set(ls.map((l) => l.sensor_id)).size === presentes.size)
    .sort(([a], [b]) => a - b)
    .map(([t, ls]) => ({
      t,
      humedad: redondear(mediaJusta(ls.map((l) => [l.sensor_id, l.humedad_suelo_pct]))),
      temperatura: redondear(mediaJusta(ls.map((l) => [l.sensor_id, l.temperatura_suelo]))),
    }));
  for (const serie of Object.values(porSensor)) serie.sort((a, b) => a.t - b.t);
  return { media, porSensor };
}

/**
 * Inserta un punto vacio donde dos puntos seguidos estan a mas de 3 veces la
 * separacion mediana: la linea se corta en vez de dibujar una bajada falsa
 * entre dos envios separados por horas sin datos.
 */
export function cortarHuecos(puntos) {
  if (puntos.length < 3) return puntos;
  const saltos = puntos.slice(1).map((p, i) => p.t - puntos[i].t).sort((a, b) => a - b);
  const mediana = saltos[Math.floor(saltos.length / 2)];
  if (!mediana) return puntos;
  const resultado = [puntos[0]];
  for (let i = 1; i < puntos.length; i++) {
    if (puntos[i].t - puntos[i - 1].t > 3 * mediana) {
      resultado.push({ t: puntos[i - 1].t + 1, humedad: null, temperatura: null });
    }
    resultado.push(puntos[i]);
  }
  return resultado;
}

const UN_DIA = 86_400_000;

/** Mete una fila {fecha} por cada dia que falta entre dos filas: la linea se corta ahi. */
export function rellenarDias(filas) {
  if (filas.length < 2) return filas;
  const resultado = [];
  for (let i = 0; i < filas.length; i++) {
    resultado.push(filas[i]);
    if (i === filas.length - 1) break;
    // Mediodia UTC: ningun cambio de hora mueve el dia.
    let t = Date.parse(`${filas[i].fecha}T12:00:00Z`) + UN_DIA;
    const siguiente = Date.parse(`${filas[i + 1].fecha}T12:00:00Z`);
    while (t < siguiente) {
      resultado.push({ fecha: new Date(t).toISOString().slice(0, 10) });
      t += UN_DIA;
    }
  }
  return resultado;
}

/** Media justa del periodo desde las filas diarias: cada dia pesa sus lecturas dentro de su sensor. */
export function mediaPeriodoDiaria(filas, ids, campo) {
  const elegidos = new Set(ids);
  return mediaJusta(filas.filter((f) => elegidos.has(f.sensor_id)).map((f) => [f.sensor_id, f[campo], f.n_lecturas]));
}

/** Media justa del periodo desde las lecturas sueltas. */
export function mediaPeriodoHoras(lecturas, ids, campo) {
  const elegidos = new Set(ids);
  return mediaJusta(lecturas.filter((l) => elegidos.has(l.sensor_id)).map((l) => [l.sensor_id, l[campo]]));
}
```

En `vinalert-front/src/pantallas/analisis/tema.js`, al final del fichero:

```js

/**
 * Cada sensor tiene SU color, el mismo en todas las graficas, por su numero
 * (S1…S6, y vuelta a empezar). La profundidad va en el trazo: codificacion
 * secundaria, para que dos colores cercanos se sigan distinguiendo.
 */
export const COLORES_SENSOR = ['#4B98E3', '#C7832D', '#C1558A', '#69A81C', '#A979DD', '#27A6A3'];

export function colorSensor(numero) {
  return COLORES_SENSOR[(Math.max(1, numero) - 1) % COLORES_SENSOR.length];
}

/** 20 cm continuo, 40 cm discontinuo, 60 cm punteado; el resto, continuo. */
export function trazoProfundidad(cm) {
  if (cm === 40) return '6 3';
  if (cm === 60) return '2 3';
  return undefined;
}
```

- [ ] **Paso 4: comprobar que pasan.**
Ejecutar: `cd vinalert-front && npx vitest run src/pantallas/analisis/series.test.js`
Esperado: 7 pruebas en verde.

- [ ] **Paso 5: checkpoint.** `cd vinalert-front && npx vitest run`. Esperado: todo en verde.

---

### Tarea 5: hook de selección y banda del selector

**Ficheros:**
- Crear: `vinalert-front/src/pantallas/analisis/useSeleccionSensores.js`, `vinalert-front/src/pantallas/analisis/SelectorSensores.jsx`, `vinalert-front/src/pantallas/analisis/useSeleccionSensores.test.jsx`

**Interfaces:**
- Consume: `colorSensor` y `trazoProfundidad` (tarea 4).
- Produce: `useSeleccionSensores(parcelaId, sensores)`, donde `sensores` son los activos `{id, numero, profundidad_cm}` ordenados por número. Devuelve `{ ids: number[], modo: 'media'|'comparar', profundidades: number[], alternar(id), elegirProfundidad(cm), elegirTodos(), cambiarModo(modo) }`.
- Produce: `<SelectorSensores sensores={...} seleccion={...} />`. Nombres accesibles:
  - botones de sensor: `Sensor <numero>, <cm> cm`, o `Sensor <numero>` si no tiene profundidad;
  - atajos: `Todos` y `<cm> cm`;
  - modo: `Media` y `Comparar`.

- [ ] **Paso 1: pruebas que fallan.** Crear `vinalert-front/src/pantallas/analisis/useSeleccionSensores.test.jsx`:

```jsx
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, test } from 'vitest';

import SelectorSensores from './SelectorSensores';
import { useSeleccionSensores } from './useSeleccionSensores';

const SENSORES = [
  { id: 11, numero: 1, profundidad_cm: 20 },
  { id: 12, numero: 2, profundidad_cm: 40 },
  { id: 14, numero: 4, profundidad_cm: 20 },
];

function Banco({ parcelaId = 1, sensores = SENSORES }) {
  const seleccion = useSeleccionSensores(parcelaId, sensores);
  return (
    <>
      <SelectorSensores sensores={sensores} seleccion={seleccion} />
      <output data-testid="estado">{`${seleccion.modo}:${seleccion.ids.join(',')}`}</output>
    </>
  );
}

const estado = () => screen.getByTestId('estado').textContent;
const pulsar = (nombre) => fireEvent.click(screen.getByRole('button', { name: nombre }));

beforeEach(() => localStorage.clear());

test('por defecto estan todos encendidos y en modo Media', () => {
  render(<Banco />);
  expect(estado()).toBe('media:11,12,14');
  expect(screen.getByRole('button', { name: 'Media' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Sensor 2, 40 cm' })).toHaveAttribute('aria-pressed', 'true');
});

test('un atajo de profundidad deja solo esos sensores, y Todos los vuelve a encender', () => {
  render(<Banco />);
  pulsar('20 cm');
  expect(estado()).toBe('media:11,14');
  pulsar('Todos');
  expect(estado()).toBe('media:11,12,14');
});

test('no deja apagar el ultimo sensor', () => {
  render(<Banco />);
  pulsar('Sensor 1, 20 cm');
  pulsar('Sensor 2, 40 cm');
  pulsar('Sensor 4, 20 cm');
  expect(estado()).toBe('media:14');
});

test('Comparar cambia el modo y la seleccion se recuerda por parcela', () => {
  const { unmount } = render(<Banco />);
  pulsar('Comparar');
  pulsar('Sensor 2, 40 cm');
  expect(estado()).toBe('comparar:11,14');
  unmount();

  render(<Banco />);
  expect(estado()).toBe('comparar:11,14');
});

test('una seleccion guardada con sensores que ya no existen vuelve a todos', () => {
  localStorage.setItem('vinalert_sensores_1', JSON.stringify({ ids: [99], modo: 'comparar' }));
  render(<Banco />);
  expect(estado()).toBe('comparar:11,12,14');
});

test('solo hay atajos para las profundidades que existen', () => {
  render(<Banco />);
  expect(screen.getByRole('button', { name: '40 cm' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '60 cm' })).not.toBeInTheDocument();
});
```

- [ ] **Paso 2: comprobar que fallan.**
Ejecutar: `cd vinalert-front && npx vitest run src/pantallas/analisis/useSeleccionSensores.test.jsx`
Esperado: FALLA al importar, porque los ficheros no existen.

- [ ] **Paso 3: implementación.** Crear `vinalert-front/src/pantallas/analisis/useSeleccionSensores.js`:

```js
import { useCallback, useMemo, useState } from 'react';

/**
 * Que sensores se ven en las graficas de suelo y como (media o comparados).
 *
 * La seleccion se recuerda por parcela en localStorage como comodidad: si el
 * almacenamiento no esta o lo guardado ya no encaja con los sensores, se
 * vuelve a "todos, en media". Nunca queda vacia.
 */

const clave = (parcelaId) => `vinalert_sensores_${parcelaId}`;

function leer(parcelaId) {
  try {
    const guardado = JSON.parse(localStorage.getItem(clave(parcelaId)));
    return guardado && Array.isArray(guardado.ids) ? guardado : null;
  } catch {
    return null;
  }
}

function guardar(parcelaId, seleccion) {
  try {
    localStorage.setItem(clave(parcelaId), JSON.stringify(seleccion));
  } catch {
    // Sin almacenamiento: se recuerda solo mientras dure la visita.
  }
}

export function useSeleccionSensores(parcelaId, sensores) {
  // Lo tocado en esta visita, por parcela. Si no se ha tocado, manda lo guardado.
  const [tocado, setTocado] = useState({});
  const todos = useMemo(() => sensores.map((s) => s.id), [sensores]);
  const profundidades = useMemo(
    () => [...new Set(sensores.map((s) => s.profundidad_cm).filter((p) => p != null))].sort((a, b) => a - b),
    [sensores],
  );

  const base = tocado[parcelaId] ?? leer(parcelaId);
  const valida = base && base.ids.length > 0 && base.ids.every((id) => todos.includes(id));
  // En el orden de los sensores, no en el de los clics.
  const ids = valida ? todos.filter((id) => base.ids.includes(id)) : todos;
  const modo = base?.modo === 'comparar' ? 'comparar' : 'media';

  const fijar = useCallback(
    (nueva) => {
      setTocado((prev) => ({ ...prev, [parcelaId]: nueva }));
      guardar(parcelaId, nueva);
    },
    [parcelaId],
  );

  return {
    ids,
    modo,
    profundidades,
    alternar: (id) => {
      const siguiente = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
      if (siguiente.length) fijar({ ids: siguiente, modo });
    },
    elegirProfundidad: (cm) => fijar({ ids: sensores.filter((s) => s.profundidad_cm === cm).map((s) => s.id), modo }),
    elegirTodos: () => fijar({ ids: todos, modo }),
    cambiarModo: (nuevo) => fijar({ ids, modo: nuevo }),
  };
}
```

Crear `vinalert-front/src/pantallas/analisis/SelectorSensores.jsx`:

```jsx
import { colorSensor, trazoProfundidad } from './tema';

/**
 * La banda del selector de sensores. Cada boton lleva una muestra de su color
 * y de su trazo: es la leyenda de las graficas en modo Comparar.
 */

const BOTON =
  'border-r border-linea px-3 py-1.5 font-mono text-[10px] font-medium tracking-[0.16em] whitespace-nowrap uppercase transition-colors last:border-r-0';
const encendido = (si) => (si ? 'bg-oso text-lousa' : 'text-oso-3 hover:bg-lousa hover:text-oso');

function Muestra({ sensor }) {
  return (
    <svg aria-hidden="true" width="18" height="6" className="shrink-0">
      <line x1="0" y1="3" x2="18" y2="3" stroke={colorSensor(sensor.numero)} strokeWidth="2"
        strokeDasharray={trazoProfundidad(sensor.profundidad_cm)} />
    </svg>
  );
}

export default function SelectorSensores({ sensores, seleccion }) {
  const { ids, modo, profundidades, alternar, elegirProfundidad, elegirTodos, cambiarModo } = seleccion;
  const todosEncendidos = ids.length === sensores.length;
  const soloProfundidad = (cm) => {
    const deEsa = sensores.filter((s) => s.profundidad_cm === cm).map((s) => s.id);
    return deEsa.length === ids.length && deEsa.every((id) => ids.includes(id));
  };

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-linea bg-alza px-6 py-3">
      <span className="rotulo">Sensores</span>
      <div className="flex border border-linea">
        <button type="button" onClick={elegirTodos} aria-pressed={todosEncendidos} className={`${BOTON} ${encendido(todosEncendidos)}`}>
          Todos
        </button>
        {profundidades.map((cm) => (
          <button key={cm} type="button" onClick={() => elegirProfundidad(cm)} aria-pressed={soloProfundidad(cm)}
            className={`${BOTON} ${encendido(soloProfundidad(cm))}`}>
            {`${cm} cm`}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap border border-linea">
        {sensores.map((s) => {
          const on = ids.includes(s.id);
          const nombre = s.profundidad_cm != null ? `Sensor ${s.numero}, ${s.profundidad_cm} cm` : `Sensor ${s.numero}`;
          return (
            <button key={s.id} type="button" onClick={() => alternar(s.id)} aria-pressed={on} aria-label={nombre}
              className={`${BOTON} flex items-center gap-2 ${on ? 'bg-lousa text-oso' : 'text-oso-4 hover:text-oso-2'}`}>
              <Muestra sensor={s} />
              {`S${s.numero}${s.profundidad_cm != null ? ` · ${s.profundidad_cm}` : ''}`}
            </button>
          );
        })}
      </div>

      <span className="rotulo sm:ml-4">Ver</span>
      <div className="flex border border-linea">
        {[['media', 'Media'], ['comparar', 'Comparar']].map(([clave, etiqueta]) => (
          <button key={clave} type="button" onClick={() => cambiarModo(clave)} aria-pressed={modo === clave}
            className={`${BOTON} ${encendido(modo === clave)}`}>
            {etiqueta}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Paso 4: comprobar que pasan.**
Ejecutar: `cd vinalert-front && npx vitest run src/pantallas/analisis/useSeleccionSensores.test.jsx && npx eslint src/pantallas/analisis`
Esperado: 6 pruebas en verde y lint sin errores en esos ficheros.

- [ ] **Paso 5: checkpoint.** `cd vinalert-front && npx vitest run`. Esperado: todo en verde.

---

### Tarea 6: gráficas de suelo con la selección en Análisis y Detalle

**Ficheros:**
- Crear: `vinalert-front/src/pantallas/analisis/GraficaSuelo.jsx`
- Modificar: `vinalert-front/src/pantallas/Analisis.jsx`, `vinalert-front/src/pantallas/analisis/Detalle.jsx`, `vinalert-front/src/pantallas/Analisis.test.jsx`, `vinalert-front/src/test/respuestas.js`

**Interfaces:**
- Consume:
  - `diarioSuelo`, `horasSuelo`, `cortarHuecos`, `rellenarDias`, `mediaPeriodoDiaria`, `mediaPeriodoHoras`, `claveHumedad`, `claveTemperatura` (tarea 4);
  - `colorSensor` y `trazoProfundidad` (tarea 4);
  - `useSeleccionSensores` y `SelectorSensores` (tarea 5);
  - `listarSensores(parcelaId)` de `src/api/sensores.js`, que ya existe.
- Produce: `<GraficaSuelo es48h modo sensores diario horas formatearEjeX formatearTooltip puntos />`, donde `sensores` son los objetos elegidos.
  - Modo Media: una gráfica titulada «Temperatura y humedad del suelo».
  - Modo Comparar: dos gráficas, «Humedad del suelo por sensor» y «Temperatura del suelo por sensor».

- [ ] **Paso 1: datos de prueba y pruebas que fallan.**

En `vinalert-front/src/test/respuestas.js`, sustituir el bloque `export const SUELO_DIARIO = [ … ];` entero por:

```js
/**
 * Respuesta de GET /suelo/diario: una fila por dia y sensor. El sensor 1
 * manda 10 veces mas que el 2; la media justa de humedad del periodo es
 * (31 + 21) / 2 = 26 %, y la de temperatura (19 + 16) / 2 = 17.5 °C.
 */
export const SUELO_DIARIO = [
  { fecha: '2026-08-14', sensor_id: 1, sensor_numero: 1, profundidad_cm: 20, humedad_media: 30, humedad_max: 31, humedad_min: 29, temperatura_media: 18, temperatura_max: 19, temperatura_min: 17, n_lecturas: 100 },
  { fecha: '2026-08-14', sensor_id: 2, sensor_numero: 2, profundidad_cm: 40, humedad_media: 20, humedad_max: 21, humedad_min: 19, temperatura_media: 16, temperatura_max: 17, temperatura_min: 15, n_lecturas: 10 },
  { fecha: '2026-08-15', sensor_id: 1, sensor_numero: 1, profundidad_cm: 20, humedad_media: 32, humedad_max: 33, humedad_min: 31, temperatura_media: 20, temperatura_max: 21, temperatura_min: 19, n_lecturas: 100 },
  { fecha: '2026-08-15', sensor_id: 2, sensor_numero: 2, profundidad_cm: 40, humedad_media: 22, humedad_max: 23, humedad_min: 21, temperatura_media: 16, temperatura_max: 17, temperatura_min: 15, n_lecturas: 10 },
];

/** Los sensores de la parcela de prueba: dos activos y uno dado de baja. */
export const SENSORES_PARCELA = [
  { id: 1, parcela_id: 1, numero: 1, etiqueta: 'Sonda 1', activo: true, profundidad_cm: 20, latitud: null, longitud: null, modelo: null },
  { id: 2, parcela_id: 1, numero: 2, etiqueta: 'Sonda 2', activo: true, profundidad_cm: 40, latitud: null, longitud: null, modelo: null },
  { id: 3, parcela_id: 1, numero: 3, etiqueta: 'Sonda 3', activo: false, profundidad_cm: 60, latitud: null, longitud: null, modelo: null },
];
```

En `vinalert-front/src/pantallas/Analisis.test.jsx`:
- añadir `SENSORES_PARCELA,` a la lista importada de `'../test/respuestas'`;
- tras el bloque `vi.mock('../api/foliar', …)`, añadir `vi.mock('../api/sensores', () => ({ listarSensores: vi.fn() }));`;
- junto a los demás imports de API, añadir `import { listarSensores } from '../api/sensores';`;
- el `beforeEach` pasa a:

```jsx
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  obtenerClimaHorario.mockResolvedValue([]);
  listarSensores.mockResolvedValue(SENSORES_PARCELA);
});
```

y al final del fichero:

```jsx

function montarDiario() {
  obtenerSueloDiario.mockResolvedValue(SUELO_DIARIO);
  obtenerClimaDiario.mockResolvedValue(CLIMA_DIARIO);
  listarTratamientos.mockResolvedValue([]);
  listarFoliar.mockResolvedValue([]);
  montar();
}

test('por defecto la humedad y la temperatura del periodo son la media justa de todos', async () => {
  montarDiario();

  expect(await screen.findByText('26.0 %')).toBeInTheDocument();
  expect(screen.getByText('17.5 °C')).toBeInTheDocument();
  // El sensor dado de baja no aparece en el selector.
  expect(screen.getByRole('button', { name: 'Sensor 1, 20 cm' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Sensor 3, 60 cm' })).not.toBeInTheDocument();
});

test('las cifras siguen a los sensores elegidos', async () => {
  montarDiario();
  await screen.findByText('26.0 %');

  await userEvent.click(screen.getByRole('button', { name: '20 cm' }));

  expect(await screen.findByText('31.0 %')).toBeInTheDocument();
  expect(screen.getByText('19.0 °C')).toBeInTheDocument();
});

test('Comparar parte la grafica de suelo en humedad y temperatura por sensor', async () => {
  montarDiario();
  await screen.findByText(/temperatura y humedad del suelo/i);

  await userEvent.click(screen.getByRole('button', { name: 'Comparar' }));

  expect(screen.getByText('Humedad del suelo por sensor')).toBeInTheDocument();
  expect(screen.getByText('Temperatura del suelo por sensor')).toBeInTheDocument();
  expect(screen.queryByText(/temperatura y humedad del suelo/i)).not.toBeInTheDocument();
  // El clima no depende de los sensores.
  expect(screen.getByText(/clima y balance hídrico/i)).toBeInTheDocument();
});
```

- [ ] **Paso 2: comprobar que fallan.**
Ejecutar: `cd vinalert-front && npx vitest run src/pantallas/Analisis.test.jsx`
Esperado: FALLAN las tres pruebas nuevas, porque no hay selector y la media se calcula por día.

- [ ] **Paso 3a: crear `vinalert-front/src/pantallas/analisis/GraficaSuelo.jsx`:**

```jsx
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Leyenda, Marco, Pista } from './piezas';
import { claveHumedad, claveTemperatura, cortarHuecos } from './series';
import { EJE, GRID, SERIES, colorSensor, trazoProfundidad } from './tema';

/**
 * Las graficas de suelo de Analisis, segun los sensores elegidos.
 *
 * - Media: una grafica con humedad y temperatura (la media justa de los
 *   elegidos), como siempre.
 * - Comparar: dos graficas de un solo eje —humedad y temperatura— con una
 *   linea por sensor, para no mezclar 12 lineas en un eje doble.
 *
 * En 48 horas el eje X es tiempo de verdad (milisegundos): dos envios
 * separados por 14 horas se ven a 14 horas, y cada linea lleva sus propios
 * puntos, asi que a un sensor que falta en un envio no le pasa nada.
 */

const MARGEN = { top: 5, right: 12, left: -12, bottom: 0 };
const CURSOR = { stroke: '#565e60', strokeDasharray: '3 3' };
const PUNTO_ACTIVO = { r: 5, strokeWidth: 2, stroke: '#222a2e' };

const nombreSensor = (s) => `S${s.numero}${s.profundidad_cm != null ? ` · ${s.profundidad_cm} cm` : ''}`;

export default function GraficaSuelo({ es48h, modo, sensores, diario, horas, formatearEjeX, formatearTooltip, puntos }) {
  const pista = <Pista formatearEtiqueta={formatearTooltip} />;
  const ejeX = es48h
    ? { dataKey: 't', type: 'number', scale: 'time', domain: ['dataMin', 'dataMax'] }
    : { dataKey: 'fecha' };

  if (modo === 'media') {
    const datos = es48h ? cortarHuecos(horas.media) : diario;
    const h = es48h ? 'humedad' : 'humedad_media';
    const t = es48h ? 'temperatura' : 'temperatura_suelo';
    return (
      <Marco
        titulo="Temperatura y humedad del suelo"
        descripcion={
          es48h
            ? 'Cada envío de los sensores elegidos, en su hora real: humedad (%) y temperatura del suelo (°C). Un envío al que le falta algún sensor no se dibuja.'
            : 'Media justa de los sensores elegidos, un valor por día: humedad (%) y temperatura del suelo (°C).'
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={datos} margin={MARGEN}>
            <CartesianGrid {...GRID} />
            <XAxis {...ejeX} tickFormatter={formatearEjeX} minTickGap={28} {...EJE} />
            <YAxis yAxisId="izq" unit="%" domain={['auto', 'auto']} {...EJE} />
            <YAxis yAxisId="der" orientation="right" unit="°C" domain={['auto', 'auto']} {...EJE} />
            <Tooltip content={pista} cursor={CURSOR} />
            <Legend content={<Leyenda />} />
            <Line yAxisId="izq" type="monotone" dataKey={h} name="Humedad suelo (%)" stroke={SERIES.agua}
              strokeWidth={2} dot={puntos} activeDot={PUNTO_ACTIVO} />
            <Line yAxisId="der" type="monotone" dataKey={t} name="Temp. suelo (°C)" stroke={SERIES.calor}
              strokeWidth={2} strokeDasharray="5 3" dot={puntos} activeDot={PUNTO_ACTIVO} />
          </ComposedChart>
        </ResponsiveContainer>
      </Marco>
    );
  }

  const graficas = [
    { titulo: 'Humedad del suelo por sensor', unidad: '%', campo48: 'humedad', clave: claveHumedad },
    { titulo: 'Temperatura del suelo por sensor', unidad: '°C', campo48: 'temperatura', clave: claveTemperatura },
  ];
  return (
    <div className="grid gap-px bg-linea xl:grid-cols-2">
      {graficas.map((g) => (
        <Marco
          key={g.titulo}
          titulo={g.titulo}
          descripcion={es48h ? `Cada lectura, en su hora real (${g.unidad}).` : `Media diaria de cada sensor (${g.unidad}).`}
          alto="h-72"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={es48h ? undefined : diario} margin={MARGEN}>
              <CartesianGrid {...GRID} />
              <XAxis {...ejeX} tickFormatter={formatearEjeX} minTickGap={28} {...EJE} allowDuplicatedCategory={false} />
              <YAxis unit={g.unidad === '%' ? '%' : '°C'} domain={['auto', 'auto']} {...EJE} />
              <Tooltip content={pista} cursor={CURSOR} />
              <Legend content={<Leyenda />} />
              {sensores.map((s) => (
                <Line
                  key={s.id}
                  type="monotone"
                  data={es48h ? cortarHuecos(horas.porSensor[s.id] ?? []) : undefined}
                  dataKey={es48h ? g.campo48 : g.clave(s.id)}
                  name={nombreSensor(s)}
                  stroke={colorSensor(s.numero)}
                  strokeDasharray={trazoProfundidad(s.profundidad_cm)}
                  strokeWidth={2}
                  dot={puntos}
                  activeDot={PUNTO_ACTIVO}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </Marco>
      ))}
    </div>
  );
}
```

- [ ] **Paso 3b: integrar en `vinalert-front/src/pantallas/Analisis.jsx`.**

1. Imports. Tras `import { listarFoliar } from '../api/foliar';` añadir `import { listarSensores } from '../api/sensores';`. Tras `import Detalle from './analisis/Detalle';` añadir:

```jsx
import GraficaSuelo from './analisis/GraficaSuelo';
import SelectorSensores from './analisis/SelectorSensores';
import { diarioSuelo, horasSuelo, mediaPeriodoDiaria, mediaPeriodoHoras, rellenarDias } from './analisis/series';
import { useSeleccionSensores } from './analisis/useSeleccionSensores';
```

2. Sensores y selección. Justo después de `const vistaEfectiva = es48h ? 'resumen' : vista;`:

```jsx
  // Los sensores activos de la parcela, para el selector. Si fallan, el
  // selector no sale y las graficas usan todos los que traigan los datos.
  const [sensores, setSensores] = useState([]);
  useEffect(() => {
    let vigente = true;
    listarSensores(parcela.id)
      .then((lista) => {
        if (vigente) setSensores(lista.filter((s) => s.activo).sort((a, b) => a.numero - b.numero));
      })
      .catch(() => {
        if (vigente) setSensores([]);
      });
    return () => {
      vigente = false;
    };
  }, [parcela.id]);
  const seleccion = useSeleccionSensores(parcela.id, sensores);
  // Sin lista de sensores, se usan todos los que vengan en los datos.
  const idsElegidos = useMemo(() => {
    if (sensores.length) return seleccion.ids;
    const desdeDatos = es48h ? (historico ?? []).map((l) => l.sensor_id) : (suelo ?? []).map((f) => f.sensor_id);
    return [...new Set(desdeDatos)];
  }, [sensores.length, seleccion.ids, es48h, historico, suelo]);
  const sensoresElegidos = sensores.filter((s) => idsElegidos.includes(s.id));
```

3. 48 horas. Dentro de `datosFusionados`, en la rama `if (es48h)`, la fila deja de acumular humedades. Sustituir el objeto de `mapa.set(fechaIso, { … })` por:

```jsx
          mapa.set(fechaIso, {
            fecha: fechaIso,
            fechaCorta,
            temp_media: log.temp_ambiente_c,
            humedad_aire: log.humedad_aire_pct,
            viento_ms: log.viento_ms,
          });
```

Borrar las dos líneas `if (log.humedad_suelo_pct != null) fila.humedades.push(...)` y `if (log.temperatura_suelo != null) fila.temperaturas_suelo.push(...)`.

Sustituir el bloque `const lista = Array.from(mapa.values()).map((f) => ({ …humedad_media…, temperatura_suelo… })).sort(…);` por:

```jsx
      const lista = Array.from(mapa.values()).sort((a, b) => a.fecha.localeCompare(b.fecha));
```

4. Días. En la rama diaria de `datosFusionados`, sustituir el bucle `(suelo ?? []).forEach((s) => { … });` por:

```jsx
    diarioSuelo(suelo ?? [], idsElegidos).forEach((d) => {
      Object.assign(obtenerFila(d.fecha), d);
    });
```

Cambiar el `return` final de esa rama por:

```jsx
    return rellenarDias(Array.from(mapa.values()).sort((a, b) => a.fecha.localeCompare(b.fecha)));
```

Añadir `idsElegidos` al array de dependencias del `useMemo` de `datosFusionados`.

5. Series de 48 horas. Justo después del `useMemo` de `datosHorarios`:

```jsx
  const horasSueloSel = useMemo(() => horasSuelo(historico ?? [], idsElegidos), [historico, idsElegidos]);
```

6. Cifras. En el `useMemo` de `kpis`:
- rama `es48h`: sustituir el cálculo de `humValidas`/`mediaHumedad` y `tempValidas`/`mediaTempSuelo` por:

```jsx
      const mediaHumedad = mediaPeriodoHoras(historico ?? [], idsElegidos, 'humedad_suelo_pct');
      const mediaTempSuelo = mediaPeriodoHoras(historico ?? [], idsElegidos, 'temperatura_suelo');
```

- rama diaria: sustituir su `humValidas`/`mediaHumedad` y `tempValidas`/`mediaTempSuelo` por:

```jsx
    const mediaHumedad = mediaPeriodoDiaria(suelo ?? [], idsElegidos, 'humedad_media');
    const mediaTempSuelo = mediaPeriodoDiaria(suelo ?? [], idsElegidos, 'temperatura_media');
```

- añadir `historico` e `idsElegidos` a sus dependencias;
- la línea `const items = datosFusionados;` de la rama `es48h` queda sin uso: borrarla.

7. Banda del selector. Justo después del `</div>` que cierra la banda de «Período / Vista»:

```jsx
      {sensores.length > 0 && <SelectorSensores sensores={sensores} seleccion={seleccion} />}
```

8. Gráfica de suelo. Sustituir el bloque `<Marco titulo="Temperatura y humedad del suelo" …> … </Marco>` entero (el de la sección «1. El suelo.») por:

```jsx
            <GraficaSuelo
              es48h={es48h}
              modo={seleccion.modo}
              sensores={sensoresElegidos}
              diario={datosFusionados}
              horas={horasSueloSel}
              formatearEjeX={formatearEjeX}
              formatearTooltip={formatearTooltip}
              puntos={es48h ? { r: 3 } : rangoActual.dias <= 30 ? { r: 2 } : false}
            />
```

9. Detalle. En `<Detalle … />` añadir las props `modo={seleccion.modo}` y `sensores={sensoresElegidos}`.

- [ ] **Paso 3c: «tus sondas y el modelo» en `vinalert-front/src/pantallas/analisis/Detalle.jsx`.**
- La firma pasa a `export default function Detalle({ datos, formatearEjeX, pista, puntos, modo = 'media', sensores = [] }) {`.
- El import de tema pasa a `import { EJE, GRID, SERIES, colorSensor, trazoProfundidad } from './tema';`.
- Añadir `import { claveHumedad } from './series';`.
- En la gráfica «Humedad del suelo: tus sondas y el modelo», sustituir la `<Line … dataKey="humedad_media" … />` por:

```jsx
            {modo === 'comparar' ? (
              sensores.map((s) => (
                <Line key={s.id} type="monotone" dataKey={claveHumedad(s.id)}
                  name={`S${s.numero}${s.profundidad_cm != null ? ` · ${s.profundidad_cm} cm` : ''} (%)`}
                  stroke={colorSensor(s.numero)} strokeDasharray={trazoProfundidad(s.profundidad_cm)}
                  strokeWidth={2} dot={puntos} activeDot={PUNTO_ACTIVO} />
              ))
            ) : (
              <Line type="monotone" dataKey="humedad_media" name="Tus sondas (%)" stroke={SERIES.agua}
                strokeWidth={2} dot={puntos} activeDot={PUNTO_ACTIVO} connectNulls={false} />
            )}
```

- [ ] **Paso 4: comprobar que pasan.**
Ejecutar: `cd vinalert-front && npx vitest run && npx eslint src/pantallas/Analisis.jsx src/pantallas/analisis`
Esperado: todo en verde. En lint solo el aviso que ya existía (`set-state-in-effect` en el `useEffect` de carga, línea `setCargando(true)`).

- [ ] **Paso 5: checkpoint.** `cd vinalert-front && npx vitest run && npm run build`. Esperado: todo en verde y la compilación sin errores.

---

### Tarea 7: exportación con la media justa y la pestaña «Suelo por sensor»

**Ficheros:**
- Modificar: `vinalert-front/src/componentes/ModalExportar.jsx`
- Crear: `vinalert-front/src/componentes/ModalExportar.test.jsx`

**Interfaces:**
- Consume: `diarioSuelo` (tarea 4) y `SUELO_DIARIO` (tarea 6).
- Produce: en Excel, las pestañas `'Análisis Diario'` (media justa de todos los sensores) y `'Suelo por sensor'`, con las cabeceras exactas `['Fecha', 'Sensor', 'Profundidad (cm)', 'Humedad Media (%)', 'Humedad Máx (%)', 'Humedad Mín (%)', 'Temp Media (°C)', 'Temp Máx (°C)', 'Temp Mín (°C)', 'Nº Lecturas']`.

- [ ] **Paso 1: prueba que falla.** Crear `vinalert-front/src/componentes/ModalExportar.test.jsx`:

```jsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';

import { SUELO_DIARIO } from '../test/respuestas';
import ModalExportar from './ModalExportar';

vi.mock('../api/analisis', () => ({ obtenerSueloDiario: vi.fn(), obtenerClimaDiario: vi.fn() }));
vi.mock('../api/estado', () => ({ obtenerHistorico: vi.fn() }));
vi.mock('../api/tratamientos', () => ({ listarTratamientos: vi.fn() }));
vi.mock('../api/foliar', () => ({ listarFoliar: vi.fn() }));
vi.mock('../utils/exportar', () => ({ exportarExcelMultilibro: vi.fn(), descargarCsv: vi.fn() }));
import { obtenerClimaDiario, obtenerSueloDiario } from '../api/analisis';
import { obtenerHistorico } from '../api/estado';
import { listarFoliar } from '../api/foliar';
import { listarTratamientos } from '../api/tratamientos';
import { exportarExcelMultilibro } from '../utils/exportar';

beforeEach(() => {
  vi.clearAllMocks();
  obtenerSueloDiario.mockResolvedValue(SUELO_DIARIO);
  obtenerClimaDiario.mockResolvedValue([]);
  obtenerHistorico.mockResolvedValue([]);
  listarTratamientos.mockResolvedValue([]);
  listarFoliar.mockResolvedValue([]);
});

test('el Excel lleva la media justa diaria y una pestaña con cada sensor', async () => {
  render(<ModalExportar parcela={{ id: 1, nombre: 'Prueba' }} abierto alCerrar={() => {}} />);

  fireEvent.click(screen.getByRole('button', { name: 'Descargar XLSX' }));

  await waitFor(() => expect(exportarExcelMultilibro).toHaveBeenCalled());
  const [, pestanas] = exportarExcelMultilibro.mock.calls[0];

  const diaria = pestanas.find((p) => p.nombre === 'Análisis Diario');
  const dia15 = diaria.filas.find((f) => f[0] === '2026-08-15');
  expect(dia15[1]).toBe(27); // (32 + 22) / 2: justa, no ponderada por lecturas

  const porSensor = pestanas.find((p) => p.nombre === 'Suelo por sensor');
  expect(porSensor.cabeceras[0]).toBe('Fecha');
  expect(porSensor.filas).toHaveLength(4);
  expect(porSensor.filas[0]).toEqual(['2026-08-14', 'S1', 20, 30, 31, 29, 18, 19, 17, 100]);
});
```

- [ ] **Paso 2: comprobar que falla.**
Ejecutar: `cd vinalert-front && npx vitest run src/componentes/ModalExportar.test.jsx`
Esperado: FALLA. El resumen diario toma la última fila de cada día (22) y no existe la pestaña «Suelo por sensor».

- [ ] **Paso 3: implementación en `ModalExportar.jsx`.**
- Tras los imports de API, añadir `import { diarioSuelo } from '../pantallas/analisis/series';`.
- Sustituir el bucle `(suelo ?? []).forEach((s) => { … f.temp_suelo = s.temperatura_media; });` por:

```jsx
      // Media justa de TODOS los sensores de cada dia: la misma que Analisis
      // por defecto. Maximo y minimo, los extremos entre sensores.
      const idsSuelo = [...new Set((suelo ?? []).map((s) => s.sensor_id))];
      diarioSuelo(suelo ?? [], idsSuelo).forEach((d) => {
        if (!mapaDiario.has(d.fecha)) mapaDiario.set(d.fecha, { fecha: d.fecha });
        const f = mapaDiario.get(d.fecha);
        const delDia = (suelo ?? []).filter((s) => s.fecha === d.fecha);
        f.humedad_media = d.humedad_media;
        f.humedad_min = Math.min(...delDia.map((s) => s.humedad_min ?? Infinity));
        f.humedad_max = Math.max(...delDia.map((s) => s.humedad_max ?? -Infinity));
        if (!Number.isFinite(f.humedad_min)) f.humedad_min = null;
        if (!Number.isFinite(f.humedad_max)) f.humedad_max = null;
        f.temp_suelo = d.temperatura_suelo;
      });
```

- Justo antes de `// Exportar según la opción seleccionada`:

```jsx
      // Pestaña: Suelo por sensor (una fila por dia y sensor)
      const cabecerasSueloSensor = [
        'Fecha', 'Sensor', 'Profundidad (cm)', 'Humedad Media (%)', 'Humedad Máx (%)', 'Humedad Mín (%)',
        'Temp Media (°C)', 'Temp Máx (°C)', 'Temp Mín (°C)', 'Nº Lecturas',
      ];
      const filasSueloSensor = (suelo ?? []).map((s) => [
        s.fecha,
        `S${s.sensor_numero}`,
        s.profundidad_cm ?? '',
        s.humedad_media ?? '',
        s.humedad_max ?? '',
        s.humedad_min ?? '',
        s.temperatura_media ?? '',
        s.temperatura_max ?? '',
        s.temperatura_min ?? '',
        s.n_lecturas ?? '',
      ]);
```

- Dentro de `if (formato === 'xlsx')`, justo después del `if` que añade la pestaña `'Análisis Diario'`:

```jsx
        if (opcion === 'todo' || opcion === 'analisis') {
          pestanas.push({ nombre: 'Suelo por sensor', cabeceras: cabecerasSueloSensor, filas: filasSueloSensor });
        }
```

- [ ] **Paso 4: comprobar que pasa.**
Ejecutar: `cd vinalert-front && npx vitest run src/componentes/ModalExportar.test.jsx`
Esperado: en verde.

- [ ] **Paso 5: checkpoint.** `cd vinalert-front && npx vitest run && npm run build`. Esperado: todo en verde.

---

### Tarea 8: migración y revisión con datos reales

**Ficheros:** ninguno nuevo. Aplica `migracion_2026_09_19_suelo_por_sensor.sql` (tarea 3).

- [ ] **Paso 1: copia de seguridad.**

```bash
URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-)
"/c/Program Files/PostgreSQL/18/bin/pg_dump.exe" --format=custom \
  --file="C:/Users/roica/Desktop/Roi/copias_vinalert/vinalert_antes_suelo_por_sensor_$(date +%F).dump" "$URL"
```

Esperado: un fichero `.dump` de más de 0 bytes.

- [ ] **Paso 2: pedir permiso al usuario** para aplicar la migración. Sin un sí explícito, se para aquí.

- [ ] **Paso 3: aplicar y verificar.**

```bash
"/c/Program Files/PostgreSQL/18/bin/psql.exe" -v ON_ERROR_STOP=1 "$URL" -f migracion_2026_09_19_suelo_por_sensor.sql
"/c/Program Files/PostgreSQL/18/bin/psql.exe" "$URL" -c "SELECT indexname FROM pg_indexes WHERE tablename='log_sensores';" -c "SELECT to_regclass('public.suelo_diario');"
```

Esperado: aparece `ix_log_sensores_parcela_fecha`, y `to_regclass` devuelve vacío (NULL).

- [ ] **Paso 4: prueba de humo contra la API en marcha.** Con un token de admin firmado con la `SECRET_KEY` del `.env`, pedir `GET /parcelas/1/suelo/diario?dias=7`.
Esperado: 200 y filas con `sensor_id`, `sensor_numero` y `n_lecturas` de los días con lecturas de la prueba.

- [ ] **Paso 5: revisión visual.** Compilar (`npm run build`), levantar `npx vite preview --port 4173` y mirar Análisis con los datos reales de la parcela 1 en:
  - 48 horas, modo Media: sin saltos en los envíos incompletos (12:25, 13:09, 13:29) y línea cortada en el hueco de la noche;
  - 48 horas, modo Comparar: una línea por sensor, con color y trazo;
  - 7 días, modos Media y Comparar;
  - el atajo «20 cm».

  Sacar las capturas por elemento (`elementHandle.screenshot()`): la captura de página completa de Chrome sin ventana sale en blanco con estas gráficas.

---

## Autorrevisión del plan

**Cobertura del diseño:**

| Requisito del diseño | Tarea |
|---|---|
| Media justa (servidor) | 1 |
| Media justa (web) | 4 y 6 |
| Media justa (Excel) | 7 |
| Índice | 2 y 3 |
| Endpoint por sensor | 2 |
| `/dashboard` justo | 1 |
| Retirada de `suelo_diario` | 3 |
| Migración y README | 3 y 8 |
| Selector (defecto, atajos, mínimo uno, recuerdo) | 5 |
| Lista de sensores de `/sensores` | 6 |
| Modos Media y Comparar | 6 |
| 48 h sin salto en envíos incompletos | 4 y 6 |
| Cortar huecos | 4 y 6 |
| Detalle sigue la selección | 6 |
| Clima sin cambios | 6 (prueba) |
| Colores y trazos | 4, 5 y 6 |
| Pestaña Excel «Suelo por sensor» | 7 |
| Revisión con datos reales | 8 |

**Nombres coherentes entre tareas:**
- `idsElegidos`, `sensoresElegidos`, `horasSueloSel` y `seleccion.modo` se definen en la tarea 6 y se usan solo allí.
- `claveHumedad` y `claveTemperatura` salen de `series.js` y se usan en `GraficaSuelo` y `Detalle`.
- `SUELO_DIARIO` tiene la forma nueva en la tarea 6, antes de que la use la tarea 7.

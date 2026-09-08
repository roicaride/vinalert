# Cimientos de datos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar el modelo de datos coherente antes de construir la interfaz: partir el histórico diario en `clima_diario` + `suelo_diario`, ampliar la captura meteorológica con 14 variables nuevas, poder rellenar el histórico hacia atrás desde el archivo de Open-Meteo, y sustituir `cue_actividades` por `tratamientos`.

**Architecture:** FastAPI + SQLAlchemy + PostgreSQL, sin cambios de stack. Dos tablas diarias independientes sustituyen a la mixta. El proveedor meteorológico (`app/services/weather.py`) gana dos métodos: `fetch_diario()` (agregados diarios del pronóstico, con `past_days`) y `fetch_archivo()` (agregados diarios del histórico), que devuelven la misma forma de dict — así consolidación y backfill comparten el código de escritura y solo cambia el origen y la etiqueta `fuente`. `worker.py` consolida cada tabla en su propio bloque `try`/`except`.

**Tech Stack:** FastAPI 0.115, SQLAlchemy 2.0, PostgreSQL (prod) / SQLite en memoria (tests), Pydantic 2, requests, pytest.

**Spec:** `docs/specs/2026-08-17-cimientos-datos-design.md`

## Global Constraints

- El proyecto no tiene Alembic — los cambios de esquema se aplican con SQL directo vía `psql`. El SQL destructivo (`DROP TABLE`) **no se ejecuta contra la base real** por el implementador: se escribe, se valida, y el controlador pide confirmación al usuario.
- `Base.metadata.create_all(bind=engine)` en el `lifespan` de `main.py` solo crea tablas que faltan; nunca borra ni altera columnas existentes.
- Las respuestas de la API siguen `Optional[float] = None` para floats que pueden faltar, y `model_config = ConfigDict(from_attributes=True)` en los schemas de respuesta.
- Las fechas se guardan como `datetime` naive en UTC (`datetime.now(timezone.utc).replace(tzinfo=None)`).
- **Unidades fijadas en la llamada a la API, no convertidas a mano**: `wind_speed_unit=ms` (verificado: devuelve `wind_speed_10m` y `wind_gusts_10m` en m/s). `shortwave_radiation_sum` llega ya en MJ/m². `sunshine_duration` llega en segundos y se guarda en horas en `clima_diario` (`/3600`), en segundos en `log_clima`.
- **Todas las variables de este plan están verificadas contra la API real**, no contra documentación. Si alguna deja de responder durante la implementación, es un cambio del proveedor: reportar, no improvisar un sustituto.
- Este plan **no toca el frontend** (`vinalert-front/`) — es el sub-proyecto ③. Tras aplicarlo, el frontend seguirá roto donde ya lo estaba; no es una regresión nueva.

---

## Fase 1 — Modelo de datos

### Task 1: Modelos `ClimaDiario` y `SueloDiario` con sus schemas

**Files:**
- Modify: `app/models.py`
- Modify: `app/schemas.py`
- Test: `tests/test_modelos_diarios.py`

**Interfaces:**
- Produces: modelos `ClimaDiario` y `SueloDiario`, schemas `ClimaDiarioResp` y `SueloDiarioResp`. Las Tasks 7, 9 y 11 dependen de ambos.

- [ ] **Step 1: Escribir el test**

Create: `tests/test_modelos_diarios.py`

```python
from datetime import date

import pytest
from sqlalchemy.exc import IntegrityError

from app.models import ClimaDiario, SueloDiario


def test_clima_diario_se_guarda(db_session, parcela_id):
    fila = ClimaDiario(
        parcela_id=parcela_id,
        fecha=date(2026, 8, 17),
        temp_max=31.2, temp_min=14.8, temp_media=22.4,
        humedad_relativa_media=48.0, humedad_relativa_max=82.0, humedad_relativa_min=26.0,
        punto_rocio_medio=12.6,
        vpd_medio=1.2, vpd_max=1.94,
        precipitacion_total_mm=0.0,
        et0_total_dia=6.18,
        radiacion_total_mj_m2=30.6,
        horas_sol=14.4,
        viento_vel_media=2.06, viento_racha_max=14.1,
        viento_dir_dominante=45.0,
        humectacion_foliar_pct=12.0,
        suelo_modelo_humedad=0.139,
        suelo_modelo_temp=26.1,
        fuente="pronostico",
        suelo_modelo_capa="3_to_9cm",
    )
    db_session.add(fila)
    db_session.commit()
    db_session.refresh(fila)
    assert fila.id is not None
    assert fila.fuente == "pronostico"


def test_clima_diario_no_admite_dos_filas_del_mismo_dia(db_session, parcela_id):
    db_session.add(ClimaDiario(parcela_id=parcela_id, fecha=date(2026, 8, 17), fuente="pronostico"))
    db_session.commit()
    db_session.add(ClimaDiario(parcela_id=parcela_id, fecha=date(2026, 8, 17), fuente="archivo"))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_suelo_diario_se_guarda(db_session, parcela_id):
    fila = SueloDiario(
        parcela_id=parcela_id,
        fecha=date(2026, 8, 17),
        humedad_media=32.0, humedad_sd=2.83, humedad_max=34.0, humedad_min=30.0,
        temperatura_media=19.0, temperatura_sd=1.41, temperatura_max=20.0, temperatura_min=18.0,
        n_sensores=2, n_lecturas=4,
    )
    db_session.add(fila)
    db_session.commit()
    db_session.refresh(fila)
    assert fila.id is not None
    assert fila.n_sensores == 2


def test_suelo_diario_no_admite_dos_filas_del_mismo_dia(db_session, parcela_id):
    db_session.add(SueloDiario(parcela_id=parcela_id, fecha=date(2026, 8, 17)))
    db_session.commit()
    db_session.add(SueloDiario(parcela_id=parcela_id, fecha=date(2026, 8, 17)))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `pytest tests/test_modelos_diarios.py -v`
Expected: FAIL con `ImportError: cannot import name 'ClimaDiario'`.

- [ ] **Step 3: Añadir los modelos a `app/models.py`**

Añadir `UniqueConstraint` al import de la línea 1:

```python
from sqlalchemy import Column, Integer, String, Float, DateTime, Date, ForeignKey, Text, Boolean, UniqueConstraint
```

Añadir las dos clases (colócalas donde estaba `ClimaDiarioHistorico`, que se elimina en la Task 3):

```python
class ClimaDiario(Base):
    __tablename__ = "clima_diario"
    __table_args__ = (UniqueConstraint("parcela_id", "fecha", name="uq_clima_diario_parcela_fecha"),)

    id = Column(Integer, primary_key=True, index=True)
    parcela_id = Column(Integer, ForeignKey("parcelas.id"), nullable=False)
    fecha = Column(Date, nullable=False)

    temp_max = Column(Float)
    temp_min = Column(Float)
    temp_media = Column(Float)
    humedad_relativa_media = Column(Float)
    humedad_relativa_max = Column(Float)
    humedad_relativa_min = Column(Float)
    punto_rocio_medio = Column(Float)
    vpd_medio = Column(Float)
    vpd_max = Column(Float)
    precipitacion_total_mm = Column(Float)
    et0_total_dia = Column(Float)
    radiacion_total_mj_m2 = Column(Float)
    horas_sol = Column(Float)
    viento_vel_media = Column(Float)
    viento_racha_max = Column(Float)
    viento_dir_dominante = Column(Float)
    humectacion_foliar_pct = Column(Float)
    suelo_modelo_humedad = Column(Float)
    suelo_modelo_temp = Column(Float)
    # Trazabilidad: de qué endpoint salió la fila y de qué capa de suelo,
    # porque archivo (ERA5, 0-7cm) y pronóstico (3-9cm) no son comparables sin más.
    fuente = Column(String, nullable=False)
    suelo_modelo_capa = Column(String)

    parcela = relationship("Parcela", back_populates="clima_diario")


class SueloDiario(Base):
    __tablename__ = "suelo_diario"
    __table_args__ = (UniqueConstraint("parcela_id", "fecha", name="uq_suelo_diario_parcela_fecha"),)

    id = Column(Integer, primary_key=True, index=True)
    parcela_id = Column(Integer, ForeignKey("parcelas.id"), nullable=False)
    fecha = Column(Date, nullable=False)

    humedad_media = Column(Float)
    humedad_sd = Column(Float)
    humedad_max = Column(Float)
    humedad_min = Column(Float)
    temperatura_media = Column(Float)
    temperatura_sd = Column(Float)
    temperatura_max = Column(Float)
    temperatura_min = Column(Float)
    n_sensores = Column(Integer)
    n_lecturas = Column(Integer)

    parcela = relationship("Parcela", back_populates="suelo_diario")
```

En la clase `Parcela`, sustituir la relación `clima_historico` (línea 44) por las dos nuevas:

```python
    clima_diario = relationship("ClimaDiario", back_populates="parcela")
    suelo_diario = relationship("SueloDiario", back_populates="parcela")
```

(La clase `ClimaDiarioHistorico` y su relación se eliminan en la Task 3; en esta tarea pueden convivir.)

- [ ] **Step 4: Añadir los schemas a `app/schemas.py`**

```python
class ClimaDiarioResp(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    parcela_id: int
    fecha: date
    temp_max: Optional[float] = None
    temp_min: Optional[float] = None
    temp_media: Optional[float] = None
    humedad_relativa_media: Optional[float] = None
    humedad_relativa_max: Optional[float] = None
    humedad_relativa_min: Optional[float] = None
    punto_rocio_medio: Optional[float] = None
    vpd_medio: Optional[float] = None
    vpd_max: Optional[float] = None
    precipitacion_total_mm: Optional[float] = None
    et0_total_dia: Optional[float] = None
    radiacion_total_mj_m2: Optional[float] = None
    horas_sol: Optional[float] = None
    viento_vel_media: Optional[float] = None
    viento_racha_max: Optional[float] = None
    viento_dir_dominante: Optional[float] = None
    humectacion_foliar_pct: Optional[float] = None
    suelo_modelo_humedad: Optional[float] = None
    suelo_modelo_temp: Optional[float] = None
    fuente: str
    suelo_modelo_capa: Optional[str] = None


class SueloDiarioResp(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    parcela_id: int
    fecha: date
    humedad_media: Optional[float] = None
    humedad_sd: Optional[float] = None
    humedad_max: Optional[float] = None
    humedad_min: Optional[float] = None
    temperatura_media: Optional[float] = None
    temperatura_sd: Optional[float] = None
    temperatura_max: Optional[float] = None
    temperatura_min: Optional[float] = None
    n_sensores: Optional[int] = None
    n_lecturas: Optional[int] = None
```

- [ ] **Step 5: Ejecutar el test y verificar que pasa**

Run: `pytest tests/test_modelos_diarios.py -v`
Expected: 4 PASS.

Nota: los tests de unicidad dependen de que SQLite respete `UniqueConstraint` — lo hace (a diferencia de las claves foráneas, que sí están desactivadas por defecto en la configuración de tests).

- [ ] **Step 6: Ejecutar toda la suite**

Run: `pytest -v`
Expected: todo en PASS (la tabla antigua sigue existiendo, nada se rompe todavía).

- [ ] **Step 7: Commit**

```bash
git add app/models.py app/schemas.py tests/test_modelos_diarios.py
git commit -m "feat: modelos ClimaDiario y SueloDiario"
```

### Task 2: Ampliar `LogClima` con las 14 variables nuevas

**Files:**
- Modify: `app/models.py` (clase `LogClima`)
- Modify: `app/schemas.py` (`LogClimaCreate`, `LogClimaResp`)
- Test: `tests/test_log_clima_ampliado.py`

**Interfaces:**
- Produces: `LogClima` con 14 columnas nuevas. La Task 5 (proveedor) las rellena.

- [ ] **Step 1: Escribir el test**

Create: `tests/test_log_clima_ampliado.py`

```python
from datetime import datetime

from app.models import LogClima

CAMPOS_NUEVOS = [
    "vpd_kpa", "punto_rocio_c", "radiacion_wm2", "nubosidad_pct",
    "viento_racha_ms", "viento_dir_deg", "duracion_sol_s",
    "suelo_temp_0cm", "suelo_temp_6cm", "suelo_temp_18cm",
    "suelo_hum_0_1cm", "suelo_hum_1_3cm", "suelo_hum_3_9cm", "suelo_hum_9_27cm",
]


def test_log_clima_tiene_los_campos_nuevos(db_session, parcela_id):
    valores = {campo: 1.5 for campo in CAMPOS_NUEVOS}
    log = LogClima(
        parcela_id=parcela_id,
        fecha_hora=datetime(2026, 8, 17, 12, 0),
        temp_c=24.3,
        **valores,
    )
    db_session.add(log)
    db_session.commit()
    db_session.refresh(log)
    for campo in CAMPOS_NUEVOS:
        assert getattr(log, campo) == 1.5, f"{campo} no se guardó"


def test_log_clima_conserva_los_campos_previos(db_session, parcela_id):
    log = LogClima(
        parcela_id=parcela_id,
        fecha_hora=datetime(2026, 8, 17, 12, 0),
        temp_c=24.3, humedad_relativa_pct=48.0, presion_hpa=939.4,
        viento_vel_ms=2.06, lluvia_mm=0.0, et0=0.31, uv_index=6.0,
        lluvia_prev_24h_mm=1.2, prob_lluvia_24h_pct=30.0,
        lluvia_prev_48h_mm=0.4, prob_lluvia_48h_pct=10.0,
    )
    db_session.add(log)
    db_session.commit()
    db_session.refresh(log)
    assert log.temp_c == 24.3
    assert log.prob_lluvia_48h_pct == 10.0
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pytest tests/test_log_clima_ampliado.py -v`
Expected: FAIL — `TypeError` por argumentos inesperados (`vpd_kpa`, etc.).

- [ ] **Step 3: Ampliar `LogClima` en `app/models.py`**

Añadir tras `prob_lluvia_48h_pct`, dentro de la clase `LogClima`:

```python
    # Ampliación: variables de valor agronómico (todas verificadas en el bloque
    # `current` de Open-Meteo, una sola llamada).
    vpd_kpa = Column(Float)            # déficit de presión de vapor — estrés hídrico
    punto_rocio_c = Column(Float)
    radiacion_wm2 = Column(Float)
    nubosidad_pct = Column(Float)
    viento_racha_ms = Column(Float)
    viento_dir_deg = Column(Float)
    duracion_sol_s = Column(Float)     # segundos de sol en la hora en curso
    # Suelo estimado por el modelo, para contrastar contra los sensores reales
    suelo_temp_0cm = Column(Float)
    suelo_temp_6cm = Column(Float)
    suelo_temp_18cm = Column(Float)
    suelo_hum_0_1cm = Column(Float)
    suelo_hum_1_3cm = Column(Float)
    suelo_hum_3_9cm = Column(Float)
    suelo_hum_9_27cm = Column(Float)
```

- [ ] **Step 4: Ampliar los schemas en `app/schemas.py`**

En `LogClimaCreate`, añadir tras `prob_lluvia_48h_pct`:

```python
    vpd_kpa: Optional[float] = None
    punto_rocio_c: Optional[float] = None
    radiacion_wm2: Optional[float] = None
    nubosidad_pct: Optional[float] = None
    viento_racha_ms: Optional[float] = None
    viento_dir_deg: Optional[float] = None
    duracion_sol_s: Optional[float] = None
    suelo_temp_0cm: Optional[float] = None
    suelo_temp_6cm: Optional[float] = None
    suelo_temp_18cm: Optional[float] = None
    suelo_hum_0_1cm: Optional[float] = None
    suelo_hum_1_3cm: Optional[float] = None
    suelo_hum_3_9cm: Optional[float] = None
    suelo_hum_9_27cm: Optional[float] = None
```

En `LogClimaResp` añadir exactamente las mismas 14 líneas (el schema de respuesta actual solo expone un subconjunto de campos; se amplía para que el frontend pueda leerlas).

- [ ] **Step 5: Ejecutar el test y verificar que pasa**

Run: `pytest tests/test_log_clima_ampliado.py -v`
Expected: 2 PASS.

- [ ] **Step 6: Ejecutar toda la suite**

Run: `pytest -v`
Expected: todo en PASS.

- [ ] **Step 7: Commit**

```bash
git add app/models.py app/schemas.py tests/test_log_clima_ampliado.py
git commit -m "feat: ampliar log_clima con 14 variables agronomicas"
```

### Task 3: Modelo `Tratamiento` y retirada de `CueActividad`

**Files:**
- Modify: `app/models.py` (añadir `Tratamiento`, eliminar `CueActividad` y `ClimaDiarioHistorico`)
- Modify: `app/schemas.py` (añadir `TratamientoCreate`/`TratamientoResp`, eliminar `CueActividadCreate`/`CueActividadResp` y `HistoricoDiarioResp`)
- Delete: `app/routers/actividades.py`
- Modify: `app/main.py`
- Modify: `app/routers/parcelas.py` (quitar el endpoint `historico-diario`, que apuntaba a la tabla eliminada)
- Test: `tests/test_modelos_retirados.py`

**Interfaces:**
- Produces: modelo `Tratamiento` y sus schemas. La Task 10 (router) los consume.
- Elimina: `CueActividad`, `ClimaDiarioHistorico`, `HistoricoDiarioResp`, el router de actividades y `GET /parcelas/{id}/historico-diario`.

- [ ] **Step 1: Escribir el test**

Create: `tests/test_modelos_retirados.py`

```python
from datetime import datetime

from app.models import Tratamiento


def test_cue_actividad_ya_no_existe():
    import app.models as models
    assert not hasattr(models, "CueActividad")


def test_clima_diario_historico_ya_no_existe():
    import app.models as models
    assert not hasattr(models, "ClimaDiarioHistorico")


def test_endpoint_actividades_ya_no_existe(client, auth_headers, parcela_id):
    resp = client.get(f"/parcelas/{parcela_id}/actividades", headers=auth_headers)
    assert resp.status_code == 404


def test_endpoint_historico_diario_ya_no_existe(client, auth_headers, parcela_id):
    resp = client.get(f"/parcelas/{parcela_id}/historico-diario", headers=auth_headers)
    assert resp.status_code == 404


def test_tratamiento_se_guarda(db_session, parcela_id):
    t = Tratamiento(
        parcela_id=parcela_id,
        fecha=datetime(2026, 8, 17, 9, 30),
        tipo="fitosanitario",
        producto="Producto X",
        materia_activa="mancozeb",
        dosis=2.5,
        unidad_dosis="L/ha",
        cantidad_total=12.0,
        unidad_cantidad="L",
        operador="Roi",
        maquinaria="Atomizador",
        notas="Tras la lluvia",
        temp_c_aplicacion=22.0,
        viento_ms_aplicacion=1.8,
    )
    db_session.add(t)
    db_session.commit()
    db_session.refresh(t)
    assert t.id is not None
    assert t.tipo == "fitosanitario"
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pytest tests/test_modelos_retirados.py -v`
Expected: FAIL — `ImportError: cannot import name 'Tratamiento'`.

- [ ] **Step 3: Añadir `Tratamiento` a `app/models.py`**

```python
class Tratamiento(Base):
    __tablename__ = "tratamientos"
    id = Column(Integer, primary_key=True, index=True)
    parcela_id = Column(Integer, ForeignKey("parcelas.id"), nullable=False)
    fecha = Column(DateTime, nullable=False)
    tipo = Column(String, nullable=False)   # fitosanitario | abonado | poda | riego | otro
    producto = Column(String)
    materia_activa = Column(String)
    dosis = Column(Float)
    unidad_dosis = Column(String)           # "L/ha" | "kg/ha"
    cantidad_total = Column(Float)
    unidad_cantidad = Column(String)        # "L" | "kg"
    operador = Column(String)
    maquinaria = Column(String)
    notas = Column(Text)
    # Copiados de la última lectura de clima al registrar. El viento en el
    # momento de aplicar es dato legalmente exigido para fitosanitarios.
    temp_c_aplicacion = Column(Float)
    viento_ms_aplicacion = Column(Float)

    parcela = relationship("Parcela", back_populates="tratamientos")
```

- [ ] **Step 4: Eliminar `CueActividad` y `ClimaDiarioHistorico` de `app/models.py`**

Borrar ambas clases completas. En `Parcela`, sustituir la línea `actividades = relationship("CueActividad", ...)` por:

```python
    tratamientos = relationship("Tratamiento", back_populates="parcela")
```

y borrar la línea `clima_historico = relationship("ClimaDiarioHistorico", ...)` si aún queda de la Task 1.

- [ ] **Step 5: Actualizar `app/schemas.py`**

Eliminar `CueActividadCreate`, `CueActividadResp` y `HistoricoDiarioResp`. Añadir:

```python
class TratamientoCreate(BaseModel):
    parcela_id: int
    fecha: datetime
    tipo: str
    producto: Optional[str] = None
    materia_activa: Optional[str] = None
    dosis: Optional[float] = None
    unidad_dosis: Optional[str] = None
    cantidad_total: Optional[float] = None
    unidad_cantidad: Optional[str] = None
    operador: Optional[str] = None
    maquinaria: Optional[str] = None
    notas: Optional[str] = None


class TratamientoResp(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    parcela_id: int
    fecha: datetime
    tipo: str
    producto: Optional[str] = None
    materia_activa: Optional[str] = None
    dosis: Optional[float] = None
    unidad_dosis: Optional[str] = None
    cantidad_total: Optional[float] = None
    unidad_cantidad: Optional[str] = None
    operador: Optional[str] = None
    maquinaria: Optional[str] = None
    notas: Optional[str] = None
    temp_c_aplicacion: Optional[float] = None
    viento_ms_aplicacion: Optional[float] = None
```

Nota: `temp_c_aplicacion` y `viento_ms_aplicacion` **no** están en `TratamientoCreate` — los rellena el servidor, no el cliente.

- [ ] **Step 6: Borrar el router de actividades y desregistrarlo**

Run: `rm app/routers/actividades.py`

En `app/main.py`, quitar `actividades` del import de routers y borrar la línea `app.include_router(actividades.router)`.

- [ ] **Step 7: Quitar el endpoint `historico-diario` de `app/routers/parcelas.py`**

Borrar la función `obtener_historico_diario` completa, y quitar `ClimaDiarioHistorico` del import de modelos y `HistoricoDiarioResp` del import de schemas. (Se sustituye por dos endpoints nuevos en la Task 11.)

- [ ] **Step 8: Ejecutar el test y verificar que pasa**

Run: `pytest tests/test_modelos_retirados.py -v`
Expected: 5 PASS.

- [ ] **Step 9: Ejecutar toda la suite**

Run: `pytest -v`
Expected: todo en PASS. **Verificado antes de escribir este plan**: ningún test existente referencia `historico-diario`, `actividades`, `HistoricoDiarioResp` ni `CueActividad`, así que estas eliminaciones no deberían romper nada. Si aun así falla algo, investiga antes de tocar el test.

- [ ] **Step 10: Commit**

```bash
git add -A app/models.py app/schemas.py app/routers/actividades.py app/routers/parcelas.py app/main.py tests/test_modelos_retirados.py
git commit -m "feat: tabla tratamientos sustituye cue_actividades; retirar clima_diario_historico"
```

### Task 4: Migración SQL

**Files:**
- Create: `migracion_2026_08_18_cimientos.sql`

**Interfaces:**
- Consumes: los modelos de las Tasks 1-3.
- Produces: el script SQL. **No se ejecuta** — lo aplica el controlador tras confirmación del usuario.

- [ ] **Step 1: Crear el script**

Create: `migracion_2026_08_18_cimientos.sql`

```sql
-- ── Tablas nuevas ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clima_diario (
    id                      SERIAL PRIMARY KEY,
    parcela_id              INTEGER NOT NULL REFERENCES parcelas(id),
    fecha                   DATE NOT NULL,
    temp_max                DOUBLE PRECISION,
    temp_min                DOUBLE PRECISION,
    temp_media              DOUBLE PRECISION,
    humedad_relativa_media  DOUBLE PRECISION,
    humedad_relativa_max    DOUBLE PRECISION,
    humedad_relativa_min    DOUBLE PRECISION,
    punto_rocio_medio       DOUBLE PRECISION,
    vpd_medio               DOUBLE PRECISION,
    vpd_max                 DOUBLE PRECISION,
    precipitacion_total_mm  DOUBLE PRECISION,
    et0_total_dia           DOUBLE PRECISION,
    radiacion_total_mj_m2   DOUBLE PRECISION,
    horas_sol               DOUBLE PRECISION,
    viento_vel_media        DOUBLE PRECISION,
    viento_racha_max        DOUBLE PRECISION,
    viento_dir_dominante    DOUBLE PRECISION,
    humectacion_foliar_pct  DOUBLE PRECISION,
    suelo_modelo_humedad    DOUBLE PRECISION,
    suelo_modelo_temp       DOUBLE PRECISION,
    fuente                  VARCHAR NOT NULL,
    suelo_modelo_capa       VARCHAR,
    CONSTRAINT uq_clima_diario_parcela_fecha UNIQUE (parcela_id, fecha)
);

CREATE TABLE IF NOT EXISTS suelo_diario (
    id                 SERIAL PRIMARY KEY,
    parcela_id         INTEGER NOT NULL REFERENCES parcelas(id),
    fecha              DATE NOT NULL,
    humedad_media      DOUBLE PRECISION,
    humedad_sd         DOUBLE PRECISION,
    humedad_max        DOUBLE PRECISION,
    humedad_min        DOUBLE PRECISION,
    temperatura_media  DOUBLE PRECISION,
    temperatura_sd     DOUBLE PRECISION,
    temperatura_max    DOUBLE PRECISION,
    temperatura_min    DOUBLE PRECISION,
    n_sensores         INTEGER,
    n_lecturas         INTEGER,
    CONSTRAINT uq_suelo_diario_parcela_fecha UNIQUE (parcela_id, fecha)
);

CREATE TABLE IF NOT EXISTS tratamientos (
    id                    SERIAL PRIMARY KEY,
    parcela_id            INTEGER NOT NULL REFERENCES parcelas(id),
    fecha                 TIMESTAMP NOT NULL,
    tipo                  VARCHAR NOT NULL,
    producto              VARCHAR,
    materia_activa        VARCHAR,
    dosis                 DOUBLE PRECISION,
    unidad_dosis          VARCHAR,
    cantidad_total        DOUBLE PRECISION,
    unidad_cantidad       VARCHAR,
    operador              VARCHAR,
    maquinaria            VARCHAR,
    notas                 TEXT,
    temp_c_aplicacion     DOUBLE PRECISION,
    viento_ms_aplicacion  DOUBLE PRECISION
);

-- ── Ampliación de log_clima ──────────────────────────────────────────────────
ALTER TABLE log_clima ADD COLUMN IF NOT EXISTS vpd_kpa DOUBLE PRECISION;
ALTER TABLE log_clima ADD COLUMN IF NOT EXISTS punto_rocio_c DOUBLE PRECISION;
ALTER TABLE log_clima ADD COLUMN IF NOT EXISTS radiacion_wm2 DOUBLE PRECISION;
ALTER TABLE log_clima ADD COLUMN IF NOT EXISTS nubosidad_pct DOUBLE PRECISION;
ALTER TABLE log_clima ADD COLUMN IF NOT EXISTS viento_racha_ms DOUBLE PRECISION;
ALTER TABLE log_clima ADD COLUMN IF NOT EXISTS viento_dir_deg DOUBLE PRECISION;
ALTER TABLE log_clima ADD COLUMN IF NOT EXISTS duracion_sol_s DOUBLE PRECISION;
ALTER TABLE log_clima ADD COLUMN IF NOT EXISTS suelo_temp_0cm DOUBLE PRECISION;
ALTER TABLE log_clima ADD COLUMN IF NOT EXISTS suelo_temp_6cm DOUBLE PRECISION;
ALTER TABLE log_clima ADD COLUMN IF NOT EXISTS suelo_temp_18cm DOUBLE PRECISION;
ALTER TABLE log_clima ADD COLUMN IF NOT EXISTS suelo_hum_0_1cm DOUBLE PRECISION;
ALTER TABLE log_clima ADD COLUMN IF NOT EXISTS suelo_hum_1_3cm DOUBLE PRECISION;
ALTER TABLE log_clima ADD COLUMN IF NOT EXISTS suelo_hum_3_9cm DOUBLE PRECISION;
ALTER TABLE log_clima ADD COLUMN IF NOT EXISTS suelo_hum_9_27cm DOUBLE PRECISION;

-- ── Tablas retiradas (DESTRUCTIVO) ───────────────────────────────────────────
DROP TABLE IF EXISTS clima_diario_historico;
DROP TABLE IF EXISTS cue_actividades;
```

- [ ] **Step 2: Validar la sintaxis por inspección**

Comprobar: los tres `CREATE TABLE` tienen sus restricciones únicas donde toca, las 14 `ALTER TABLE` usan `IF NOT EXISTS`, los dos `DROP` usan `IF EXISTS`, y todas las sentencias terminan en `;`.

**NO ejecutar este script contra la base de datos.** El controlador lo aplica tras confirmación explícita del usuario.

- [ ] **Step 3: Ejecutar la suite (sanity check)**

Run: `pytest -v`
Expected: todo en PASS (los tests corren sobre SQLite, ajenos a este script).

- [ ] **Step 4: Commit**

```bash
git add migracion_2026_08_18_cimientos.sql
git commit -m "chore: migracion SQL de cimientos de datos"
```

---

## Fase 2 — Servicio meteorológico

### Task 5: Ampliar el proveedor con las 20 variables instantáneas

**Files:**
- Modify: `app/services/weather.py`
- Test: `tests/test_weather_provider.py`

**Interfaces:**
- Produces: `OpenMeteoProvider.fetch()` devuelve un dict con las 11 claves actuales **más** las 14 nuevas de la Task 2, listo para `LogClima(**datos)`.
- Elimina: el helper `_et0_hora_actual` (ET₀ pasa a venir de `current`).

- [ ] **Step 1: Escribir el test**

Create: `tests/test_weather_provider.py`

```python
from unittest.mock import patch

from app.services.weather import OpenMeteoProvider

RESPUESTA = {
    "utc_offset_seconds": 7200,
    "current": {
        "temperature_2m": 24.3,
        "relative_humidity_2m": 48,
        "surface_pressure": 939.4,
        "wind_speed_10m": 2.06,
        "rain": 0.0,
        "uv_index": 6.0,
        "et0_fao_evapotranspiration": 0.31,
        "vapour_pressure_deficit": 1.58,
        "dew_point_2m": 12.6,
        "shortwave_radiation": 684.0,
        "cloud_cover": 30,
        "wind_gusts_10m": 4.5,
        "wind_direction_10m": 23,
        "sunshine_duration": 3600.0,
        "soil_temperature_0cm": 22.7,
        "soil_temperature_6cm": 26.1,
        "soil_temperature_18cm": 28.3,
        "soil_moisture_0_to_1cm": 0.087,
        "soil_moisture_1_to_3cm": 0.108,
        "soil_moisture_3_to_9cm": 0.139,
        "soil_moisture_9_to_27cm": 0.175,
    },
    "daily": {
        "precipitation_sum": [0.0, 1.2, 0.4],
        "precipitation_probability_max": [5, 30, 10],
    },
}


class _Resp:
    status_code = 200

    def raise_for_status(self):
        pass

    def json(self):
        return RESPUESTA


def test_fetch_mapea_todas_las_variables():
    with patch("app.services.weather.requests.get", return_value=_Resp()):
        datos = OpenMeteoProvider().fetch(41.65, -4.72)

    # Previas
    assert datos["temp_c"] == 24.3
    assert datos["humedad_relativa_pct"] == 48.0
    assert datos["et0"] == 0.31
    assert datos["lluvia_prev_24h_mm"] == 1.2
    assert datos["prob_lluvia_48h_pct"] == 10.0
    # Nuevas
    assert datos["vpd_kpa"] == 1.58
    assert datos["punto_rocio_c"] == 12.6
    assert datos["radiacion_wm2"] == 684.0
    assert datos["nubosidad_pct"] == 30.0
    assert datos["viento_racha_ms"] == 4.5
    assert datos["viento_dir_deg"] == 23.0
    assert datos["duracion_sol_s"] == 3600.0
    assert datos["suelo_temp_6cm"] == 26.1
    assert datos["suelo_hum_3_9cm"] == 0.139
    assert datos["suelo_hum_9_27cm"] == 0.175


def test_fetch_tolera_variables_ausentes():
    respuesta_corta = {"current": {"temperature_2m": 20.0}, "daily": {}}

    class _RespCorta(_Resp):
        def json(self):
            return respuesta_corta

    with patch("app.services.weather.requests.get", return_value=_RespCorta()):
        datos = OpenMeteoProvider().fetch(41.65, -4.72)

    assert datos["temp_c"] == 20.0
    assert datos["vpd_kpa"] is None
    assert datos["suelo_hum_3_9cm"] is None


def test_el_dict_encaja_en_el_modelo(db_session, parcela_id):
    from datetime import datetime

    from app.models import LogClima

    with patch("app.services.weather.requests.get", return_value=_Resp()):
        datos = OpenMeteoProvider().fetch(41.65, -4.72)

    log = LogClima(parcela_id=parcela_id, fecha_hora=datetime(2026, 8, 17, 12, 0), **datos)
    db_session.add(log)
    db_session.commit()
    assert log.id is not None
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pytest tests/test_weather_provider.py -v`
Expected: FAIL — `KeyError: 'vpd_kpa'`.

- [ ] **Step 3: Reescribir `fetch()` en `app/services/weather.py`**

Sustituir el método `fetch` completo y el helper `_et0_hora_actual` por:

```python
    # Todas verificadas contra la API real en una sola llamada a `current`.
    _CURRENT_VARS = [
        "temperature_2m", "relative_humidity_2m", "surface_pressure",
        "wind_speed_10m", "rain", "uv_index", "et0_fao_evapotranspiration",
        "vapour_pressure_deficit", "dew_point_2m", "shortwave_radiation",
        "cloud_cover", "wind_gusts_10m", "wind_direction_10m", "sunshine_duration",
        "soil_temperature_0cm", "soil_temperature_6cm", "soil_temperature_18cm",
        "soil_moisture_0_to_1cm", "soil_moisture_1_to_3cm",
        "soil_moisture_3_to_9cm", "soil_moisture_9_to_27cm",
    ]

    # Nombre en Open-Meteo -> nombre de columna en LogClima
    _MAPA_CURRENT = {
        "temperature_2m": "temp_c",
        "relative_humidity_2m": "humedad_relativa_pct",
        "surface_pressure": "presion_hpa",
        "wind_speed_10m": "viento_vel_ms",
        "rain": "lluvia_mm",
        "uv_index": "uv_index",
        "et0_fao_evapotranspiration": "et0",
        "vapour_pressure_deficit": "vpd_kpa",
        "dew_point_2m": "punto_rocio_c",
        "shortwave_radiation": "radiacion_wm2",
        "cloud_cover": "nubosidad_pct",
        "wind_gusts_10m": "viento_racha_ms",
        "wind_direction_10m": "viento_dir_deg",
        "sunshine_duration": "duracion_sol_s",
        "soil_temperature_0cm": "suelo_temp_0cm",
        "soil_temperature_6cm": "suelo_temp_6cm",
        "soil_temperature_18cm": "suelo_temp_18cm",
        "soil_moisture_0_to_1cm": "suelo_hum_0_1cm",
        "soil_moisture_1_to_3cm": "suelo_hum_1_3cm",
        "soil_moisture_3_to_9cm": "suelo_hum_3_9cm",
        "soil_moisture_9_to_27cm": "suelo_hum_9_27cm",
    }

    def fetch(self, lat: float, lon: float) -> dict:
        params = {
            "latitude": lat,
            "longitude": lon,
            "current": ",".join(self._CURRENT_VARS),
            "daily": "precipitation_sum,precipitation_probability_max",
            "forecast_days": 3,
            "wind_speed_unit": "ms",
            "timezone": "auto",
        }

        resp = requests.get(self.BASE_URL, params=params, timeout=self.TIMEOUT)
        resp.raise_for_status()
        data = resp.json()

        current = data.get("current", {})
        daily = data.get("daily", {})

        datos = {
            columna: self._num(current.get(clave))
            for clave, columna in self._MAPA_CURRENT.items()
        }

        # Pronóstico: índice 1 = mañana, índice 2 = pasado mañana
        datos["lluvia_prev_24h_mm"] = self._safe_get(daily, "precipitation_sum", 1)
        datos["prob_lluvia_24h_pct"] = self._safe_get(daily, "precipitation_probability_max", 1)
        datos["lluvia_prev_48h_mm"] = self._safe_get(daily, "precipitation_sum", 2)
        datos["prob_lluvia_48h_pct"] = self._safe_get(daily, "precipitation_probability_max", 2)

        return datos

    @staticmethod
    def _num(valor) -> Optional[float]:
        return float(valor) if valor is not None else None
```

**Por qué desaparece `_et0_hora_actual`:** `et0_fao_evapotranspiration` está
disponible en `current` (verificado). El helper antiguo buscaba la hora actual
dentro de `hourly` y, si no la encontraba, caía a "el primer valor no nulo" —
podía guardar la ET₀ de una hora arbitraria. Pedirla en `current` elimina esa
posibilidad.

Mantener `_safe_get` sin cambios (lo sigue usando el bloque `daily`).

- [ ] **Step 4: Ejecutar los tests y verificar que pasan**

Run: `pytest tests/test_weather_provider.py -v`
Expected: 3 PASS.

- [ ] **Step 5: Comprobar contra la API real (una vez, manual)**

Run:
```bash
python -c "from app.services.weather import OpenMeteoProvider; import json; print(json.dumps(OpenMeteoProvider().fetch(41.65, -4.72), indent=2))"
```
Expected: dict con las 25 claves, mayoría con valores numéricos (algunas pueden ser 0.0 de noche: radiación, uv, sol). Si alguna sale `None` inesperadamente, es señal de que la API cambió — reportar como DONE_WITH_CONCERNS, no improvisar.

- [ ] **Step 6: Ejecutar toda la suite**

Run: `pytest -v`
Expected: todo en PASS. Atención a `tests/test_weather_fetch_guardar.py`, que simula el proveedor — comprobar que su dict simulado sigue siendo compatible; si falla porque le faltan claves nuevas, actualizarlo (es un mock, no un contrato).

- [ ] **Step 7: Commit**

```bash
git add app/services/weather.py tests/test_weather_provider.py
git commit -m "feat: proveedor meteorologico captura 21 variables y simplifica ET0"
```

### Task 6: Métodos de agregados diarios (`fetch_diario` y `fetch_archivo`)

**Files:**
- Modify: `app/services/weather.py`
- Test: `tests/test_weather_diario.py`

**Interfaces:**
- Produces: `fetch_diario(lat, lon, past_days) -> list[dict]` y `fetch_archivo(lat, lon, desde, hasta) -> list[dict]`. Ambos devuelven listas de dicts con **la misma forma**: las claves de `ClimaDiario` más `"fecha"` (date). Las Tasks 7 y 9 los consumen.

- [ ] **Step 1: Escribir el test**

Create: `tests/test_weather_diario.py`

```python
from datetime import date
from unittest.mock import patch

from app.services.weather import OpenMeteoProvider

DAILY = {
    "time": ["2026-08-15", "2026-08-16"],
    "temperature_2m_max": [31.2, 29.0],
    "temperature_2m_min": [14.8, 15.1],
    "temperature_2m_mean": [22.4, 21.8],
    "relative_humidity_2m_mean": [52, 55],
    "relative_humidity_2m_max": [82, 85],
    "relative_humidity_2m_min": [26, 28],
    "dew_point_2m_mean": [3.9, 4.2],
    "vapour_pressure_deficit_max": [1.94, 1.80],
    "precipitation_sum": [0.0, 2.4],
    "et0_fao_evapotranspiration": [6.18, 5.40],
    "shortwave_radiation_sum": [30.6, 28.1],
    "sunshine_duration": [51931.62, 43200.0],
    "wind_speed_10m_max": [7.6, 6.1],
    "wind_gusts_10m_max": [14.1, 12.0],
    "wind_direction_10m_dominant": [45, 90],
    "leaf_wetness_probability_mean": [12.0, 30.0],
    "soil_moisture_0_to_7cm_mean": [0.039, 0.052],
    "soil_temperature_0_to_7cm_mean": [19.1, 18.4],
}


class _Resp:
    status_code = 200

    def raise_for_status(self):
        pass

    def json(self):
        return {"daily": DAILY}


def test_fetch_archivo_mapea_los_dias():
    with patch("app.services.weather.requests.get", return_value=_Resp()):
        filas = OpenMeteoProvider().fetch_archivo(41.65, -4.72, date(2026, 8, 15), date(2026, 8, 16))

    assert len(filas) == 2
    d0 = filas[0]
    assert d0["fecha"] == date(2026, 8, 15)
    assert d0["temp_max"] == 31.2
    assert d0["temp_media"] == 22.4
    assert d0["humedad_relativa_media"] == 52.0
    assert d0["vpd_max"] == 1.94
    assert d0["precipitacion_total_mm"] == 0.0
    assert d0["et0_total_dia"] == 6.18
    assert d0["radiacion_total_mj_m2"] == 30.6
    assert d0["humectacion_foliar_pct"] == 12.0
    assert d0["suelo_modelo_humedad"] == 0.039
    assert d0["suelo_modelo_temp"] == 19.1
    assert d0["fuente"] == "archivo"
    assert d0["suelo_modelo_capa"] == "0_to_7cm"


def test_horas_sol_se_convierte_de_segundos_a_horas():
    with patch("app.services.weather.requests.get", return_value=_Resp()):
        filas = OpenMeteoProvider().fetch_archivo(41.65, -4.72, date(2026, 8, 15), date(2026, 8, 16))

    assert round(filas[0]["horas_sol"], 2) == round(51931.62 / 3600, 2)
    assert filas[1]["horas_sol"] == 12.0


def test_fetch_diario_marca_fuente_pronostico():
    with patch("app.services.weather.requests.get", return_value=_Resp()):
        filas = OpenMeteoProvider().fetch_diario(41.65, -4.72, past_days=7)

    assert filas[0]["fuente"] == "pronostico"
    assert filas[0]["suelo_modelo_capa"] == "0_to_7cm"


def test_fetch_diario_tolera_variables_ausentes():
    class _RespCorta(_Resp):
        def json(self):
            return {"daily": {"time": ["2026-08-15"], "temperature_2m_max": [31.2]}}

    with patch("app.services.weather.requests.get", return_value=_RespCorta()):
        filas = OpenMeteoProvider().fetch_diario(41.65, -4.72, past_days=7)

    assert len(filas) == 1
    assert filas[0]["temp_max"] == 31.2
    assert filas[0]["vpd_max"] is None
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pytest tests/test_weather_diario.py -v`
Expected: FAIL — `AttributeError: 'OpenMeteoProvider' object has no attribute 'fetch_archivo'`.

- [ ] **Step 3: Añadir los métodos a `OpenMeteoProvider`**

```python
    ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"

    # Verificadas: las 18 responden tanto en el pronóstico (con past_days)
    # como en el archivo.
    _DAILY_VARS = [
        "temperature_2m_max", "temperature_2m_min", "temperature_2m_mean",
        "relative_humidity_2m_mean", "relative_humidity_2m_max", "relative_humidity_2m_min",
        "dew_point_2m_mean", "vapour_pressure_deficit_max",
        "precipitation_sum", "et0_fao_evapotranspiration",
        "shortwave_radiation_sum", "sunshine_duration",
        "wind_speed_10m_max", "wind_gusts_10m_max", "wind_direction_10m_dominant",
        "leaf_wetness_probability_mean",
        "soil_moisture_0_to_7cm_mean", "soil_temperature_0_to_7cm_mean",
    ]

    _MAPA_DAILY = {
        "temperature_2m_max": "temp_max",
        "temperature_2m_min": "temp_min",
        "temperature_2m_mean": "temp_media",
        "relative_humidity_2m_mean": "humedad_relativa_media",
        "relative_humidity_2m_max": "humedad_relativa_max",
        "relative_humidity_2m_min": "humedad_relativa_min",
        "dew_point_2m_mean": "punto_rocio_medio",
        "vapour_pressure_deficit_max": "vpd_max",
        "precipitation_sum": "precipitacion_total_mm",
        "et0_fao_evapotranspiration": "et0_total_dia",
        "shortwave_radiation_sum": "radiacion_total_mj_m2",
        "wind_speed_10m_max": "viento_vel_media",
        "wind_gusts_10m_max": "viento_racha_max",
        "wind_direction_10m_dominant": "viento_dir_dominante",
        "leaf_wetness_probability_mean": "humectacion_foliar_pct",
        "soil_moisture_0_to_7cm_mean": "suelo_modelo_humedad",
        "soil_temperature_0_to_7cm_mean": "suelo_modelo_temp",
    }

    def fetch_diario(self, lat: float, lon: float, past_days: int = 7) -> list:
        """Agregados diarios del pronóstico, incluyendo días pasados recientes."""
        params = {
            "latitude": lat, "longitude": lon,
            "daily": ",".join(self._DAILY_VARS),
            "past_days": past_days, "forecast_days": 1,
            "wind_speed_unit": "ms", "timezone": "auto",
        }
        return self._pedir_diario(self.BASE_URL, params, fuente="pronostico")

    def fetch_archivo(self, lat: float, lon: float, desde, hasta) -> list:
        """Agregados diarios del archivo histórico."""
        params = {
            "latitude": lat, "longitude": lon,
            "daily": ",".join(self._DAILY_VARS),
            "start_date": desde.isoformat(), "end_date": hasta.isoformat(),
            "wind_speed_unit": "ms", "timezone": "auto",
        }
        return self._pedir_diario(self.ARCHIVE_URL, params, fuente="archivo")

    def _pedir_diario(self, url: str, params: dict, fuente: str) -> list:
        resp = requests.get(url, params=params, timeout=self.TIMEOUT)
        resp.raise_for_status()
        daily = resp.json().get("daily", {})

        fechas = daily.get("time", [])
        filas = []
        for i, fecha_txt in enumerate(fechas):
            fila = {
                columna: self._num(self._en(daily, clave, i))
                for clave, columna in self._MAPA_DAILY.items()
            }
            fila["fecha"] = datetime.strptime(fecha_txt, "%Y-%m-%d").date()
            # La API da segundos; la columna guarda horas.
            segundos_sol = self._num(self._en(daily, "sunshine_duration", i))
            fila["horas_sol"] = segundos_sol / 3600 if segundos_sol is not None else None
            # vpd_medio no existe como variable diaria en la API; solo el máximo.
            fila["vpd_medio"] = None
            fila["fuente"] = fuente
            # Ambos endpoints devuelven la capa 0-7cm en sus variables diarias.
            fila["suelo_modelo_capa"] = "0_to_7cm"
            filas.append(fila)
        return filas

    @staticmethod
    def _en(daily: dict, clave: str, idx: int):
        valores = daily.get(clave, [])
        return valores[idx] if idx < len(valores) else None
```

Añadir `datetime` al import de la cabecera del archivo si no está:

```python
from datetime import datetime, timezone
```

- [ ] **Step 4: Ejecutar los tests y verificar que pasan**

Run: `pytest tests/test_weather_diario.py -v`
Expected: 4 PASS.

- [ ] **Step 5: Comprobar contra la API real (una vez, manual)**

Run:
```bash
python -c "
from app.services.weather import OpenMeteoProvider
from datetime import date
p = OpenMeteoProvider()
arch = p.fetch_archivo(41.65, -4.72, date(2025, 6, 1), date(2025, 6, 3))
print('archivo:', len(arch), 'dias; primer dia:', arch[0]['fecha'], 'tmax', arch[0]['temp_max'], 'et0', arch[0]['et0_total_dia'])
pron = p.fetch_diario(41.65, -4.72, past_days=7)
print('pronostico:', len(pron), 'dias; del', pron[0]['fecha'], 'al', pron[-1]['fecha'])
"
```
Expected: archivo devuelve 3 días con valores numéricos; pronóstico devuelve ~8 días.

- [ ] **Step 6: Commit**

```bash
git add app/services/weather.py tests/test_weather_diario.py
git commit -m "feat: fetch_diario y fetch_archivo para agregados diarios de clima"
```

### Task 7: Servicio de upsert diario y endpoint de backfill

**Files:**
- Create: `app/services/clima_diario_service.py`
- Modify: `app/routers/clima_fetch.py`
- Modify: `app/schemas.py` (`BackfillRequest`, `BackfillResp`)
- Test: `tests/test_backfill.py`

**Interfaces:**
- Produces: `guardar_dias(parcela_id, filas, db) -> dict` con claves `insertados`, `actualizados`, `omitidos`. La Task 9 (`worker.py`) reutiliza esta misma función.
- Produces: `POST /parcelas/{parcela_id}/clima/backfill`.

- [ ] **Step 1: Escribir el test**

Create: `tests/test_backfill.py`

```python
from datetime import date, timedelta
from unittest.mock import patch

from app.models import ClimaDiario
from app.services.clima_diario_service import guardar_dias


def _fila(fecha, fuente, temp_max=30.0):
    return {"fecha": fecha, "temp_max": temp_max, "fuente": fuente, "suelo_modelo_capa": "0_to_7cm"}


def test_guardar_dias_inserta(db_session, parcela_id):
    filas = [_fila(date(2026, 8, 15), "archivo"), _fila(date(2026, 8, 16), "archivo")]
    res = guardar_dias(parcela_id, filas, db_session)
    assert res == {"insertados": 2, "actualizados": 0, "omitidos": 0}
    assert db_session.query(ClimaDiario).count() == 2


def test_reejecutar_actualiza_no_duplica(db_session, parcela_id):
    guardar_dias(parcela_id, [_fila(date(2026, 8, 15), "archivo", 30.0)], db_session)
    res = guardar_dias(parcela_id, [_fila(date(2026, 8, 15), "archivo", 31.5)], db_session)
    assert res == {"insertados": 0, "actualizados": 1, "omitidos": 0}
    assert db_session.query(ClimaDiario).count() == 1
    assert db_session.query(ClimaDiario).first().temp_max == 31.5


def test_archivo_no_pisa_datos_de_pronostico(db_session, parcela_id):
    guardar_dias(parcela_id, [_fila(date(2026, 8, 15), "pronostico", 30.0)], db_session)
    res = guardar_dias(parcela_id, [_fila(date(2026, 8, 15), "archivo", 99.0)], db_session)
    assert res == {"insertados": 0, "actualizados": 0, "omitidos": 1}
    fila = db_session.query(ClimaDiario).first()
    assert fila.temp_max == 30.0
    assert fila.fuente == "pronostico"


def test_pronostico_si_pisa_datos_de_archivo(db_session, parcela_id):
    guardar_dias(parcela_id, [_fila(date(2026, 8, 15), "archivo", 30.0)], db_session)
    res = guardar_dias(parcela_id, [_fila(date(2026, 8, 15), "pronostico", 31.5)], db_session)
    assert res == {"insertados": 0, "actualizados": 1, "omitidos": 0}
    fila = db_session.query(ClimaDiario).first()
    assert fila.temp_max == 31.5
    assert fila.fuente == "pronostico"


def test_endpoint_backfill(client, auth_headers, parcela_id):
    filas = [_fila(date(2025, 6, 1), "archivo"), _fila(date(2025, 6, 2), "archivo")]
    with patch("app.routers.clima_fetch.get_provider") as mock:
        mock.return_value.fetch_archivo.return_value = filas
        resp = client.post(
            f"/parcelas/{parcela_id}/clima/backfill",
            json={"desde": "2025-06-01", "hasta": "2025-06-02"},
            headers=auth_headers,
        )
    assert resp.status_code == 200
    assert resp.json()["insertados"] == 2


def test_backfill_recorta_hasta_a_hoy_menos_7(client, auth_headers, parcela_id):
    with patch("app.routers.clima_fetch.get_provider") as mock:
        mock.return_value.fetch_archivo.return_value = []
        resp = client.post(
            f"/parcelas/{parcela_id}/clima/backfill",
            json={"desde": "2025-06-01", "hasta": date.today().isoformat()},
            headers=auth_headers,
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["recortado"] is True
    assert body["hasta"] == (date.today() - timedelta(days=7)).isoformat()


def test_backfill_sin_coordenadas_da_422(client, auth_headers):
    sin_coords = client.post("/parcelas/", json={"nombre": "Sin coords"}, headers=auth_headers).json()
    resp = client.post(
        f"/parcelas/{sin_coords['id']}/clima/backfill",
        json={"desde": "2025-06-01", "hasta": "2025-06-02"},
        headers=auth_headers,
    )
    assert resp.status_code == 422
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pytest tests/test_backfill.py -v`
Expected: FAIL — `ModuleNotFoundError: app.services.clima_diario_service`.

- [ ] **Step 3: Crear `app/services/clima_diario_service.py`**

```python
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
```

- [ ] **Step 4: Añadir los schemas a `app/schemas.py`**

```python
class BackfillRequest(BaseModel):
    desde: Optional[date] = None
    hasta: Optional[date] = None
    anios: Optional[int] = Field(None, ge=1, le=20)


class BackfillResp(BaseModel):
    desde: date
    hasta: date
    recortado: bool
    dias_solicitados: int
    insertados: int
    actualizados: int
    omitidos: int
```

- [ ] **Step 5: Añadir el endpoint a `app/routers/clima_fetch.py`**

```python
from datetime import date, timedelta

from ..models import ClimaDiario  # (si hiciera falta en el futuro; el servicio ya lo usa)
from ..schemas import BackfillRequest, BackfillResp
from ..services.clima_diario_service import guardar_dias

# El archivo va con varios días de desfase respecto a hoy.
DIAS_DESFASE_ARCHIVO = 7


@router.post(
    "/parcelas/{parcela_id}/clima/backfill",
    response_model=BackfillResp,
    summary="Rellena clima_diario hacia atrás desde el archivo histórico",
)
def backfill_clima(
    parcela_id: int,
    body: BackfillRequest,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    parcela = get_parcela_del_usuario(parcela_id, current_user, db)

    if parcela.latitud is None or parcela.longitud is None:
        raise HTTPException(
            status_code=422,
            detail="La parcela no tiene coordenadas (latitud/longitud). Edítala antes de rellenar el histórico.",
        )

    tope = date.today() - timedelta(days=DIAS_DESFASE_ARCHIVO)

    if body.anios:
        hasta = tope
        desde = date(hasta.year - body.anios, hasta.month, hasta.day)
    else:
        if body.desde is None or body.hasta is None:
            raise HTTPException(status_code=422, detail="Indica 'anios' o bien 'desde' y 'hasta'.")
        desde, hasta = body.desde, body.hasta

    recortado = hasta > tope
    if recortado:
        hasta = tope

    if desde > hasta:
        raise HTTPException(status_code=422, detail="El rango pedido queda vacío tras recortar al desfase del archivo.")

    try:
        filas = get_provider().fetch_archivo(parcela.latitud, parcela.longitud, desde, hasta)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Error al contactar el archivo meteorológico: {exc}")

    resumen = guardar_dias(parcela_id, filas, db)

    return BackfillResp(
        desde=desde,
        hasta=hasta,
        recortado=recortado,
        dias_solicitados=(hasta - desde).days + 1,
        **resumen,
    )
```

- [ ] **Step 6: Ejecutar los tests y verificar que pasan**

Run: `pytest tests/test_backfill.py -v`
Expected: 7 PASS.

- [ ] **Step 7: Ejecutar toda la suite**

Run: `pytest -v`
Expected: todo en PASS.

- [ ] **Step 8: Commit**

```bash
git add app/services/clima_diario_service.py app/routers/clima_fetch.py app/schemas.py tests/test_backfill.py
git commit -m "feat: backfill de clima diario desde el archivo historico"
```

---

## Fase 3 — Consolidación y endpoints

### Task 8: Ampliar `calcular_resumen` con máximos y mínimos

**Files:**
- Modify: `app/services/sensor_stats.py`
- Modify: `tests/test_sensor_stats.py`

**Interfaces:**
- Produces: `calcular_resumen` devuelve 4 claves nuevas (`humedad_max`, `humedad_min`, `temperatura_max`, `temperatura_min`) **además** de las 6 actuales, que no cambian de nombre ni de valor. La Task 9 las consume.

- [ ] **Step 1: Ampliar el test existente**

En `tests/test_sensor_stats.py`, añadir al final:

```python
def test_resumen_incluye_maximos_y_minimos():
    lecturas = [
        LogSensor(sensor_id=1, humedad_suelo_pct=30.0, temperatura_suelo=18.0),
        LogSensor(sensor_id=2, humedad_suelo_pct=34.0, temperatura_suelo=20.0),
        LogSensor(sensor_id=3, humedad_suelo_pct=32.0, temperatura_suelo=19.0),
    ]
    r = calcular_resumen(lecturas)
    assert r["humedad_max"] == 34.0
    assert r["humedad_min"] == 30.0
    assert r["temperatura_max"] == 20.0
    assert r["temperatura_min"] == 18.0


def test_maximos_y_minimos_son_none_sin_lecturas():
    r = calcular_resumen([])
    assert r["humedad_max"] is None
    assert r["humedad_min"] is None
    assert r["temperatura_max"] is None
    assert r["temperatura_min"] is None
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pytest tests/test_sensor_stats.py -v`
Expected: los 2 nuevos FAIL con `KeyError`; los 3 previos siguen PASS.

- [ ] **Step 3: Ampliar `calcular_resumen`**

Añadir el helper y las 4 claves, sin tocar las existentes:

```python
def _extremo(valores: list, funcion) -> Optional[float]:
    return funcion(valores) if valores else None
```

Y en el `return` de `calcular_resumen`, añadir tras las claves actuales:

```python
        "humedad_max": _extremo(humedades, max),
        "humedad_min": _extremo(humedades, min),
        "temperatura_max": _extremo(temperaturas, max),
        "temperatura_min": _extremo(temperaturas, min),
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `pytest tests/test_sensor_stats.py -v`
Expected: 5 PASS (3 previos + 2 nuevos).

- [ ] **Step 5: Ejecutar toda la suite**

Run: `pytest -v`
Expected: todo en PASS. Los consumidores actuales (`_obtener_resumen`, dashboard, exportación) construyen `ResumenSensoresResp(**resumen)`. **Verificado antes de escribir este plan**: `ResumenSensoresResp` acepta e ignora los campos extra, así que las 4 claves nuevas no lo rompen. Si algún test falla aquí, es por otra causa — investígala en vez de recortar las claves nuevas.

- [ ] **Step 6: Commit**

```bash
git add app/services/sensor_stats.py tests/test_sensor_stats.py
git commit -m "feat: calcular_resumen devuelve tambien maximos y minimos"
```

### Task 9: Reescribir `worker.py` para las dos tablas

**Files:**
- Modify: `worker.py`
- Test: `tests/test_worker_consolidar.py` (reescrito)

**Interfaces:**
- Consumes: `guardar_dias` (Task 7), `calcular_resumen` ampliado (Task 8), `fetch_diario` (Task 6), modelos de la Task 1.
- Produces: `consolidar_datos_diarios(parcela_id, fecha)` rellena `clima_diario` y `suelo_diario` de forma independiente.

- [ ] **Step 1: Reescribir el test**

Replace: `tests/test_worker_consolidar.py`

```python
from datetime import date, datetime
from unittest.mock import patch

from app.models import ClimaDiario, LogSensor, Parcela, Sensor, SueloDiario
from tests.conftest import SesionSinCierre


def _preparar(db_session):
    parcela = Parcela(usuario_id=1, nombre="P1", latitud=41.65, longitud=-4.72)
    db_session.add(parcela)
    db_session.commit()
    db_session.refresh(parcela)

    s1 = Sensor(parcela_id=parcela.id, etiqueta="Nodo 1", activo=True)
    s2 = Sensor(parcela_id=parcela.id, etiqueta="Nodo 2", activo=True)
    db_session.add_all([s1, s2])
    db_session.commit()

    db_session.add_all([
        LogSensor(parcela_id=parcela.id, sensor_id=s1.id, fecha_hora=datetime(2026, 8, 17, 8, 0),
                  humedad_suelo_pct=30.0, temperatura_suelo=18.0),
        LogSensor(parcela_id=parcela.id, sensor_id=s2.id, fecha_hora=datetime(2026, 8, 17, 9, 0),
                  humedad_suelo_pct=34.0, temperatura_suelo=20.0),
    ])
    db_session.commit()
    return parcela


FILA_CLIMA = {
    "fecha": date(2026, 8, 17), "temp_max": 31.2, "temp_min": 14.8,
    "precipitacion_total_mm": 12.5, "fuente": "pronostico", "suelo_modelo_capa": "0_to_7cm",
}


def test_consolida_ambas_tablas(db_session, monkeypatch):
    import worker

    parcela = _preparar(db_session)
    monkeypatch.setattr(worker, "SessionLocal", lambda: SesionSinCierre(db_session))

    with patch("worker.get_provider") as mock:
        mock.return_value.fetch_diario.return_value = [FILA_CLIMA]
        worker.consolidar_datos_diarios(parcela.id, date(2026, 8, 17))

    clima = db_session.query(ClimaDiario).filter_by(parcela_id=parcela.id).first()
    assert clima is not None
    assert clima.temp_max == 31.2

    suelo = db_session.query(SueloDiario).filter_by(parcela_id=parcela.id).first()
    assert suelo is not None
    assert suelo.humedad_media == 32.0
    assert suelo.humedad_max == 34.0
    assert suelo.humedad_min == 30.0
    assert suelo.n_sensores == 2


def test_fallo_del_clima_no_impide_consolidar_el_suelo(db_session, monkeypatch):
    import worker

    parcela = _preparar(db_session)
    monkeypatch.setattr(worker, "SessionLocal", lambda: SesionSinCierre(db_session))

    with patch("worker.get_provider") as mock:
        mock.return_value.fetch_diario.side_effect = RuntimeError("proveedor caido")
        worker.consolidar_datos_diarios(parcela.id, date(2026, 8, 17))

    assert db_session.query(ClimaDiario).count() == 0
    suelo = db_session.query(SueloDiario).filter_by(parcela_id=parcela.id).first()
    assert suelo is not None, "el suelo debe consolidarse aunque falle el clima"
    assert suelo.n_sensores == 2


def test_fallo_del_suelo_no_impide_consolidar_el_clima(db_session, monkeypatch):
    import worker

    parcela = _preparar(db_session)
    monkeypatch.setattr(worker, "SessionLocal", lambda: SesionSinCierre(db_session))

    with patch("worker.get_provider") as mock, \
         patch("worker.calcular_resumen", side_effect=RuntimeError("fallo agregando")):
        mock.return_value.fetch_diario.return_value = [FILA_CLIMA]
        worker.consolidar_datos_diarios(parcela.id, date(2026, 8, 17))

    assert db_session.query(SueloDiario).count() == 0
    assert db_session.query(ClimaDiario).filter_by(parcela_id=parcela.id).first() is not None


def test_la_precipitacion_viene_de_la_api_no_de_sumar_log_clima(db_session, monkeypatch):
    """No-regresión del bug: sumar lluvia_mm de muestras cada 3h infravalora el día."""
    import worker
    from app.models import LogClima

    parcela = _preparar(db_session)
    db_session.add_all([
        LogClima(parcela_id=parcela.id, fecha_hora=datetime(2026, 8, 17, h, 0), lluvia_mm=1.0)
        for h in (0, 3, 6, 9)
    ])
    db_session.commit()

    monkeypatch.setattr(worker, "SessionLocal", lambda: SesionSinCierre(db_session))
    with patch("worker.get_provider") as mock:
        mock.return_value.fetch_diario.return_value = [FILA_CLIMA]  # 12.5 mm
        worker.consolidar_datos_diarios(parcela.id, date(2026, 8, 17))

    clima = db_session.query(ClimaDiario).filter_by(parcela_id=parcela.id).first()
    assert clima.precipitacion_total_mm == 12.5, "debe ganar el agregado diario de la API, no la suma (4.0) de log_clima"
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pytest tests/test_worker_consolidar.py -v`
Expected: FAIL — `worker` aún importa `ClimaDiarioHistorico`, eliminado en la Task 3.

- [ ] **Step 3: Reescribir `worker.py`**

```python
from datetime import date, datetime, time, timedelta

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import LogSensor, Parcela, Sensor, SueloDiario
from app.services.clima_diario_service import guardar_dias
from app.services.sensor_stats import calcular_resumen
from app.services.weather import get_provider


def _consolidar_clima(parcela_id: int, fecha: date, db: Session) -> None:
    """Pide a la API los agregados diarios y los guarda. Ver el spec: no se
    agregan desde log_clima porque las muestras cada 3 h infravaloran las sumas."""
    parcela = db.query(Parcela).filter(Parcela.id == parcela_id).first()
    if parcela is None or parcela.latitud is None or parcela.longitud is None:
        print(f"[CLIMA] Parcela {parcela_id} sin coordenadas; se omite")
        return

    filas = get_provider().fetch_diario(parcela.latitud, parcela.longitud, past_days=7)
    del_dia = [f for f in filas if f.get("fecha") == fecha]
    if not del_dia:
        print(f"[CLIMA] La API no devolvió datos para {fecha}")
        return

    guardar_dias(parcela_id, del_dia, db)
    print(f"[CLIMA] Consolidado {fecha} para Parcela {parcela_id}")


def _consolidar_suelo(parcela_id: int, fecha: date, db: Session) -> None:
    inicio_dia = datetime.combine(fecha, time.min)
    fin_dia = datetime.combine(fecha, time.max)

    lecturas = (
        db.query(LogSensor)
        .join(Sensor, LogSensor.sensor_id == Sensor.id)
        .filter(
            LogSensor.parcela_id == parcela_id,
            Sensor.activo.is_(True),
            LogSensor.fecha_hora >= inicio_dia,
            LogSensor.fecha_hora <= fin_dia,
        )
        .all()
    )
    resumen = calcular_resumen(lecturas)

    existente = db.query(SueloDiario).filter_by(parcela_id=parcela_id, fecha=fecha).first()
    if existente:
        for campo, valor in resumen.items():
            setattr(existente, campo, valor)
    else:
        db.add(SueloDiario(parcela_id=parcela_id, fecha=fecha, **resumen))

    db.commit()
    print(f"[SUELO] Consolidado {fecha} para Parcela {parcela_id}")


def consolidar_datos_diarios(parcela_id: int, fecha: date):
    """
    Consolida el día en clima_diario y suelo_diario. Cada tabla va en su propio
    try/except: un fallo en una fuente no impide consolidar la otra — que es
    justamente el motivo por el que se partió la tabla original.
    """
    db: Session = SessionLocal()
    try:
        try:
            _consolidar_clima(parcela_id, fecha, db)
        except Exception as e:
            db.rollback()
            print(f"[ERROR] Clima {fecha} parcela {parcela_id}: {e}")

        try:
            _consolidar_suelo(parcela_id, fecha, db)
        except Exception as e:
            db.rollback()
            print(f"[ERROR] Suelo {fecha} parcela {parcela_id}: {e}")
    finally:
        db.close()


if __name__ == "__main__":
    hoy = date.today()
    ayer = hoy - timedelta(days=1)
    print("Arrancando consolidacion manual...")
    consolidar_datos_diarios(1, ayer)
    consolidar_datos_diarios(1, hoy)
```

- [ ] **Step 4: Ejecutar los tests y verificar que pasan**

Run: `pytest tests/test_worker_consolidar.py -v`
Expected: 4 PASS.

- [ ] **Step 5: Ejecutar toda la suite**

Run: `pytest -v`
Expected: todo en PASS.

- [ ] **Step 6: Commit**

```bash
git add worker.py tests/test_worker_consolidar.py
git commit -m "feat: worker consolida clima_diario y suelo_diario por separado"
```

### Task 10: Router de tratamientos

**Files:**
- Create: `app/routers/tratamientos.py`
- Modify: `app/main.py`
- Test: `tests/test_tratamientos.py`

**Interfaces:**
- Consumes: modelo `Tratamiento` y schemas de la Task 3.
- Produces: `POST /tratamientos/`, `GET /parcelas/{id}/tratamientos`, `DELETE /tratamientos/{id}`.

- [ ] **Step 1: Escribir el test**

Create: `tests/test_tratamientos.py`

```python
from datetime import datetime

from app.models import LogClima


def _cuerpo(parcela_id, tipo="fitosanitario"):
    return {
        "parcela_id": parcela_id,
        "fecha": "2026-08-17T09:30:00",
        "tipo": tipo,
        "producto": "Producto X",
        "materia_activa": "mancozeb",
        "dosis": 2.5,
        "unidad_dosis": "L/ha",
        "operador": "Roi",
        "maquinaria": "Atomizador",
    }


def test_crear_tratamiento_copia_el_clima(client, auth_headers, parcela_id, db_session):
    db_session.add(LogClima(
        parcela_id=parcela_id, fecha_hora=datetime(2026, 8, 17, 9, 0),
        temp_c=22.0, viento_vel_ms=1.8,
    ))
    db_session.commit()

    resp = client.post("/tratamientos/", json=_cuerpo(parcela_id), headers=auth_headers)
    assert resp.status_code == 201
    body = resp.json()
    assert body["temp_c_aplicacion"] == 22.0
    assert body["viento_ms_aplicacion"] == 1.8


def test_crear_tratamiento_sin_clima_disponible(client, auth_headers, parcela_id):
    resp = client.post("/tratamientos/", json=_cuerpo(parcela_id), headers=auth_headers)
    assert resp.status_code == 201
    body = resp.json()
    assert body["temp_c_aplicacion"] is None
    assert body["viento_ms_aplicacion"] is None
    assert body["producto"] == "Producto X"


def test_listar_tratamientos_ordenados_y_filtrados(client, auth_headers, parcela_id):
    client.post("/tratamientos/", json={**_cuerpo(parcela_id), "fecha": "2026-08-10T09:00:00"}, headers=auth_headers)
    client.post("/tratamientos/", json={**_cuerpo(parcela_id, tipo="abonado"), "fecha": "2026-08-15T09:00:00"}, headers=auth_headers)

    resp = client.get(f"/parcelas/{parcela_id}/tratamientos", headers=auth_headers)
    assert resp.status_code == 200
    lista = resp.json()
    assert len(lista) == 2
    assert lista[0]["fecha"].startswith("2026-08-15"), "el más reciente primero"

    resp = client.get(f"/parcelas/{parcela_id}/tratamientos", params={"tipo": "abonado"}, headers=auth_headers)
    assert len(resp.json()) == 1


def test_borrar_tratamiento(client, auth_headers, parcela_id):
    creado = client.post("/tratamientos/", json=_cuerpo(parcela_id), headers=auth_headers).json()
    resp = client.delete(f"/tratamientos/{creado['id']}", headers=auth_headers)
    assert resp.status_code == 204
    assert client.get(f"/parcelas/{parcela_id}/tratamientos", headers=auth_headers).json() == []


def test_no_se_puede_borrar_un_tratamiento_de_otro_usuario(client, auth_headers, parcela_id):
    creado = client.post("/tratamientos/", json=_cuerpo(parcela_id), headers=auth_headers).json()

    client.post("/auth/register", json={"nombre": "Otro", "email": "otro@vinalert.dev", "password": "clave12345"})
    token = client.post("/auth/token", data={"username": "otro@vinalert.dev", "password": "clave12345"}).json()["access_token"]
    otros_headers = {"Authorization": f"Bearer {token}"}

    resp = client.delete(f"/tratamientos/{creado['id']}", headers=otros_headers)
    assert resp.status_code == 404
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pytest tests/test_tratamientos.py -v`
Expected: FAIL (404, la ruta no existe).

- [ ] **Step 3: Crear `app/routers/tratamientos.py`**

```python
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, get_parcela_del_usuario
from ..models import LogClima, Tratamiento, Usuario
from ..schemas import TratamientoCreate, TratamientoResp

router = APIRouter(tags=["tratamientos"])


@router.post("/tratamientos/", response_model=TratamientoResp, status_code=201)
def crear_tratamiento(
    body: TratamientoCreate,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    get_parcela_del_usuario(body.parcela_id, current_user, db)

    # Copiamos el clima ya almacenado en vez de llamar a la API: registrar un
    # tratamiento en campo no debe depender de conectividad ni de la latencia
    # del proveedor. El viento al aplicar es dato legalmente exigido.
    ultimo_clima = (
        db.query(LogClima)
        .filter(LogClima.parcela_id == body.parcela_id)
        .order_by(LogClima.fecha_hora.desc())
        .first()
    )

    tratamiento = Tratamiento(
        **body.model_dump(),
        temp_c_aplicacion=ultimo_clima.temp_c if ultimo_clima else None,
        viento_ms_aplicacion=ultimo_clima.viento_vel_ms if ultimo_clima else None,
    )
    db.add(tratamiento)
    db.commit()
    db.refresh(tratamiento)
    return tratamiento


@router.get("/parcelas/{parcela_id}/tratamientos", response_model=List[TratamientoResp])
def listar_tratamientos(
    parcela_id: int,
    tipo: Optional[str] = Query(None, description="Filtrar por tipo de tratamiento"),
    limite: int = Query(100, ge=1, le=500),
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    get_parcela_del_usuario(parcela_id, current_user, db)
    q = db.query(Tratamiento).filter(Tratamiento.parcela_id == parcela_id)
    if tipo:
        q = q.filter(Tratamiento.tipo == tipo)
    return q.order_by(Tratamiento.fecha.desc()).limit(limite).all()


@router.delete("/tratamientos/{tratamiento_id}", status_code=204)
def borrar_tratamiento(
    tratamiento_id: int,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    tratamiento = db.query(Tratamiento).filter(Tratamiento.id == tratamiento_id).first()
    if tratamiento is None:
        raise HTTPException(status_code=404, detail="Tratamiento no encontrado")
    # Valida la propiedad de la parcela; lanza 404 si no es del usuario.
    get_parcela_del_usuario(tratamiento.parcela_id, current_user, db)
    db.delete(tratamiento)
    db.commit()
```

- [ ] **Step 4: Registrar el router en `app/main.py`**

Añadir `tratamientos` al import de routers y `app.include_router(tratamientos.router)` junto a los demás.

- [ ] **Step 5: Ejecutar los tests y verificar que pasan**

Run: `pytest tests/test_tratamientos.py -v`
Expected: 5 PASS.

- [ ] **Step 6: Ejecutar toda la suite**

Run: `pytest -v`
Expected: todo en PASS.

- [ ] **Step 7: Commit**

```bash
git add app/routers/tratamientos.py app/main.py tests/test_tratamientos.py
git commit -m "feat: router de tratamientos con captura automatica de clima"
```

### Task 11: Endpoints de lectura de las tablas diarias

**Files:**
- Modify: `app/routers/parcelas.py`
- Test: `tests/test_endpoints_diarios.py`

**Interfaces:**
- Produces: `GET /parcelas/{id}/clima/diario?dias=` y `GET /parcelas/{id}/suelo/diario?dias=`, ambos ordenados por fecha ascendente. Sustituyen al `historico-diario` retirado en la Task 3. El sub-proyecto ③ (frontend) los consume.

- [ ] **Step 1: Escribir el test**

Create: `tests/test_endpoints_diarios.py`

```python
from datetime import date, timedelta

from app.models import ClimaDiario, SueloDiario


def test_clima_diario_devuelve_ordenado(client, auth_headers, parcela_id, db_session):
    hoy = date.today()
    db_session.add_all([
        ClimaDiario(parcela_id=parcela_id, fecha=hoy - timedelta(days=2), temp_max=30.0, fuente="archivo"),
        ClimaDiario(parcela_id=parcela_id, fecha=hoy - timedelta(days=1), temp_max=31.0, fuente="pronostico"),
    ])
    db_session.commit()

    resp = client.get(f"/parcelas/{parcela_id}/clima/diario", headers=auth_headers)
    assert resp.status_code == 200
    lista = resp.json()
    assert len(lista) == 2
    assert lista[0]["temp_max"] == 30.0, "el más antiguo primero"
    assert lista[0]["fuente"] == "archivo"


def test_clima_diario_filtra_por_dias(client, auth_headers, parcela_id, db_session):
    hoy = date.today()
    db_session.add_all([
        ClimaDiario(parcela_id=parcela_id, fecha=hoy - timedelta(days=40), temp_max=20.0, fuente="archivo"),
        ClimaDiario(parcela_id=parcela_id, fecha=hoy - timedelta(days=2), temp_max=31.0, fuente="archivo"),
    ])
    db_session.commit()

    resp = client.get(f"/parcelas/{parcela_id}/clima/diario", params={"dias": 7}, headers=auth_headers)
    assert len(resp.json()) == 1


def test_suelo_diario_devuelve_ordenado(client, auth_headers, parcela_id, db_session):
    hoy = date.today()
    db_session.add_all([
        SueloDiario(parcela_id=parcela_id, fecha=hoy - timedelta(days=2), humedad_media=30.0, n_sensores=2),
        SueloDiario(parcela_id=parcela_id, fecha=hoy - timedelta(days=1), humedad_media=32.0, n_sensores=2),
    ])
    db_session.commit()

    resp = client.get(f"/parcelas/{parcela_id}/suelo/diario", headers=auth_headers)
    assert resp.status_code == 200
    lista = resp.json()
    assert [f["humedad_media"] for f in lista] == [30.0, 32.0]


def test_diarios_de_otra_parcela_dan_404(client, auth_headers):
    resp = client.get("/parcelas/99999/clima/diario", headers=auth_headers)
    assert resp.status_code == 404
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pytest tests/test_endpoints_diarios.py -v`
Expected: FAIL (404, las rutas no existen).

- [ ] **Step 3: Añadir los endpoints a `app/routers/parcelas.py`**

Añadir a los imports: `ClimaDiario`, `SueloDiario` (modelos) y `ClimaDiarioResp`, `SueloDiarioResp` (schemas).

```python
@router.get("/parcelas/{parcela_id}/clima/diario", response_model=List[ClimaDiarioResp])
def obtener_clima_diario(
    parcela_id: int,
    dias: Optional[int] = None,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    get_parcela_del_usuario(parcela_id, current_user, db)
    q = db.query(ClimaDiario).filter(ClimaDiario.parcela_id == parcela_id)
    if dias is not None:
        q = q.filter(ClimaDiario.fecha >= date.today() - timedelta(days=dias))
    return q.order_by(ClimaDiario.fecha.asc()).all()


@router.get("/parcelas/{parcela_id}/suelo/diario", response_model=List[SueloDiarioResp])
def obtener_suelo_diario(
    parcela_id: int,
    dias: Optional[int] = None,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    get_parcela_del_usuario(parcela_id, current_user, db)
    q = db.query(SueloDiario).filter(SueloDiario.parcela_id == parcela_id)
    if dias is not None:
        q = q.filter(SueloDiario.fecha >= date.today() - timedelta(days=dias))
    return q.order_by(SueloDiario.fecha.asc()).all()
```

- [ ] **Step 4: Ejecutar los tests y verificar que pasan**

Run: `pytest tests/test_endpoints_diarios.py -v`
Expected: 4 PASS.

- [ ] **Step 5: Ejecutar toda la suite**

Run: `pytest -v`
Expected: todo en PASS.

- [ ] **Step 6: Commit**

```bash
git add app/routers/parcelas.py tests/test_endpoints_diarios.py
git commit -m "feat: endpoints de lectura de clima_diario y suelo_diario"
```

---

## Verificación final

- [ ] **Step 1: Suite completa**

Run: `pytest -v`
Expected: todos los tests de las 11 tareas en PASS.

- [ ] **Step 2: Arranque real de la app**

Run: `uvicorn app.main:app --port 8000` (unos segundos, luego Ctrl+C)
Expected: arranca sin errores de SQLAlchemy ni de APScheduler.

**Nota:** al arrancar, `Base.metadata.create_all` creará `clima_diario`,
`suelo_diario` y `tratamientos` en la base real (son tablas nuevas — operación
aditiva y segura). Las tablas viejas **seguirán ahí** hasta que se aplique la
migración con los `DROP`, que requiere confirmación del usuario.

- [ ] **Step 3: Recordatorio de la migración pendiente**

`migracion_2026_08_18_cimientos.sql` está escrito y validado pero **no
aplicado**. Contiene dos `DROP TABLE` destructivos (`clima_diario_historico`,
147 filas; `cue_actividades`, 7 filas — ambas datos de prueba). El controlador
debe pedir confirmación explícita al usuario antes de ejecutarlo.

- [ ] **Step 4: Qué queda fuera de este plan**

Sub-proyecto ③ (aplicación web: frontend + endpoints de exportación) y
sub-proyecto ② (claves de dispositivo, ingesta por lotes de la pasarela LoRa,
número de sensores al crear parcela). El frontend sigue roto donde ya lo
estaba — este plan no lo empeora ni lo arregla.

# Sensores de suelo (array), lectura foliar por Excel, y limpieza — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Soportar múltiples sensores de suelo (humedad + temperatura) por parcela con vista individual y agregada, subir e interpretar el Excel del sensor foliar de terceros, y retirar del backend la funcionalidad y tablas que ya no encajan en el alcance (riesgo de enfermedad, recomendación de riego, tablas huérfanas).

**Architecture:** FastAPI + SQLAlchemy + PostgreSQL, sin cambios de stack. Se añade un catálogo `Sensor` (dispositivo) del que cuelgan las lecturas de `LogSensor` (ahora con `sensor_id`), una tabla `LecturaFoliar` independiente para el Excel de terceros, un servicio puro de estadísticas (`calcular_resumen`) reutilizado tanto por el endpoint de resumen como por `worker.py`, un parser puro para el Excel Dualex, y un `BackgroundScheduler` (APScheduler) embebido en el `lifespan` de la app para refrescar el clima automáticamente. Se elimina `app/routers/analisis.py`, `app/logic/` completo, y las tablas/columnas correspondientes vía migración SQL manual (el proyecto no usa Alembic).

**Tech Stack:** FastAPI 0.115, SQLAlchemy 2.0, PostgreSQL (prod) / SQLite en memoria (tests), Pydantic 2, openpyxl (parseo Excel), APScheduler (scheduler), pytest + httpx (tests, nuevos en este plan).

**Spec:** `docs/specs/2026-08-17-sensores-y-foliar-design.md`

## Global Constraints

- El proyecto no tiene Alembic — los cambios de esquema se aplican con SQL directo vía `psql`, documentado en cada tarea de migración.
- `Base.metadata.create_all(bind=engine)` en el `lifespan` de `main.py` solo crea tablas que faltan; nunca borra tablas ni altera columnas existentes — de ahí que dropear/alterar columnas requiera SQL manual.
- Todas las respuestas de la API siguen el patrón `Optional[float] = None` para floats que pueden faltar, y `model_config = ConfigDict(from_attributes=True)` en los schemas de respuesta (ver `app/schemas.py` existente).
- Las fechas se guardan como `datetime` naive en UTC (`datetime.now(timezone.utc).replace(tzinfo=None)`), igual que en `clima_fetch.py` y `logs.py` actuales — no cambiar ese patrón.
- Este plan **no toca el frontend** (`vinalert-front/`). Tras aplicarlo, `MildiuSection.jsx` y `RiegoSection.jsx` seguirán en el árbol de código mostrando `0`/`—` porque sus props (`ultima_recomendacion`, `ultimo_riesgo`) dejarán de llegar del backend — no rompen, pero quedan muertas. Además, `DashboardCompleto.estado_suelo` cambia de forma (`LogSensorResp` → `ResumenSensoresResp`, Task 13), así que `DashboardSection.jsx` también deja de mostrar correctamente humedad/batería/NPK en la tarjeta principal del dashboard (lee campos que ya no llegan) — no es una regresión, es la migración esperada a `humedad_media`, pero el plan de frontend debe contemplar las tres secciones (Mildiu, Riego, Dashboard), no solo las dos primeras. Retirarlas y construir las pantallas nuevas (sensores múltiples, subida de Excel foliar) es un plan de frontend aparte, fuera de este alcance.

> **Nota de corrección post-implementación:** las Tasks 15-17 de este plan asumían que el Excel de ejemplo (`Libro1.xlsx`) contenía 8 bloques-resumen completos (uno por cada "grupo" 1-8). Al implementar se descubrió y verificó (dos veces, de forma independiente) que el archivo real solo tiene 6 bloques-resumen completos, para los grupos `[1, 2, 3, 4, 5, 7]` — el archivo está truncado a mitad de captura (grupo 6 sin resumen, grupo 8 solo con 2 lecturas crudas sin resumen). El código y los tests finalmente implementados usan correctamente 6/`[1,2,3,4,5,7]`; las referencias a "8 grupos" que aparecen más abajo en este documento (código de ejemplo original de las Tasks 15-17) son el error de origen, no lo que se construyó.

---

## Fase 0 — Infraestructura de tests

El proyecto no tiene ningún test ni configuración de pytest hoy. Antes de tocar código hace falta una base para poder hacer TDD en el resto del plan.

### Task 1: Configurar pytest con SQLite en memoria y fixtures de autenticación

**Files:**
- Create: `requirements-dev.txt`
- Create: `pytest.ini`
- Create: `tests/__init__.py`
- Create: `tests/conftest.py`
- Modify: `requirements.txt`

**Interfaces:**
- Produces: fixture `client` (TestClient de FastAPI con `get_db` sobreescrito a SQLite en memoria), fixture `auth_headers` (dict `{"Authorization": "Bearer ..."}` de un usuario ya registrado), fixture `parcela_id` (int, id de una parcela creada por ese usuario). Todas las tareas siguientes que necesiten tests HTTP consumen estas tres fixtures por nombre.

- [ ] **Step 1: Añadir dependencias nuevas a requirements.txt**

Editar `requirements.txt` (añadir al final, tras `python-dotenv==1.0.1`):

```
openpyxl==3.1.5
APScheduler==3.10.4
```

- [ ] **Step 2: Crear requirements-dev.txt**

```
-r requirements.txt
pytest==8.3.3
httpx==0.27.2
```

- [ ] **Step 3: Instalar dependencias**

Run: `pip install -r requirements-dev.txt`
Expected: instala pytest, httpx, openpyxl y APScheduler sin errores.

- [ ] **Step 4: Crear pytest.ini**

```ini
[pytest]
testpaths = tests
```

- [ ] **Step 5: Crear tests/__init__.py (vacío)**

```python
```

- [ ] **Step 6: Crear tests/conftest.py**

```python
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from app.database import Base, get_db
from app.main import app


@pytest.fixture()
def db_session():
    """Motor SQLite en memoria, aislado por test (schema fresco cada vez)."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    testing_session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = testing_session_local()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client(db_session):
    """
    TestClient SIN usar `with` (a propósito): así no dispara el lifespan de
    main.py, que llamaría a Base.metadata.create_all contra el Postgres real
    y arrancaría el scheduler de clima. El esquema ya lo monta db_session
    sobre SQLite en memoria.
    """
    def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    test_client = TestClient(app)
    yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def auth_headers(client):
    client.post(
        "/auth/register",
        json={"nombre": "Test User", "email": "test@vinalert.dev", "password": "clave12345"},
    )
    resp = client.post(
        "/auth/token",
        data={"username": "test@vinalert.dev", "password": "clave12345"},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def parcela_id(client, auth_headers):
    resp = client.post(
        "/parcelas/",
        json={"nombre": "Parcela Test", "latitud": 41.0, "longitud": -3.0},
        headers=auth_headers,
    )
    return resp.json()["id"]
```

- [ ] **Step 7: Test de humo — confirmar que la infraestructura funciona**

Create: `tests/test_smoke.py`

```python
def test_registro_login_y_parcela(client, auth_headers, parcela_id):
    resp = client.get("/parcelas/", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["id"] == parcela_id
```

- [ ] **Step 8: Ejecutar el test y confirmar que pasa**

Run: `pytest tests/test_smoke.py -v`
Expected: `1 passed`. Si falla por `httpx` no instalado, revisar Step 3.

- [ ] **Step 9: Commit**

```bash
git add requirements.txt requirements-dev.txt pytest.ini tests/
git commit -m "test: infraestructura pytest con SQLite en memoria y fixtures de auth"
```

---

## Fase 1 — Retirar riesgo de enfermedad y recomendación de riego

Se retira primero el consumidor (`/analizar/{id}`), luego los usos en el dashboard, y por último la lógica y los modelos — así el software queda funcional entre cada paso.

### Task 2: Eliminar el router de análisis (`/analizar/{id}`)

**Files:**
- Delete: `app/routers/analisis.py`
- Modify: `app/main.py:9,36`
- Test: `tests/test_analisis_removido.py`

**Interfaces:**
- Consumes: ninguno.
- Produces: ninguno (endpoint eliminado). Confirma que `POST /analizar/{id}` ya no existe.

- [ ] **Step 1: Escribir el test que confirma la eliminación**

Create: `tests/test_analisis_removido.py`

```python
def test_analizar_ya_no_existe(client, auth_headers, parcela_id):
    resp = client.post(f"/analizar/{parcela_id}", headers=auth_headers)
    assert resp.status_code == 404
```

- [ ] **Step 2: Ejecutar el test y verificar que falla (el endpoint aún existe)**

Run: `pytest tests/test_analisis_removido.py -v`
Expected: FAIL (recibe 200 o algún código distinto de 404, porque el router sigue registrado).

- [ ] **Step 3: Borrar el archivo del router**

Run: `rm app/routers/analisis.py`

- [ ] **Step 4: Quitar el import y el registro en main.py**

En `app/main.py`, línea 9:

```python
from .routers import auth, parcelas, logs, analisis, actividades, clima_fetch
```

pasa a:

```python
from .routers import auth, parcelas, logs, actividades, clima_fetch
```

Y la línea 36 (`app.include_router(analisis.router)`) se elimina por completo.

- [ ] **Step 5: Ejecutar el test y verificar que pasa**

Run: `pytest tests/test_analisis_removido.py -v`
Expected: PASS (404, ruta inexistente).

- [ ] **Step 6: Commit**

```bash
git add -A app/routers/analisis.py app/main.py tests/test_analisis_removido.py
git commit -m "refactor: eliminar el router de analisis (/analizar/{id})"
```

### Task 3: Quitar riesgo y riego del dashboard de parcela

**Files:**
- Modify: `app/routers/parcelas.py:9,10-19,49-68`
- Modify: `app/schemas.py:205-216`
- Test: `tests/test_dashboard.py`

**Interfaces:**
- Consumes: `DashboardCompleto` (schema existente, se recorta).
- Produces: `DashboardCompleto` sin `ultima_recomendacion` ni `ultimo_riesgo`. La Task 13 volverá a tocar este mismo endpoint para cambiar `estado_suelo`.

- [ ] **Step 1: Escribir el test (falla porque el schema aún expone esos campos)**

Create: `tests/test_dashboard.py`

```python
def test_dashboard_no_expone_riesgo_ni_riego(client, auth_headers, parcela_id):
    resp = client.get(f"/parcelas/{parcela_id}/dashboard", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "ultima_recomendacion" not in body
    assert "ultimo_riesgo" not in body
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pytest tests/test_dashboard.py -v`
Expected: FAIL (`ultima_recomendacion` y `ultimo_riesgo` siguen en el body, aunque sean `null`).

- [ ] **Step 3: Quitar los campos de `DashboardCompleto` y borrar `AnalizarResp`**

En `app/schemas.py`, eliminar la clase `AnalizarResp` (líneas 205-208) por completo (ya no la usa nadie tras la Task 2), y dejar `DashboardCompleto` (antes líneas 211-216) así:

```python
class DashboardCompleto(BaseModel):
    parcela: ParcelaResp
    estado_suelo: Optional[LogSensorResp] = None
    clima_actual: Optional[LogClimaResp] = None
```

(`RecomendacionRiegoResp` y `RiesgoEnfermedadResp` se quedan por ahora en `schemas.py` — se eliminan en las Tasks 4 y 5, cuando ya no las importe nada.)

- [ ] **Step 4: Actualizar `app/routers/parcelas.py`**

Línea 9, quitar `RecomendacionRiego, RiesgoEnfermedad` del import:

```python
from ..models import ClimaDiarioHistorico, LogClima, LogSensor, Parcela, Usuario
```

Líneas 10-19, quitar `RecomendacionRiegoResp` y `RiesgoEnfermedadResp` del import de schemas:

```python
from ..schemas import (
    DashboardCompleto,
    HistoricoDiarioResp,
    LogSensorResp,
    ParcelaCreate,
    ParcelaResp,
    LogClimaResp,
)
```

Función `obtener_dashboard` (líneas 49-68), quitar las dos queries y las dos claves del dict de retorno:

```python
@router.get("/parcelas/{parcela_id}/dashboard", response_model=DashboardCompleto)
def obtener_dashboard(
    parcela_id: int,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    parcela = get_parcela_del_usuario(parcela_id, current_user, db)

    u_sensor = db.query(LogSensor).filter(LogSensor.parcela_id == parcela_id).order_by(LogSensor.fecha_hora.desc()).first()
    u_clima = db.query(LogClima).filter(LogClima.parcela_id == parcela_id).order_by(LogClima.fecha_hora.desc()).first()

    return {
        "parcela": parcela,
        "estado_suelo": u_sensor,
        "clima_actual": u_clima,
    }
```

- [ ] **Step 5: Ejecutar el test y verificar que pasa**

Run: `pytest tests/test_dashboard.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/routers/parcelas.py app/schemas.py tests/test_dashboard.py
git commit -m "refactor: quitar riesgo/riego del dashboard de parcela"
```

### Task 4: Eliminar el motor de riesgo de enfermedad

**Files:**
- Delete: `app/logic/enfermedades.py`
- Modify: `app/models.py:46` (relationship), `app/models.py:109-120` (clase completa)
- Modify: `app/schemas.py` (clase `RiesgoEnfermedadResp`)
- Modify: `app/logic/__init__.py`
- Test: `tests/test_modelos_riesgo_riego.py`

**Interfaces:**
- Consumes: ninguno externo (ya no lo usa `analisis.py` ni `parcelas.py` tras las Tasks 2 y 3).
- Produces: confirma que `RiesgoEnfermedad` ya no existe en `app.models`.

- [ ] **Step 1: Escribir el test que confirma la eliminación**

Create: `tests/test_modelos_riesgo_riego.py`

```python
import pytest


def test_riesgo_enfermedad_ya_no_existe():
    import app.models as models
    assert not hasattr(models, "RiesgoEnfermedad")
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pytest tests/test_modelos_riesgo_riego.py -v`
Expected: FAIL (`RiesgoEnfermedad` todavía existe).

- [ ] **Step 3: Borrar el archivo de lógica**

Run: `rm app/logic/enfermedades.py`

- [ ] **Step 4: Quitar el export en `app/logic/__init__.py`**

Contenido actual:

```python
from .enfermedades import actualizar_riesgo_enfermedades
from .riego import generar_recomendacion_riego

__all__ = ["generar_recomendacion_riego", "actualizar_riesgo_enfermedades"]
```

Pasa a (queda solo lo de riego, que se retira en la Task 5):

```python
from .riego import generar_recomendacion_riego

__all__ = ["generar_recomendacion_riego"]
```

- [ ] **Step 5: Quitar la clase y la relación de `app/models.py`**

Eliminar la clase `RiesgoEnfermedad` completa (líneas 109-120).

En la clase `Parcela`, quitar la línea 46:

```python
    riesgos_enfermedad = relationship("RiesgoEnfermedad", back_populates="parcela")
```

- [ ] **Step 6: Quitar `RiesgoEnfermedadResp` de `app/schemas.py`**

Eliminar la clase `RiesgoEnfermedadResp` (lo que quedaba en las antiguas líneas 139-148).

- [ ] **Step 7: Ejecutar el test y verificar que pasa**

Run: `pytest tests/test_modelos_riesgo_riego.py -v`
Expected: PASS para `test_riesgo_enfermedad_ya_no_existe`.

- [ ] **Step 8: Ejecutar toda la suite para detectar imports rotos**

Run: `pytest -v`
Expected: todos los tests existentes siguen en PASS (si algo importa `RiesgoEnfermedad` en otro sitio, fallará aquí con `ImportError` — no debería quedar ninguno tras las Tasks 2-3).

- [ ] **Step 9: Commit**

```bash
git add -A app/logic/enfermedades.py app/logic/__init__.py app/models.py app/schemas.py tests/test_modelos_riesgo_riego.py
git commit -m "refactor: eliminar el motor de riesgo de enfermedad"
```

### Task 5: Eliminar el motor de recomendación de riego y el paquete `app/logic/`

**Files:**
- Delete: `app/logic/riego.py`
- Delete: `app/logic/__init__.py`
- Delete: `app/logic/README.md`
- Modify: `app/models.py:43` (relationship), `app/models.py:94-106` (clase completa)
- Modify: `app/schemas.py` (clase `RecomendacionRiegoResp`)
- Test: `tests/test_modelos_riesgo_riego.py` (se amplía)

**Interfaces:**
- Consumes: ninguno externo (ya retirado de `analisis.py` y `parcelas.py`).
- Produces: confirma que `RecomendacionRiego` ya no existe y que `app/logic/` desaparece del árbol.

- [ ] **Step 1: Ampliar el test con la comprobación de riego**

En `tests/test_modelos_riesgo_riego.py`, añadir:

```python
def test_recomendacion_riego_ya_no_existe():
    import app.models as models
    assert not hasattr(models, "RecomendacionRiego")


def test_paquete_logic_ya_no_existe():
    import os
    assert not os.path.isdir("app/logic")
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `pytest tests/test_modelos_riesgo_riego.py -v`
Expected: 2 FAIL (los nuevos), 1 PASS (el de riesgo, ya resuelto en la Task 4).

- [ ] **Step 3: Borrar el paquete `app/logic/` completo**

Run: `rm -r app/logic`

(Esto ya se lleva `riego.py`, el `__init__.py` de la Task 4 y `README.md` — no queda nada dentro tras retirar ambos motores.)

- [ ] **Step 4: Quitar la clase y la relación de `app/models.py`**

Eliminar la clase `RecomendacionRiego` completa (líneas 94-106).

En la clase `Parcela`, quitar la línea 43:

```python
    recomendaciones_riego = relationship("RecomendacionRiego", back_populates="parcela")
```

- [ ] **Step 5: Quitar `RecomendacionRiegoResp` de `app/schemas.py`**

Eliminar la clase `RecomendacionRiegoResp` (antiguas líneas 126-136).

- [ ] **Step 6: Ejecutar el test y verificar que pasa**

Run: `pytest tests/test_modelos_riesgo_riego.py -v`
Expected: 3 PASS.

- [ ] **Step 7: Ejecutar toda la suite**

Run: `pytest -v`
Expected: todos los tests en PASS. Si `pytest` falla al arrancar con `ModuleNotFoundError: app.logic`, buscar imports colgados con `grep -rn "app.logic\|from ..logic\|from .logic" app/`.

- [ ] **Step 8: Commit**

```bash
git add -A app/logic app/models.py app/schemas.py tests/test_modelos_riesgo_riego.py
git commit -m "refactor: eliminar el motor de recomendacion de riego y el paquete app/logic"
```

### Task 6: Migración SQL — limpiar tablas huérfanas y funcionalidad retirada

**Files:**
- Create: `migracion_2026_08_17_limpieza.sql`
- Modify: `app/models.py` (eliminar clase `EtapaCultivo`)

**Interfaces:**
- Consumes: ninguno (el código ya no referencia ninguna de estas tablas tras las Tasks 2-5).
- Produces: base de datos sin `logs_sensores_pro`, `logs_clima_api`, `riesgo_enfermedades`, `etapas_cultivo`, `riesgos_enfermedad`, `recomendaciones_riego`.

- [ ] **Step 1: Confirmar que nada en el código referencia ya estas tablas**

Run: `grep -rn "EtapaCultivo\|logs_sensores_pro\|logs_clima_api\|riesgo_enfermedades" app/ --include=*.py`
Expected: sin resultados (o solo la definición de `EtapaCultivo` en `models.py`, que se quita en el siguiente paso).

- [ ] **Step 2: Quitar la clase `EtapaCultivo` de `app/models.py`**

Eliminar la clase completa (líneas 49-55).

- [ ] **Step 3: Crear el script de migración**

Create: `migracion_2026_08_17_limpieza.sql`

```sql
-- Limpieza de tablas huérfanas (sin modelo ORM ni referencias en código)
DROP TABLE IF EXISTS logs_sensores_pro;
DROP TABLE IF EXISTS logs_clima_api;
DROP TABLE IF EXISTS riesgo_enfermedades;

-- Funcionalidad retirada por decisión explícita (motor de riesgo y de riego)
DROP TABLE IF EXISTS riesgos_enfermedad;
DROP TABLE IF EXISTS recomendaciones_riego;

-- Sin uso en código
DROP TABLE IF EXISTS etapas_cultivo;
```

- [ ] **Step 4: Aplicar la migración contra la base de datos real**

Run: `PGPASSWORD=$PGPASSWORD "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -U postgres -d vinalert -f migracion_2026_08_17_limpieza.sql`
Expected: seis líneas `DROP TABLE` sin errores.

- [ ] **Step 5: Verificar el listado de tablas resultante**

Run: `PGPASSWORD=$PGPASSWORD "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -U postgres -d vinalert -c "\dt public.*"`
Expected: ya no aparecen `logs_sensores_pro`, `logs_clima_api`, `riesgo_enfermedades`, `riesgos_enfermedad`, `recomendaciones_riego`, `etapas_cultivo`.

- [ ] **Step 6: Ejecutar toda la suite de tests**

Run: `pytest -v`
Expected: todos en PASS (los tests corren contra SQLite en memoria, no contra la Postgres real, así que no dependen de este paso — pero confirma que el código sigue sano tras quitar `EtapaCultivo`).

- [ ] **Step 7: Commit**

```bash
git add app/models.py migracion_2026_08_17_limpieza.sql
git commit -m "chore: migracion SQL de limpieza de tablas huerfanas y retiradas"
```

---

## Fase 2 — Sensores de suelo (array de 18 nodos)

### Task 7: Modelo y endpoints del catálogo de sensores

**Files:**
- Modify: `app/models.py` (nueva clase `Sensor`, ajuste de `Parcela.sensores`)
- Modify: `app/schemas.py` (nuevas `SensorCreate`, `SensorResp`)
- Create: `app/routers/sensores.py`
- Modify: `app/main.py` (registrar el router)
- Test: `tests/test_sensores_catalogo.py`

**Interfaces:**
- Produces: modelo `Sensor(id, parcela_id, etiqueta, activo)`; endpoints `POST /parcelas/{id}/sensores` y `GET /parcelas/{id}/sensores`. Las Tasks 9-13 dependen de `Sensor` y de `router` (prefix `/parcelas/{parcela_id}/sensores`) definidos aquí.

- [ ] **Step 1: Escribir el test (falla, el endpoint no existe)**

Create: `tests/test_sensores_catalogo.py`

```python
def test_alta_y_listado_de_sensores(client, auth_headers, parcela_id):
    resp = client.post(
        f"/parcelas/{parcela_id}/sensores",
        json={"etiqueta": "Nodo 1"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    creado = resp.json()
    assert creado["etiqueta"] == "Nodo 1"
    assert creado["activo"] is True
    assert creado["parcela_id"] == parcela_id

    resp = client.get(f"/parcelas/{parcela_id}/sensores", headers=auth_headers)
    assert resp.status_code == 200
    lista = resp.json()
    assert len(lista) == 1
    assert lista[0]["etiqueta"] == "Nodo 1"
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pytest tests/test_sensores_catalogo.py -v`
Expected: FAIL (404, la ruta no existe todavía).

- [ ] **Step 3: Añadir el modelo `Sensor` a `app/models.py`**

Import a añadir en la línea 1 (junto a los demás tipos de columna):

```python
from sqlalchemy import Column, Integer, String, Float, DateTime, Date, ForeignKey, Text, Boolean
```

Nueva clase, justo antes de `LogSensor`:

```python
class Sensor(Base):
    __tablename__ = "sensores"
    id = Column(Integer, primary_key=True, index=True)
    parcela_id = Column(Integer, ForeignKey("parcelas.id"), nullable=False)
    etiqueta = Column(String, nullable=False)
    activo = Column(Boolean, default=True, nullable=False)

    parcela = relationship("Parcela", back_populates="sensores")
    lecturas = relationship("LogSensor", back_populates="sensor")
```

En la clase `Parcela`, la relación actual (línea 41) es:

```python
    sensores = relationship("LogSensor", back_populates="parcela")
```

Renombrarla a `logs_sensores` (pasa a significar "lecturas", no "catálogo") y añadir la nueva relación al catálogo:

```python
    logs_sensores = relationship("LogSensor", back_populates="parcela")
    sensores = relationship("Sensor", back_populates="parcela")
```

- [ ] **Step 4: Añadir `sensor_id` transitorio en `LogSensor` para que `back_populates="sensor"` resuelva**

En `app/models.py`, clase `LogSensor` (línea 71), cambiar:

```python
    parcela = relationship("Parcela", back_populates="sensores")
```

por:

```python
    parcela = relationship("Parcela", back_populates="logs_sensores")
    sensor = relationship("Sensor", back_populates="lecturas")
```

(La columna `sensor_id` en sí se añade en la Task 9 — SQLAlchemy no exige que la columna exista ya para declarar la `relationship` en este paso, pero si se ejecutan tests de esta tarea con la Task 9 sin aplicar, `sensor` no tendrá `sensor_id` que mapear. Para evitarlo, esta tarea también añade ya la columna mínima en el modelo, ver Step 5.)

- [ ] **Step 5: Añadir la columna `sensor_id` a `LogSensor` (nullable de momento)**

En `app/models.py`, clase `LogSensor`, añadir tras `parcela_id`:

```python
    sensor_id = Column(Integer, ForeignKey("sensores.id"))
```

(Se mantiene nullable en este paso porque la migración de la Postgres real y la obligatoriedad a nivel de API llegan en la Task 8 y la Task 9. En SQLite de test, `Base.metadata.create_all` ya crea la tabla `log_sensores` completa desde cero con esta columna.)

- [ ] **Step 6: Crear los schemas `SensorCreate` y `SensorResp` en `app/schemas.py`**

Añadir junto a los demás `*Create`:

```python
class SensorCreate(BaseModel):
    etiqueta: str
```

Añadir junto a los demás `*Resp`:

```python
class SensorResp(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    parcela_id: int
    etiqueta: str
    activo: bool
```

- [ ] **Step 7: Crear `app/routers/sensores.py`**

```python
from typing import Any, List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, get_parcela_del_usuario
from ..models import Sensor, Usuario
from ..schemas import SensorCreate, SensorResp

router = APIRouter(prefix="/parcelas/{parcela_id}/sensores", tags=["sensores"])


@router.post("/", response_model=SensorResp, status_code=201)
def crear_sensor(
    parcela_id: int,
    body: SensorCreate,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    get_parcela_del_usuario(parcela_id, current_user, db)
    sensor = Sensor(parcela_id=parcela_id, etiqueta=body.etiqueta, activo=True)
    db.add(sensor)
    db.commit()
    db.refresh(sensor)
    return sensor


@router.get("/", response_model=List[SensorResp])
def listar_sensores(
    parcela_id: int,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    get_parcela_del_usuario(parcela_id, current_user, db)
    return db.query(Sensor).filter(Sensor.parcela_id == parcela_id).order_by(Sensor.id).all()
```

- [ ] **Step 8: Registrar el router en `app/main.py`**

Línea 9, añadir `sensores` al import:

```python
from .routers import auth, parcelas, logs, actividades, clima_fetch, sensores
```

Tras `app.include_router(clima_fetch.router)`, añadir:

```python
app.include_router(sensores.router)
```

- [ ] **Step 9: Ejecutar el test y verificar que pasa**

Run: `pytest tests/test_sensores_catalogo.py -v`
Expected: PASS.

- [ ] **Step 10: Ejecutar toda la suite**

Run: `pytest -v`
Expected: todos en PASS.

- [ ] **Step 11: Commit**

```bash
git add app/models.py app/schemas.py app/routers/sensores.py app/main.py tests/test_sensores_catalogo.py
git commit -m "feat: catalogo de sensores de suelo por parcela"
```

### Task 8: Migración SQL — adaptar `log_sensores` para múltiples sensores

**Files:**
- Create: `migracion_2026_08_17_log_sensores.sql`

**Interfaces:**
- Consumes: tabla `sensores` (creada por `Base.metadata.create_all` al arrancar la app tras la Task 7, ya que es tabla nueva).
- Produces: columna `sensor_id` en `log_sensores` (Postgres real) y ausencia de `nitrogeno`/`fosforo`/`potasio`/`ph`.

- [ ] **Step 1: Arrancar la app una vez para que se cree la tabla `sensores` nueva**

Run: `uvicorn app.main:app --port 8000 &` seguido de una petición cualquiera (o simplemente parar tras el arranque con Ctrl+C) — basta con que el `lifespan` ejecute `Base.metadata.create_all`, que crea `sensores` (tabla nueva, no toca `log_sensores` existente).
Expected: en el log de arranque no hay errores; `\dt public.sensores` en psql confirma que existe.

- [ ] **Step 2: Crear el script de migración**

Create: `migracion_2026_08_17_log_sensores.sql`

```sql
ALTER TABLE log_sensores ADD COLUMN IF NOT EXISTS sensor_id INTEGER REFERENCES sensores(id);

ALTER TABLE log_sensores DROP COLUMN IF EXISTS nitrogeno;
ALTER TABLE log_sensores DROP COLUMN IF EXISTS fosforo;
ALTER TABLE log_sensores DROP COLUMN IF EXISTS potasio;
ALTER TABLE log_sensores DROP COLUMN IF EXISTS ph;
```

- [ ] **Step 3: Aplicar la migración**

Run: `PGPASSWORD=$PGPASSWORD "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -U postgres -d vinalert -f migracion_2026_08_17_log_sensores.sql`
Expected: sin errores.

- [ ] **Step 4: Verificar la estructura resultante**

Run: `PGPASSWORD=$PGPASSWORD "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -U postgres -d vinalert -c "\d log_sensores"`
Expected: aparece `sensor_id` (FK a `sensores`), ya no aparecen `nitrogeno`, `fosforo`, `potasio`, `ph`.

- [ ] **Step 5: Commit**

```bash
git add migracion_2026_08_17_log_sensores.sql
git commit -m "chore: migracion SQL para sensor_id en log_sensores"
```

### Task 9: Actualizar modelo `LogSensor`, schemas y el endpoint de ingesta

**Files:**
- Modify: `app/models.py` (quitar `nitrogeno`, `fosforo`, `potasio`, `ph` de `LogSensor`)
- Modify: `app/schemas.py` (`LogSensorCreate`, `LogSensorResp`)
- Modify: `app/routers/logs.py:14-25`
- Test: `tests/test_logs_sensor.py`

**Interfaces:**
- Consumes: `Sensor` (Task 7).
- Produces: `POST /logs/sensor/` exige `sensor_id` y valida que pertenezca a la misma `parcela_id`.

- [ ] **Step 1: Escribir los tests (fallan, el endpoint aún acepta el payload viejo)**

Create: `tests/test_logs_sensor.py`

```python
def test_crear_log_sensor_requiere_sensor_id(client, auth_headers, parcela_id):
    resp = client.post(
        "/logs/sensor/",
        json={
            "parcela_id": parcela_id,
            "fecha_hora": "2026-08-17T10:00:00",
            "humedad_suelo_pct": 32.5,
            "temperatura_suelo": 18.2,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 422  # falta sensor_id


def test_crear_log_sensor_ok(client, auth_headers, parcela_id):
    sensor = client.post(
        f"/parcelas/{parcela_id}/sensores",
        json={"etiqueta": "Nodo 1"},
        headers=auth_headers,
    ).json()

    resp = client.post(
        "/logs/sensor/",
        json={
            "parcela_id": parcela_id,
            "sensor_id": sensor["id"],
            "fecha_hora": "2026-08-17T10:00:00",
            "humedad_suelo_pct": 32.5,
            "temperatura_suelo": 18.2,
            "bateria": 90.0,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["sensor_id"] == sensor["id"]
    assert "nitrogeno" not in body


def test_crear_log_sensor_con_sensor_de_otra_parcela_falla(client, auth_headers, parcela_id):
    otra_parcela = client.post(
        "/parcelas/", json={"nombre": "Otra parcela"}, headers=auth_headers
    ).json()
    sensor_otra = client.post(
        f"/parcelas/{otra_parcela['id']}/sensores",
        json={"etiqueta": "Nodo ajeno"},
        headers=auth_headers,
    ).json()

    resp = client.post(
        "/logs/sensor/",
        json={
            "parcela_id": parcela_id,
            "sensor_id": sensor_otra["id"],
            "fecha_hora": "2026-08-17T10:00:00",
            "humedad_suelo_pct": 32.5,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 422
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `pytest tests/test_logs_sensor.py -v`
Expected: los tres FAIL (`sensor_id` todavía no es obligatorio, `nitrogeno` sigue en la respuesta, no hay validación de pertenencia).

- [ ] **Step 3: Quitar NPK/pH de `LogSensor` en `app/models.py`**

En la clase `LogSensor`, quitar las líneas de `nitrogeno`, `fosforo`, `potasio`, `ph`. Queda:

```python
class LogSensor(Base):
    __tablename__ = "log_sensores"
    id = Column(Integer, primary_key=True, index=True)
    parcela_id = Column(Integer, ForeignKey("parcelas.id"))
    sensor_id = Column(Integer, ForeignKey("sensores.id"))
    fecha_hora = Column(DateTime)
    humedad_suelo_pct = Column(Float)
    temperatura_suelo = Column(Float)
    bateria = Column(Float)

    parcela = relationship("Parcela", back_populates="logs_sensores")
    sensor = relationship("Sensor", back_populates="lecturas")
```

- [ ] **Step 4: Actualizar `LogSensorCreate` y `LogSensorResp` en `app/schemas.py`**

```python
class LogSensorCreate(BaseModel):
    parcela_id: int
    sensor_id: int
    fecha_hora: datetime
    humedad_suelo_pct: Optional[float] = Field(None, ge=0, le=100)
    temperatura_suelo: Optional[float] = None
    bateria: Optional[float] = Field(None, ge=0, le=100)
```

```python
class LogSensorResp(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    parcela_id: int
    sensor_id: Optional[int] = None
    fecha_hora: datetime
    humedad_suelo_pct: Optional[float] = None
    temperatura_suelo: Optional[float] = None
    bateria: Optional[float] = None
```

- [ ] **Step 5: Validar pertenencia del sensor en `app/routers/logs.py`**

Añadir `Sensor` al import de modelos (línea 8):

```python
from ..models import LogClima, LogSensor, Sensor, Usuario
```

Reemplazar `crear_log_sensor` (líneas 14-25):

```python
@router.post("/sensor/", response_model=LogSensorResp, status_code=201)
def crear_log_sensor(
    body: LogSensorCreate,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    get_parcela_del_usuario(body.parcela_id, current_user, db)

    sensor = db.query(Sensor).filter(Sensor.id == body.sensor_id).first()
    if sensor is None or sensor.parcela_id != body.parcela_id:
        raise HTTPException(
            status_code=422,
            detail="El sensor indicado no existe o no pertenece a esta parcela.",
        )

    log = LogSensor(**body.model_dump())
    db.add(log)
    db.commit()
    db.refresh(log)
    return log
```

Añadir `HTTPException` al import de fastapi (línea 3):

```python
from fastapi import APIRouter, Depends, HTTPException
```

- [ ] **Step 6: Ejecutar los tests y verificar que pasan**

Run: `pytest tests/test_logs_sensor.py -v`
Expected: 3 PASS.

- [ ] **Step 7: Ejecutar toda la suite**

Run: `pytest -v`
Expected: todos en PASS.

- [ ] **Step 8: Commit**

```bash
git add app/models.py app/schemas.py app/routers/logs.py tests/test_logs_sensor.py
git commit -m "feat: exigir sensor_id en la ingesta de log_sensores y quitar NPK/pH"
```

### Task 10: Endpoint de histórico por sensor individual

**Files:**
- Modify: `app/routers/sensores.py`
- Test: `tests/test_sensores_historico.py`

**Interfaces:**
- Consumes: `Sensor`, `LogSensor` (Tasks 7, 9).
- Produces: `GET /parcelas/{id}/sensores/{sensor_id}/historico` → `List[LogSensorResp]`.

- [ ] **Step 1: Escribir el test**

Create: `tests/test_sensores_historico.py`

```python
def test_historico_de_un_sensor(client, auth_headers, parcela_id):
    sensor = client.post(
        f"/parcelas/{parcela_id}/sensores", json={"etiqueta": "Nodo 1"}, headers=auth_headers
    ).json()
    otro_sensor = client.post(
        f"/parcelas/{parcela_id}/sensores", json={"etiqueta": "Nodo 2"}, headers=auth_headers
    ).json()

    for hora, humedad in [("08:00:00", 30.0), ("09:00:00", 31.0)]:
        client.post(
            "/logs/sensor/",
            json={
                "parcela_id": parcela_id,
                "sensor_id": sensor["id"],
                "fecha_hora": f"2026-08-17T{hora}",
                "humedad_suelo_pct": humedad,
            },
            headers=auth_headers,
        )
    client.post(
        "/logs/sensor/",
        json={
            "parcela_id": parcela_id,
            "sensor_id": otro_sensor["id"],
            "fecha_hora": "2026-08-17T08:30:00",
            "humedad_suelo_pct": 99.0,
        },
        headers=auth_headers,
    )

    resp = client.get(
        f"/parcelas/{parcela_id}/sensores/{sensor['id']}/historico", headers=auth_headers
    )
    assert resp.status_code == 200
    lecturas = resp.json()
    assert len(lecturas) == 2
    assert all(l["sensor_id"] == sensor["id"] for l in lecturas)
    assert lecturas[0]["humedad_suelo_pct"] == 30.0
    assert lecturas[1]["humedad_suelo_pct"] == 31.0
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pytest tests/test_sensores_historico.py -v`
Expected: FAIL (404, ruta inexistente).

- [ ] **Step 3: Añadir el endpoint a `app/routers/sensores.py`**

Añadir al import de modelos: `LogSensor`. Import de schemas: `LogSensorResp`. Añadir tipo `List`.

```python
from ..models import LogSensor, Sensor, Usuario
from ..schemas import LogSensorResp, SensorCreate, SensorResp
```

Nuevo endpoint:

```python
@router.get("/{sensor_id}/historico", response_model=List[LogSensorResp])
def historico_sensor(
    parcela_id: int,
    sensor_id: int,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    get_parcela_del_usuario(parcela_id, current_user, db)
    return (
        db.query(LogSensor)
        .filter(LogSensor.parcela_id == parcela_id, LogSensor.sensor_id == sensor_id)
        .order_by(LogSensor.fecha_hora.asc())
        .all()
    )
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `pytest tests/test_sensores_historico.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/routers/sensores.py tests/test_sensores_historico.py
git commit -m "feat: historico por sensor individual"
```

### Task 11: Servicio de estadísticas agregadas + endpoint de resumen

**Files:**
- Create: `app/services/sensor_stats.py`
- Modify: `app/schemas.py` (nueva `ResumenSensoresResp`)
- Modify: `app/routers/sensores.py`
- Test: `tests/test_sensor_stats.py`, `tests/test_sensores_resumen.py`

**Interfaces:**
- Produces: `calcular_resumen(lecturas: Iterable[LogSensor]) -> dict` con claves `n_sensores, n_lecturas, humedad_media, humedad_sd, temperatura_media, temperatura_sd`. La Task 13 (dashboard) y la Task 20 (`worker.py`) reutilizan esta misma función.
- Produces: `GET /parcelas/{id}/sensores/resumen?desde=&hasta=`.

- [ ] **Step 1: Escribir el test del servicio puro (sin DB)**

Create: `tests/test_sensor_stats.py`

```python
from app.models import LogSensor
from app.services.sensor_stats import calcular_resumen


def test_resumen_sin_lecturas():
    r = calcular_resumen([])
    assert r == {
        "n_sensores": 0,
        "n_lecturas": 0,
        "humedad_media": None,
        "humedad_sd": None,
        "temperatura_media": None,
        "temperatura_sd": None,
    }


def test_resumen_con_una_lectura_sd_es_none():
    lecturas = [LogSensor(sensor_id=1, humedad_suelo_pct=30.0, temperatura_suelo=18.0)]
    r = calcular_resumen(lecturas)
    assert r["n_sensores"] == 1
    assert r["n_lecturas"] == 1
    assert r["humedad_media"] == 30.0
    assert r["humedad_sd"] is None


def test_resumen_con_varios_sensores():
    lecturas = [
        LogSensor(sensor_id=1, humedad_suelo_pct=30.0, temperatura_suelo=18.0),
        LogSensor(sensor_id=2, humedad_suelo_pct=34.0, temperatura_suelo=20.0),
    ]
    r = calcular_resumen(lecturas)
    assert r["n_sensores"] == 2
    assert r["n_lecturas"] == 2
    assert r["humedad_media"] == 32.0
    assert round(r["humedad_sd"], 4) == round(2.8284271247461903, 4)
    assert r["temperatura_media"] == 19.0
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pytest tests/test_sensor_stats.py -v`
Expected: FAIL (`ModuleNotFoundError: app.services.sensor_stats`).

- [ ] **Step 3: Crear `app/services/sensor_stats.py`**

```python
import statistics
from typing import Iterable, Optional

from ..models import LogSensor


def _media(valores: list) -> Optional[float]:
    return sum(valores) / len(valores) if valores else None


def _desviacion(valores: list) -> Optional[float]:
    return statistics.stdev(valores) if len(valores) >= 2 else None


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
    }
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `pytest tests/test_sensor_stats.py -v`
Expected: 3 PASS.

- [ ] **Step 5: Escribir el test del endpoint HTTP (falla, no existe todavía)**

Create: `tests/test_sensores_resumen.py`

```python
def test_resumen_agrega_varios_sensores(client, auth_headers, parcela_id):
    s1 = client.post(f"/parcelas/{parcela_id}/sensores", json={"etiqueta": "Nodo 1"}, headers=auth_headers).json()
    s2 = client.post(f"/parcelas/{parcela_id}/sensores", json={"etiqueta": "Nodo 2"}, headers=auth_headers).json()

    for sensor, humedad in [(s1, 30.0), (s2, 34.0)]:
        client.post(
            "/logs/sensor/",
            json={
                "parcela_id": parcela_id,
                "sensor_id": sensor["id"],
                "fecha_hora": "2026-08-17T10:00:00",
                "humedad_suelo_pct": humedad,
                "temperatura_suelo": 19.0,
            },
            headers=auth_headers,
        )

    resp = client.get(
        f"/parcelas/{parcela_id}/sensores/resumen",
        params={"desde": "2026-08-17T00:00:00", "hasta": "2026-08-17T23:59:59"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["n_sensores"] == 2
    assert body["humedad_media"] == 32.0


def test_resumen_sin_lecturas_devuelve_nulos(client, auth_headers, parcela_id):
    resp = client.get(f"/parcelas/{parcela_id}/sensores/resumen", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["n_sensores"] == 0
    assert body["humedad_media"] is None
```

- [ ] **Step 6: Ejecutar y verificar que falla**

Run: `pytest tests/test_sensores_resumen.py -v`
Expected: FAIL (404).

- [ ] **Step 7: Añadir `ResumenSensoresResp` a `app/schemas.py`**

```python
class ResumenSensoresResp(BaseModel):
    parcela_id: int
    desde: datetime
    hasta: datetime
    n_sensores: int
    n_lecturas: int
    humedad_media: Optional[float] = None
    humedad_sd: Optional[float] = None
    temperatura_media: Optional[float] = None
    temperatura_sd: Optional[float] = None
```

- [ ] **Step 8: Añadir el endpoint de resumen a `app/routers/sensores.py`**

Añadir imports:

```python
from datetime import datetime, timedelta, timezone
from typing import Any, List, Optional

from ..schemas import LogSensorResp, ResumenSensoresResp, SensorCreate, SensorResp
from ..services.sensor_stats import calcular_resumen
```

Nuevo endpoint:

```python
@router.get("/resumen", response_model=ResumenSensoresResp)
def resumen_sensores(
    parcela_id: int,
    desde: Optional[datetime] = None,
    hasta: Optional[datetime] = None,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    get_parcela_del_usuario(parcela_id, current_user, db)

    if hasta is None:
        hasta = datetime.now(timezone.utc).replace(tzinfo=None)
    if desde is None:
        desde = hasta - timedelta(hours=24)

    lecturas = (
        db.query(LogSensor)
        .join(Sensor, LogSensor.sensor_id == Sensor.id)
        .filter(
            LogSensor.parcela_id == parcela_id,
            Sensor.activo.is_(True),
            LogSensor.fecha_hora >= desde,
            LogSensor.fecha_hora <= hasta,
        )
        .all()
    )
    resumen = calcular_resumen(lecturas)
    return ResumenSensoresResp(parcela_id=parcela_id, desde=desde, hasta=hasta, **resumen)
```

**Importante:** esta ruta (`/resumen`) debe registrarse ANTES que `/{sensor_id}/historico` en el archivo si FastAPI las evaluara como conflictivas — no lo son (prefijos distintos: `/resumen` vs `/{sensor_id}/historico`), así que el orden no importa aquí, pero mantener `/resumen` cerca de las demás rutas fijas por legibilidad.

- [ ] **Step 9: Ejecutar los tests y verificar que pasan**

Run: `pytest tests/test_sensores_resumen.py -v`
Expected: 2 PASS.

- [ ] **Step 10: Ejecutar toda la suite**

Run: `pytest -v`
Expected: todos en PASS.

- [ ] **Step 11: Commit**

```bash
git add app/services/sensor_stats.py app/schemas.py app/routers/sensores.py tests/test_sensor_stats.py tests/test_sensores_resumen.py
git commit -m "feat: servicio de estadisticas agregadas y endpoint de resumen de sensores"
```

### Task 12: Endpoint de exportación (CSV/XLSX)

**Files:**
- Modify: `app/routers/sensores.py`
- Test: `tests/test_sensores_exportar.py`

**Interfaces:**
- Consumes: `calcular_resumen` (Task 11).
- Produces: `GET /parcelas/{id}/sensores/exportar?formato=csv|xlsx&desde=&hasta=` → archivo descargable con las mismas columnas que `ResumenSensoresResp`.

- [ ] **Step 1: Escribir los tests**

Create: `tests/test_sensores_exportar.py`

```python
import csv
import io

import openpyxl


def test_exportar_csv(client, auth_headers, parcela_id):
    resp = client.get(
        f"/parcelas/{parcela_id}/sensores/exportar",
        params={"formato": "csv"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    filas = list(csv.reader(io.StringIO(resp.text)))
    assert filas[0] == [
        "parcela_id", "desde", "hasta", "n_sensores", "n_lecturas",
        "humedad_media", "humedad_sd", "temperatura_media", "temperatura_sd",
    ]
    assert len(filas) == 2


def test_exportar_xlsx(client, auth_headers, parcela_id):
    resp = client.get(
        f"/parcelas/{parcela_id}/sensores/exportar",
        params={"formato": "xlsx"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert "spreadsheet" in resp.headers["content-type"]
    wb = openpyxl.load_workbook(io.BytesIO(resp.content))
    filas = list(wb.active.iter_rows(values_only=True))
    assert filas[0][0] == "parcela_id"
    assert len(filas) == 2


def test_exportar_formato_invalido(client, auth_headers, parcela_id):
    resp = client.get(
        f"/parcelas/{parcela_id}/sensores/exportar",
        params={"formato": "pdf"},
        headers=auth_headers,
    )
    assert resp.status_code == 422
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `pytest tests/test_sensores_exportar.py -v`
Expected: FAIL (404).

- [ ] **Step 3: Añadir el endpoint a `app/routers/sensores.py`**

Añadir imports:

```python
import csv
import io

import openpyxl
from fastapi import HTTPException
from fastapi.responses import StreamingResponse
```

Nuevo endpoint (misma lógica de consulta que `resumen_sensores`, factorizada en un helper interno):

```python
def _obtener_resumen(parcela_id, desde, hasta, db) -> ResumenSensoresResp:
    if hasta is None:
        hasta = datetime.now(timezone.utc).replace(tzinfo=None)
    if desde is None:
        desde = hasta - timedelta(hours=24)

    lecturas = (
        db.query(LogSensor)
        .join(Sensor, LogSensor.sensor_id == Sensor.id)
        .filter(
            LogSensor.parcela_id == parcela_id,
            Sensor.activo.is_(True),
            LogSensor.fecha_hora >= desde,
            LogSensor.fecha_hora <= hasta,
        )
        .all()
    )
    resumen = calcular_resumen(lecturas)
    return ResumenSensoresResp(parcela_id=parcela_id, desde=desde, hasta=hasta, **resumen)


@router.get("/exportar")
def exportar_resumen_sensores(
    parcela_id: int,
    formato: str = "csv",
    desde: Optional[datetime] = None,
    hasta: Optional[datetime] = None,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    get_parcela_del_usuario(parcela_id, current_user, db)
    if formato not in ("csv", "xlsx"):
        raise HTTPException(status_code=422, detail="formato debe ser 'csv' o 'xlsx'")

    resumen = _obtener_resumen(parcela_id, desde, hasta, db)
    columnas = list(resumen.model_dump().keys())
    valores = [str(v) for v in resumen.model_dump().values()]

    if formato == "csv":
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(columnas)
        writer.writerow(valores)
        return StreamingResponse(
            iter([buffer.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=resumen_parcela_{parcela_id}.csv"},
        )

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(columnas)
    ws.append(valores)
    buffer_bin = io.BytesIO()
    wb.save(buffer_bin)
    buffer_bin.seek(0)
    return StreamingResponse(
        buffer_bin,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=resumen_parcela_{parcela_id}.xlsx"},
    )
```

Y simplificar `resumen_sensores` (Task 11) para reutilizar el helper:

```python
@router.get("/resumen", response_model=ResumenSensoresResp)
def resumen_sensores(
    parcela_id: int,
    desde: Optional[datetime] = None,
    hasta: Optional[datetime] = None,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    get_parcela_del_usuario(parcela_id, current_user, db)
    return _obtener_resumen(parcela_id, desde, hasta, db)
```

- [ ] **Step 4: Ejecutar los tests y verificar que pasan**

Run: `pytest tests/test_sensores_exportar.py -v`
Expected: 3 PASS.

- [ ] **Step 5: Ejecutar toda la suite**

Run: `pytest -v`
Expected: todos en PASS.

- [ ] **Step 6: Commit**

```bash
git add app/routers/sensores.py tests/test_sensores_exportar.py
git commit -m "feat: exportar resumen de sensores en CSV y XLSX"
```

### Task 13: Actualizar el dashboard de parcela con el resumen agregado

**Files:**
- Modify: `app/routers/parcelas.py`
- Modify: `app/schemas.py` (`DashboardCompleto`)
- Test: `tests/test_dashboard.py` (se amplía)

**Interfaces:**
- Consumes: `calcular_resumen` (Task 11).
- Produces: `DashboardCompleto.estado_suelo` pasa de `LogSensorResp` (última lectura de un único sensor) a `ResumenSensoresResp` (agregado de las últimas 24h).

- [ ] **Step 1: Ampliar el test del dashboard**

En `tests/test_dashboard.py`, añadir:

```python
def test_dashboard_usa_resumen_agregado_de_sensores(client, auth_headers, parcela_id):
    sensor = client.post(
        f"/parcelas/{parcela_id}/sensores", json={"etiqueta": "Nodo 1"}, headers=auth_headers
    ).json()
    from datetime import datetime, timezone
    ahora = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
    client.post(
        "/logs/sensor/",
        json={
            "parcela_id": parcela_id,
            "sensor_id": sensor["id"],
            "fecha_hora": ahora,
            "humedad_suelo_pct": 40.0,
        },
        headers=auth_headers,
    )

    resp = client.get(f"/parcelas/{parcela_id}/dashboard", headers=auth_headers)
    assert resp.status_code == 200
    estado = resp.json()["estado_suelo"]
    assert estado["n_sensores"] == 1
    assert estado["humedad_media"] == 40.0
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pytest tests/test_dashboard.py -v`
Expected: FAIL (`estado_suelo` sigue siendo el `LogSensorResp` de la última lectura, sin `n_sensores`).

- [ ] **Step 3: Cambiar el tipo de `estado_suelo` en `DashboardCompleto`**

```python
class DashboardCompleto(BaseModel):
    parcela: ParcelaResp
    estado_suelo: ResumenSensoresResp
    clima_actual: Optional[LogClimaResp] = None
```

- [ ] **Step 4: Actualizar `obtener_dashboard` en `app/routers/parcelas.py`**

Añadir imports:

```python
from datetime import date, datetime, timedelta, timezone

from ..models import ClimaDiarioHistorico, LogClima, LogSensor, Parcela, Sensor, Usuario
from ..schemas import (
    DashboardCompleto,
    HistoricoDiarioResp,
    LogSensorResp,
    ParcelaCreate,
    ParcelaResp,
    LogClimaResp,
    ResumenSensoresResp,
)
from ..services.sensor_stats import calcular_resumen
```

```python
@router.get("/parcelas/{parcela_id}/dashboard", response_model=DashboardCompleto)
def obtener_dashboard(
    parcela_id: int,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    parcela = get_parcela_del_usuario(parcela_id, current_user, db)

    hasta = datetime.now(timezone.utc).replace(tzinfo=None)
    desde = hasta - timedelta(hours=24)
    lecturas = (
        db.query(LogSensor)
        .join(Sensor, LogSensor.sensor_id == Sensor.id)
        .filter(
            LogSensor.parcela_id == parcela_id,
            Sensor.activo.is_(True),
            LogSensor.fecha_hora >= desde,
            LogSensor.fecha_hora <= hasta,
        )
        .all()
    )
    resumen_suelo = ResumenSensoresResp(
        parcela_id=parcela_id, desde=desde, hasta=hasta, **calcular_resumen(lecturas)
    )

    u_clima = db.query(LogClima).filter(LogClima.parcela_id == parcela_id).order_by(LogClima.fecha_hora.desc()).first()

    return {
        "parcela": parcela,
        "estado_suelo": resumen_suelo,
        "clima_actual": u_clima,
    }
```

- [ ] **Step 5: Ejecutar los tests y verificar que pasan**

Run: `pytest tests/test_dashboard.py -v`
Expected: todos PASS.

- [ ] **Step 6: Ejecutar toda la suite**

Run: `pytest -v`
Expected: todos en PASS.

- [ ] **Step 7: Commit**

```bash
git add app/routers/parcelas.py app/schemas.py tests/test_dashboard.py
git commit -m "feat: dashboard usa el resumen agregado de sensores en vez de un unico sensor"
```

---

## Fase 3 — Lectura foliar de terceros (Excel Dualex)

### Task 14: Modelo `LecturaFoliar` y schema

**Files:**
- Modify: `app/models.py`
- Modify: `app/schemas.py`
- Test: `tests/test_lectura_foliar_modelo.py`

**Interfaces:**
- Produces: modelo `LecturaFoliar(id, parcela_id, fecha, grupo, chl_medio, chl_sd, flav_medio, flav_sd, nbi_medio, nbi_sd, n_mediciones, archivo_origen)` y schema `LecturaFoliarResp`. Las Tasks 16-17 dependen de ambos.

- [ ] **Step 1: Escribir el test**

Create: `tests/test_lectura_foliar_modelo.py`

```python
from datetime import date

from app.database import Base
from app.models import LecturaFoliar


def test_lectura_foliar_tiene_los_campos_esperados(db_session, parcela_id):
    lectura = LecturaFoliar(
        parcela_id=parcela_id,
        fecha=date(2026, 7, 28),
        grupo=1,
        chl_medio=29584.0,
        chl_sd=1200.0,
        flav_medio=1271.0,
        flav_sd=120.0,
        nbi_medio=23.28,
        nbi_sd=2.1,
        n_mediciones=61,
        archivo_origen="Libro1.xlsx",
    )
    db_session.add(lectura)
    db_session.commit()
    db_session.refresh(lectura)
    assert lectura.id is not None
    assert lectura.grupo == 1
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pytest tests/test_lectura_foliar_modelo.py -v`
Expected: FAIL (`ImportError: cannot import name 'LecturaFoliar'`).

- [ ] **Step 3: Añadir el modelo a `app/models.py`**

Añadir la clase, y la relación en `Parcela`:

```python
class LecturaFoliar(Base):
    __tablename__ = "lecturas_foliares"
    id = Column(Integer, primary_key=True, index=True)
    parcela_id = Column(Integer, ForeignKey("parcelas.id"), nullable=False)
    fecha = Column(Date, nullable=False)
    grupo = Column(Integer, nullable=False)
    chl_medio = Column(Float)
    chl_sd = Column(Float)
    flav_medio = Column(Float)
    flav_sd = Column(Float)
    nbi_medio = Column(Float)
    nbi_sd = Column(Float)
    n_mediciones = Column(Integer)
    archivo_origen = Column(String)

    parcela = relationship("Parcela", back_populates="lecturas_foliares")
```

En `Parcela`, añadir junto a las demás relaciones:

```python
    lecturas_foliares = relationship("LecturaFoliar", back_populates="parcela")
```

- [ ] **Step 4: Añadir `LecturaFoliarResp` a `app/schemas.py`**

```python
class LecturaFoliarResp(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    parcela_id: int
    fecha: date
    grupo: int
    chl_medio: Optional[float] = None
    chl_sd: Optional[float] = None
    flav_medio: Optional[float] = None
    flav_sd: Optional[float] = None
    nbi_medio: Optional[float] = None
    nbi_sd: Optional[float] = None
    n_mediciones: Optional[int] = None
    archivo_origen: Optional[str] = None
```

- [ ] **Step 5: Ejecutar el test y verificar que pasa**

Run: `pytest tests/test_lectura_foliar_modelo.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/models.py app/schemas.py tests/test_lectura_foliar_modelo.py
git commit -m "feat: modelo LecturaFoliar para el sensor foliar de terceros"
```

### Task 15: Parser del Excel foliar (Dualex)

**Files:**
- Create: `app/services/foliar_parser.py`
- Test: `tests/test_foliar_parser.py`
- Test fixture: `tests/fixtures/Libro1.xlsx` (copia del archivo de ejemplo)

**Interfaces:**
- Produces: `parsear_excel_foliar(archivo) -> List[dict]` (claves `fecha, grupo, chl_medio, chl_sd, flav_medio, flav_sd, nbi_medio, nbi_sd, n_mediciones`) y la excepción `FormatoExcelInvalido`. La Task 16 depende de ambos.

- [ ] **Step 1: Copiar el Excel de ejemplo a la carpeta de fixtures**

Run:
```bash
mkdir -p tests/fixtures
cp Libro1.xlsx tests/fixtures/Libro1.xlsx
```

- [ ] **Step 2: Escribir el test**

Create: `tests/test_foliar_parser.py`

```python
from datetime import date

import pytest

from app.services.foliar_parser import FormatoExcelInvalido, parsear_excel_foliar


def test_parsea_los_ocho_grupos_del_ejemplo():
    resultados = parsear_excel_foliar("tests/fixtures/Libro1.xlsx")
    assert len(resultados) == 8
    grupos = sorted(r["grupo"] for r in resultados)
    assert grupos == [1, 2, 3, 4, 5, 6, 7, 8]


def test_primer_grupo_tiene_los_valores_esperados():
    resultados = parsear_excel_foliar("tests/fixtures/Libro1.xlsx")
    grupo_1 = next(r for r in resultados if r["grupo"] == 1)
    assert grupo_1["fecha"] == date(2026, 7, 28)
    assert grupo_1["n_mediciones"] == 61
    assert grupo_1["chl_medio"] is not None
    assert grupo_1["nbi_sd"] is not None


def test_archivo_con_formato_invalido_lanza_excepcion(tmp_path):
    import openpyxl

    ruta = tmp_path / "invalido.xlsx"
    wb = openpyxl.Workbook()
    wb.active.append(["columna_a", "columna_b"])
    wb.active.append([1, 2])
    wb.save(ruta)

    with pytest.raises(FormatoExcelInvalido):
        parsear_excel_foliar(str(ruta))
```

- [ ] **Step 3: Ejecutar y verificar que falla**

Run: `pytest tests/test_foliar_parser.py -v`
Expected: FAIL (`ModuleNotFoundError`).

- [ ] **Step 4: Crear `app/services/foliar_parser.py`**

```python
from datetime import date, datetime
from typing import BinaryIO, Dict, List, Union

import openpyxl


class FormatoExcelInvalido(Exception):
    """El archivo subido no tiene el formato esperado del sensor foliar Dualex."""


def _num(valor):
    if valor is None:
        return None
    try:
        return float(valor)
    except (TypeError, ValueError):
        return None


def parsear_excel_foliar(archivo: Union[str, BinaryIO]) -> List[Dict]:
    """
    Parsea el .xlsx que exporta el medidor foliar Dualex Dx4.5.
    El archivo intercala, por cada "grupo" (punto/planta muestreada), un
    bloque de lecturas crudas seguido de un bloque-resumen de 2 filas:
    ("#Grupo", "Chl", "Chl_sd", "Flav", "Flav_sd", "NBI", "NBI_sd", ...)
    seguido de la fila de valores agregados de ese grupo. Solo se guarda
    el resumen: el propio dispositivo ya calcula media y desviación.
    """
    try:
        wb = openpyxl.load_workbook(archivo, data_only=True)
        filas = list(wb.worksheets[0].iter_rows(values_only=True))
    except Exception as exc:
        raise FormatoExcelInvalido(f"No se pudo abrir el archivo: {exc}") from exc

    fecha_archivo = None
    conteo_por_grupo: Dict[int, int] = {}
    for fila in filas:
        if isinstance(fila[0], datetime):
            if fecha_archivo is None:
                fecha_archivo = fila[0].date()
            grupo_crudo = fila[7] if len(fila) > 7 else None
            if isinstance(grupo_crudo, int):
                conteo_por_grupo[grupo_crudo] = conteo_por_grupo.get(grupo_crudo, 0) + 1

    resultados: List[Dict] = []
    for i, fila in enumerate(filas):
        if fila[0] == "#Grupo" and len(fila) > 1 and fila[1] == "Chl":
            if i + 1 >= len(filas):
                continue
            valores = filas[i + 1]
            grupo = valores[0]
            if not isinstance(grupo, int):
                continue
            resultados.append({
                "grupo": grupo,
                "chl_medio": _num(valores[1]),
                "chl_sd": _num(valores[2]),
                "flav_medio": _num(valores[3]),
                "flav_sd": _num(valores[4]),
                "nbi_medio": _num(valores[5]),
                "nbi_sd": _num(valores[6]),
                "n_mediciones": conteo_por_grupo.get(grupo, 0),
            })

    if fecha_archivo is None or not resultados:
        raise FormatoExcelInvalido(
            "No se encontraron bloques de resumen '#Grupo' con el formato esperado."
        )

    for r in resultados:
        r["fecha"] = fecha_archivo

    return resultados
```

- [ ] **Step 5: Ejecutar los tests y verificar que pasan**

Run: `pytest tests/test_foliar_parser.py -v`
Expected: 3 PASS.

- [ ] **Step 6: Commit**

```bash
git add app/services/foliar_parser.py tests/test_foliar_parser.py tests/fixtures/Libro1.xlsx
git commit -m "feat: parser del Excel del sensor foliar Dualex"
```

### Task 16: Endpoint de subida del Excel foliar

**Files:**
- Create: `app/routers/foliar.py`
- Modify: `app/main.py`
- Test: `tests/test_foliar_upload.py`

**Interfaces:**
- Consumes: `parsear_excel_foliar`, `FormatoExcelInvalido` (Task 15), `LecturaFoliar` (Task 14).
- Produces: `POST /parcelas/{id}/foliar/upload` → `List[LecturaFoliarResp]`.

- [ ] **Step 1: Escribir los tests**

Create: `tests/test_foliar_upload.py`

```python
def test_subir_excel_foliar_guarda_los_grupos(client, auth_headers, parcela_id):
    with open("tests/fixtures/Libro1.xlsx", "rb") as f:
        resp = client.post(
            f"/parcelas/{parcela_id}/foliar/upload",
            files={"archivo": ("Libro1.xlsx", f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            headers=auth_headers,
        )
    assert resp.status_code == 201
    registros = resp.json()
    assert len(registros) == 8
    assert all(r["parcela_id"] == parcela_id for r in registros)
    assert all(r["archivo_origen"] == "Libro1.xlsx" for r in registros)


def test_subir_excel_con_formato_invalido_devuelve_422(client, auth_headers, parcela_id, tmp_path):
    import openpyxl

    ruta = tmp_path / "invalido.xlsx"
    wb = openpyxl.Workbook()
    wb.active.append(["a", "b"])
    wb.save(ruta)

    with open(ruta, "rb") as f:
        resp = client.post(
            f"/parcelas/{parcela_id}/foliar/upload",
            files={"archivo": ("invalido.xlsx", f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            headers=auth_headers,
        )
    assert resp.status_code == 422
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pytest tests/test_foliar_upload.py -v`
Expected: FAIL (404).

- [ ] **Step 3: Crear `app/routers/foliar.py`**

```python
import io
from typing import Any, List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, get_parcela_del_usuario
from ..models import LecturaFoliar, Usuario
from ..schemas import LecturaFoliarResp
from ..services.foliar_parser import FormatoExcelInvalido, parsear_excel_foliar

router = APIRouter(prefix="/parcelas/{parcela_id}/foliar", tags=["foliar"])


@router.post("/upload", response_model=List[LecturaFoliarResp], status_code=201)
def subir_excel_foliar(
    parcela_id: int,
    archivo: UploadFile = File(...),
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    get_parcela_del_usuario(parcela_id, current_user, db)

    contenido = io.BytesIO(archivo.file.read())
    try:
        bloques = parsear_excel_foliar(contenido)
    except FormatoExcelInvalido as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    registros = [
        LecturaFoliar(parcela_id=parcela_id, archivo_origen=archivo.filename, **bloque)
        for bloque in bloques
    ]
    db.add_all(registros)
    db.commit()
    for r in registros:
        db.refresh(r)
    return registros
```

- [ ] **Step 4: Registrar el router en `app/main.py`**

```python
from .routers import auth, parcelas, logs, actividades, clima_fetch, sensores, foliar
```

```python
app.include_router(foliar.router)
```

- [ ] **Step 5: Ejecutar los tests y verificar que pasan**

Run: `pytest tests/test_foliar_upload.py -v`
Expected: 2 PASS.

- [ ] **Step 6: Commit**

```bash
git add app/routers/foliar.py app/main.py tests/test_foliar_upload.py
git commit -m "feat: endpoint de subida del Excel del sensor foliar"
```

### Task 17: Endpoint de listado de lecturas foliares

**Files:**
- Modify: `app/routers/foliar.py`
- Test: `tests/test_foliar_listado.py`

**Interfaces:**
- Produces: `GET /parcelas/{id}/foliar/` → `List[LecturaFoliarResp]`, ordenado por fecha descendente y grupo ascendente.

- [ ] **Step 1: Escribir el test**

Create: `tests/test_foliar_listado.py`

```python
def test_listar_lecturas_foliares(client, auth_headers, parcela_id):
    with open("tests/fixtures/Libro1.xlsx", "rb") as f:
        client.post(
            f"/parcelas/{parcela_id}/foliar/upload",
            files={"archivo": ("Libro1.xlsx", f)},
            headers=auth_headers,
        )

    resp = client.get(f"/parcelas/{parcela_id}/foliar/", headers=auth_headers)
    assert resp.status_code == 200
    lista = resp.json()
    assert len(lista) == 8
    assert lista == sorted(lista, key=lambda r: (r["fecha"], r["grupo"]))[::-1] or True
```

Nota: como todos los grupos comparten la misma fecha en el ejemplo, la comprobación fuerte de orden es por `grupo` ascendente dentro de la misma fecha — se simplifica el test:

```python
def test_listar_lecturas_foliares(client, auth_headers, parcela_id):
    with open("tests/fixtures/Libro1.xlsx", "rb") as f:
        client.post(
            f"/parcelas/{parcela_id}/foliar/upload",
            files={"archivo": ("Libro1.xlsx", f)},
            headers=auth_headers,
        )

    resp = client.get(f"/parcelas/{parcela_id}/foliar/", headers=auth_headers)
    assert resp.status_code == 200
    lista = resp.json()
    assert len(lista) == 8
    assert [r["grupo"] for r in lista] == [1, 2, 3, 4, 5, 6, 7, 8]
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pytest tests/test_foliar_listado.py -v`
Expected: FAIL (404).

- [ ] **Step 3: Añadir el endpoint a `app/routers/foliar.py`**

```python
@router.get("/", response_model=List[LecturaFoliarResp])
def listar_lecturas_foliares(
    parcela_id: int,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    get_parcela_del_usuario(parcela_id, current_user, db)
    return (
        db.query(LecturaFoliar)
        .filter(LecturaFoliar.parcela_id == parcela_id)
        .order_by(LecturaFoliar.fecha.desc(), LecturaFoliar.grupo.asc())
        .all()
    )
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `pytest tests/test_foliar_listado.py -v`
Expected: PASS.

- [ ] **Step 5: Ejecutar toda la suite**

Run: `pytest -v`
Expected: todos en PASS.

- [ ] **Step 6: Commit**

```bash
git add app/routers/foliar.py tests/test_foliar_listado.py
git commit -m "feat: listado de lecturas foliares por parcela"
```

---

## Fase 4 — Clima automático

### Task 18: Servicio compartido de clima (DRY) y refactor del endpoint manual

**Files:**
- Modify: `app/services/weather.py`
- Modify: `app/routers/clima_fetch.py`
- Test: `tests/test_weather_fetch_guardar.py`

**Interfaces:**
- Produces: `fetch_y_guardar_clima(parcela: Parcela, db: Session) -> Optional[str]` (None si OK, mensaje de aviso si falla). La Task 19 (scheduler) reutiliza esta misma función.

- [ ] **Step 1: Escribir el test**

Create: `tests/test_weather_fetch_guardar.py`

```python
from unittest.mock import patch

from app.models import LogClima, Parcela
from app.services.weather import fetch_y_guardar_clima


def test_fetch_y_guardar_clima_sin_coordenadas(db_session):
    parcela = Parcela(usuario_id=1, nombre="Sin coords")
    db_session.add(parcela)
    db_session.commit()
    db_session.refresh(parcela)

    aviso = fetch_y_guardar_clima(parcela, db_session)
    assert aviso == "La parcela no tiene coordenadas."


def test_fetch_y_guardar_clima_ok(db_session):
    parcela = Parcela(usuario_id=1, nombre="Con coords", latitud=41.0, longitud=-3.0)
    db_session.add(parcela)
    db_session.commit()
    db_session.refresh(parcela)

    datos_falsos = {
        "temp_c": 22.0, "humedad_relativa_pct": 55.0, "presion_hpa": 1013.0,
        "viento_vel_ms": 2.1, "lluvia_mm": 0.0, "uv_index": 4.0, "et0": 3.2,
        "lluvia_prev_24h_mm": 0.0, "prob_lluvia_24h_pct": 10.0,
        "lluvia_prev_48h_mm": 0.0, "prob_lluvia_48h_pct": 5.0,
    }
    with patch("app.services.weather.get_provider") as mock_provider:
        mock_provider.return_value.fetch.return_value = datos_falsos
        aviso = fetch_y_guardar_clima(parcela, db_session)

    assert aviso is None
    log = db_session.query(LogClima).filter(LogClima.parcela_id == parcela.id).first()
    assert log is not None
    assert log.temp_c == 22.0
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pytest tests/test_weather_fetch_guardar.py -v`
Expected: FAIL (`ImportError: cannot import name 'fetch_y_guardar_clima'`).

- [ ] **Step 3: Añadir la función a `app/services/weather.py`**

Al final del archivo, tras `get_provider`:

```python
def fetch_y_guardar_clima(parcela, db) -> Optional[str]:
    """
    Descarga el clima actual del proveedor configurado y lo guarda en log_clima.
    Devuelve None si OK, o un mensaje de aviso si falla (no es error fatal).
    Compartida entre el endpoint manual (clima_fetch.py) y el scheduler automático.
    """
    from datetime import datetime, timezone
    from ..models import LogClima

    if parcela.latitud is None or parcela.longitud is None:
        return "La parcela no tiene coordenadas."

    provider = get_provider()
    try:
        datos = provider.fetch(parcela.latitud, parcela.longitud)
    except Exception as exc:
        return str(exc)

    ahora = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(LogClima(parcela_id=parcela.id, fecha_hora=ahora, **datos))
    db.commit()
    return None
```

- [ ] **Step 4: Ejecutar los tests y verificar que pasan**

Run: `pytest tests/test_weather_fetch_guardar.py -v`
Expected: 2 PASS.

- [ ] **Step 5: Refactorizar `app/routers/clima_fetch.py` para usar la función compartida**

```python
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, get_parcela_del_usuario
from ..models import LogClima, Usuario
from ..schemas import LogClimaResp
from ..services.weather import fetch_y_guardar_clima, get_provider

router = APIRouter(tags=["clima"])


@router.post(
    "/parcelas/{parcela_id}/actualizar-clima",
    response_model=LogClimaResp,
    status_code=201,
    summary="Obtiene el clima actual de Open-Meteo y lo guarda en log_clima",
)
def actualizar_clima(
    parcela_id: int,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    parcela = get_parcela_del_usuario(parcela_id, current_user, db)

    aviso = fetch_y_guardar_clima(parcela, db)
    if aviso:
        raise HTTPException(status_code=503, detail=f"Error al contactar el proveedor meteorológico: {aviso}")

    return db.query(LogClima).filter(LogClima.parcela_id == parcela_id).order_by(LogClima.fecha_hora.desc()).first()


@router.get(
    "/clima/ping",
    summary="Verifica la conectividad con el proveedor meteorológico configurado",
)
def ping_clima() -> dict:
    provider = get_provider()
    ok = provider.ping()
    return {
        "proveedor": type(provider).__name__,
        "conectado": ok,
        "estado": "OK" if ok else "ERROR — sin respuesta del proveedor",
    }
```

- [ ] **Step 6: Ejecutar toda la suite**

Run: `pytest -v`
Expected: todos en PASS.

- [ ] **Step 7: Commit**

```bash
git add app/services/weather.py app/routers/clima_fetch.py tests/test_weather_fetch_guardar.py
git commit -m "refactor: extraer fetch_y_guardar_clima como servicio compartido"
```

### Task 19: Scheduler automático de clima

**Files:**
- Create: `app/services/clima_scheduler.py`
- Modify: `app/main.py`
- Modify: `.env.example`
- Test: `tests/test_clima_scheduler.py`

**Interfaces:**
- Consumes: `fetch_y_guardar_clima` (Task 18).
- Produces: `refrescar_clima_todas_parcelas() -> None`, llamada cada `CLIMA_INTERVALO_HORAS` horas (default 3) por un `BackgroundScheduler` arrancado en el `lifespan` de `main.py`.

- [ ] **Step 1: Escribir el test**

Create: `tests/test_clima_scheduler.py`

```python
from unittest.mock import patch

from app.database import Base
from app.models import LogClima, Parcela
from app.services.clima_scheduler import refrescar_clima_todas_parcelas


def test_refresca_solo_parcelas_con_coordenadas(db_session, monkeypatch):
    con_coords = Parcela(usuario_id=1, nombre="Con coords", latitud=41.0, longitud=-3.0)
    sin_coords = Parcela(usuario_id=1, nombre="Sin coords")
    db_session.add_all([con_coords, sin_coords])
    db_session.commit()

    # El scheduler abre su propia sesión (SessionLocal) — para el test,
    # apuntamos SessionLocal al mismo engine en memoria que usa db_session.
    import app.services.clima_scheduler as mod
    monkeypatch.setattr(mod, "SessionLocal", lambda: db_session)

    datos_falsos = {
        "temp_c": 20.0, "humedad_relativa_pct": 50.0, "presion_hpa": None,
        "viento_vel_ms": None, "lluvia_mm": None, "uv_index": None, "et0": None,
        "lluvia_prev_24h_mm": None, "prob_lluvia_24h_pct": None,
        "lluvia_prev_48h_mm": None, "prob_lluvia_48h_pct": None,
    }
    with patch("app.services.weather.get_provider") as mock_provider:
        mock_provider.return_value.fetch.return_value = datos_falsos
        refrescar_clima_todas_parcelas()

    logs = db_session.query(LogClima).all()
    assert len(logs) == 1
    assert logs[0].parcela_id == con_coords.id
```

Nota: `db_session.close()` no debe ejecutarse dentro de `refrescar_clima_todas_parcelas` en este test porque `db_session` la sigue usando el propio test — como `SessionLocal` está parcheada para devolver la sesión ya abierta, el `finally: db.close()` de la función real cerraría la sesión de test. Para evitarlo, el `monkeypatch` envuelve la sesión en un objeto que ignora `close()`:

```python
class _SesionSinCierre:
    def __init__(self, sesion):
        self._sesion = sesion

    def __getattr__(self, nombre):
        return getattr(self._sesion, nombre)

    def close(self):
        pass  # el test sigue usando la sesión después
```

Y el `monkeypatch` pasa a ser:

```python
    monkeypatch.setattr(mod, "SessionLocal", lambda: _SesionSinCierre(db_session))
```

(Añadir la clase `_SesionSinCierre` al principio del archivo de test, antes de la función.)

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pytest tests/test_clima_scheduler.py -v`
Expected: FAIL (`ModuleNotFoundError: app.services.clima_scheduler`).

- [ ] **Step 3: Crear `app/services/clima_scheduler.py`**

```python
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
            aviso = fetch_y_guardar_clima(parcela, db)
            if aviso:
                logger.warning("No se pudo actualizar clima de parcela %s: %s", parcela.id, aviso)
    finally:
        db.close()
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `pytest tests/test_clima_scheduler.py -v`
Expected: PASS.

- [ ] **Step 5: Integrar el scheduler en `app/main.py`**

```python
import os
from contextlib import asynccontextmanager

from apscheduler.schedulers.background import BackgroundScheduler
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, engine
from .routers import auth, parcelas, logs, actividades, clima_fetch, sensores, foliar
from .services.clima_scheduler import refrescar_clima_todas_parcelas

load_dotenv()

scheduler = BackgroundScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    intervalo_horas = int(os.getenv("CLIMA_INTERVALO_HORAS", "3"))
    scheduler.add_job(
        refrescar_clima_todas_parcelas,
        "interval",
        hours=intervalo_horas,
        id="refrescar_clima",
        replace_existing=True,
    )
    scheduler.start()
    yield
    scheduler.shutdown()


app = FastAPI(title="Vinalert API", lifespan=lifespan)

_raw_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173")
origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(parcelas.router)
app.include_router(logs.router)
app.include_router(actividades.router)
app.include_router(clima_fetch.router)
app.include_router(sensores.router)
app.include_router(foliar.router)
```

- [ ] **Step 6: Documentar la variable de entorno nueva**

En `.env.example`, añadir:

```
CLIMA_INTERVALO_HORAS=3
```

- [ ] **Step 7: Ejecutar toda la suite**

Run: `pytest -v`
Expected: todos en PASS. (Recuerda: la fixture `client` de `tests/conftest.py` NO usa `with TestClient(app)`, así que el `lifespan` — y por tanto el scheduler real — nunca se dispara durante los tests.)

- [ ] **Step 8: Arrancar la app manualmente y confirmar que el scheduler no rompe el arranque**

Run: `uvicorn app.main:app --port 8000` (dejar unos segundos y parar con Ctrl+C)
Expected: arranca sin errores; en logs no aparece ninguna excepción de APScheduler.

- [ ] **Step 9: Commit**

```bash
git add app/services/clima_scheduler.py app/main.py .env.example tests/test_clima_scheduler.py
git commit -m "feat: scheduler automatico de clima cada N horas"
```

---

## Fase 5 — `worker.py`

### Task 20: Actualizar `worker.py` con el agregado de sensores de suelo

**Files:**
- Modify: `worker.py`
- Modify: `app/models.py` (columnas de `ClimaDiarioHistorico`)
- Create: `migracion_2026_08_17_historico.sql`
- Test: `tests/test_worker_consolidar.py`

**Interfaces:**
- Consumes: `calcular_resumen` (Task 11), `Sensor` (Task 7).
- Produces: `consolidar_datos_diarios(parcela_id, fecha)` ya no calcula NPK/pH; calcula `humedad_suelo_sd`, `temperatura_suelo_media`, `temperatura_suelo_sd` del array de sensores activos.

- [ ] **Step 1: Escribir el test**

Create: `tests/test_worker_consolidar.py`

```python
from datetime import date, datetime

from app.models import ClimaDiarioHistorico, LogSensor, Sensor


def test_consolidar_agrega_sensores_de_suelo(db_session, monkeypatch):
    import worker

    monkeypatch.setattr(worker, "SessionLocal", lambda: db_session)

    s1 = Sensor(parcela_id=1, etiqueta="Nodo 1", activo=True)
    s2 = Sensor(parcela_id=1, etiqueta="Nodo 2", activo=True)
    db_session.add_all([s1, s2])
    db_session.commit()

    db_session.add_all([
        LogSensor(parcela_id=1, sensor_id=s1.id, fecha_hora=datetime(2026, 8, 17, 8, 0), humedad_suelo_pct=30.0, temperatura_suelo=18.0),
        LogSensor(parcela_id=1, sensor_id=s2.id, fecha_hora=datetime(2026, 8, 17, 9, 0), humedad_suelo_pct=34.0, temperatura_suelo=20.0),
    ])
    db_session.commit()

    worker.consolidar_datos_diarios(1, date(2026, 8, 17))

    historico = db_session.query(ClimaDiarioHistorico).filter_by(parcela_id=1, fecha=date(2026, 8, 17)).first()
    assert historico is not None
    assert historico.humedad_inicial == 30.0
    assert historico.humedad_final == 34.0
    assert historico.temperatura_suelo_media == 19.0
    assert round(historico.humedad_suelo_sd, 4) == round(2.8284271247461903, 4)
```

Nota: igual que en la Task 19, `consolidar_datos_diarios` abre y cierra su propia sesión con `SessionLocal()` — como aquí el test SÍ necesita seguir leyendo con `db_session` después de llamar a la función, aplica el mismo patrón `_SesionSinCierre` de la Task 19 (definir la clase en este archivo también, o moverla a un helper compartido en `tests/conftest.py` — se opta por moverla a `conftest.py` para no duplicarla).

- [ ] **Step 2: Mover `_SesionSinCierre` a `tests/conftest.py`**

En `tests/conftest.py`, añadir (fuera de cualquier fixture, a nivel de módulo):

```python
class SesionSinCierre:
    """Envuelve una sesión de test para que `close()` no la invalide entre llamadas."""
    def __init__(self, sesion):
        self._sesion = sesion

    def __getattr__(self, nombre):
        return getattr(self._sesion, nombre)

    def close(self):
        pass
```

Y actualizar `tests/test_clima_scheduler.py` (Task 19) para importarla en vez de definirla localmente:

```python
from tests.conftest import SesionSinCierre
```

sustituyendo la clase `_SesionSinCierre` local por `SesionSinCierre` importada, y el monkeypatch por:

```python
    monkeypatch.setattr(mod, "SessionLocal", lambda: SesionSinCierre(db_session))
```

En `tests/test_worker_consolidar.py`, usar igual:

```python
from tests.conftest import SesionSinCierre

...
    monkeypatch.setattr(worker, "SessionLocal", lambda: SesionSinCierre(db_session))
```

- [ ] **Step 3: Ejecutar y verificar que falla**

Run: `pytest tests/test_worker_consolidar.py -v`
Expected: FAIL (`AttributeError: 'ClimaDiarioHistorico' object has no attribute 'temperatura_suelo_media'` o similar).

- [ ] **Step 4: Actualizar las columnas de `ClimaDiarioHistorico` en `app/models.py`**

Quitar `nitrogeno_max/min`, `fosforo_max/min`, `potasio_max/min`, `ph_max/min`. Añadir:

```python
    humedad_suelo_sd = Column(Float)
    temperatura_suelo_media = Column(Float)
    temperatura_suelo_sd = Column(Float)
```

La clase completa queda:

```python
class ClimaDiarioHistorico(Base):
    __tablename__ = "clima_diario_historico"
    id = Column(Integer, primary_key=True, index=True)
    parcela_id = Column(Integer, ForeignKey("parcelas.id"))
    fecha = Column(Date)
    temp_max = Column(Float)
    temp_min = Column(Float)
    temp_media = Column(Float)
    precipitacion_total_mm = Column(Float)
    et0_total_dia = Column(Float)
    humedad_relativa_media = Column(Float)
    humedad_max = Column(Float)
    humedad_min = Column(Float)
    radiacion_total_joules = Column(Float)
    humedad_inicial = Column(Float)
    humedad_final = Column(Float)
    humedad_suelo_sd = Column(Float)
    temperatura_suelo_media = Column(Float)
    temperatura_suelo_sd = Column(Float)

    parcela = relationship("Parcela", back_populates="clima_historico")
```

- [ ] **Step 5: Reescribir `worker.py`**

```python
from datetime import date, datetime, time, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import ClimaDiarioHistorico, LogClima, LogSensor, Sensor
from app.services.sensor_stats import calcular_resumen


def consolidar_datos_diarios(parcela_id: int, fecha: date):
    db: Session = SessionLocal()
    try:
        inicio_dia = datetime.combine(fecha, time.min)
        fin_dia = datetime.combine(fecha, time.max)

        # ── Clima del día ─────────────────────────────────────────────────────
        clima_stats = db.query(
            func.max(LogClima.temp_c).label("t_max"),
            func.min(LogClima.temp_c).label("t_min"),
            func.avg(LogClima.temp_c).label("t_media"),
            func.sum(LogClima.lluvia_mm).label("lluvia_total"),
            func.sum(LogClima.et0).label("et0_total"),
            func.avg(LogClima.humedad_relativa_pct).label("hr_media"),
            func.max(LogClima.humedad_relativa_pct).label("hr_max"),
            func.min(LogClima.humedad_relativa_pct).label("hr_min"),
        ).filter(
            LogClima.parcela_id == parcela_id,
            LogClima.fecha_hora >= inicio_dia,
            LogClima.fecha_hora <= fin_dia,
        ).first()

        # ── Sensores de suelo del día (agregado del array) ──────────────────────
        lecturas_dia = (
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
        resumen_suelo = calcular_resumen(lecturas_dia)

        h_inicial = db.query(LogSensor.humedad_suelo_pct).filter(
            LogSensor.parcela_id == parcela_id,
            LogSensor.fecha_hora >= inicio_dia,
            LogSensor.fecha_hora <= fin_dia,
        ).order_by(LogSensor.fecha_hora.asc()).first()

        h_final = db.query(LogSensor.humedad_suelo_pct).filter(
            LogSensor.parcela_id == parcela_id,
            LogSensor.fecha_hora >= inicio_dia,
            LogSensor.fecha_hora <= fin_dia,
        ).order_by(LogSensor.fecha_hora.desc()).first()

        def _f(val):
            return float(val) if val is not None else None

        valores = dict(
            temp_max=_f(clima_stats.t_max),
            temp_min=_f(clima_stats.t_min),
            temp_media=_f(clima_stats.t_media),
            precipitacion_total_mm=_f(clima_stats.lluvia_total),
            et0_total_dia=_f(clima_stats.et0_total),
            humedad_relativa_media=_f(clima_stats.hr_media),
            humedad_max=_f(clima_stats.hr_max),
            humedad_min=_f(clima_stats.hr_min),
            humedad_inicial=h_inicial[0] if h_inicial else None,
            humedad_final=h_final[0] if h_final else None,
            humedad_suelo_sd=_f(resumen_suelo["humedad_sd"]),
            temperatura_suelo_media=_f(resumen_suelo["temperatura_media"]),
            temperatura_suelo_sd=_f(resumen_suelo["temperatura_sd"]),
        )

        existing = db.query(ClimaDiarioHistorico).filter_by(parcela_id=parcela_id, fecha=fecha).first()
        if existing:
            for campo, val in valores.items():
                setattr(existing, campo, val)
        else:
            db.add(ClimaDiarioHistorico(parcela_id=parcela_id, fecha=fecha, **valores))

        db.commit()
        print(f"[HISTORICO] Consolidado {fecha} para Parcela {parcela_id}")

    except Exception as e:
        print(f"[ERROR] Error consolidando: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    hoy = date.today()
    ayer = hoy - timedelta(days=1)
    print("Arrancando consolidacion manual...")
    consolidar_datos_diarios(1, ayer)
    consolidar_datos_diarios(1, hoy)
```

- [ ] **Step 6: Ejecutar el test y verificar que pasa**

Run: `pytest tests/test_worker_consolidar.py -v`
Expected: PASS.

- [ ] **Step 7: Actualizar `HistoricoDiarioResp` en `app/schemas.py`**

Quitar `nitrogeno_max/min`, `fosforo_max/min`, `potasio_max/min`, `ph_max/min`. Añadir:

```python
class HistoricoDiarioResp(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    parcela_id: int
    fecha: date
    temp_max: Optional[float] = None
    temp_min: Optional[float] = None
    temp_media: Optional[float] = None
    precipitacion_total_mm: Optional[float] = None
    et0_total_dia: Optional[float] = None
    humedad_relativa_media: Optional[float] = None
    humedad_max: Optional[float] = None
    humedad_min: Optional[float] = None
    radiacion_total_joules: Optional[float] = None
    humedad_inicial: Optional[float] = None
    humedad_final: Optional[float] = None
    humedad_suelo_sd: Optional[float] = None
    temperatura_suelo_media: Optional[float] = None
    temperatura_suelo_sd: Optional[float] = None
```

- [ ] **Step 8: Crear la migración SQL para `clima_diario_historico`**

Create: `migracion_2026_08_17_historico.sql`

```sql
ALTER TABLE clima_diario_historico DROP COLUMN IF EXISTS nitrogeno_max;
ALTER TABLE clima_diario_historico DROP COLUMN IF EXISTS nitrogeno_min;
ALTER TABLE clima_diario_historico DROP COLUMN IF EXISTS fosforo_max;
ALTER TABLE clima_diario_historico DROP COLUMN IF EXISTS fosforo_min;
ALTER TABLE clima_diario_historico DROP COLUMN IF EXISTS potasio_max;
ALTER TABLE clima_diario_historico DROP COLUMN IF EXISTS potasio_min;
ALTER TABLE clima_diario_historico DROP COLUMN IF EXISTS ph_max;
ALTER TABLE clima_diario_historico DROP COLUMN IF EXISTS ph_min;

ALTER TABLE clima_diario_historico ADD COLUMN IF NOT EXISTS humedad_suelo_sd DOUBLE PRECISION;
ALTER TABLE clima_diario_historico ADD COLUMN IF NOT EXISTS temperatura_suelo_media DOUBLE PRECISION;
ALTER TABLE clima_diario_historico ADD COLUMN IF NOT EXISTS temperatura_suelo_sd DOUBLE PRECISION;
```

- [ ] **Step 9: Aplicar la migración**

Run: `PGPASSWORD=$PGPASSWORD "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -U postgres -d vinalert -f migracion_2026_08_17_historico.sql`
Expected: sin errores.

- [ ] **Step 10: Ejecutar toda la suite de tests**

Run: `pytest -v`
Expected: todos en PASS.

- [ ] **Step 11: Commit**

```bash
git add worker.py app/models.py app/schemas.py migracion_2026_08_17_historico.sql tests/test_worker_consolidar.py tests/conftest.py tests/test_clima_scheduler.py
git commit -m "feat: worker.py agrega humedad y temperatura de suelo del array de sensores"
```

---

## Verificación final

- [ ] **Step 1: Suite completa**

Run: `pytest -v`
Expected: todos los tests de las 20 tareas en PASS.

- [ ] **Step 2: Arranque real de la app contra Postgres**

Run: `uvicorn app.main:app --port 8000` (unos segundos, luego Ctrl+C)
Expected: arranca sin errores, sin excepciones de SQLAlchemy (columnas/tablas que no cuadren) ni de APScheduler.

- [ ] **Step 3: Repasar el listado de tablas de Postgres**

Run: `PGPASSWORD=$PGPASSWORD "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -U postgres -d vinalert -c "\dt public.*"`
Expected: aparecen `sensores`, `lecturas_foliares` (nuevas); no aparecen `logs_sensores_pro`, `logs_clima_api`, `riesgo_enfermedades`, `riesgos_enfermedad`, `recomendaciones_riego`, `etapas_cultivo`.

- [ ] **Step 4: Recordatorio de lo que queda fuera de este plan**

El frontend (`vinalert-front/`) no se ha tocado: `MildiuSection.jsx` y `RiegoSection.jsx` seguirán en el árbol mostrando datos vacíos/cero porque el backend ya no manda `ultima_recomendacion` ni `ultimo_riesgo`. Retirarlas y construir las pantallas nuevas (detalle por sensor + agregado, subida de Excel foliar) es trabajo de un plan de frontend aparte.

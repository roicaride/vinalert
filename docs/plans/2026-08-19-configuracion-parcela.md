# Configuración de parcela y sensores — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que toda la configuración de una parcela y de sus sensores se pueda hacer desde la aplicación, y que cada sensor tenga un número estable dentro de su parcela.

**Architecture:** `Sensor` gana un `numero` único por parcela —asignado siempre por el backend— más cuatro campos de configuración. Se añaden `GET` y `PATCH` de parcela, una acción idempotente de aprovisionamiento de sensores, y una sonda de solo lectura contra el proveedor meteorológico. Todo sigue el patrón ya establecido: la puerta `parcela_con_gestion` / `parcela_con_lectura` de `app/deps.py`, y registro obligatorio en la matriz de permisos.

**Tech Stack:** FastAPI 0.115, SQLAlchemy 2.0, PostgreSQL (prod) / SQLite en memoria (tests), Pydantic 2, pytest.

**Spec:** `docs/specs/2026-08-19-configuracion-parcela-design.md`

## Global Constraints

- El proyecto **no tiene Alembic**. Los cambios de esquema se aplican con SQL directo escrito a mano. **El implementador NUNCA ejecuta el SQL contra la base real**: lo escribe, lo valida, y el controlador pide confirmación al usuario.
- `Base.metadata.create_all(bind=engine)` solo crea tablas que faltan; nunca añade columnas a tablas existentes.
- **Quien no pertenece a una parcela recibe 404, nunca 403.** Un miembro de `lectura` que intenta escribir recibe **403, no 404**.
- Los valores de rol son exactamente `"gestor"`, `"lectura"`, `"admin"`, `"agricultor"`.
- **El número de un sensor lo asigna el backend, nunca el cliente.** Único por `(parcela_id, numero)`, empieza en 1, y desactivar un sensor no libera su número.
- **Todo endpoint nuevo con ámbito de parcela va a `tests/test_matriz_permisos.py`.** Hay una guarda estructural (`test_matriz_cubre_todos_los_endpoints_con_ambito_de_parcela`) que falla en rojo si se olvida.
- Rango de coordenadas: latitud en `[-90, 90]`, longitud en `[-180, 180]`, validado con `Field(ge=..., le=...)` de Pydantic, no a mano.
- Los schemas de respuesta llevan `model_config = ConfigDict(from_attributes=True)`.
- **La suite debe quedar verde al final de cada tarea.** `pytest` sin argumentos, sin `--ignore` y sin deselecciones. Un fallo de colección es un fallo.
- Este plan **no toca el frontend** (`vinalert-front/`) — es el sub-proyecto D.

## Nota sobre el `PATCH` y los valores nulos

El `PATCH` de sensor que ya existe usa `body.model_dump(exclude_unset=True, exclude_none=True)`: enviar un campo a `null` **no lo borra**, se ignora. El `PATCH` de parcela que añade este plan usa el mismo patrón, a propósito, por coherencia. Consecuencia deliberada: **no se puede vaciar un campo desde la API**. Para un formulario de configuración es el comportamiento más seguro, y evita tener dos semánticas distintas de `PATCH` en la misma aplicación.

---

## Task 1: `Sensor` con número y campos de configuración

**Files:**
- Modify: `app/models.py` (clase `Sensor`)
- Modify: `app/routers/sensores.py` (función `crear_sensor`)
- Modify: `tests/test_consolidacion.py`, `tests/test_consolidacion_scheduler.py`
- Test: `tests/test_sensor_numeracion.py` (crear)

**Interfaces:**
- Produces: `Sensor.numero` (Integer, NOT NULL, único por parcela), `Sensor.profundidad_cm`, `Sensor.latitud`, `Sensor.longitud`, `Sensor.modelo`. Las tareas 2, 3 y 6 los consumen.
- `crear_sensor` pasa a asignar el número automáticamente.

**Aviso:** hay **5 construcciones directas de `Sensor(...)` en los tests** que no pasan `numero`. Al hacer la columna NOT NULL fallarían. Migrarlas es parte de esta tarea (Step 5), y hay que hacerlo **sin tocar nada más** de esos ficheros.

- [ ] **Step 1: Escribir el test**

Create: `tests/test_sensor_numeracion.py`

```python
import pytest
from sqlalchemy.exc import IntegrityError

from app.models import Parcela, Sensor


def _parcela(db_session, nombre="P1"):
    p = Parcela(nombre=nombre)
    db_session.add(p)
    db_session.commit()
    db_session.refresh(p)
    return p


def test_el_primer_sensor_de_una_parcela_es_el_numero_1(client, auth_headers, parcela_id):
    resp = client.post(
        f"/parcelas/{parcela_id}/sensores/",
        json={"etiqueta": "Nodo A"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["numero"] == 1


def test_la_numeracion_es_consecutiva(client, auth_headers, parcela_id):
    numeros = []
    for i in range(3):
        resp = client.post(
            f"/parcelas/{parcela_id}/sensores/",
            json={"etiqueta": f"Nodo {i}"},
            headers=auth_headers,
        )
        numeros.append(resp.json()["numero"])
    assert numeros == [1, 2, 3]


def test_dos_parcelas_pueden_tener_ambas_un_sensor_numero_1(client, auth_headers, parcela_id):
    """El numero es unico DENTRO de la parcela, no globalmente."""
    otra = client.post("/parcelas/", json={"nombre": "Otra"}, headers=auth_headers).json()["id"]

    a = client.post(f"/parcelas/{parcela_id}/sensores/", json={"etiqueta": "A"}, headers=auth_headers)
    b = client.post(f"/parcelas/{otra}/sensores/", json={"etiqueta": "B"}, headers=auth_headers)

    assert a.json()["numero"] == 1
    assert b.json()["numero"] == 1


def test_desactivar_un_sensor_no_libera_su_numero(client, auth_headers, parcela_id):
    """
    Reutilizar el numero mezclaria bajo un mismo identificador las lecturas
    historicas del nodo viejo y las del nuevo.
    """
    primero = client.post(
        f"/parcelas/{parcela_id}/sensores/", json={"etiqueta": "A"}, headers=auth_headers
    ).json()
    client.patch(
        f"/parcelas/{parcela_id}/sensores/{primero['id']}",
        json={"activo": False},
        headers=auth_headers,
    )

    segundo = client.post(
        f"/parcelas/{parcela_id}/sensores/", json={"etiqueta": "B"}, headers=auth_headers
    ).json()
    assert segundo["numero"] == 2, "el numero del sensor desactivado se ha reutilizado"


def test_el_cliente_no_puede_fijar_el_numero(client, auth_headers, parcela_id):
    """SensorCreate no declara `numero`: enviarlo se ignora."""
    resp = client.post(
        f"/parcelas/{parcela_id}/sensores/",
        json={"etiqueta": "Listillo", "numero": 99},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["numero"] == 1


def test_la_restriccion_impide_dos_sensores_con_el_mismo_numero(db_session):
    p = _parcela(db_session)
    db_session.add(Sensor(parcela_id=p.id, numero=1, etiqueta="A", activo=True))
    db_session.commit()

    db_session.add(Sensor(parcela_id=p.id, numero=1, etiqueta="B", activo=True))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_los_campos_de_configuracion_se_guardan(db_session):
    p = _parcela(db_session)
    s = Sensor(
        parcela_id=p.id, numero=1, etiqueta="A", activo=True,
        profundidad_cm=30.0, latitud=42.31, longitud=-8.61, modelo="ACME-1000",
    )
    db_session.add(s)
    db_session.commit()
    db_session.refresh(s)

    assert s.profundidad_cm == 30.0
    assert s.latitud == 42.31
    assert s.longitud == -8.61
    assert s.modelo == "ACME-1000"
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pytest tests/test_sensor_numeracion.py -v`
Expected: FAIL — los tests que llaman al endpoint fallan con `KeyError: 'numero'`, y los que construyen `Sensor(numero=...)` con `TypeError: 'numero' is an invalid keyword argument`.

- [ ] **Step 3: Ampliar el modelo**

En `app/models.py`, sustituir la clase `Sensor` por:

```python
class Sensor(Base):
    __tablename__ = "sensores"
    __table_args__ = (
        UniqueConstraint("parcela_id", "numero", name="uq_sensor_parcela_numero"),
    )

    id = Column(Integer, primary_key=True, index=True)
    parcela_id = Column(Integer, ForeignKey("parcelas.id"), nullable=False)
    # Numero del nodo DENTRO de su parcela. Lo asigna siempre el backend, nunca
    # el cliente: la ingesta de campo identificara cada lectura por este numero,
    # asi que un duplicado o un hueco haria que se perdieran datos en silencio.
    numero = Column(Integer, nullable=False)
    etiqueta = Column(String, nullable=False)
    activo = Column(Boolean, default=True, nullable=False)
    profundidad_cm = Column(Float)
    latitud = Column(Float)
    longitud = Column(Float)
    modelo = Column(String)

    parcela = relationship("Parcela", back_populates="sensores")
    lecturas = relationship("LogSensor", back_populates="sensor")
```

`UniqueConstraint` y `Float` **ya están importados** en la primera línea de `app/models.py`. No toques los imports de ese fichero.

- [ ] **Step 4: Asignar el número al crear**

En `app/routers/sensores.py`, dentro de `crear_sensor`, sustituir la construcción del sensor por:

```python
    siguiente = (
        db.query(func.coalesce(func.max(Sensor.numero), 0))
        .filter(Sensor.parcela_id == parcela_id)
        .scalar()
    ) + 1
    sensor = Sensor(parcela_id=parcela_id, numero=siguiente, etiqueta=body.etiqueta, activo=True)
```

Añade `from sqlalchemy import func` a los imports de `app/routers/sensores.py`: es el único import que falta ahí. `List` y `Optional` ya están.

Añade `numero: int` a `SensorResp` en `app/schemas.py`, después de `parcela_id`.

- [ ] **Step 5: Migrar las 5 construcciones directas de los tests**

Estas cinco líneas construyen `Sensor(...)` sin `numero` y ahora fallarían. Añade el número que se indica y **no cambies nada más** de esos ficheros — ni aserciones, ni nombres, ni estructura:

- `tests/test_consolidacion.py:14` → `numero=1`
- `tests/test_consolidacion.py:15` → `numero=2`
- `tests/test_consolidacion.py:99` → `numero=3`
- `tests/test_consolidacion.py:182` → `numero=1`
- `tests/test_consolidacion_scheduler.py:24` → `numero=1`

En `test_consolidacion.py:99` el sensor es el tercero de esa parcela (hay dos creados antes en el mismo test), de ahí el 3. Si al ejecutar ves que la numeración no cuadra en algún caso, ajústala: lo que importa es que sea única dentro de su parcela.

- [ ] **Step 6: Ejecutar el test**

Run: `pytest tests/test_sensor_numeracion.py -v`
Expected: 7 PASS.

- [ ] **Step 7: Ejecutar toda la suite**

Run: `pytest`
Expected: todo en PASS (208 previos + 7 nuevos = 215).

- [ ] **Step 8: Commit**

```bash
git add app/models.py app/routers/sensores.py app/schemas.py tests/
git commit -m "feat: numeracion por parcela y campos de configuracion del sensor"
```

---

## Task 2: Aprovisionar sensores por cantidad

**Files:**
- Modify: `app/routers/sensores.py`, `app/schemas.py`
- Modify: `tests/test_matriz_permisos.py`
- Test: `tests/test_sensor_provisionar.py` (crear)

**Interfaces:**
- Consumes: `Sensor.numero` (Task 1).
- Produces: `POST /parcelas/{parcela_id}/sensores/provisionar`, cuerpo `{"cantidad": int}`, respuesta `List[SensorResp]`.

- [ ] **Step 1: Escribir el test**

Create: `tests/test_sensor_provisionar.py`

```python
def _provisionar(client, headers, parcela_id, cantidad):
    return client.post(
        f"/parcelas/{parcela_id}/sensores/provisionar",
        json={"cantidad": cantidad},
        headers=headers,
    )


def test_provisionar_crea_los_sensores_numerados(client, auth_headers, parcela_id):
    resp = _provisionar(client, auth_headers, parcela_id, 18)
    assert resp.status_code == 200

    sensores = resp.json()
    assert len(sensores) == 18
    assert [s["numero"] for s in sensores] == list(range(1, 19))


def test_provisionar_es_idempotente(client, auth_headers, parcela_id):
    """Repetir la misma cantidad no puede duplicar nada."""
    _provisionar(client, auth_headers, parcela_id, 18)
    resp = _provisionar(client, auth_headers, parcela_id, 18)

    assert resp.status_code == 200
    assert len(resp.json()) == 18


def test_ampliar_conserva_los_existentes_con_sus_datos(client, auth_headers, parcela_id):
    """
    La trampa importa: si el aprovisionamiento recreara los sensores en vez de
    completar los que faltan, la etiqueta editada se perderia y este test lo veria.
    """
    _provisionar(client, auth_headers, parcela_id, 3)
    sensores = client.get(f"/parcelas/{parcela_id}/sensores/", headers=auth_headers).json()
    segundo = next(s for s in sensores if s["numero"] == 2)
    client.patch(
        f"/parcelas/{parcela_id}/sensores/{segundo['id']}",
        json={"etiqueta": "Nodo bautizado"},
        headers=auth_headers,
    )

    resp = _provisionar(client, auth_headers, parcela_id, 6)

    assert len(resp.json()) == 6
    conservado = next(s for s in resp.json() if s["numero"] == 2)
    assert conservado["etiqueta"] == "Nodo bautizado"
    assert conservado["id"] == segundo["id"]


def test_una_cantidad_menor_no_borra_nada(client, auth_headers, parcela_id):
    """Reducir destruiria el historico de los sensores eliminados."""
    _provisionar(client, auth_headers, parcela_id, 5)

    resp = _provisionar(client, auth_headers, parcela_id, 2)

    assert resp.status_code == 200
    assert len(resp.json()) == 5


def test_se_puede_alternar_con_el_alta_de_uno_en_uno(client, auth_headers, parcela_id):
    _provisionar(client, auth_headers, parcela_id, 3)
    suelto = client.post(
        f"/parcelas/{parcela_id}/sensores/", json={"etiqueta": "Suelto"}, headers=auth_headers
    ).json()
    assert suelto["numero"] == 4

    resp = _provisionar(client, auth_headers, parcela_id, 6)
    assert [s["numero"] for s in resp.json()] == [1, 2, 3, 4, 5, 6]


def test_cantidad_fuera_de_rango_da_422(client, auth_headers, parcela_id):
    """El tope evita que un error de tecleo cree diez mil filas."""
    assert _provisionar(client, auth_headers, parcela_id, 0).status_code == 422
    assert _provisionar(client, auth_headers, parcela_id, 101).status_code == 422


def test_un_lector_no_puede_provisionar(client, auth_headers, parcela_id, db_session):
    from app.models import ParcelaUsuario, Usuario

    client.post(
        "/auth/register",
        json={"nombre": "L", "email": "lector@test.dev", "password": "clave12345"},
    )
    tok = client.post(
        "/auth/token", data={"username": "lector@test.dev", "password": "clave12345"}
    ).json()["access_token"]
    u = db_session.query(Usuario).filter_by(email="lector@test.dev").first()
    db_session.add(ParcelaUsuario(parcela_id=parcela_id, usuario_id=u.id, rol="lectura"))
    db_session.commit()

    resp = _provisionar(client, {"Authorization": f"Bearer {tok}"}, parcela_id, 5)
    assert resp.status_code == 403
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pytest tests/test_sensor_provisionar.py -v`
Expected: todos FAIL con 404 (la ruta no existe).

- [ ] **Step 3: Añadir el schema**

En `app/schemas.py`:

```python
class ProvisionarSensores(BaseModel):
    cantidad: int = Field(ge=1, le=100)
```

`Field` y `Optional` **ya están importados** en `app/schemas.py`. No toques sus imports.

- [ ] **Step 4: Añadir el endpoint**

En `app/routers/sensores.py`, tras `crear_sensor`, añadir:

(Nota: hoy no hay conflicto de rutas —el único otro `POST` del router es `/`—, pero colócalo antes de los endpoints con `{sensor_id}` de todas formas: si mañana alguien añade un `POST /{sensor_id}/algo`, el orden ya será el correcto.)

```python
@router.post("/provisionar", response_model=List[SensorResp])
def provisionar_sensores(
    parcela_id: int,
    body: ProvisionarSensores,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    """
    Crea las filas que falten hasta `cantidad`. Idempotente: repetir la misma
    cantidad no hace nada, y una cantidad menor NO borra sensores — reducir
    destruiria el historico de los eliminados. Para quitar uno se desactiva.
    """
    parcela_con_gestion(parcela_id, current_user, db)

    actual = (
        db.query(func.coalesce(func.max(Sensor.numero), 0))
        .filter(Sensor.parcela_id == parcela_id)
        .scalar()
    )
    for n in range(actual + 1, body.cantidad + 1):
        db.add(Sensor(parcela_id=parcela_id, numero=n, etiqueta=f"Nodo {n}", activo=True))
    db.commit()

    return (
        db.query(Sensor)
        .filter(Sensor.parcela_id == parcela_id)
        .order_by(Sensor.numero.asc())
        .all()
    )
```

Añade `ProvisionarSensores` al import de `..schemas`. `parcela_con_gestion` y `Sensor` ya están importados en ese fichero.

- [ ] **Step 5: Registrar en la matriz de permisos**

En `tests/test_matriz_permisos.py`, añadir a la lista `ENDPOINTS`:

```python
    ("POST", "/parcelas/{pid}/sensores/provisionar", True),
```

Y en la función `_cuerpo`, añadir antes del `return {}` final:

```python
    if plantilla.endswith("/sensores/provisionar"):
        return {"cantidad": 2}
```

- [ ] **Step 6: Ejecutar los tests**

Run: `pytest tests/test_sensor_provisionar.py tests/test_matriz_permisos.py -v`
Expected: todo PASS. Si la guarda estructural falla, es que el endpoint no quedó registrado en `ENDPOINTS`.

- [ ] **Step 7: Ejecutar toda la suite**

Run: `pytest`
Expected: todo en PASS.

- [ ] **Step 8: Commit**

```bash
git add app/routers/sensores.py app/schemas.py tests/
git commit -m "feat: aprovisionar sensores por cantidad, idempotente"
```

---

## Task 3: Configuración individual del sensor

**Files:**
- Modify: `app/schemas.py`
- Test: `tests/test_sensor_configuracion.py` (crear)

**Interfaces:**
- Consumes: las columnas de la Task 1.
- Produces: `SensorUpdate` acepta `profundidad_cm`, `latitud`, `longitud` y `modelo`. `SensorResp` los devuelve.

El endpoint `PATCH /parcelas/{id}/sensores/{sensor_id}` **no cambia**: ya hace `setattr` sobre los campos enviados, así que ampliar el schema basta. `numero` no se declara en `SensorUpdate`, y por eso enviarlo se ignora.

- [ ] **Step 1: Escribir el test**

Create: `tests/test_sensor_configuracion.py`

```python
def _crear(client, headers, parcela_id):
    return client.post(
        f"/parcelas/{parcela_id}/sensores/", json={"etiqueta": "A"}, headers=headers
    ).json()


def test_configurar_los_campos_nuevos(client, auth_headers, parcela_id):
    sensor = _crear(client, auth_headers, parcela_id)

    resp = client.patch(
        f"/parcelas/{parcela_id}/sensores/{sensor['id']}",
        json={"profundidad_cm": 40.0, "latitud": 42.31, "longitud": -8.61, "modelo": "ACME-1000"},
        headers=auth_headers,
    )

    assert resp.status_code == 200
    cuerpo = resp.json()
    assert cuerpo["profundidad_cm"] == 40.0
    assert cuerpo["latitud"] == 42.31
    assert cuerpo["longitud"] == -8.61
    assert cuerpo["modelo"] == "ACME-1000"


def test_solo_se_modifican_los_campos_enviados(client, auth_headers, parcela_id):
    """La trampa: sembrar todo y enviar uno solo, comprobando que el resto sigue."""
    sensor = _crear(client, auth_headers, parcela_id)
    client.patch(
        f"/parcelas/{parcela_id}/sensores/{sensor['id']}",
        json={"profundidad_cm": 40.0, "modelo": "ACME-1000"},
        headers=auth_headers,
    )

    resp = client.patch(
        f"/parcelas/{parcela_id}/sensores/{sensor['id']}",
        json={"etiqueta": "Renombrado"},
        headers=auth_headers,
    )

    cuerpo = resp.json()
    assert cuerpo["etiqueta"] == "Renombrado"
    assert cuerpo["profundidad_cm"] == 40.0, "un PATCH parcial ha borrado otro campo"
    assert cuerpo["modelo"] == "ACME-1000"


def test_el_numero_no_es_editable(client, auth_headers, parcela_id):
    sensor = _crear(client, auth_headers, parcela_id)

    resp = client.patch(
        f"/parcelas/{parcela_id}/sensores/{sensor['id']}",
        json={"numero": 99},
        headers=auth_headers,
    )

    assert resp.status_code == 200
    assert resp.json()["numero"] == sensor["numero"]


def test_coordenadas_del_sensor_fuera_de_rango_dan_422(client, auth_headers, parcela_id):
    sensor = _crear(client, auth_headers, parcela_id)

    for cuerpo in ({"latitud": 91.0}, {"latitud": -91.0}, {"longitud": 181.0}, {"longitud": -181.0}):
        resp = client.patch(
            f"/parcelas/{parcela_id}/sensores/{sensor['id']}", json=cuerpo, headers=auth_headers
        )
        assert resp.status_code == 422, f"{cuerpo} deberia ser rechazado"
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pytest tests/test_sensor_configuracion.py -v`
Expected: FAIL — los campos nuevos no existen en `SensorResp`, y las coordenadas fuera de rango se aceptan con 200.

- [ ] **Step 3: Ampliar los schemas**

En `app/schemas.py`, sustituir `SensorUpdate` y `SensorResp` por:

```python
class SensorUpdate(BaseModel):
    etiqueta: Optional[str] = None
    activo: Optional[bool] = None
    profundidad_cm: Optional[float] = None
    latitud: Optional[float] = Field(default=None, ge=-90, le=90)
    longitud: Optional[float] = Field(default=None, ge=-180, le=180)
    modelo: Optional[str] = None


class SensorResp(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    parcela_id: int
    numero: int
    etiqueta: str
    activo: bool
    profundidad_cm: Optional[float] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    modelo: Optional[str] = None
```

`numero` no aparece en `SensorUpdate`: ésa es la razón por la que enviarlo se ignora.

- [ ] **Step 4: Ejecutar el test**

Run: `pytest tests/test_sensor_configuracion.py -v`
Expected: 4 PASS.

- [ ] **Step 5: Ejecutar toda la suite**

Run: `pytest`
Expected: todo en PASS.

- [ ] **Step 6: Commit**

```bash
git add app/schemas.py tests/test_sensor_configuracion.py
git commit -m "feat: configuracion individual del sensor (profundidad, posicion, modelo)"
```

---

## Task 4: Consultar y editar una parcela

**Files:**
- Modify: `app/routers/parcelas.py`, `app/schemas.py`
- Modify: `tests/test_matriz_permisos.py`
- Test: `tests/test_parcela_edicion.py` (crear)

**Interfaces:**
- Produces: `GET /parcelas/{parcela_id}` (lectura) y `PATCH /parcelas/{parcela_id}` (gestión), más el schema `ParcelaUpdate`.

- [ ] **Step 1: Escribir el test**

Create: `tests/test_parcela_edicion.py`

```python
def test_consultar_una_parcela(client, auth_headers, parcela_id):
    resp = client.get(f"/parcelas/{parcela_id}", headers=auth_headers)

    assert resp.status_code == 200
    assert resp.json()["id"] == parcela_id
    assert resp.json()["nombre"] == "Parcela Test"


def test_editar_las_coordenadas(client, auth_headers, parcela_id):
    """El motivo de ser de esta tarea: hoy un error al crear era permanente."""
    resp = client.patch(
        f"/parcelas/{parcela_id}",
        json={"latitud": 42.31, "longitud": -8.61},
        headers=auth_headers,
    )

    assert resp.status_code == 200
    assert resp.json()["latitud"] == 42.31
    assert resp.json()["longitud"] == -8.61


def test_solo_se_modifican_los_campos_enviados(client, auth_headers, parcela_id):
    """Trampa: sembrar varios campos y enviar uno; el resto debe sobrevivir."""
    client.patch(
        f"/parcelas/{parcela_id}",
        json={"variedad": "Albarino", "kc_actual": 0.75, "tipo_cultivo": "Vinedo"},
        headers=auth_headers,
    )

    resp = client.patch(f"/parcelas/{parcela_id}", json={"nombre": "Renombrada"}, headers=auth_headers)

    cuerpo = resp.json()
    assert cuerpo["nombre"] == "Renombrada"
    assert cuerpo["variedad"] == "Albarino", "un PATCH parcial ha borrado otro campo"
    assert cuerpo["kc_actual"] == 0.75
    assert cuerpo["tipo_cultivo"] == "Vinedo"


def test_un_patch_vacio_no_es_un_error(client, auth_headers, parcela_id):
    """Un formulario que no cambia nada no deberia fallar."""
    resp = client.patch(f"/parcelas/{parcela_id}", json={}, headers=auth_headers)

    assert resp.status_code == 200
    assert resp.json()["nombre"] == "Parcela Test"


def test_coordenadas_fuera_de_rango_dan_422_al_editar(client, auth_headers, parcela_id):
    for cuerpo in ({"latitud": 91.0}, {"latitud": -91.0}, {"longitud": 181.0}, {"longitud": -181.0}):
        resp = client.patch(f"/parcelas/{parcela_id}", json=cuerpo, headers=auth_headers)
        assert resp.status_code == 422, f"{cuerpo} deberia ser rechazado"


def test_coordenadas_fuera_de_rango_dan_422_al_crear(client, auth_headers):
    resp = client.post(
        "/parcelas/", json={"nombre": "Mala", "latitud": 999.0}, headers=auth_headers
    )
    assert resp.status_code == 422


def test_un_lector_no_puede_editar(client, auth_headers, parcela_id, db_session):
    from app.models import ParcelaUsuario, Usuario

    client.post(
        "/auth/register",
        json={"nombre": "L", "email": "lector@test.dev", "password": "clave12345"},
    )
    tok = client.post(
        "/auth/token", data={"username": "lector@test.dev", "password": "clave12345"}
    ).json()["access_token"]
    u = db_session.query(Usuario).filter_by(email="lector@test.dev").first()
    db_session.add(ParcelaUsuario(parcela_id=parcela_id, usuario_id=u.id, rol="lectura"))
    db_session.commit()
    cabeceras = {"Authorization": f"Bearer {tok}"}

    assert client.get(f"/parcelas/{parcela_id}", headers=cabeceras).status_code == 200
    assert client.patch(f"/parcelas/{parcela_id}", json={"nombre": "X"}, headers=cabeceras).status_code == 403
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pytest tests/test_parcela_edicion.py -v`
Expected: FAIL con 405 o 404 (las rutas no existen), salvo el de crear con coordenadas malas, que falla porque hoy se aceptan.

- [ ] **Step 3: Añadir el schema y validar el rango al crear**

En `app/schemas.py`, en `ParcelaCreate`, sustituir las dos líneas de coordenadas por:

```python
    latitud: Optional[float] = Field(default=None, ge=-90, le=90)
    longitud: Optional[float] = Field(default=None, ge=-180, le=180)
```

Y añadir después de `ParcelaCreate`:

```python
class ParcelaUpdate(BaseModel):
    """Todos los campos opcionales: solo se modifica lo que se envia."""
    nombre: Optional[str] = None
    tipo_cultivo: Optional[str] = None
    variedad: Optional[str] = None
    superficie_total_m2: Optional[float] = None
    cobertura_cultivo_pct: Optional[float] = None
    profundidad_raices_cm: Optional[float] = None
    umbral_humedad_critico_pct: Optional[float] = None
    latitud: Optional[float] = Field(default=None, ge=-90, le=90)
    longitud: Optional[float] = Field(default=None, ge=-180, le=180)
    distancia_filas_m: Optional[float] = None
    distancia_plantas_m: Optional[float] = None
    caudal_gotero_lph: Optional[float] = None
    num_goteros_planta: Optional[int] = None
    eficiencia_riego_pct: Optional[float] = None
    kc_actual: Optional[float] = None
    porcentaje_cobertura_suelo: Optional[float] = None
    capacidad_campo_suelo: Optional[float] = None
```

- [ ] **Step 4: Añadir los endpoints**

En `app/routers/parcelas.py`, tras `crear_parcela`, añadir:

```python
@router.get("/parcelas/{parcela_id}", response_model=ParcelaResp)
def obtener_parcela(
    parcela_id: int,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    return parcela_con_lectura(parcela_id, current_user, db)


@router.patch("/parcelas/{parcela_id}", response_model=ParcelaResp)
def editar_parcela(
    parcela_id: int,
    body: ParcelaUpdate,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    parcela = parcela_con_gestion(parcela_id, current_user, db)

    # Mismo patron que el PATCH de sensor: enviar null no vacia un campo, se
    # ignora. Dos semanticas distintas de PATCH en la misma app serian peores.
    datos = body.model_dump(exclude_unset=True, exclude_none=True)
    for campo, valor in datos.items():
        setattr(parcela, campo, valor)

    db.commit()
    db.refresh(parcela)
    return parcela
```

Añade `parcela_con_gestion` al import de `..deps` de `app/routers/parcelas.py` (hoy solo trae `parcela_con_lectura`) y `ParcelaUpdate` al de `..schemas`.

- [ ] **Step 5: Registrar en la matriz de permisos**

En `tests/test_matriz_permisos.py`, añadir a `ENDPOINTS`:

```python
    ("GET", "/parcelas/{pid}", False),
    ("PATCH", "/parcelas/{pid}", True),
```

Y en `_cuerpo`, antes del `return {}` final:

```python
    if metodo == "PATCH" and plantilla == "/parcelas/{pid}":
        return {"nombre": "Editada por la matriz"}
```

- [ ] **Step 6: Ejecutar los tests**

Run: `pytest tests/test_parcela_edicion.py tests/test_matriz_permisos.py -v`
Expected: todo PASS.

- [ ] **Step 7: Ejecutar toda la suite**

Run: `pytest`
Expected: todo en PASS.

- [ ] **Step 8: Commit**

```bash
git add app/routers/parcelas.py app/schemas.py tests/
git commit -m "feat: consultar y editar una parcela"
```

---

## Task 5: Sonda de coordenadas contra el proveedor

**Files:**
- Modify: `app/routers/clima_fetch.py`, `app/schemas.py`
- Modify: `tests/test_matriz_permisos.py`
- Test: `tests/test_clima_comprobar.py` (crear)

**Interfaces:**
- Produces: `GET /parcelas/{parcela_id}/clima/comprobar` (gestión), respuesta `ComprobacionClimaResp`.

**Va en `clima_fetch.py` a propósito**: el fixture `sin_red` de la matriz ya simula `get_provider` en ese módulo, así que el endpoint queda cubierto sin tocar el fixture.

- [ ] **Step 1: Escribir el test**

Create: `tests/test_clima_comprobar.py`

```python
from unittest.mock import MagicMock, patch

from app.models import LogClima


def test_coordenadas_validas_dan_disponible(client, auth_headers, parcela_id):
    proveedor = MagicMock()
    proveedor.fetch.return_value = {"temp_c": 21.5}

    with patch("app.routers.clima_fetch.get_provider", return_value=proveedor):
        resp = client.get(f"/parcelas/{parcela_id}/clima/comprobar", headers=auth_headers)

    assert resp.status_code == 200
    assert resp.json()["disponible"] is True


def test_la_sonda_no_escribe_nada(client, auth_headers, parcela_id, db_session):
    """Es una comprobacion, no una lectura: no debe ensuciar log_clima."""
    proveedor = MagicMock()
    proveedor.fetch.return_value = {"temp_c": 21.5}

    with patch("app.routers.clima_fetch.get_provider", return_value=proveedor):
        client.get(f"/parcelas/{parcela_id}/clima/comprobar", headers=auth_headers)

    assert db_session.query(LogClima).filter_by(parcela_id=parcela_id).count() == 0


def test_proveedor_caido_da_200_con_disponible_false(client, auth_headers, parcela_id):
    """
    No es un 503: la pregunta "sirven estas coordenadas?" se ha respondido
    correctamente, y la respuesta es "ahora mismo no se puede saber".
    """
    proveedor = MagicMock()
    proveedor.fetch.side_effect = RuntimeError("sin respuesta del proveedor")

    with patch("app.routers.clima_fetch.get_provider", return_value=proveedor):
        resp = client.get(f"/parcelas/{parcela_id}/clima/comprobar", headers=auth_headers)

    assert resp.status_code == 200
    assert resp.json()["disponible"] is False
    assert resp.json()["motivo"]


def test_parcela_sin_coordenadas_da_422(client, auth_headers):
    creada = client.post("/parcelas/", json={"nombre": "Sin coords"}, headers=auth_headers).json()

    resp = client.get(f"/parcelas/{creada['id']}/clima/comprobar", headers=auth_headers)

    assert resp.status_code == 422


def test_un_lector_no_puede_sondear(client, auth_headers, parcela_id, db_session):
    """Gasta cuota de Open-Meteo, que es un recurso compartido y limitado."""
    from app.models import ParcelaUsuario, Usuario

    client.post(
        "/auth/register",
        json={"nombre": "L", "email": "lector@test.dev", "password": "clave12345"},
    )
    tok = client.post(
        "/auth/token", data={"username": "lector@test.dev", "password": "clave12345"}
    ).json()["access_token"]
    u = db_session.query(Usuario).filter_by(email="lector@test.dev").first()
    db_session.add(ParcelaUsuario(parcela_id=parcela_id, usuario_id=u.id, rol="lectura"))
    db_session.commit()

    resp = client.get(
        f"/parcelas/{parcela_id}/clima/comprobar",
        headers={"Authorization": f"Bearer {tok}"},
    )
    assert resp.status_code == 403
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pytest tests/test_clima_comprobar.py -v`
Expected: todos FAIL con 404 (la ruta no existe).

- [ ] **Step 3: Añadir el schema**

En `app/schemas.py`:

```python
class ComprobacionClimaResp(BaseModel):
    disponible: bool
    latitud: float
    longitud: float
    motivo: Optional[str] = None
```

- [ ] **Step 4: Añadir el endpoint**

En `app/routers/clima_fetch.py`:

```python
@router.get(
    "/parcelas/{parcela_id}/clima/comprobar",
    response_model=ComprobacionClimaResp,
    summary="Comprueba si el proveedor meteorologico devuelve datos para estas coordenadas",
)
def comprobar_clima(
    parcela_id: int,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    """
    Sonda de configuracion: NO escribe nada. Es de gestion y no de lectura
    porque cada llamada gasta cuota de Open-Meteo, que es compartida y limitada.
    """
    parcela = parcela_con_gestion(parcela_id, current_user, db)

    if parcela.latitud is None or parcela.longitud is None:
        raise HTTPException(
            status_code=422,
            detail="La parcela no tiene coordenadas. Editala antes de comprobarlas.",
        )

    try:
        datos = get_provider().fetch(parcela.latitud, parcela.longitud)
    except Exception as exc:
        return ComprobacionClimaResp(
            disponible=False,
            latitud=parcela.latitud,
            longitud=parcela.longitud,
            motivo=f"El proveedor no respondio: {exc}",
        )

    if not datos:
        return ComprobacionClimaResp(
            disponible=False,
            latitud=parcela.latitud,
            longitud=parcela.longitud,
            motivo="El proveedor respondio sin datos para esas coordenadas.",
        )

    return ComprobacionClimaResp(
        disponible=True, latitud=parcela.latitud, longitud=parcela.longitud
    )
```

`parcela_con_gestion` y `get_provider` **ya están importados** en `app/routers/clima_fetch.py`. Solo tienes que añadir `ComprobacionClimaResp` al import de `..schemas`.

- [ ] **Step 5: Registrar en la matriz de permisos**

En `tests/test_matriz_permisos.py`, añadir a `ENDPOINTS`:

```python
    ("GET", "/parcelas/{pid}/clima/comprobar", True),
```

Es un `GET` marcado como escritura: la columna dice si **requiere gestión**, no si modifica la base.

- [ ] **Step 6: Ejecutar los tests**

Run: `pytest tests/test_clima_comprobar.py tests/test_matriz_permisos.py -v`
Expected: todo PASS.

- [ ] **Step 7: Ejecutar toda la suite**

Run: `pytest`
Expected: todo en PASS.

- [ ] **Step 8: Commit**

```bash
git add app/routers/clima_fetch.py app/schemas.py tests/
git commit -m "feat: sonda de coordenadas contra el proveedor meteorologico"
```

---

## Task 6: Migración SQL

**Files:**
- Create: `migracion_2026_08_19_sensores.sql`

**Interfaces:**
- Consumes: el modelo `Sensor` de la Task 1.

- [ ] **Step 1: Escribir el script**

Create: `migracion_2026_08_19_sensores.sql`

```sql
-- ============================================================================
-- Migracion: numeracion y configuracion de sensores
-- Fecha: 2026-08-19
--
-- ORDEN DE EJECUCION OBLIGATORIO. Los cuatro bloques van en este orden:
--   1. Anade las columnas, con `numero` todavia NULLABLE.
--   2. Rellena `numero` en los sensores existentes.
--   3. Lo pone NOT NULL — falla si el bloque 2 dejo algun nulo.
--   4. Anade la restriccion de unicidad — falla si el bloque 2 dejo duplicados.
--
-- Que los bloques 3 y 4 fallen es DESEABLE: significa que algo no cuadra y hay
-- que mirarlo antes de seguir, no forzarlo.
--
-- Ejecutar ANTES de arrancar la app con este codigo: create_all() solo crea
-- tablas que faltan, nunca anade columnas a una tabla existente.
-- ============================================================================

-- 1. Columnas nuevas
ALTER TABLE sensores ADD COLUMN IF NOT EXISTS numero INTEGER;
ALTER TABLE sensores ADD COLUMN IF NOT EXISTS profundidad_cm DOUBLE PRECISION;
ALTER TABLE sensores ADD COLUMN IF NOT EXISTS latitud DOUBLE PRECISION;
ALTER TABLE sensores ADD COLUMN IF NOT EXISTS longitud DOUBLE PRECISION;
ALTER TABLE sensores ADD COLUMN IF NOT EXISTS modelo VARCHAR;

-- 2. Numerar los sensores existentes: por id ascendente dentro de cada parcela.
WITH numerados AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY parcela_id ORDER BY id) AS n
  FROM sensores
)
UPDATE sensores s SET numero = numerados.n
FROM numerados
WHERE s.id = numerados.id AND s.numero IS NULL;

-- VERIFICACION antes del bloque 3. Debe devolver 0 filas:
--   SELECT id, parcela_id FROM sensores WHERE numero IS NULL;

-- 3. Ya no admite nulos
ALTER TABLE sensores ALTER COLUMN numero SET NOT NULL;

-- 4. Unicidad dentro de la parcela. Sin IF NOT EXISTS: en Postgres, ADD
--    CONSTRAINT no lo admite, asi que re-ejecutar este bloque da error de
--    "ya existe", que es informativo y no destructivo.
ALTER TABLE sensores ADD CONSTRAINT uq_sensor_parcela_numero UNIQUE (parcela_id, numero);
```

**NO ejecutes este script contra ninguna base de datos.** El controlador lo aplica tras confirmación explícita del usuario.

- [ ] **Step 2: Comprobar el script contra el modelo**

Relee `app/models.py`, clase `Sensor`, y confirma columna a columna que los nombres y tipos del script coinciden: `numero` (Integer → INTEGER), `profundidad_cm`, `latitud`, `longitud` (Float → DOUBLE PRECISION), `modelo` (String → VARCHAR), y que el nombre de la restricción es exactamente `uq_sensor_parcela_numero`. Anota la comprobación en el informe.

- [ ] **Step 3: Ejecutar la suite como sanity check**

Run: `pytest`
Expected: todo en PASS. El script SQL no afecta a los tests, que corren sobre SQLite en memoria.

- [ ] **Step 4: Commit**

```bash
git add migracion_2026_08_19_sensores.sql
git commit -m "docs: migracion SQL de numeracion y configuracion de sensores"
```

---

## Verificación final

- [ ] `pytest` completo en verde, sin argumentos ni exclusiones.
- [ ] La guarda estructural de la matriz pasa: los 4 endpoints nuevos están registrados.
- [ ] `grep -n "numero" app/schemas.py` confirma que `numero` está en `SensorResp` y **no** en `SensorCreate` ni en `SensorUpdate`.
- [ ] La migración SQL queda escrita y **sin ejecutar**, pendiente de confirmación del usuario.

## Fuera de este plan

- Borrar parcelas y borrar sensores (ver el spec).
- El endpoint de lote del ESP y sus credenciales — dependen del contrato de numeración que fija este plan.
- El frontend (sub-proyecto D).

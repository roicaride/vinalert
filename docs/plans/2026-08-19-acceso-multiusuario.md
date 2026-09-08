# Acceso multiusuario por parcela — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una parcela pueda tener varios usuarios con dos niveles de acceso (`gestor` y `lectura`), y que exista una cuenta de admin capaz de entrar en cualquier parcela.

**Architecture:** Una tabla de asociación `parcela_usuarios` con clave primaria compuesta sustituye a `Parcela.usuario_id`. La función de autorización actual (`get_parcela_del_usuario`) se parte en dos —`parcela_con_lectura` y `parcela_con_gestion`— y toda la autorización sigue viviendo en `app/deps.py`. El admin se resuelve con el campo `Usuario.rol`, que ya existe, comprobado dentro de esas dos funciones.

**Tech Stack:** FastAPI 0.115, SQLAlchemy 2.0, PostgreSQL (prod) / SQLite en memoria (tests), Pydantic 2, pytest.

**Spec:** `docs/specs/2026-08-19-acceso-multiusuario-design.md`

## Global Constraints

- El proyecto **no tiene Alembic**. Los cambios de esquema se aplican con SQL directo, escrito a mano. **El implementador NUNCA ejecuta el SQL contra la base real**: lo escribe, lo valida, y el controlador pide confirmación al usuario.
- `Base.metadata.create_all(bind=engine)` en el `lifespan` de `main.py` solo crea tablas que faltan; nunca borra ni altera columnas existentes.
- Los schemas de respuesta llevan `model_config = ConfigDict(from_attributes=True)`.
- Los valores de rol son exactamente `"gestor"` y `"lectura"` (miembros de parcela) y `"admin"` / `"agricultor"` (campo `Usuario.rol`). Cualquier otra grafía es un fallo.
- **Quien no pertenece a una parcela recibe 404, nunca 403.** Un 403 confirmaría que la parcela existe.
- **Un miembro de `lectura` que intenta escribir recibe 403, no 404.** Ya sabe que la parcela existe porque la está viendo.
- El rol de admin **no se concede por ninguna vía de la API**. `UsuarioCreate` no acepta `rol` y no debe aceptarlo nunca.
- **La suite debe quedar verde al final de cada tarea.** `pytest` sin argumentos, sin `--ignore` y sin deselecciones. Un fallo de colección es un fallo.
- Este plan **no toca el frontend** (`vinalert-front/`) — es el sub-proyecto D.

## Orden y por qué

El orden es deliberado y **no debe alterarse**: `Parcela.usuario_id` se elimina en la ÚLTIMA tarea, cuando ya nadie lo usa. Las tareas 1-3 son puramente aditivas (la columna vieja sigue viva y poblada), la 4 traslada la autorización, la 5 añade los endpoints de compartir, y solo la 6 borra la columna y migra los tests que la nombran. Así la suite está verde entre todas las tareas, que es la red de seguridad del proceso.

---

## Task 1: Modelo `ParcelaUsuario`

**Files:**
- Modify: `app/models.py`
- Test: `tests/test_parcela_usuarios_modelo.py` (crear)

**Interfaces:**
- Produces: clase `ParcelaUsuario` con columnas `parcela_id`, `usuario_id`, `rol`; relaciones `Parcela.miembros` y `Usuario.parcelas_asociadas`. Las tareas 2, 3, 4 y 5 las consumen.
- **No toca** `Parcela.usuario_id` ni `Usuario.parcelas`: siguen vivas. Esta tarea es puramente aditiva.

- [ ] **Step 1: Escribir el test**

Create: `tests/test_parcela_usuarios_modelo.py`

```python
import pytest
from sqlalchemy.exc import IntegrityError

from app.models import Parcela, ParcelaUsuario, Usuario


def _usuario(db_session, email):
    u = Usuario(nombre="U", email=email, hashed_password="x")
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


def _parcela(db_session, nombre="P1"):
    p = Parcela(nombre=nombre)
    db_session.add(p)
    db_session.commit()
    db_session.refresh(p)
    return p


def test_asociar_usuario_a_parcela(db_session):
    u = _usuario(db_session, "a@test.dev")
    p = _parcela(db_session)

    db_session.add(ParcelaUsuario(parcela_id=p.id, usuario_id=u.id, rol="gestor"))
    db_session.commit()

    db_session.refresh(p)
    assert len(p.miembros) == 1
    assert p.miembros[0].rol == "gestor"
    assert p.miembros[0].usuario_id == u.id


def test_una_parcela_admite_varios_usuarios(db_session):
    u1 = _usuario(db_session, "a@test.dev")
    u2 = _usuario(db_session, "b@test.dev")
    p = _parcela(db_session)

    db_session.add_all([
        ParcelaUsuario(parcela_id=p.id, usuario_id=u1.id, rol="gestor"),
        ParcelaUsuario(parcela_id=p.id, usuario_id=u2.id, rol="lectura"),
    ])
    db_session.commit()

    db_session.refresh(p)
    assert {m.rol for m in p.miembros} == {"gestor", "lectura"}


def test_un_usuario_puede_estar_en_varias_parcelas(db_session):
    u = _usuario(db_session, "a@test.dev")
    p1 = _parcela(db_session, "P1")
    p2 = _parcela(db_session, "P2")

    db_session.add_all([
        ParcelaUsuario(parcela_id=p1.id, usuario_id=u.id, rol="gestor"),
        ParcelaUsuario(parcela_id=p2.id, usuario_id=u.id, rol="lectura"),
    ])
    db_session.commit()

    db_session.refresh(u)
    assert len(u.parcelas_asociadas) == 2


def test_la_clave_compuesta_impide_asociar_dos_veces_al_mismo_usuario(db_session):
    """Sin PK compuesta, el mismo usuario podria estar dos veces con roles
    distintos y la autorizacion dependeria de cual leyese primero."""
    u = _usuario(db_session, "a@test.dev")
    p = _parcela(db_session)

    db_session.add(ParcelaUsuario(parcela_id=p.id, usuario_id=u.id, rol="gestor"))
    db_session.commit()

    db_session.add(ParcelaUsuario(parcela_id=p.id, usuario_id=u.id, rol="lectura"))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pytest tests/test_parcela_usuarios_modelo.py -v`
Expected: FAIL con `ImportError: cannot import name 'ParcelaUsuario'`.

- [ ] **Step 3: Añadir el modelo**

En `app/models.py`, después de la clase `Parcela`, añadir:

```python
class ParcelaUsuario(Base):
    """
    Asociacion entre una parcela y un usuario, con su nivel de acceso.

    La clave primaria es compuesta (parcela_id, usuario_id) a proposito: sin
    ella el mismo usuario podria aparecer dos veces en la misma parcela con
    roles distintos, y que gane uno u otro dependeria del orden de lectura.
    """
    __tablename__ = "parcela_usuarios"

    parcela_id = Column(Integer, ForeignKey("parcelas.id"), primary_key=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), primary_key=True)
    rol = Column(String, nullable=False)

    parcela = relationship("Parcela", back_populates="miembros")
    usuario = relationship("Usuario", back_populates="parcelas_asociadas")
```

En la clase `Parcela`, junto a las demás relaciones, añadir:

```python
    miembros = relationship("ParcelaUsuario", back_populates="parcela", cascade="all, delete-orphan")
```

En la clase `Usuario`, junto a `parcelas`, añadir:

```python
    parcelas_asociadas = relationship("ParcelaUsuario", back_populates="usuario", cascade="all, delete-orphan")
```

No elimines `Parcela.usuario_id`, `Parcela.usuario` ni `Usuario.parcelas`. Se retiran en la Task 6.

- [ ] **Step 4: Ejecutar el test**

Run: `pytest tests/test_parcela_usuarios_modelo.py -v`
Expected: 4 PASS.

- [ ] **Step 5: Ejecutar toda la suite**

Run: `pytest`
Expected: todo en PASS (105 previos + 4 nuevos = 109).

- [ ] **Step 6: Commit**

```bash
git add app/models.py tests/test_parcela_usuarios_modelo.py
git commit -m "feat: modelo ParcelaUsuario con rol por parcela"
```

---

## Task 2: Dependencias de autorización

**Files:**
- Modify: `app/deps.py`
- Test: `tests/test_autorizacion.py` (crear)

**Interfaces:**
- Consumes: `ParcelaUsuario` de la Task 1.
- Produces: `parcela_con_lectura(parcela_id, current_user, db) -> Parcela` y `parcela_con_gestion(parcela_id, current_user, db) -> Parcela`. La Task 4 sustituye con ellas las 19 llamadas a `get_parcela_del_usuario`.
- **No elimina** `get_parcela_del_usuario`: sigue en uso hasta la Task 4. Las tres conviven.

- [ ] **Step 1: Escribir el test**

Create: `tests/test_autorizacion.py`

```python
import pytest
from fastapi import HTTPException

from app.deps import parcela_con_gestion, parcela_con_lectura
from app.models import Parcela, ParcelaUsuario, Usuario


def _usuario(db_session, email, rol="agricultor"):
    u = Usuario(nombre="U", email=email, hashed_password="x", rol=rol)
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


def _parcela_con(db_session, usuario, rol):
    p = Parcela(nombre="P1")
    db_session.add(p)
    db_session.commit()
    db_session.refresh(p)
    db_session.add(ParcelaUsuario(parcela_id=p.id, usuario_id=usuario.id, rol=rol))
    db_session.commit()
    return p


def test_gestor_pasa_ambas_puertas(db_session):
    u = _usuario(db_session, "g@test.dev")
    p = _parcela_con(db_session, u, "gestor")

    assert parcela_con_lectura(p.id, u, db_session).id == p.id
    assert parcela_con_gestion(p.id, u, db_session).id == p.id


def test_lectura_pasa_la_de_lectura(db_session):
    u = _usuario(db_session, "l@test.dev")
    p = _parcela_con(db_session, u, "lectura")

    assert parcela_con_lectura(p.id, u, db_session).id == p.id


def test_lectura_recibe_403_al_intentar_gestionar(db_session):
    """403 y no 404: ya sabe que la parcela existe porque la esta viendo."""
    u = _usuario(db_session, "l@test.dev")
    p = _parcela_con(db_session, u, "lectura")

    with pytest.raises(HTTPException) as exc:
        parcela_con_gestion(p.id, u, db_session)
    assert exc.value.status_code == 403


def test_usuario_ajeno_recibe_404_en_ambas(db_session):
    """404 y no 403: un 403 confirmaria que la parcela existe."""
    duenio = _usuario(db_session, "d@test.dev")
    ajeno = _usuario(db_session, "x@test.dev")
    p = _parcela_con(db_session, duenio, "gestor")

    for puerta in (parcela_con_lectura, parcela_con_gestion):
        with pytest.raises(HTTPException) as exc:
            puerta(p.id, ajeno, db_session)
        assert exc.value.status_code == 404, f"{puerta.__name__} no devolvio 404"


def test_parcela_inexistente_da_404(db_session):
    u = _usuario(db_session, "u@test.dev")
    with pytest.raises(HTTPException) as exc:
        parcela_con_lectura(9999, u, db_session)
    assert exc.value.status_code == 404


def test_admin_entra_en_parcelas_ajenas_sin_estar_asociado(db_session):
    duenio = _usuario(db_session, "d@test.dev")
    admin = _usuario(db_session, "admin@test.dev", rol="admin")
    p = _parcela_con(db_session, duenio, "gestor")

    assert parcela_con_lectura(p.id, admin, db_session).id == p.id
    assert parcela_con_gestion(p.id, admin, db_session).id == p.id


def test_admin_no_puede_inventarse_una_parcela(db_session):
    """Ser admin da acceso a todo lo que existe, no a lo que no existe."""
    admin = _usuario(db_session, "admin@test.dev", rol="admin")
    with pytest.raises(HTTPException) as exc:
        parcela_con_lectura(9999, admin, db_session)
    assert exc.value.status_code == 404


def test_el_registro_publico_no_puede_fijar_el_rol(client, db_session):
    """
    Guarda contra escalada de privilegios: si alguien anade `rol` a
    UsuarioCreate, este test debe fallar.
    """
    resp = client.post(
        "/auth/register",
        json={
            "nombre": "Listillo",
            "email": "listillo@test.dev",
            "password": "clave12345",
            "rol": "admin",
        },
    )
    assert resp.status_code == 201

    creado = db_session.query(Usuario).filter_by(email="listillo@test.dev").first()
    assert creado.rol == "agricultor", "el registro publico ha fijado un rol"
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pytest tests/test_autorizacion.py -v`
Expected: FAIL con `ImportError: cannot import name 'parcela_con_gestion'`.

- [ ] **Step 3: Implementar las dos puertas**

En `app/deps.py`, añadir tras `get_parcela_del_usuario` (que se deja intacta):

```python
ROL_ADMIN = "admin"
ROL_GESTOR = "gestor"


def _parcela_o_404(parcela_id: int, db: Session) -> Parcela:
    parcela = db.query(Parcela).filter(Parcela.id == parcela_id).first()
    if parcela is None:
        raise HTTPException(status_code=404, detail="Parcela no encontrada")
    return parcela


def _miembro(parcela_id: int, usuario_id: int, db: Session) -> Optional[ParcelaUsuario]:
    return db.query(ParcelaUsuario).filter(
        ParcelaUsuario.parcela_id == parcela_id,
        ParcelaUsuario.usuario_id == usuario_id,
    ).first()


def parcela_con_lectura(parcela_id: int, current_user: Usuario, db: Session) -> Parcela:
    """
    Devuelve la parcela si el usuario esta asociado con cualquier rol, o si es
    admin. 404 en cualquier otro caso: un 403 aqui confirmaria que la parcela
    existe a alguien que no tiene por que saberlo.
    """
    if current_user.rol == ROL_ADMIN:
        return _parcela_o_404(parcela_id, db)

    if _miembro(parcela_id, current_user.id, db) is None:
        raise HTTPException(status_code=404, detail="Parcela no encontrada")
    return _parcela_o_404(parcela_id, db)


def parcela_con_gestion(parcela_id: int, current_user: Usuario, db: Session) -> Parcela:
    """
    Devuelve la parcela si el usuario esta asociado como gestor, o si es admin.

    El ORDEN de las comprobaciones es parte del contrato: primero se determina
    si el usuario ve la parcela (miembro o admin) y solo entonces se distingue
    entre 403 y 404. Comprobar el rol antes que la pertenencia filtraria la
    existencia de parcelas ajenas por el codigo de estado.
    """
    if current_user.rol == ROL_ADMIN:
        return _parcela_o_404(parcela_id, db)

    miembro = _miembro(parcela_id, current_user.id, db)
    if miembro is None:
        raise HTTPException(status_code=404, detail="Parcela no encontrada")
    if miembro.rol != ROL_GESTOR:
        raise HTTPException(
            status_code=403,
            detail="Necesitas permiso de gestion sobre esta parcela",
        )
    return _parcela_o_404(parcela_id, db)
```

Añade `ParcelaUsuario` al import de modelos y `Optional` al de `typing` si no está.

- [ ] **Step 4: Ejecutar el test**

Run: `pytest tests/test_autorizacion.py -v`
Expected: 8 PASS.

- [ ] **Step 5: Ejecutar toda la suite**

Run: `pytest`
Expected: todo en PASS (109 + 8 = 117).

- [ ] **Step 6: Commit**

```bash
git add app/deps.py tests/test_autorizacion.py
git commit -m "feat: puertas de autorizacion por rol de parcela y admin global"
```

---

## Task 3: Alta y listado de parcelas por asociación

**Files:**
- Modify: `app/routers/parcelas.py:24-45`
- Test: `tests/test_parcelas_asociacion.py` (crear)

**Interfaces:**
- Consumes: `ParcelaUsuario` (Task 1).
- Produces: toda parcela creada a partir de aquí tiene una fila `gestor` para su creador. La Task 4 depende de ello: sin esta tarea, al cambiar la autorización todos los tests con la fixture `parcela_id` darían 404.
- `Parcela.usuario_id` **se sigue rellenando** al crear, para no romper nada. Se retira en la Task 6.

- [ ] **Step 1: Escribir el test**

Create: `tests/test_parcelas_asociacion.py`

```python
from app.models import ParcelaUsuario, Usuario


def _otro_usuario(client, email="otro@test.dev"):
    client.post("/auth/register", json={"nombre": "Otro", "email": email, "password": "clave12345"})
    resp = client.post("/auth/token", data={"username": email, "password": "clave12345"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def test_el_creador_queda_como_gestor(client, auth_headers, db_session):
    resp = client.post(
        "/parcelas/",
        json={"nombre": "Mia", "latitud": 41.0, "longitud": -3.0},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    parcela_id = resp.json()["id"]

    miembros = db_session.query(ParcelaUsuario).filter_by(parcela_id=parcela_id).all()
    assert len(miembros) == 1
    assert miembros[0].rol == "gestor"


def test_el_listado_solo_devuelve_las_parcelas_asociadas(client, auth_headers):
    client.post("/parcelas/", json={"nombre": "Mia"}, headers=auth_headers)
    otro = _otro_usuario(client)
    client.post("/parcelas/", json={"nombre": "Del otro"}, headers=otro)

    mias = client.get("/parcelas/", headers=auth_headers).json()
    assert [p["nombre"] for p in mias] == ["Mia"]

    del_otro = client.get("/parcelas/", headers=otro).json()
    assert [p["nombre"] for p in del_otro] == ["Del otro"]


def test_el_listado_incluye_las_parcelas_donde_solo_tengo_lectura(client, auth_headers, db_session):
    """Sin esto, un invitado no veria la parcela compartida en su lista."""
    otro = _otro_usuario(client)
    creada = client.post("/parcelas/", json={"nombre": "Compartida"}, headers=otro).json()

    yo = db_session.query(Usuario).filter_by(email="test@vinalert.dev").first()
    db_session.add(ParcelaUsuario(parcela_id=creada["id"], usuario_id=yo.id, rol="lectura"))
    db_session.commit()

    mias = client.get("/parcelas/", headers=auth_headers).json()
    assert [p["nombre"] for p in mias] == ["Compartida"]


def test_el_admin_ve_todas_las_parcelas(client, auth_headers, db_session):
    client.post("/parcelas/", json={"nombre": "Mia"}, headers=auth_headers)
    otro = _otro_usuario(client)
    client.post("/parcelas/", json={"nombre": "Del otro"}, headers=otro)

    admin_headers = _otro_usuario(client, email="admin@test.dev")
    admin = db_session.query(Usuario).filter_by(email="admin@test.dev").first()
    admin.rol = "admin"
    db_session.commit()

    todas = client.get("/parcelas/", headers=admin_headers).json()
    assert {p["nombre"] for p in todas} == {"Mia", "Del otro"}
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pytest tests/test_parcelas_asociacion.py -v`
Expected: `test_el_creador_queda_como_gestor` FAIL (0 miembros), `test_el_listado_incluye_las_parcelas_donde_solo_tengo_lectura` FAIL (lista vacía), `test_el_admin_ve_todas_las_parcelas` FAIL.

- [ ] **Step 3: Implementar**

En `app/routers/parcelas.py`, sustituir `listar_parcelas` y `crear_parcela` por:

```python
@router.get("/parcelas/", response_model=List[ParcelaResp])
def listar_parcelas(
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    if current_user.rol == ROL_ADMIN:
        # Sin esto el admin tendria acceso a todas las parcelas pero ninguna
        # forma de llegar a ellas desde la aplicacion.
        return db.query(Parcela).all()

    return (
        db.query(Parcela)
        .join(ParcelaUsuario, ParcelaUsuario.parcela_id == Parcela.id)
        .filter(ParcelaUsuario.usuario_id == current_user.id)
        .all()
    )


@router.post("/parcelas/", response_model=ParcelaResp, status_code=201)
def crear_parcela(
    body: ParcelaCreate,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    parcela = Parcela(**body.model_dump(), usuario_id=current_user.id)
    try:
        db.add(parcela)
        db.flush()
        # En la misma transaccion: una parcela sin ningun gestor seria
        # inadministrable, y nadie podria recuperarla.
        db.add(ParcelaUsuario(
            parcela_id=parcela.id,
            usuario_id=current_user.id,
            rol=ROL_GESTOR,
        ))
        db.commit()
        db.refresh(parcela)
        return parcela
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"No se pudo crear la parcela: {e}")
```

Añade a los imports de `app/routers/parcelas.py`: `ParcelaUsuario` desde `..models` y `ROL_ADMIN`, `ROL_GESTOR` desde `..deps`. Conserva el resto del `except` tal y como esté en el fichero si difiere del mostrado.

- [ ] **Step 4: Ejecutar el test**

Run: `pytest tests/test_parcelas_asociacion.py -v`
Expected: 4 PASS.

- [ ] **Step 5: Ejecutar toda la suite**

Run: `pytest`
Expected: todo en PASS (117 + 4 = 121).

- [ ] **Step 6: Commit**

```bash
git add app/routers/parcelas.py tests/test_parcelas_asociacion.py
git commit -m "feat: el creador de una parcela queda como gestor y el listado usa la asociacion"
```

---

## Task 4: Trasladar los 19 puntos de autorización

**Files:**
- Modify: `app/routers/parcelas.py` (4 llamadas), `app/routers/sensores.py` (6), `app/routers/logs.py` (2), `app/routers/clima_fetch.py` (2), `app/routers/foliar.py` (2), `app/routers/tratamientos.py` (3)
- Modify: `app/deps.py` (eliminar `get_parcela_del_usuario`)
- Test: `tests/test_matriz_permisos.py` (crear)

**Interfaces:**
- Consumes: `parcela_con_lectura` y `parcela_con_gestion` (Task 2); la asociación del creador (Task 3).
- Produces: `get_parcela_del_usuario` deja de existir. Ningún fichero debe seguir nombrándola.

**Ésta es la tarea de mayor riesgo del plan.** Clasificar como lectura algo que escribe no rompe ningún test evidente: simplemente deja que un invitado modifique datos ajenos. La tabla siguiente es la clasificación **exacta y obligatoria**; no la deduzcas de nuevo.

| Fichero | Línea aprox. | Endpoint | Puerta |
|---|---|---|---|
| `parcelas.py` | 55 | `GET /parcelas/{id}/dashboard` | `parcela_con_lectura` |
| `parcelas.py` | 76 | `GET /parcelas/{id}/historico` | `parcela_con_lectura` |
| `parcelas.py` | 93 | `GET /parcelas/{id}/clima/diario` | `parcela_con_lectura` |
| `parcelas.py` | 109 | `GET /parcelas/{id}/suelo/diario` | `parcela_con_lectura` |
| `sensores.py` | 27 | `POST` crear sensor | `parcela_con_gestion` |
| `sensores.py` | 43 | `PATCH /{sensor_id}` | `parcela_con_gestion` |
| `sensores.py` | 63 | `GET` listar sensores | `parcela_con_lectura` |
| `sensores.py` | 96 | `GET /resumen` | `parcela_con_lectura` |
| `sensores.py` | 109 | `GET /exportar` | `parcela_con_lectura` |
| `sensores.py` | 150 | `GET /{sensor_id}/historico` | `parcela_con_lectura` |
| `logs.py` | 20 | `POST /logs/sensor/` | `parcela_con_gestion` |
| `logs.py` | 42 | `POST /logs/clima/` | `parcela_con_gestion` |
| `clima_fetch.py` | 42 | `POST` actualizar clima | `parcela_con_gestion` |
| `clima_fetch.py` | 82 | `POST` backfill | `parcela_con_gestion` |
| `foliar.py` | 23 | `POST /upload` | `parcela_con_gestion` |
| `foliar.py` | 48 | `GET` listar foliares | `parcela_con_lectura` |
| `tratamientos.py` | 21 | `POST /tratamientos/` | `parcela_con_gestion` |
| `tratamientos.py` | 52 | `GET /parcelas/{id}/tratamientos` | `parcela_con_lectura` |
| `tratamientos.py` | 69 | `DELETE /tratamientos/{id}` | `parcela_con_gestion` |

`GET /clima/ping` (`clima_fetch.py:57`) NO lleva puerta: no tiene ámbito de parcela. Déjalo como está.

- [ ] **Step 1: Escribir la matriz**

Create: `tests/test_matriz_permisos.py`

```python
import pytest

from app.models import ParcelaUsuario, Usuario

# La matriz es EXPLICITA a proposito, no derivada de las rutas de FastAPI:
# asi, anadir un endpoint nuevo sin anadirlo aqui se ve en la revision. Un
# test que se auto-descubre no protege de lo que no conoce.
# (metodo, plantilla_de_ruta, escribe)
ENDPOINTS = [
    ("GET", "/parcelas/{pid}/dashboard", False),
    ("GET", "/parcelas/{pid}/historico", False),
    ("GET", "/parcelas/{pid}/clima/diario", False),
    ("GET", "/parcelas/{pid}/suelo/diario", False),
    ("GET", "/parcelas/{pid}/sensores/", False),
    ("GET", "/parcelas/{pid}/sensores/resumen", False),
    ("GET", "/parcelas/{pid}/sensores/exportar", False),
    ("GET", "/parcelas/{pid}/foliar/", False),
    ("GET", "/parcelas/{pid}/tratamientos", False),
    ("POST", "/parcelas/{pid}/sensores/", True),
    ("POST", "/parcelas/{pid}/actualizar-clima", True),
    ("POST", "/parcelas/{pid}/clima/backfill", True),
]


@pytest.fixture(autouse=True)
def sin_red(monkeypatch):
    """
    Dos endpoints de la matriz salen a Open-Meteo de verdad. La autorizacion
    ocurre antes de la llamada, asi que los casos de 403/404 nunca la
    alcanzarian, pero los de gestor y admin si. La suite debe ser hermetica.
    """
    from unittest.mock import MagicMock

    import app.routers.clima_fetch as cf

    proveedor = MagicMock()
    proveedor.fetch.return_value = {"temp_c": 20.0}
    proveedor.fetch_archivo.return_value = []
    monkeypatch.setattr(cf, "get_provider", lambda: proveedor)
    monkeypatch.setattr(
        cf, "fetch_y_guardar_clima", lambda parcela, db: None, raising=False
    )
    return proveedor


def _registrar(client, email):
    client.post("/auth/register", json={"nombre": email, "email": email, "password": "clave12345"})
    resp = client.post("/auth/token", data={"username": email, "password": "clave12345"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def _cuerpo(metodo, ruta):
    if metodo == "POST" and "/sensores/" in ruta:
        return {"etiqueta": "Nodo nuevo"}
    if ruta.endswith("/clima/backfill"):
        return {"anios": 1}
    return {}


@pytest.fixture()
def escenario(client, auth_headers, db_session):
    """Una parcela del usuario de prueba, mas un lector, un ajeno y un admin."""
    pid = client.post(
        "/parcelas/", json={"nombre": "P", "latitud": 41.0, "longitud": -3.0},
        headers=auth_headers,
    ).json()["id"]

    lector = _registrar(client, "lector@test.dev")
    ajeno = _registrar(client, "ajeno@test.dev")
    admin = _registrar(client, "admin@test.dev")

    u_lector = db_session.query(Usuario).filter_by(email="lector@test.dev").first()
    db_session.add(ParcelaUsuario(parcela_id=pid, usuario_id=u_lector.id, rol="lectura"))
    u_admin = db_session.query(Usuario).filter_by(email="admin@test.dev").first()
    u_admin.rol = "admin"
    db_session.commit()

    return {"pid": pid, "gestor": auth_headers, "lector": lector, "ajeno": ajeno, "admin": admin}


@pytest.mark.parametrize("metodo,plantilla,escribe", ENDPOINTS)
def test_usuario_ajeno_siempre_404(escenario, client, metodo, plantilla, escribe):
    ruta = plantilla.format(pid=escenario["pid"])
    resp = client.request(metodo, ruta, headers=escenario["ajeno"], json=_cuerpo(metodo, ruta))
    assert resp.status_code == 404, f"{metodo} {ruta} filtro la existencia de la parcela"


@pytest.mark.parametrize("metodo,plantilla,escribe", ENDPOINTS)
def test_lector_consulta_pero_no_escribe(escenario, client, metodo, plantilla, escribe):
    ruta = plantilla.format(pid=escenario["pid"])
    resp = client.request(metodo, ruta, headers=escenario["lector"], json=_cuerpo(metodo, ruta))
    if escribe:
        assert resp.status_code == 403, f"{metodo} {ruta} dejo escribir a un usuario de lectura"
    else:
        assert resp.status_code != 403, f"{metodo} {ruta} bloqueo una consulta legitima"
        assert resp.status_code != 404, f"{metodo} {ruta} oculto la parcela a un miembro"


@pytest.mark.parametrize("metodo,plantilla,escribe", ENDPOINTS)
def test_admin_no_asociado_entra_como_gestor(escenario, client, metodo, plantilla, escribe):
    ruta = plantilla.format(pid=escenario["pid"])
    resp = client.request(metodo, ruta, headers=escenario["admin"], json=_cuerpo(metodo, ruta))
    assert resp.status_code not in (403, 404), f"{metodo} {ruta} bloqueo al admin"


def test_no_queda_ninguna_llamada_a_la_funcion_antigua():
    """Si sobrevive una llamada, ese endpoint se queda con la autorizacion vieja."""
    import pathlib
    raiz = pathlib.Path(__file__).resolve().parent.parent / "app"
    restos = [
        f"{p}" for p in raiz.rglob("*.py")
        if "get_parcela_del_usuario" in p.read_text(encoding="utf-8")
    ]
    assert restos == [], f"quedan referencias a get_parcela_del_usuario en {restos}"
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pytest tests/test_matriz_permisos.py -v`
Expected: los tests de `lector` fallan en los endpoints de escritura (devuelven 404, no 403, porque el lector no es el dueño), los de `admin` fallan con 404, y `test_no_queda_ninguna_llamada_a_la_funcion_antigua` falla listando los 6 routers.

- [ ] **Step 3: Trasladar las llamadas**

En cada uno de los 6 routers: cambia el import de `..deps` para traer `parcela_con_gestion` y/o `parcela_con_lectura` en vez de `get_parcela_del_usuario`, y sustituye cada llamada según la tabla de arriba. La firma es idéntica —`(parcela_id, current_user, db)`— así que solo cambia el nombre de la función.

Ejemplo, en `app/routers/sensores.py`:

```python
# antes
get_parcela_del_usuario(parcela_id, current_user, db)
# despues, en el POST de crear sensor
parcela_con_gestion(parcela_id, current_user, db)
# despues, en el GET de listar
parcela_con_lectura(parcela_id, current_user, db)
```

En `logs.py` y en el `POST /tratamientos/` la llamada usa `body.parcela_id`; en el `DELETE` de tratamientos usa `tratamiento.parcela_id`. Conserva ese argumento tal cual, solo cambia el nombre de la función.

- [ ] **Step 4: Eliminar la función antigua**

En `app/deps.py`, borra `get_parcela_del_usuario` por completo. Si algún import queda huérfano, quítalo.

- [ ] **Step 5: Ejecutar el test**

Run: `pytest tests/test_matriz_permisos.py -v`
Expected: todo PASS.

- [ ] **Step 6: Ejecutar toda la suite**

Run: `pytest`
Expected: todo en PASS. Si falla algún test antiguo con 403, es que has clasificado como gestión un endpoint de consulta: revisa la tabla, no el test.

- [ ] **Step 7: Commit**

```bash
git add app/deps.py app/routers/ tests/test_matriz_permisos.py
git commit -m "feat: autorizacion por rol en los 19 endpoints con ambito de parcela"
```

---

## Task 5: Endpoints para compartir una parcela

**Files:**
- Create: `app/routers/miembros.py`
- Modify: `app/schemas.py`, `app/main.py`
- Test: `tests/test_miembros.py` (crear)

**Interfaces:**
- Consumes: `parcela_con_lectura`, `parcela_con_gestion` (Task 2); `ParcelaUsuario` (Task 1).
- Produces: `GET/POST/PATCH/DELETE /parcelas/{parcela_id}/usuarios`. El sub-proyecto D los consume.

- [ ] **Step 1: Escribir el test**

Create: `tests/test_miembros.py`

```python
def _registrar(client, email):
    client.post("/auth/register", json={"nombre": email, "email": email, "password": "clave12345"})
    resp = client.post("/auth/token", data={"username": email, "password": "clave12345"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def _uid(client, headers, pid, email):
    miembros = client.get(f"/parcelas/{pid}/usuarios", headers=headers).json()
    return next(m["usuario_id"] for m in miembros if m["email"] == email)


def test_el_creador_aparece_como_unico_miembro(client, auth_headers, parcela_id):
    resp = client.get(f"/parcelas/{parcela_id}/usuarios", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["rol"] == "gestor"
    assert resp.json()[0]["email"] == "test@vinalert.dev"


def test_anadir_por_email_y_que_aparezca_en_su_listado(client, auth_headers, parcela_id):
    invitado = _registrar(client, "invitado@test.dev")

    resp = client.post(
        f"/parcelas/{parcela_id}/usuarios",
        json={"email": "invitado@test.dev", "rol": "lectura"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["rol"] == "lectura"

    suyas = client.get("/parcelas/", headers=invitado).json()
    assert len(suyas) == 1


def test_email_sin_cuenta_da_404(client, auth_headers, parcela_id):
    resp = client.post(
        f"/parcelas/{parcela_id}/usuarios",
        json={"email": "nadie@test.dev", "rol": "lectura"},
        headers=auth_headers,
    )
    assert resp.status_code == 404
    assert "registr" in resp.json()["detail"].lower()


def test_anadir_dos_veces_da_409(client, auth_headers, parcela_id):
    _registrar(client, "invitado@test.dev")
    cuerpo = {"email": "invitado@test.dev", "rol": "lectura"}
    client.post(f"/parcelas/{parcela_id}/usuarios", json=cuerpo, headers=auth_headers)

    resp = client.post(f"/parcelas/{parcela_id}/usuarios", json=cuerpo, headers=auth_headers)
    assert resp.status_code == 409


def test_rol_invalido_da_422(client, auth_headers, parcela_id):
    _registrar(client, "invitado@test.dev")
    resp = client.post(
        f"/parcelas/{parcela_id}/usuarios",
        json={"email": "invitado@test.dev", "rol": "jefe supremo"},
        headers=auth_headers,
    )
    assert resp.status_code == 422


def test_un_lector_no_puede_anadir_a_nadie(client, auth_headers, parcela_id):
    lector = _registrar(client, "lector@test.dev")
    client.post(
        f"/parcelas/{parcela_id}/usuarios",
        json={"email": "lector@test.dev", "rol": "lectura"},
        headers=auth_headers,
    )
    _registrar(client, "tercero@test.dev")

    resp = client.post(
        f"/parcelas/{parcela_id}/usuarios",
        json={"email": "tercero@test.dev", "rol": "lectura"},
        headers=lector,
    )
    assert resp.status_code == 403


def test_cambiar_el_rol_de_un_miembro(client, auth_headers, parcela_id):
    _registrar(client, "invitado@test.dev")
    client.post(
        f"/parcelas/{parcela_id}/usuarios",
        json={"email": "invitado@test.dev", "rol": "lectura"},
        headers=auth_headers,
    )
    uid = _uid(client, auth_headers, parcela_id, "invitado@test.dev")

    resp = client.patch(
        f"/parcelas/{parcela_id}/usuarios/{uid}",
        json={"rol": "gestor"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["rol"] == "gestor"


def test_no_se_puede_degradar_al_ultimo_gestor(client, auth_headers, parcela_id):
    """Una parcela sin gestor seria inadministrable y nadie podria recuperarla."""
    uid = _uid(client, auth_headers, parcela_id, "test@vinalert.dev")

    resp = client.patch(
        f"/parcelas/{parcela_id}/usuarios/{uid}",
        json={"rol": "lectura"},
        headers=auth_headers,
    )
    assert resp.status_code == 409


def test_no_se_puede_retirar_al_ultimo_gestor(client, auth_headers, parcela_id):
    uid = _uid(client, auth_headers, parcela_id, "test@vinalert.dev")

    resp = client.delete(f"/parcelas/{parcela_id}/usuarios/{uid}", headers=auth_headers)
    assert resp.status_code == 409


def test_un_gestor_puede_retirarse_si_queda_otro(client, auth_headers, parcela_id):
    _registrar(client, "cogestor@test.dev")
    client.post(
        f"/parcelas/{parcela_id}/usuarios",
        json={"email": "cogestor@test.dev", "rol": "gestor"},
        headers=auth_headers,
    )
    uid = _uid(client, auth_headers, parcela_id, "test@vinalert.dev")

    resp = client.delete(f"/parcelas/{parcela_id}/usuarios/{uid}", headers=auth_headers)
    assert resp.status_code == 204
    assert client.get("/parcelas/", headers=auth_headers).json() == []


def test_el_admin_no_aparece_como_miembro(client, auth_headers, parcela_id, db_session):
    """Su acceso viene del rol global, no de una fila: el listado debe reflejar
    exactamente lo que hay en parcela_usuarios."""
    from app.models import Usuario

    _registrar(client, "admin@test.dev")
    admin = db_session.query(Usuario).filter_by(email="admin@test.dev").first()
    admin.rol = "admin"
    db_session.commit()

    miembros = client.get(f"/parcelas/{parcela_id}/usuarios", headers=auth_headers).json()
    assert [m["email"] for m in miembros] == ["test@vinalert.dev"]


def test_retirar_a_quien_no_es_miembro_da_404(client, auth_headers, parcela_id):
    otro = _registrar(client, "nomiembro@test.dev")  # noqa: F841
    resp = client.delete(f"/parcelas/{parcela_id}/usuarios/99999", headers=auth_headers)
    assert resp.status_code == 404
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pytest tests/test_miembros.py -v`
Expected: todos FAIL con 404 (las rutas no existen).

- [ ] **Step 3: Añadir los schemas**

En `app/schemas.py`:

```python
from typing import Literal


class MiembroCreate(BaseModel):
    email: str
    rol: Literal["gestor", "lectura"]


class MiembroUpdate(BaseModel):
    rol: Literal["gestor", "lectura"]


class MiembroResp(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    usuario_id: int
    nombre: str
    email: str
    rol: str
```

- [ ] **Step 4: Crear el router**

Create: `app/routers/miembros.py`

```python
from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import ROL_GESTOR, get_current_user, parcela_con_gestion, parcela_con_lectura
from ..models import ParcelaUsuario, Usuario
from ..schemas import MiembroCreate, MiembroResp, MiembroUpdate

router = APIRouter(prefix="/parcelas/{parcela_id}/usuarios", tags=["miembros"])


def _a_resp(miembro: ParcelaUsuario, usuario: Usuario) -> MiembroResp:
    return MiembroResp(
        usuario_id=usuario.id, nombre=usuario.nombre, email=usuario.email, rol=miembro.rol
    )


def _cuantos_gestores(parcela_id: int, db: Session) -> int:
    return db.query(ParcelaUsuario).filter(
        ParcelaUsuario.parcela_id == parcela_id,
        ParcelaUsuario.rol == ROL_GESTOR,
    ).count()


def _miembro_o_404(parcela_id: int, usuario_id: int, db: Session) -> ParcelaUsuario:
    miembro = db.query(ParcelaUsuario).filter(
        ParcelaUsuario.parcela_id == parcela_id,
        ParcelaUsuario.usuario_id == usuario_id,
    ).first()
    if miembro is None:
        raise HTTPException(status_code=404, detail="Ese usuario no tiene acceso a esta parcela")
    return miembro


@router.get("", response_model=List[MiembroResp])
def listar_miembros(
    parcela_id: int,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    """Cualquier miembro puede ver con quien comparte la parcela: le concierne."""
    parcela_con_lectura(parcela_id, current_user, db)
    filas = db.query(ParcelaUsuario, Usuario).join(
        Usuario, Usuario.id == ParcelaUsuario.usuario_id
    ).filter(ParcelaUsuario.parcela_id == parcela_id).all()
    return [_a_resp(m, u) for m, u in filas]


@router.post("", response_model=MiembroResp, status_code=201)
def anadir_miembro(
    parcela_id: int,
    body: MiembroCreate,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    parcela_con_gestion(parcela_id, current_user, db)

    usuario = db.query(Usuario).filter(Usuario.email == body.email).first()
    if usuario is None:
        # Error mas probable en uso real: el frontend necesita poder explicarlo.
        raise HTTPException(
            status_code=404,
            detail="No hay ninguna cuenta con ese email. Esa persona debe registrarse primero.",
        )

    ya = db.query(ParcelaUsuario).filter(
        ParcelaUsuario.parcela_id == parcela_id,
        ParcelaUsuario.usuario_id == usuario.id,
    ).first()
    if ya is not None:
        raise HTTPException(status_code=409, detail="Ese usuario ya tiene acceso a esta parcela")

    miembro = ParcelaUsuario(parcela_id=parcela_id, usuario_id=usuario.id, rol=body.rol)
    db.add(miembro)
    db.commit()
    return _a_resp(miembro, usuario)


@router.patch("/{usuario_id}", response_model=MiembroResp)
def cambiar_rol(
    parcela_id: int,
    usuario_id: int,
    body: MiembroUpdate,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    parcela_con_gestion(parcela_id, current_user, db)
    miembro = _miembro_o_404(parcela_id, usuario_id, db)

    if miembro.rol == ROL_GESTOR and body.rol != ROL_GESTOR and _cuantos_gestores(parcela_id, db) == 1:
        raise HTTPException(
            status_code=409,
            detail="No puedes dejar la parcela sin ningun gestor: nombra a otro antes.",
        )

    miembro.rol = body.rol
    db.commit()
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    return _a_resp(miembro, usuario)


@router.delete("/{usuario_id}", status_code=204)
def retirar_miembro(
    parcela_id: int,
    usuario_id: int,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    parcela_con_gestion(parcela_id, current_user, db)
    miembro = _miembro_o_404(parcela_id, usuario_id, db)

    if miembro.rol == ROL_GESTOR and _cuantos_gestores(parcela_id, db) == 1:
        raise HTTPException(
            status_code=409,
            detail="No puedes dejar la parcela sin ningun gestor: nombra a otro antes.",
        )

    db.delete(miembro)
    db.commit()
```

- [ ] **Step 5: Registrar el router**

En `app/main.py`, añadir `miembros` al import de routers y `app.include_router(miembros.router)` junto a los demás.

- [ ] **Step 6: Ejecutar el test**

Run: `pytest tests/test_miembros.py -v`
Expected: 12 PASS.

- [ ] **Step 7: Ejecutar toda la suite**

Run: `pytest`
Expected: todo en PASS.

- [ ] **Step 8: Commit**

```bash
git add app/routers/miembros.py app/schemas.py app/main.py tests/test_miembros.py
git commit -m "feat: endpoints para compartir una parcela y gestionar sus miembros"
```

---

## Task 6: Retirar `Parcela.usuario_id` y escribir la migración

**Files:**
- Modify: `app/models.py`, `app/routers/parcelas.py`
- Modify: `tests/test_clima_puntual.py`, `tests/test_clima_scheduler.py`, `tests/test_consolidacion.py`, `tests/test_consolidacion_scheduler.py`, `tests/test_weather_fetch_guardar.py`
- Create: `migracion_2026_08_19_multiusuario.sql`

**Interfaces:**
- Consumes: todo lo anterior. Nadie debe leer ya `Parcela.usuario_id`.
- Produces: el esquema definitivo.

Va la última a propósito: hasta aquí la columna seguía viva y poblada, así que la suite estuvo verde en todo momento.

- [ ] **Step 1: Comprobar que nadie la usa en `app/`**

Run: `grep -rn "usuario_id" app/ --include=*.py | grep -v parcela_usuarios | grep -v ParcelaUsuario`
Expected: solo la definición en `models.py` y el `usuario_id=current_user.id` de `crear_parcela`. Si aparece algo más, trasládalo antes de seguir.

- [ ] **Step 2: Escribir el test de retirada**

Añadir al final de `tests/test_parcela_usuarios_modelo.py`:

```python
def test_parcela_ya_no_tiene_usuario_id():
    """El acceso vive solo en parcela_usuarios: dos caminos serian dos sitios
    donde equivocarse."""
    assert not hasattr(Parcela, "usuario_id")
```

- [ ] **Step 3: Ejecutar y verificar que falla**

Run: `pytest tests/test_parcela_usuarios_modelo.py::test_parcela_ya_no_tiene_usuario_id -v`
Expected: FAIL.

- [ ] **Step 4: Retirar la columna**

En `app/models.py`: elimina de `Parcela` la línea `usuario_id = Column(...)` y la relación `usuario = relationship("Usuario", back_populates="parcelas")`. Elimina de `Usuario` la relación `parcelas = relationship("Parcela", back_populates="usuario")`.

En `app/routers/parcelas.py`, en `crear_parcela`, cambia `Parcela(**body.model_dump(), usuario_id=current_user.id)` por `Parcela(**body.model_dump())`. El resto de la función (el `ParcelaUsuario` con rol gestor) no cambia.

- [ ] **Step 5: Migrar los tests que la nombran**

En los 5 ficheros de test listados arriba, elimina el argumento `usuario_id=1` de cada constructor `Parcela(...)`. Son 11 apariciones. No cambies nada más de esos tests: no toques sus aserciones ni sus nombres.

- [ ] **Step 6: Ejecutar toda la suite**

Run: `pytest`
Expected: todo en PASS. Si algún test falla por `usuario_id`, es que quedó una aparición sin migrar.

- [ ] **Step 7: Escribir la migración SQL**

Create: `migracion_2026_08_19_multiusuario.sql`

```sql
-- ============================================================================
-- Migracion: acceso multiusuario por parcela
-- Fecha: 2026-08-19
--
-- ORDEN DE EJECUCION OBLIGATORIO: los tres bloques van en este orden y no en
-- otro. El bloque 3 destruye la columna que el bloque 2 necesita leer; al
-- reves, se pierde para siempre quien era el dueno de cada parcela.
--
-- Ejecutar ANTES de arrancar la app con este codigo: create_all() solo crea
-- tablas que faltan, nunca elimina columnas, asi que no hara el bloque 3 por
-- su cuenta.
-- ============================================================================

-- 1. Tabla de asociacion
CREATE TABLE IF NOT EXISTS parcela_usuarios (
    parcela_id INTEGER NOT NULL REFERENCES parcelas(id),
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    rol VARCHAR NOT NULL,
    PRIMARY KEY (parcela_id, usuario_id)
);

-- 2. Cada dueno actual pasa a ser gestor de su parcela.
--    ON CONFLICT: hace el bloque re-ejecutable sin duplicar ni fallar.
INSERT INTO parcela_usuarios (parcela_id, usuario_id, rol)
SELECT id, usuario_id, 'gestor' FROM parcelas WHERE usuario_id IS NOT NULL
ON CONFLICT (parcela_id, usuario_id) DO NOTHING;

-- 3. DESTRUCTIVO. Solo despues de comprobar que el bloque 2 ha insertado
--    tantas filas como parcelas con dueno habia.
ALTER TABLE parcelas DROP COLUMN IF EXISTS usuario_id;
```

**NO ejecutes este script contra ninguna base de datos.** El controlador lo aplica tras confirmación explícita del usuario.

- [ ] **Step 8: Commit**

```bash
git add app/models.py app/routers/parcelas.py tests/ migracion_2026_08_19_multiusuario.sql
git commit -m "feat: retirar Parcela.usuario_id y migracion a parcela_usuarios"
```

---

## Verificación final

- [ ] `pytest` completo en verde, sin argumentos ni exclusiones.
- [ ] `grep -rn "get_parcela_del_usuario" app/ tests/` no devuelve nada.
- [ ] `grep -rn "usuario_id" app/models.py` solo aparece dentro de `ParcelaUsuario`.
- [ ] La app arranca: `uvicorn app.main:app` sin errores de mapeo de SQLAlchemy.
- [ ] La migración SQL queda escrita y **sin ejecutar**, pendiente de confirmación del usuario.

## Fuera de este plan

- Conceder el rol de admin a una cuenta concreta: se hace tocando la base de datos, y el usuario decidirá cuál.
- El frontend (sub-proyecto D) y la configuración de parcela desde la app (sub-proyecto C).
- `GET /clima/ping` no tiene autenticación. No lo introduce este plan y no tiene ámbito de parcela, pero conviene revisarlo en algún momento.

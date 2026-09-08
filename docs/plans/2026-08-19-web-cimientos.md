# Cimientos de la web (D1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la aplicación web sepa quién eres y qué puedes hacer en cada parcela, que la caducidad de la sesión sea un mensaje en vez de un fallo mudo, y dejar montada la estructura sobre la que se construyen D2, D3 y D4.

**Architecture:** Tres cambios pequeños de backend —`GET /auth/me`, un campo `mi_rol` que viaja con cada parcela, y el token a 7 días— y una reorganización del frontend por responsabilidad: cliente de API con interceptor de 401, contexto de sesión que carga el usuario al arrancar, contexto de parcela que lleva el permiso dentro, y traducción común de errores. Se monta Vitest desde el principio porque tres sub-proyectos más van a construir encima.

**Tech Stack:** FastAPI 0.115, SQLAlchemy 2.0, Pydantic 2, pytest (backend). React 19, Vite 7, Tailwind 4, react-router 7, axios, Vitest, Testing Library (frontend).

**Spec:** `docs/specs/2026-08-19-web-cimientos-design.md`

## Global Constraints

- **El stack no cambia**: React 19, Vite 7, Tailwind 4, react-router 7, axios, recharts. Se rehacen estructura y pantallas, no las herramientas.
- **`mi_rol` vale `"gestor"` para el admin**, esté o no asociado a la parcela. El campo responde a "qué puede hacer aquí", no a "por qué".
- Los valores de rol son exactamente `"gestor"`, `"lectura"`, `"admin"`, `"agricultor"`.
- **Quien no pertenece a una parcela recibe 404, nunca 403**; un miembro de `lectura` que escribe recibe **403, no 404**. No cambia en este plan; se respeta al mostrar errores.
- **A un usuario de lectura se le ocultan las acciones de gestión, no se le muestran desactivadas.**
- **La suite de backend debe quedar verde**: `pytest` sin argumentos, sin `--ignore` y sin deselecciones. Está en 255 tests.
- **La suite de frontend debe quedar verde**: `npm test` en `vinalert-front/`.
- Este plan **no construye ninguna pantalla de contenido**. Las secciones quedan vacías con un cartel de qué irá en cada una.
- Ningún cambio añade un endpoint con ámbito de parcela, así que `tests/test_matriz_permisos.py` y su guarda estructural **no cambian**.

## Orden y por qué

El backend va primero (Tasks 1 y 2) porque el frontend consume `/auth/me` y `mi_rol`. Dentro del frontend, el entorno de tests va antes que nada (Task 3): montarlo después obligaría a volver sobre código ya escrito para añadirle tests.

---

## Task 1: `GET /auth/me` y token de 7 días

**Files:**
- Modify: `app/schemas.py`, `app/routers/auth.py`, `app/auth.py`
- Test: `tests/test_auth_me.py` (crear)

**Interfaces:**
- Produces: `GET /auth/me` → `UsuarioMeResp` con `id`, `nombre`, `email`, `rol`. El frontend lo consume en la Task 5.

- [ ] **Step 1: Escribir el test**

Create: `tests/test_auth_me.py`

```python
from app.models import Usuario


def test_me_devuelve_el_usuario_autenticado(client, auth_headers):
    resp = client.get("/auth/me", headers=auth_headers)

    assert resp.status_code == 200
    cuerpo = resp.json()
    assert cuerpo["email"] == "test@vinalert.dev"
    assert cuerpo["nombre"] == "Test User"
    assert cuerpo["rol"] == "agricultor"
    assert isinstance(cuerpo["id"], int)


def test_me_sin_token_da_401(client):
    assert client.get("/auth/me").status_code == 401


def test_me_con_token_invalido_da_401(client):
    resp = client.get("/auth/me", headers={"Authorization": "Bearer basura"})
    assert resp.status_code == 401


def test_me_refleja_el_rol_admin(client, auth_headers, db_session):
    """El frontend usa este campo para saber si entra en cualquier parcela."""
    u = db_session.query(Usuario).filter_by(email="test@vinalert.dev").first()
    u.rol = "admin"
    db_session.commit()

    resp = client.get("/auth/me", headers=auth_headers)

    assert resp.json()["rol"] == "admin"


def test_me_no_expone_la_contrasena(client, auth_headers):
    cuerpo = client.get("/auth/me", headers=auth_headers).json()
    assert "hashed_password" not in cuerpo
    assert "password" not in cuerpo


def test_el_token_dura_siete_dias():
    """
    Una semana en vez de un dia. El coste esta aceptado en el spec: un token
    robado sirve siete dias y no hay forma de revocarlo.
    """
    from app.auth import ACCESS_TOKEN_EXPIRE_MINUTES

    assert ACCESS_TOKEN_EXPIRE_MINUTES == 60 * 24 * 7
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pytest tests/test_auth_me.py -v`
Expected: los cinco primeros FAIL con 404 (la ruta no existe); el último FAIL porque hoy vale `60 * 24`.

- [ ] **Step 3: Añadir el schema**

En `app/schemas.py`, junto a `UsuarioResp`:

```python
class UsuarioMeResp(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    nombre: str
    email: str
    rol: str
```

No se le añade `rol` a `UsuarioResp`: ese schema lo usa `/auth/register`, donde el rol no aporta nada y siempre sería `"agricultor"`.

- [ ] **Step 4: Añadir el endpoint**

En `app/routers/auth.py`, tras `register_usuario`:

```python
@router.get("/me", response_model=UsuarioMeResp)
def usuario_actual(current_user: Usuario = Depends(get_current_user)) -> Any:
    """
    Quien soy. Sin esto la aplicacion web no puede saber, tras recargar la
    pagina, ni tu nombre ni si eres admin — y por tanto no puede decidir que
    acciones mostrarte.
    """
    return current_user
```

Añade `UsuarioMeResp` al import de `..schemas` y `get_current_user` al de `..deps`.

- [ ] **Step 5: Subir la caducidad del token**

En `app/auth.py`, cambiar:

```python
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24
```

por:

```python
# Una semana. Alargarlo reduce cuantas veces te echa, pero NO elimina el fallo:
# el interceptor del 401 en el frontend es lo que convierte la caducidad en un
# mensaje en vez de en pantallas vacias.
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7
```

- [ ] **Step 6: Ejecutar el test**

Run: `pytest tests/test_auth_me.py -v`
Expected: 6 PASS.

- [ ] **Step 7: Ejecutar toda la suite**

Run: `pytest`
Expected: todo en PASS (255 previos + 6 nuevos = 261).

- [ ] **Step 8: Commit**

```bash
git add app/schemas.py app/routers/auth.py app/auth.py tests/test_auth_me.py
git commit -m "feat: endpoint del usuario actual y token de siete dias"
```

---

## Task 2: `mi_rol` en la respuesta de parcela

**Files:**
- Modify: `app/schemas.py`, `app/deps.py`, `app/routers/parcelas.py`
- Test: `tests/test_parcela_mi_rol.py` (crear)

**Interfaces:**
- Consumes: `ROL_ADMIN`, `ROL_GESTOR` de `app/deps.py`.
- Produces: `ParcelaResp.mi_rol` (`"gestor"` o `"lectura"`), presente en los **cinco** puntos que devuelven parcelas. El frontend lo consume en la Task 6.

**Aviso: son CINCO puntos, no cuatro.** `ParcelaResp` va embebido en `DashboardCompleto` (`app/schemas.py:248`), y `obtener_dashboard` devuelve un diccionario con el objeto ORM dentro. Como `Parcela` no tiene atributo `mi_rol`, un campo obligatorio sin rellenar ahí **no da un campo ausente: da un 500 en la pantalla principal**.

- [ ] **Step 1: Escribir el test**

Create: `tests/test_parcela_mi_rol.py`

```python
from app.models import ParcelaUsuario, Usuario


def _registrar(client, email):
    client.post("/auth/register", json={"nombre": email, "email": email, "password": "clave12345"})
    resp = client.post("/auth/token", data={"username": email, "password": "clave12345"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def test_el_creador_ve_mi_rol_gestor(client, auth_headers, parcela_id):
    resp = client.get(f"/parcelas/{parcela_id}", headers=auth_headers)

    assert resp.status_code == 200
    assert resp.json()["mi_rol"] == "gestor"


def test_un_lector_ve_mi_rol_lectura(client, auth_headers, parcela_id, db_session):
    lector = _registrar(client, "lector@test.dev")
    u = db_session.query(Usuario).filter_by(email="lector@test.dev").first()
    db_session.add(ParcelaUsuario(parcela_id=parcela_id, usuario_id=u.id, rol="lectura"))
    db_session.commit()

    resp = client.get(f"/parcelas/{parcela_id}", headers=lector)

    assert resp.json()["mi_rol"] == "lectura"


def test_el_admin_no_asociado_ve_mi_rol_gestor(client, auth_headers, parcela_id, db_session):
    """Responde a que PUEDE hacer, no a por que puede."""
    admin = _registrar(client, "admin@test.dev")
    u = db_session.query(Usuario).filter_by(email="admin@test.dev").first()
    u.rol = "admin"
    db_session.commit()

    resp = client.get(f"/parcelas/{parcela_id}", headers=admin)

    assert resp.json()["mi_rol"] == "gestor"


def test_el_listado_trae_mi_rol(client, auth_headers, parcela_id):
    parcelas = client.get("/parcelas/", headers=auth_headers).json()

    assert len(parcelas) == 1
    assert parcelas[0]["mi_rol"] == "gestor"


def test_el_listado_distingue_el_rol_de_cada_parcela(client, auth_headers, db_session):
    """Con una propia y una compartida en lectura, cada fila trae el suyo."""
    mia = client.post("/parcelas/", json={"nombre": "Mia"}, headers=auth_headers).json()
    otro = _registrar(client, "otro@test.dev")
    suya = client.post("/parcelas/", json={"nombre": "Suya"}, headers=otro).json()

    yo = db_session.query(Usuario).filter_by(email="test@vinalert.dev").first()
    db_session.add(ParcelaUsuario(parcela_id=suya["id"], usuario_id=yo.id, rol="lectura"))
    db_session.commit()

    por_nombre = {p["nombre"]: p["mi_rol"] for p in client.get("/parcelas/", headers=auth_headers).json()}

    assert por_nombre == {"Mia": "gestor", "Suya": "lectura"}


def test_al_crear_una_parcela_la_respuesta_trae_mi_rol(client, auth_headers):
    resp = client.post("/parcelas/", json={"nombre": "Nueva"}, headers=auth_headers)

    assert resp.status_code == 201
    assert resp.json()["mi_rol"] == "gestor"


def test_al_editar_una_parcela_la_respuesta_trae_mi_rol(client, auth_headers, parcela_id):
    resp = client.patch(f"/parcelas/{parcela_id}", json={"nombre": "Editada"}, headers=auth_headers)

    assert resp.json()["mi_rol"] == "gestor"


def test_el_dashboard_sigue_respondiendo_con_mi_rol(client, auth_headers, parcela_id):
    """
    El punto que mas facil se olvida: ParcelaResp va embebido en
    DashboardCompleto, asi que un mi_rol sin rellenar aqui da un 500.
    """
    resp = client.get(f"/parcelas/{parcela_id}/dashboard", headers=auth_headers)

    assert resp.status_code == 200, "el dashboard se ha roto al anadir mi_rol"
    assert resp.json()["parcela"]["mi_rol"] == "gestor"
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pytest tests/test_parcela_mi_rol.py -v`
Expected: todos FAIL con `KeyError: 'mi_rol'`.

- [ ] **Step 3: Añadir el campo y la constante**

En `app/schemas.py`, en `ParcelaResp`, añadir tras `id`:

```python
    mi_rol: Literal["gestor", "lectura"]
```

En `app/deps.py`, junto a `ROL_ADMIN` y `ROL_GESTOR`, añadir:

```python
ROL_LECTURA = "lectura"
```

(Existió y se retiró por no tener consumidores; ahora los tiene.)

- [ ] **Step 4: Añadir los helpers**

En `app/routers/parcelas.py`, antes de `listar_parcelas`:

```python
def _rol_en_parcela(parcela_id: int, current_user: Usuario, db: Session) -> str:
    """
    Que puede hacer este usuario en esta parcela. El admin es gestor en todas.
    Llegar aqui exige haber pasado por parcela_con_lectura o
    parcela_con_gestion, asi que el caso "no es miembro" no puede darse.
    """
    if current_user.rol == ROL_ADMIN:
        return ROL_GESTOR

    miembro = db.query(ParcelaUsuario).filter(
        ParcelaUsuario.parcela_id == parcela_id,
        ParcelaUsuario.usuario_id == current_user.id,
    ).first()
    return miembro.rol if miembro else ROL_LECTURA


def _con_mi_rol(parcela: Parcela, mi_rol: str) -> Parcela:
    """
    Adjunta mi_rol al objeto ORM para que ParcelaResp lo recoja via
    from_attributes. SQLAlchemy ignora los atributos que no mapea, asi que
    esto no toca la base de datos.
    """
    parcela.mi_rol = mi_rol
    return parcela
```

Añade `ROL_LECTURA` al import de `..deps`.

- [ ] **Step 5: Rellenarlo en los cinco puntos**

En `listar_parcelas`, sustituir el cuerpo por:

```python
    if current_user.rol == ROL_ADMIN:
        parcelas = db.query(Parcela).all()
        return [_con_mi_rol(p, ROL_GESTOR) for p in parcelas]

    # Una sola consulta para todas las membresias: una por parcela seria un
    # N+1 gratuito.
    roles = dict(
        db.query(ParcelaUsuario.parcela_id, ParcelaUsuario.rol)
        .filter(ParcelaUsuario.usuario_id == current_user.id)
        .all()
    )
    parcelas = (
        db.query(Parcela)
        .join(ParcelaUsuario, ParcelaUsuario.parcela_id == Parcela.id)
        .filter(ParcelaUsuario.usuario_id == current_user.id)
        .all()
    )
    return [_con_mi_rol(p, roles[p.id]) for p in parcelas]
```

En `crear_parcela`, cambiar `return parcela` por:

```python
        return _con_mi_rol(parcela, ROL_GESTOR)
```

En `obtener_parcela`:

```python
    parcela = parcela_con_lectura(parcela_id, current_user, db)
    return _con_mi_rol(parcela, _rol_en_parcela(parcela_id, current_user, db))
```

En `editar_parcela`, cambiar el `return parcela` final por:

```python
    return _con_mi_rol(parcela, _rol_en_parcela(parcela_id, current_user, db))
```

Y en `obtener_dashboard` —**el que se olvida**— cambiar el diccionario de retorno por:

```python
    return {
        "parcela": _con_mi_rol(parcela, _rol_en_parcela(parcela_id, current_user, db)),
        "estado_suelo": resumen_suelo,
        "clima_actual": u_clima,
    }
```

- [ ] **Step 6: Ejecutar el test**

Run: `pytest tests/test_parcela_mi_rol.py -v`
Expected: 8 PASS.

- [ ] **Step 7: Ejecutar toda la suite**

Run: `pytest`
Expected: todo en PASS. Si falla algún test antiguo con un error de validación de `ParcelaResp`, es que queda un punto de construcción sin rellenar.

- [ ] **Step 8: Commit**

```bash
git add app/schemas.py app/deps.py app/routers/parcelas.py tests/test_parcela_mi_rol.py
git commit -m "feat: mi_rol viaja con cada parcela"
```

---

## Task 3: Entorno de tests del frontend

**Files:**
- Modify: `vinalert-front/package.json`, `vinalert-front/vite.config.js`
- Create: `vinalert-front/src/test/setup.js`, `vinalert-front/src/test/humo.test.jsx`

**Interfaces:**
- Produces: `npm test` ejecuta Vitest con jsdom y Testing Library. Las Tasks 4 a 7 escriben tests contra este entorno.

Va antes que el código a propósito: montarlo después obligaría a volver sobre lo ya escrito.

- [ ] **Step 1: Instalar las dependencias**

Run desde `vinalert-front/`:

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Step 2: Configurar Vitest**

En `vinalert-front/vite.config.js`, añadir la clave `test` al objeto de `defineConfig`:

```js
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
})
```

- [ ] **Step 3: Crear el fichero de arranque**

Create: `vinalert-front/src/test/setup.js`

```js
import '@testing-library/jest-dom';
```

- [ ] **Step 4: Añadir el script**

En `vinalert-front/package.json`, en `"scripts"`, añadir:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 5: Escribir el test de humo**

Create: `vinalert-front/src/test/humo.test.jsx`

```jsx
import { render, screen } from '@testing-library/react';

function Saludo() {
  return <p>el entorno de tests funciona</p>;
}

test('renderiza un componente y encuentra su texto', () => {
  render(<Saludo />);
  expect(screen.getByText('el entorno de tests funciona')).toBeInTheDocument();
});
```

Ese `toBeInTheDocument` es de `jest-dom`: si el fichero de arranque no se cargara, el test fallaría con "no es una función". Sirve de comprobación del montaje, no solo del render.

- [ ] **Step 6: Ejecutar**

Run desde `vinalert-front/`: `npm test`
Expected: 1 passed.

- [ ] **Step 7: Commit**

```bash
git add vinalert-front/package.json vinalert-front/package-lock.json vinalert-front/vite.config.js vinalert-front/src/test/
git commit -m "chore: montar vitest y testing library en el frontend"
```

---

## Task 4: Cliente de API con interceptor de 401

**Files:**
- Create: `vinalert-front/src/api/cliente.js`, `vinalert-front/src/api/auth.js`, `vinalert-front/src/api/parcelas.js`
- Create: `vinalert-front/src/test/respuestas.js`
- Create: `vinalert-front/src/api/cliente.test.js`
- Delete: `vinalert-front/src/api.js`

**Interfaces:**
- Produces: `cliente` (instancia de axios), `sesion.guardarToken(t)`, `sesion.leerToken()`, `sesion.limpiar()`, y las funciones `login(email, password)`, `me()`, `listarParcelas()`, `obtenerParcela(id)`. Las Tasks 5, 6 y 7 las consumen.

- [ ] **Step 1: Escribir el test**

Create: `vinalert-front/src/api/cliente.test.js`

Estos tests acceden a `cliente.interceptors.*.handlers[0]`, que son tripas de axios. Es deliberado: permite probar los interceptores sin levantar un servidor ni añadir otra dependencia. Si una subida de axios rompiera ese acceso, se vería aquí y en ningún otro sitio.

```js
import { beforeEach, describe, expect, test, vi } from 'vitest';
import cliente, { LLAVE_TOKEN, MOTIVO_CADUCADA } from './cliente';

describe('cliente de API', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/p/1/estado');
  });

  test('adjunta el token a la peticion cuando existe', () => {
    localStorage.setItem(LLAVE_TOKEN, 'un-token');
    const config = cliente.interceptors.request.handlers[0].fulfilled({ headers: {} });
    expect(config.headers.Authorization).toBe('Bearer un-token');
  });

  test('no adjunta nada si no hay token', () => {
    const config = cliente.interceptors.request.handlers[0].fulfilled({ headers: {} });
    expect(config.headers.Authorization).toBeUndefined();
  });

  test('un 401 limpia la sesion y lleva al login con el motivo y el destino', async () => {
    localStorage.setItem(LLAVE_TOKEN, 'caducado');
    const alRechazar = cliente.interceptors.response.handlers[0].rejected;

    await expect(alRechazar({ response: { status: 401 } })).rejects.toBeTruthy();

    expect(localStorage.getItem(LLAVE_TOKEN)).toBeNull();
    expect(window.location.pathname).toBe('/login');
    expect(window.location.search).toContain(MOTIVO_CADUCADA);
    expect(decodeURIComponent(window.location.search)).toContain('/p/1/estado');
  });

  test('un 403 se propaga sin tocar la sesion', async () => {
    localStorage.setItem(LLAVE_TOKEN, 'valido');
    const alRechazar = cliente.interceptors.response.handlers[0].rejected;

    await expect(alRechazar({ response: { status: 403 } })).rejects.toBeTruthy();

    expect(localStorage.getItem(LLAVE_TOKEN)).toBe('valido');
    expect(window.location.pathname).toBe('/p/1/estado');
  });

  test('un error de red se propaga sin tocar la sesion', async () => {
    localStorage.setItem(LLAVE_TOKEN, 'valido');
    const alRechazar = cliente.interceptors.response.handlers[0].rejected;

    await expect(alRechazar({ request: {} })).rejects.toBeTruthy();

    expect(localStorage.getItem(LLAVE_TOKEN)).toBe('valido');
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npm test`
Expected: FAIL — no existe `./cliente`.

- [ ] **Step 3: Escribir el cliente**

Create: `vinalert-front/src/api/cliente.js`

```js
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000';

export const LLAVE_TOKEN = 'access_token';
export const MOTIVO_CADUCADA = 'sesion_caducada';

export const sesion = {
  leerToken: () => localStorage.getItem(LLAVE_TOKEN),
  guardarToken: (token) => localStorage.setItem(LLAVE_TOKEN, token),
  limpiar: () => localStorage.removeItem(LLAVE_TOKEN),
};

const cliente = axios.create({ baseURL: API_BASE });

cliente.interceptors.request.use((config) => {
  const token = sesion.leerToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// El 401 es el UNICO error que toda la aplicacion trata igual. Sin esto, al
// caducar el token la app deja navegar y todas las peticiones fallan a la vez,
// dejando pantallas vacias sin explicacion.
cliente.interceptors.response.use(
  (respuesta) => respuesta,
  (error) => {
    if (error.response?.status === 401) {
      sesion.limpiar();
      const destino = window.location.pathname + window.location.search;
      window.location.assign(
        `/login?motivo=${MOTIVO_CADUCADA}&destino=${encodeURIComponent(destino)}`,
      );
    }
    return Promise.reject(error);
  },
);

export default cliente;
```

Nota para el implementador: en jsdom, `window.location.assign` no navega de verdad pero sí actualiza `window.location`. Si en tu versión de jsdom no lo hiciera, usa `window.history.replaceState` seguido de la asignación, y dilo en el informe.

- [ ] **Step 4: Escribir las funciones de la API**

Create: `vinalert-front/src/api/auth.js`

```js
import cliente, { sesion } from './cliente';

export async function login(email, password) {
  const form = new URLSearchParams();
  form.append('username', email);
  form.append('password', password);

  const { data } = await cliente.post('/auth/token', form, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  sesion.guardarToken(data.access_token);
  return data;
}

export async function me() {
  const { data } = await cliente.get('/auth/me');
  return data;
}
```

Create: `vinalert-front/src/api/parcelas.js`

```js
import cliente from './cliente';

export async function listarParcelas() {
  const { data } = await cliente.get('/parcelas/');
  return data;
}

export async function obtenerParcela(id) {
  const { data } = await cliente.get(`/parcelas/${id}`);
  return data;
}
```

- [ ] **Step 5: Crear el fichero único de respuestas simuladas**

Create: `vinalert-front/src/test/respuestas.js`

```js
// Respuestas simuladas de la API, derivadas de respuestas reales.
//
// Viven TODAS aqui a proposito. Los tests del frontend no detectan una deriva
// del contrato con el backend: si el backend cambia de forma, los tests siguen
// verdes y la aplicacion se rompe. Concentrarlas en un fichero hace que
// actualizarlas sea un unico cambio visible en la revision, en vez de una
// caceria por todos los tests.

export const USUARIO = {
  id: 1,
  nombre: 'Test User',
  email: 'test@vinalert.dev',
  rol: 'agricultor',
};

export const USUARIO_ADMIN = { ...USUARIO, id: 9, email: 'admin@vinalert.dev', rol: 'admin' };

export const PARCELA_GESTOR = {
  id: 1,
  nombre: 'Parcela Test',
  mi_rol: 'gestor',
  tipo_cultivo: 'Vinedo',
  variedad: 'Albarino',
  latitud: 42.31,
  longitud: -8.61,
};

export const PARCELA_LECTURA = { ...PARCELA_GESTOR, id: 2, nombre: 'Compartida', mi_rol: 'lectura' };
```

- [ ] **Step 6: Borrar el cliente viejo**

Delete: `vinalert-front/src/api.js`

Los componentes que lo importan se reescriben en la Task 7. Entre la Task 4 y la 7 la aplicación **no compila**; es intencionado y el único tramo del plan donde ocurre, porque separar el cliente de sus consumidores en dos tareas es lo que permite revisarlos por separado. `npm test` sí funciona en todo momento.

- [ ] **Step 7: Ejecutar los tests**

Run: `npm test`
Expected: 6 passed (1 de humo + 5 del cliente).

- [ ] **Step 8: Commit**

```bash
git add vinalert-front/src/api/ vinalert-front/src/test/respuestas.js
git rm vinalert-front/src/api.js
git commit -m "feat: cliente de API con interceptor de 401"
```

---

## Task 5: Contexto de sesión y ruta protegida

**Files:**
- Create: `vinalert-front/src/sesion/SesionContext.jsx`, `vinalert-front/src/sesion/RutaProtegida.jsx`
- Create: `vinalert-front/src/sesion/sesion.test.jsx`
- Delete: `vinalert-front/src/components/ProtectedRoute.jsx`

**Interfaces:**
- Consumes: `me()` de `api/auth.js`, `sesion` de `api/cliente.js` (Task 4).
- Produces: `<ProveedorSesion>`, el hook `useSesion()` → `{ usuario, cargando, cerrarSesion }`, y `<RutaProtegida>`. La Task 7 los monta en `App.jsx`.

- [ ] **Step 1: Escribir el test**

Create: `vinalert-front/src/sesion/sesion.test.jsx`

```jsx
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';

import { LLAVE_TOKEN } from '../api/cliente';
import { USUARIO } from '../test/respuestas';
import { ProveedorSesion, useSesion } from './SesionContext';
import RutaProtegida from './RutaProtegida';

vi.mock('../api/auth', () => ({ me: vi.fn() }));
import { me } from '../api/auth';

function Privado() {
  const { usuario } = useSesion();
  return <p>hola {usuario.nombre}</p>;
}

function montar() {
  return render(
    <MemoryRouter initialEntries={['/privado']}>
      <ProveedorSesion>
        <Routes>
          <Route path="/login" element={<p>pantalla de login</p>} />
          <Route
            path="/privado"
            element={<RutaProtegida><Privado /></RutaProtegida>}
          />
        </Routes>
      </ProveedorSesion>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

test('con token valido, carga el usuario y deja pasar', async () => {
  localStorage.setItem(LLAVE_TOKEN, 'valido');
  me.mockResolvedValue(USUARIO);

  montar();

  expect(await screen.findByText('hola Test User')).toBeInTheDocument();
});

test('sin token, no llama a la API y manda al login', async () => {
  montar();

  expect(await screen.findByText('pantalla de login')).toBeInTheDocument();
  expect(me).not.toHaveBeenCalled();
});

test('no redirige mientras la sesion se esta resolviendo', async () => {
  localStorage.setItem(LLAVE_TOKEN, 'valido');
  let resolver;
  me.mockReturnValue(new Promise((r) => { resolver = r; }));

  montar();

  // Con la promesa aun sin resolver, no puede haber decidido nada todavia:
  // redirigir aqui produciria un parpadeo al login en cada carga de pagina.
  expect(screen.queryByText('pantalla de login')).not.toBeInTheDocument();
  expect(screen.queryByText('hola Test User')).not.toBeInTheDocument();

  resolver(USUARIO);
  expect(await screen.findByText('hola Test User')).toBeInTheDocument();
});

test('si /auth/me falla, limpia el token y manda al login', async () => {
  localStorage.setItem(LLAVE_TOKEN, 'basura');
  me.mockRejectedValue(new Error('401'));

  montar();

  expect(await screen.findByText('pantalla de login')).toBeInTheDocument();
  await waitFor(() => expect(localStorage.getItem(LLAVE_TOKEN)).toBeNull());
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npm test`
Expected: FAIL — no existen `./SesionContext` ni `./RutaProtegida`.

- [ ] **Step 3: Escribir el contexto**

Create: `vinalert-front/src/sesion/SesionContext.jsx`

```jsx
import { createContext, useContext, useEffect, useState } from 'react';

import { sesion } from '../api/cliente';
import { me } from '../api/auth';

const SesionContext = createContext(null);

export function ProveedorSesion({ children }) {
  const [usuario, setUsuario] = useState(null);
  // Empieza en true solo si hay token que resolver. Sin token no hay nada que
  // esperar y podemos decidir de inmediato.
  const [cargando, setCargando] = useState(Boolean(sesion.leerToken()));

  useEffect(() => {
    if (!sesion.leerToken()) return;

    let vigente = true;
    me()
      .then((u) => { if (vigente) setUsuario(u); })
      .catch(() => { sesion.limpiar(); })
      .finally(() => { if (vigente) setCargando(false); });

    return () => { vigente = false; };
  }, []);

  const cerrarSesion = () => {
    sesion.limpiar();
    setUsuario(null);
  };

  return (
    <SesionContext.Provider value={{ usuario, cargando, setUsuario, cerrarSesion }}>
      {children}
    </SesionContext.Provider>
  );
}

export function useSesion() {
  const valor = useContext(SesionContext);
  if (valor === null) {
    throw new Error('useSesion debe usarse dentro de <ProveedorSesion>');
  }
  return valor;
}
```

- [ ] **Step 4: Escribir la ruta protegida**

Create: `vinalert-front/src/sesion/RutaProtegida.jsx`

```jsx
import { Navigate, useLocation } from 'react-router-dom';

import { useSesion } from './SesionContext';

export default function RutaProtegida({ children }) {
  const { usuario, cargando } = useSesion();
  const location = useLocation();

  // Mientras no sepamos quien eres no decidimos nada: redirigir aqui haria
  // parpadear el login en cada carga de pagina.
  if (cargando) return <p className="p-8 text-slate-400">Cargando…</p>;

  if (!usuario) {
    return <Navigate to="/login" replace state={{ destino: location.pathname }} />;
  }
  return children;
}
```

- [ ] **Step 5: Borrar la ruta protegida vieja**

Delete: `vinalert-front/src/components/ProtectedRoute.jsx`

Solo comprobaba que existiera una cadena en `localStorage`, no que valiera.

- [ ] **Step 6: Ejecutar los tests**

Run: `npm test`
Expected: 10 passed.

- [ ] **Step 7: Commit**

```bash
git add vinalert-front/src/sesion/
git rm vinalert-front/src/components/ProtectedRoute.jsx
git commit -m "feat: contexto de sesion que sabe quien eres"
```

---

## Task 6: Contexto de parcela, permiso declarativo y errores

**Files:**
- Create: `vinalert-front/src/parcela/ParcelaContext.jsx`, `vinalert-front/src/parcela/SoloGestor.jsx`
- Create: `vinalert-front/src/errores/MensajeError.jsx`
- Create: `vinalert-front/src/parcela/parcela.test.jsx`, `vinalert-front/src/errores/MensajeError.test.jsx`

**Interfaces:**
- Consumes: `obtenerParcela(id)` de `api/parcelas.js` (Task 4).
- Produces: `<ProveedorParcela parcelaId>`, el hook `useParcela()` → `{ parcela, puedeGestionar, cargando, error }`, `<SoloGestor>` y `<MensajeError error>`. La Task 7 los monta.

- [ ] **Step 1: Escribir los tests**

Create: `vinalert-front/src/parcela/parcela.test.jsx`

```jsx
import { render, screen } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';

import { PARCELA_GESTOR, PARCELA_LECTURA } from '../test/respuestas';
import { ProveedorParcela, useParcela } from './ParcelaContext';
import SoloGestor from './SoloGestor';

vi.mock('../api/parcelas', () => ({ obtenerParcela: vi.fn() }));
import { obtenerParcela } from '../api/parcelas';

function Pantalla() {
  const { parcela } = useParcela();
  return (
    <div>
      <p>{parcela.nombre}</p>
      <SoloGestor><button type="button">Editar parcela</button></SoloGestor>
    </div>
  );
}

function montar() {
  return render(
    <ProveedorParcela parcelaId={1}><Pantalla /></ProveedorParcela>,
  );
}

beforeEach(() => vi.clearAllMocks());

test('un gestor ve la accion de gestion', async () => {
  obtenerParcela.mockResolvedValue(PARCELA_GESTOR);

  montar();

  expect(await screen.findByText('Parcela Test')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Editar parcela' })).toBeInTheDocument();
});

test('un lector NO ve la accion de gestion', async () => {
  obtenerParcela.mockResolvedValue(PARCELA_LECTURA);

  montar();

  expect(await screen.findByText('Compartida')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Editar parcela' })).not.toBeInTheDocument();
});

test('el permiso sale de mi_rol, no de adivinarlo', async () => {
  // La trampa: misma parcela, mismo todo, solo cambia mi_rol. Si el permiso
  // se dedujera de otra cosa, este test no distinguiria los dos casos.
  obtenerParcela.mockResolvedValue({ ...PARCELA_GESTOR, mi_rol: 'lectura' });

  montar();

  expect(await screen.findByText('Parcela Test')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Editar parcela' })).not.toBeInTheDocument();
});
```

Create: `vinalert-front/src/errores/MensajeError.test.jsx`

```jsx
import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import MensajeError from './MensajeError';

function errorHttp(status, detail) {
  return { response: { status, data: detail === undefined ? {} : { detail } } };
}

test('403 explica que es un problema de permiso', () => {
  render(<MensajeError error={errorHttp(403)} />);
  expect(screen.getByText(/permiso/i)).toBeInTheDocument();
});

test('409 muestra el mensaje que manda la API', () => {
  // Los 409 del backend traen textos escritos para el usuario.
  render(<MensajeError error={errorHttp(409, 'No puedes dejar la parcela sin ningun gestor.')} />);
  expect(screen.getByText('No puedes dejar la parcela sin ningun gestor.')).toBeInTheDocument();
});

test('404 usa el texto que le da la pantalla', () => {
  render(<MensajeError error={errorHttp(404)} textoNoEncontrado="Ese sensor ya no existe." />);
  expect(screen.getByText('Ese sensor ya no existe.')).toBeInTheDocument();
});

test('422 lista los campos que fallan', () => {
  const error = {
    response: {
      status: 422,
      data: { detail: [{ loc: ['body', 'latitud'], msg: 'Input should be less than or equal to 90' }] },
    },
  };
  render(<MensajeError error={error} />);
  expect(screen.getByText(/latitud/)).toBeInTheDocument();
});

test('un fallo de red lo dice', () => {
  render(<MensajeError error={{ request: {} }} />);
  expect(screen.getByText(/no se pudo contactar/i)).toBeInTheDocument();
});

test('sin error no pinta nada', () => {
  const { container } = render(<MensajeError error={null} />);
  expect(container).toBeEmptyDOMElement();
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npm test`
Expected: FAIL — no existen los módulos.

- [ ] **Step 3: Escribir el contexto de parcela**

Create: `vinalert-front/src/parcela/ParcelaContext.jsx`

```jsx
import { createContext, useContext, useEffect, useState } from 'react';

import { obtenerParcela } from '../api/parcelas';

const ParcelaContext = createContext(null);

export function ProveedorParcela({ parcelaId, children }) {
  const [parcela, setParcela] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    obtenerParcela(parcelaId)
      .then((p) => { if (vigente) { setParcela(p); setError(null); } })
      .catch((e) => { if (vigente) setError(e); })
      .finally(() => { if (vigente) setCargando(false); });

    return () => { vigente = false; };
  }, [parcelaId]);

  // El permiso sale de mi_rol y de nada mas. Deducirlo de otra cosa —del rol
  // global, de si eres el creador— seria adivinar, y adivinar mal significa
  // ensenar botones que devuelven 403.
  const puedeGestionar = parcela?.mi_rol === 'gestor';

  return (
    <ParcelaContext.Provider value={{ parcela, puedeGestionar, cargando, error, setParcela }}>
      {cargando ? <p className="p-8 text-slate-400">Cargando parcela…</p> : children}
    </ParcelaContext.Provider>
  );
}

export function useParcela() {
  const valor = useContext(ParcelaContext);
  if (valor === null) {
    throw new Error('useParcela debe usarse dentro de <ProveedorParcela>');
  }
  return valor;
}
```

- [ ] **Step 4: Escribir el permiso declarativo**

Create: `vinalert-front/src/parcela/SoloGestor.jsx`

```jsx
import { useParcela } from './ParcelaContext';

/**
 * Envuelve lo que requiere permiso de gestion. Las pantallas DECLARAN lo que
 * necesitan en vez de comparar cadenas por ahi: si manana aparece un tercer
 * rol, se cambia aqui y en ningun sitio mas.
 *
 * Oculta, no desactiva: un boton inhabilitado invita a preguntar por que, y la
 * respuesta no va a cambiar mientras no le cambien el rol al usuario.
 */
export default function SoloGestor({ children }) {
  const { puedeGestionar } = useParcela();
  return puedeGestionar ? children : null;
}
```

- [ ] **Step 5: Escribir la traducción de errores**

Create: `vinalert-front/src/errores/MensajeError.jsx`

```jsx
/**
 * Traduce un error de axios a algo que una persona entienda.
 *
 * El backend distingue los codigos a proposito: 403 es "no puedes", 404 es "no
 * existe o no es tuyo", 409 trae un texto ya escrito para el usuario, y 422 son
 * errores de validacion campo a campo. El 401 no llega aqui: lo captura el
 * interceptor del cliente.
 */
export default function MensajeError({ error, textoNoEncontrado = 'No se ha encontrado.' }) {
  if (!error) return null;

  const status = error.response?.status;
  const detail = error.response?.data?.detail;

  let texto;
  if (status === 403) {
    texto = 'No tienes permiso para hacer esto en esta parcela.';
  } else if (status === 404) {
    texto = textoNoEncontrado;
  } else if (status === 409) {
    texto = typeof detail === 'string' ? detail : 'La operacion entra en conflicto con el estado actual.';
  } else if (status === 422) {
    const campos = Array.isArray(detail)
      ? detail.map((d) => `${d.loc?.[d.loc.length - 1]}: ${d.msg}`)
      : [];
    texto = campos.length ? campos.join(' · ') : 'Hay datos que no son validos.';
  } else if (error.response) {
    texto = 'El servidor ha devuelto un error inesperado.';
  } else {
    texto = 'No se pudo contactar con el servidor.';
  }

  return (
    <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
      {texto}
    </p>
  );
}
```

- [ ] **Step 6: Ejecutar los tests**

Run: `npm test`
Expected: 19 passed.

- [ ] **Step 7: Commit**

```bash
git add vinalert-front/src/parcela/ vinalert-front/src/errores/
git commit -m "feat: contexto de parcela con el permiso dentro y traduccion de errores"
```

---

## Task 7: Estructura, rutas y pantallas

**Files:**
- Create: `vinalert-front/src/layout/AppLayout.jsx`, `vinalert-front/src/layout/Navegacion.jsx`
- Create: `vinalert-front/src/pantallas/Login.jsx`, `vinalert-front/src/pantallas/SeleccionParcela.jsx`, `vinalert-front/src/pantallas/Seccion.jsx`
- Modify: `vinalert-front/src/App.jsx`, `vinalert-front/src/main.jsx`
- Create: `vinalert-front/src/pantallas/rutas.test.jsx`
- Delete: `vinalert-front/src/components/` entero (`Dashboard.jsx`, `LoginPage.jsx`, `SeleccionParcelasPage.jsx`, `sections/`)

**Interfaces:**
- Consumes: todo lo de las Tasks 4, 5 y 6.
- Produces: la aplicación navegable. D2, D3 y D4 rellenan las secciones.

- [ ] **Step 1: Escribir el test**

Create: `vinalert-front/src/pantallas/rutas.test.jsx`

```jsx
import { render, screen } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';

import { LLAVE_TOKEN } from '../api/cliente';
import { PARCELA_GESTOR, PARCELA_LECTURA, USUARIO } from '../test/respuestas';
import App from '../App';

vi.mock('../api/auth', () => ({ me: vi.fn(), login: vi.fn() }));
vi.mock('../api/parcelas', () => ({ listarParcelas: vi.fn(), obtenerParcela: vi.fn() }));
import { me } from '../api/auth';
import { listarParcelas, obtenerParcela } from '../api/parcelas';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/');
});

test('sin sesion se ve el login', async () => {
  render(<App />);
  expect(await screen.findByRole('heading', { name: /acceso/i })).toBeInTheDocument();
});

test('con una sola parcela se entra directo, sin pantalla de seleccion', async () => {
  localStorage.setItem(LLAVE_TOKEN, 'valido');
  me.mockResolvedValue(USUARIO);
  listarParcelas.mockResolvedValue([PARCELA_GESTOR]);
  obtenerParcela.mockResolvedValue(PARCELA_GESTOR);

  render(<App />);

  expect(await screen.findByText('Parcela Test')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: /elige una parcela/i })).not.toBeInTheDocument();
});

test('con varias parcelas aparece la seleccion', async () => {
  localStorage.setItem(LLAVE_TOKEN, 'valido');
  me.mockResolvedValue(USUARIO);
  listarParcelas.mockResolvedValue([PARCELA_GESTOR, PARCELA_LECTURA]);

  render(<App />);

  expect(await screen.findByRole('heading', { name: /elige una parcela/i })).toBeInTheDocument();
  expect(screen.getByText('Compartida')).toBeInTheDocument();
});

test('la seleccion marca las parcelas en las que solo puedes leer', async () => {
  localStorage.setItem(LLAVE_TOKEN, 'valido');
  me.mockResolvedValue(USUARIO);
  listarParcelas.mockResolvedValue([PARCELA_GESTOR, PARCELA_LECTURA]);

  render(<App />);

  expect(await screen.findByText(/solo lectura/i)).toBeInTheDocument();
});

test('el login avisa cuando la sesion ha caducado', async () => {
  window.history.replaceState({}, '', '/login?motivo=sesion_caducada');

  render(<App />);

  expect(await screen.findByText(/ha caducado/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npm test`
Expected: FAIL — `App` todavía importa los componentes viejos.

- [ ] **Step 3: Escribir el layout**

Create: `vinalert-front/src/layout/Navegacion.jsx`

```jsx
import { NavLink } from 'react-router-dom';

export const SECCIONES = [
  { ruta: 'estado', etiqueta: 'Estado' },
  { ruta: 'analisis', etiqueta: 'Análisis' },
  { ruta: 'tratamientos', etiqueta: 'Tratamientos' },
  { ruta: 'foliar', etiqueta: 'Foliar' },
  { ruta: 'sensores', etiqueta: 'Sensores' },
  { ruta: 'miembros', etiqueta: 'Acceso' },
  { ruta: 'configuracion', etiqueta: 'Configuración' },
];

export default function Navegacion({ parcelaId }) {
  return (
    <nav className="flex flex-col gap-1">
      {SECCIONES.map((s) => (
        <NavLink
          key={s.ruta}
          to={`/p/${parcelaId}/${s.ruta}`}
          className={({ isActive }) =>
            `rounded-lg px-3 py-2 text-sm transition ${
              isActive ? 'bg-cyan-500/15 text-cyan-300' : 'text-slate-400 hover:bg-slate-800/60'
            }`
          }
        >
          {s.etiqueta}
        </NavLink>
      ))}
    </nav>
  );
}
```

Create: `vinalert-front/src/layout/AppLayout.jsx`

```jsx
import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router-dom';

import { listarParcelas } from '../api/parcelas';
import { useParcela } from '../parcela/ParcelaContext';
import { useSesion } from '../sesion/SesionContext';
import Navegacion from './Navegacion';

export default function AppLayout() {
  const { parcelaId } = useParams();
  const { parcela } = useParcela();
  const { usuario, cerrarSesion } = useSesion();
  const navigate = useNavigate();

  // El cambiador solo tiene sentido si hay mas de una parcela. Esta consulta
  // vive AQUI y no en App a proposito: App envuelve tambien al login, y pedir
  // parcelas sin sesion dispararia un 401 que el interceptor convertiria en
  // una redireccion al login... estando ya en el login.
  const [variasParcelas, setVariasParcelas] = useState(false);
  useEffect(() => {
    let vigente = true;
    listarParcelas()
      .then((p) => { if (vigente) setVariasParcelas(p.length > 1); })
      .catch(() => {});
    return () => { vigente = false; };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex max-w-7xl gap-6 px-6 py-6">
        <aside className="w-56 shrink-0">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Parcela</p>
          <h1 className="mt-1 text-lg font-semibold">{parcela.nombre}</h1>
          {parcela.mi_rol === 'lectura' && (
            <p className="mt-1 text-xs text-slate-500">Solo lectura</p>
          )}
          {variasParcelas && (
            <button
              type="button"
              onClick={() => navigate('/parcelas')}
              className="mt-2 text-xs text-slate-400 underline hover:text-slate-200"
            >
              Cambiar de parcela
            </button>
          )}

          <div className="mt-6">
            <Navegacion parcelaId={parcelaId} />
          </div>

          <div className="mt-8 border-t border-slate-800 pt-4">
            <p className="text-xs text-slate-500">{usuario.nombre}</p>
            <button
              type="button"
              onClick={() => { cerrarSesion(); navigate('/login'); }}
              className="mt-1 text-xs text-slate-400 underline hover:text-slate-200"
            >
              Cerrar sesión
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Escribir las pantallas**

Create: `vinalert-front/src/pantallas/Seccion.jsx`

```jsx
/** Marcador de las secciones que llenan D2, D3 y D4. */
export default function Seccion({ titulo, descripcion }) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-slate-50">{titulo}</h2>
      <p className="mt-2 max-w-xl text-sm text-slate-400">{descripcion}</p>
      <p className="mt-6 rounded-lg border border-dashed border-slate-700 px-4 py-8 text-center text-sm text-slate-500">
        Todavía no construido.
      </p>
    </section>
  );
}
```

Create: `vinalert-front/src/pantallas/Login.jsx`

```jsx
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { login, me } from '../api/auth';
import MensajeError from '../errores/MensajeError';
import { useSesion } from '../sesion/SesionContext';

export default function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { setUsuario } = useSesion();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  const caducada = params.get('motivo') === 'sesion_caducada';
  const destino = params.get('destino');

  const enviar = async (e) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await login(email, password);
      setUsuario(await me());
      navigate(destino || '/', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
        <h1 className="text-xl font-semibold text-slate-50">Acceso a VinAlert</h1>
        {caducada && (
          <p className="mt-2 text-sm text-amber-300">
            Tu sesión ha caducado. Vuelve a entrar y seguimos donde estabas.
          </p>
        )}
        <form className="mt-4 space-y-4" onSubmit={enviar}>
          <div>
            <label htmlFor="email" className="block text-xs font-medium text-slate-300">Email</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-xs font-medium text-slate-300">Contraseña</label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400"
            />
          </div>
          <MensajeError error={error} textoNoEncontrado="Email o contraseña incorrectos." />
          <button
            type="submit"
            disabled={enviando}
            className="w-full rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-60"
          >
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

Create: `vinalert-front/src/pantallas/SeleccionParcela.jsx`

```jsx
import { useNavigate } from 'react-router-dom';

export default function SeleccionParcela({ parcelas }) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-semibold">Elige una parcela</h1>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {parcelas.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => navigate(`/p/${p.id}`)}
              className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 text-left hover:border-cyan-500/50"
            >
              <p className="text-lg font-semibold">{p.nombre}</p>
              {p.variedad && (
                <p className="mt-1 text-xs text-slate-400">{p.tipo_cultivo} · {p.variedad}</p>
              )}
              {p.mi_rol === 'lectura' && (
                <p className="mt-2 text-xs text-slate-500">Solo lectura</p>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Reescribir `App.jsx`**

Reemplaza `vinalert-front/src/App.jsx` entero por:

```jsx
import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';

import { listarParcelas } from './api/parcelas';
import AppLayout from './layout/AppLayout';
import { ProveedorParcela } from './parcela/ParcelaContext';
import Login from './pantallas/Login';
import Seccion from './pantallas/Seccion';
import SeleccionParcela from './pantallas/SeleccionParcela';
import RutaProtegida from './sesion/RutaProtegida';
import { ProveedorSesion } from './sesion/SesionContext';

const SECCIONES = [
  { ruta: 'estado', titulo: 'Estado', descripcion: 'Cómo está la parcela ahora mismo: humedad y temperatura del suelo, tiempo actual y últimas lecturas.' },
  { ruta: 'analisis', titulo: 'Análisis', descripcion: 'Cruzar variables en el tiempo: lo que miden tus sensores contra la lluvia, la ET₀ o la radiación, con los tratamientos marcados encima.' },
  { ruta: 'tratamientos', titulo: 'Tratamientos', descripcion: 'El cuaderno: qué se aplicó, cuándo y con qué tiempo hacía.' },
  { ruta: 'foliar', titulo: 'Foliar', descripcion: 'Lecturas del sensor foliar y subida de su Excel.' },
  { ruta: 'sensores', titulo: 'Sensores', descripcion: 'Cuántos hay, dónde está cada uno y a qué profundidad.' },
  { ruta: 'miembros', titulo: 'Acceso', descripcion: 'Quién puede ver y gestionar esta parcela.' },
  { ruta: 'configuracion', titulo: 'Configuración', descripcion: 'Datos de la parcela y sus coordenadas.' },
];

function ParcelaLayout() {
  const { parcelaId } = useParams();
  return (
    <ProveedorParcela parcelaId={parcelaId}>
      <AppLayout />
    </ProveedorParcela>
  );
}

function Entrada() {
  const [parcelas, setParcelas] = useState(null);

  useEffect(() => {
    let vigente = true;
    listarParcelas()
      .then((p) => { if (vigente) setParcelas(p); })
      .catch(() => { if (vigente) setParcelas([]); });
    return () => { vigente = false; };
  }, []);

  if (parcelas === null) return <p className="p-8 text-slate-400">Cargando parcelas…</p>;
  if (parcelas.length === 0) {
    return <p className="p-8 text-slate-400">Todavía no tienes ninguna parcela.</p>;
  }
  // Con una sola —el caso normal— entrar lleva directo a ella.
  if (parcelas.length === 1) return <Navigate to={`/p/${parcelas[0].id}`} replace />;

  return <SeleccionParcela parcelas={parcelas} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ProveedorSesion>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RutaProtegida><Entrada /></RutaProtegida>} />
          <Route path="/parcelas" element={<RutaProtegida><Entrada /></RutaProtegida>} />
          <Route
            path="/p/:parcelaId"
            element={<RutaProtegida><ParcelaLayout /></RutaProtegida>}
          >
            <Route index element={<Navigate to="estado" replace />} />
            {SECCIONES.map((s) => (
              <Route
                key={s.ruta}
                path={s.ruta}
                element={<Seccion titulo={s.titulo} descripcion={s.descripcion} />}
              />
            ))}
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ProveedorSesion>
    </BrowserRouter>
  );
}
```

- [ ] **Step 6: Borrar los componentes viejos**

```bash
git rm -r vinalert-front/src/components
```

Se van `Dashboard.jsx`, `LoginPage.jsx`, `SeleccionParcelasPage.jsx` y `sections/` (con `MildiuSection.jsx` y `RiegoSection.jsx`, muertos desde que se retiraron sus motores).

- [ ] **Step 7: Ejecutar los tests**

Run: `npm test`
Expected: 24 passed.

- [ ] **Step 8: Comprobar que la aplicación compila**

Run desde `vinalert-front/`: `npm run build`
Expected: build correcto, sin imports rotos. Es lo que confirma que el tramo sin compilar abierto en la Task 4 queda cerrado.

- [ ] **Step 9: Commit**

```bash
git add vinalert-front/src/
git commit -m "feat: estructura, rutas y pantallas de los cimientos de la web"
```

---

## Verificación final

- [ ] `pytest` completo en verde desde la raíz, sin argumentos ni exclusiones.
- [ ] `npm test` en verde desde `vinalert-front/`.
- [ ] `npm run build` sin errores.
- [ ] `grep -rn "components/" vinalert-front/src/` no devuelve nada: no quedan referencias a los componentes borrados.
- [ ] `tests/test_matriz_permisos.py` sigue pasando sin cambios: este plan no añade endpoints con ámbito de parcela.

## Fuera de este plan

- Las pantallas de contenido: configuración (D2), estado y registro (D3), análisis (D4).
- El móvil.
- Tokens de refresco.

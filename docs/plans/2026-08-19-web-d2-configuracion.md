# Pantallas de configuración (D2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Llenar las tres secciones de configuración de la web que D1 dejó vacías — datos de la parcela con la sonda de coordenadas, sensores, y acceso (miembros) — usando el backend que ya existe completo.

**Architecture:** Tres pantallas independientes bajo `vinalert-front/src/pantallas/`, cada una con su propio módulo `api/*.js` de funciones finas sobre `cliente` (sin hook de fetching compartido: cada pantalla pide su lista con `useEffect`/`useState`, igual que ya hace `ParcelaContext`). Las mutaciones actualizan el estado local a partir de la respuesta del backend, sin volver a pedir la lista aparte. `App.jsx` gana un mapa `PANTALLAS` que sustituye el marcador `<Seccion>` por el componente real cuando existe uno.

**Tech Stack:** React 19, Vite 7, Tailwind 4, react-router 7, axios, Vitest, Testing Library — mismo stack que D1, sin dependencias nuevas.

**Spec:** `docs/specs/2026-08-19-web-d2-configuracion-design.md`

## Global Constraints

- **Sin mapa interactivo.** Las coordenadas (parcela y sensores) se escriben en dos campos numéricos, latitud y longitud. Queda para otro sub-proyecto.
- **Aprovisionar sensores es la única vía de alta**, por cantidad (`POST /provisionar`). No hay formulario de alta individual.
- **`POST /provisionar` devuelve la lista COMPLETA de sensores de la parcela**, no solo los nuevos — la pantalla reemplaza su estado local con la respuesta, nunca concatena.
- **Sin componente `ConfirmarAccion` genérico.** Solo retirar un miembro es destructivo; usa `window.confirm()` nativo.
- **Desactivar un sensor no pide confirmación** — no borra nada, es reversible (decisión ya tomada en el sub-proyecto C).
- **La lista de miembros es visible para cualquier miembro de la parcela**; los controles de gestión (añadir, cambiar rol, retirar) solo para gestores, ocultos con `<SoloGestor>` y NUNCA solo deshabilitados.
- **El formulario de configuración de parcela es la excepción**: se muestra completo mientras haya sesión de lectura, pero con los campos deshabilitados — es información útil verla, a diferencia de un botón de acción.
- **La sonda de coordenadas (`GET /parcelas/{id}/clima/comprobar`) se deshabilita si hay cambios de latitud/longitud sin guardar** — el endpoint mira lo que ya está en la base de datos, no el formulario.
- **Una única zona de error por pantalla**, no error por fila; se limpia en cada reintento.
- **La suite de frontend debe quedar verde**: `npm test` en `vinalert-front/`. Hoy está en 31 tests, 7 ficheros.
- **La suite de backend no cambia**: este plan no toca el backend en absoluto. `pytest` debe seguir en verde tal cual está (255 tests o los que haya en `main`), pero ningún test nuevo se añade ahí.
- Los valores de rol son exactamente `"gestor"` y `"lectura"` (los únicos que puede traer `mi_rol` o el rol de un miembro).

## Orden y por qué

Las tres pantallas son independientes entre sí — ninguna consume nada de otra. Se implementan en el orden del spec (Configuración, Sensores, Miembros) por ser el orden en que aparecen en la barra lateral, no por dependencia real. Cada tarea añade una entrada al mapa `PANTALLAS` de `App.jsx` que introduce la Task 1; las Tasks 2 y 3 solo le añaden una línea.

---

## Task 1: Pantalla de configuración de la parcela

**Files:**
- Modify: `vinalert-front/src/api/parcelas.js`
- Modify: `vinalert-front/src/App.jsx`
- Create: `vinalert-front/src/pantallas/Configuracion.jsx`
- Test: `vinalert-front/src/pantallas/Configuracion.test.jsx`

**Interfaces:**
- Consumes: `useParcela()` de `../parcela/ParcelaContext` → `{ parcela, puedeGestionar, setParcela }` (de D1; `parcela` trae los 17 campos de `ParcelaResp` más `id` y `mi_rol`). `<SoloGestor>` de `../parcela/SoloGestor` (D1). `<MensajeError error textoNoEncontrado>` de `../errores/MensajeError` (D1).
- Produces: `editarParcela(id, cambios)` → `PATCH /parcelas/{id}`, y `comprobarClima(id)` → `GET /parcelas/{id}/clima/comprobar`, ambas en `api/parcelas.js`. El mapa `PANTALLAS` en `App.jsx`, que las Tasks 2 y 3 amplían con sus propias entradas.

- [ ] **Step 1: Escribir el test**

Create: `vinalert-front/src/pantallas/Configuracion.test.jsx`

```jsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';

import { PARCELA_GESTOR, PARCELA_LECTURA } from '../test/respuestas';
import { ProveedorParcela } from '../parcela/ParcelaContext';
import Configuracion from './Configuracion';

vi.mock('../api/parcelas', () => ({
  obtenerParcela: vi.fn(),
  editarParcela: vi.fn(),
  comprobarClima: vi.fn(),
}));
import { comprobarClima, editarParcela, obtenerParcela } from '../api/parcelas';

function montar(parcela) {
  obtenerParcela.mockResolvedValue(parcela);
  return render(
    <ProveedorParcela parcelaId={parcela.id}><Configuracion /></ProveedorParcela>,
  );
}

beforeEach(() => vi.clearAllMocks());

test('un gestor ve los datos y puede guardar', async () => {
  editarParcela.mockResolvedValue({ ...PARCELA_GESTOR, nombre: 'Parcela Nueva' });
  montar(PARCELA_GESTOR);

  const nombre = await screen.findByLabelText('Nombre');
  expect(nombre).toHaveValue('Parcela Test');
  expect(nombre).not.toBeDisabled();

  await userEvent.clear(nombre);
  await userEvent.type(nombre, 'Parcela Nueva');
  await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

  await waitFor(() => expect(editarParcela).toHaveBeenCalledWith(
    1,
    expect.objectContaining({ nombre: 'Parcela Nueva' }),
  ));
});

test('un lector ve el formulario pero no puede tocarlo', async () => {
  montar(PARCELA_LECTURA);

  const nombre = await screen.findByLabelText('Nombre');
  expect(nombre).toHaveValue('Compartida');
  expect(nombre).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Comprobar estas coordenadas' })).not.toBeInTheDocument();
});

test('un error al guardar se traduce con MensajeError', async () => {
  editarParcela.mockRejectedValue({
    response: {
      status: 422,
      data: { detail: [{ loc: ['body', 'latitud'], msg: 'Input should be less than or equal to 90' }] },
    },
  });
  montar(PARCELA_GESTOR);

  await screen.findByLabelText('Nombre');
  await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

  expect(await screen.findByText(/latitud/)).toBeInTheDocument();
});

test('la sonda se deshabilita si hay coordenadas sin guardar', async () => {
  montar(PARCELA_GESTOR);

  const latitud = await screen.findByLabelText('Latitud');
  const boton = screen.getByRole('button', { name: 'Comprobar estas coordenadas' });
  expect(boton).not.toBeDisabled();

  await userEvent.clear(latitud);
  await userEvent.type(latitud, '43');

  expect(boton).toBeDisabled();
  expect(screen.getByText(/guarda antes de comprobar/i)).toBeInTheDocument();
});

test('la sonda muestra el resultado de comprobar', async () => {
  comprobarClima.mockResolvedValue({ disponible: false, latitud: 42.31, longitud: -8.61, motivo: 'El proveedor no respondio.' });
  montar(PARCELA_GESTOR);

  await screen.findByLabelText('Nombre');
  await userEvent.click(screen.getByRole('button', { name: 'Comprobar estas coordenadas' }));

  expect(comprobarClima).toHaveBeenCalledWith(1);
  expect(await screen.findByText('El proveedor no respondio.')).toBeInTheDocument();
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd vinalert-front && npm test`
Expected: FAIL — `./Configuracion` no existe y `editarParcela`/`comprobarClima` no se exportan de `api/parcelas.js`.

- [ ] **Step 3: Añadir las funciones al cliente de API**

Modify: `vinalert-front/src/api/parcelas.js` — añadir al final del fichero (que ya tiene `listarParcelas` y `obtenerParcela`):

```js
export async function editarParcela(id, cambios) {
  const { data } = await cliente.patch(`/parcelas/${id}`, cambios);
  return data;
}

export async function comprobarClima(id) {
  const { data } = await cliente.get(`/parcelas/${id}/clima/comprobar`);
  return data;
}
```

- [ ] **Step 4: Escribir la pantalla**

Create: `vinalert-front/src/pantallas/Configuracion.jsx`

```jsx
import { useState } from 'react';

import { comprobarClima, editarParcela } from '../api/parcelas';
import MensajeError from '../errores/MensajeError';
import { useParcela } from '../parcela/ParcelaContext';
import SoloGestor from '../parcela/SoloGestor';

// Los 17 campos de ParcelaUpdate (app/schemas.py), agrupados como en el spec.
const CAMPOS_TEXTO = ['nombre', 'tipo_cultivo', 'variedad'];
const CAMPOS_NUMERO = [
  'superficie_total_m2', 'cobertura_cultivo_pct', 'porcentaje_cobertura_suelo',
  'profundidad_raices_cm', 'umbral_humedad_critico_pct', 'capacidad_campo_suelo', 'kc_actual',
  'distancia_filas_m', 'distancia_plantas_m', 'caudal_gotero_lph', 'num_goteros_planta',
  'eficiencia_riego_pct', 'latitud', 'longitud',
];

function aFormulario(parcela) {
  const datos = {};
  for (const campo of [...CAMPOS_TEXTO, ...CAMPOS_NUMERO]) datos[campo] = parcela[campo] ?? null;
  return datos;
}

function CampoTexto({ etiqueta, valor, onChange, disabled, requerido }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-300">{etiqueta}</span>
      <input
        type="text"
        value={valor ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        required={requerido}
        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400 disabled:opacity-60"
      />
    </label>
  );
}

function CampoNumero({ etiqueta, valor, onChange, disabled, min, max }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-300">{etiqueta}</span>
      <input
        type="number"
        step="any"
        min={min}
        max={max}
        value={valor ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        disabled={disabled}
        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400 disabled:opacity-60"
      />
    </label>
  );
}

export default function Configuracion() {
  const { parcela, puedeGestionar, setParcela } = useParcela();
  const [campos, setCampos] = useState(() => aFormulario(parcela));
  const [coordenadasGuardadas, setCoordenadasGuardadas] = useState({
    latitud: parcela.latitud ?? null,
    longitud: parcela.longitud ?? null,
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [sonda, setSonda] = useState(null);
  const [comprobando, setComprobando] = useState(false);

  const cambiar = (campo) => (valor) => {
    setCampos((c) => ({ ...c, [campo]: valor }));
    setSonda(null);
  };

  const coordenadasSinGuardar =
    campos.latitud !== coordenadasGuardadas.latitud || campos.longitud !== coordenadasGuardadas.longitud;

  const guardar = async (e) => {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      const actualizada = await editarParcela(parcela.id, campos);
      setParcela(actualizada);
      setCoordenadasGuardadas({ latitud: actualizada.latitud ?? null, longitud: actualizada.longitud ?? null });
    } catch (err) {
      setError(err);
    } finally {
      setGuardando(false);
    }
  };

  const comprobar = async () => {
    setError(null);
    setComprobando(true);
    try {
      setSonda(await comprobarClima(parcela.id));
    } catch (err) {
      setError(err);
    } finally {
      setComprobando(false);
    }
  };

  return (
    <section>
      <h2 className="text-xl font-semibold text-slate-50">Configuración</h2>
      <form className="mt-4 space-y-6" onSubmit={guardar}>
        <fieldset className="grid gap-4 sm:grid-cols-3">
          <legend className="mb-2 text-sm font-semibold text-slate-300">Identidad</legend>
          <CampoTexto etiqueta="Nombre" valor={campos.nombre} onChange={cambiar('nombre')} disabled={!puedeGestionar} requerido />
          <CampoTexto etiqueta="Tipo de cultivo" valor={campos.tipo_cultivo} onChange={cambiar('tipo_cultivo')} disabled={!puedeGestionar} />
          <CampoTexto etiqueta="Variedad" valor={campos.variedad} onChange={cambiar('variedad')} disabled={!puedeGestionar} />
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-3">
          <legend className="mb-2 text-sm font-semibold text-slate-300">Agronomía</legend>
          <CampoNumero etiqueta="Superficie total (m²)" valor={campos.superficie_total_m2} onChange={cambiar('superficie_total_m2')} disabled={!puedeGestionar} />
          <CampoNumero etiqueta="Cobertura del cultivo (%)" valor={campos.cobertura_cultivo_pct} onChange={cambiar('cobertura_cultivo_pct')} disabled={!puedeGestionar} />
          <CampoNumero etiqueta="Cobertura del suelo (%)" valor={campos.porcentaje_cobertura_suelo} onChange={cambiar('porcentaje_cobertura_suelo')} disabled={!puedeGestionar} />
          <CampoNumero etiqueta="Profundidad de raíces (cm)" valor={campos.profundidad_raices_cm} onChange={cambiar('profundidad_raices_cm')} disabled={!puedeGestionar} />
          <CampoNumero etiqueta="Umbral de humedad crítico (%)" valor={campos.umbral_humedad_critico_pct} onChange={cambiar('umbral_humedad_critico_pct')} disabled={!puedeGestionar} />
          <CampoNumero etiqueta="Capacidad de campo del suelo" valor={campos.capacidad_campo_suelo} onChange={cambiar('capacidad_campo_suelo')} disabled={!puedeGestionar} />
          <CampoNumero etiqueta="Kc actual" valor={campos.kc_actual} onChange={cambiar('kc_actual')} disabled={!puedeGestionar} />
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-3">
          <legend className="mb-2 text-sm font-semibold text-slate-300">Riego y coordenadas</legend>
          <CampoNumero etiqueta="Distancia entre filas (m)" valor={campos.distancia_filas_m} onChange={cambiar('distancia_filas_m')} disabled={!puedeGestionar} />
          <CampoNumero etiqueta="Distancia entre plantas (m)" valor={campos.distancia_plantas_m} onChange={cambiar('distancia_plantas_m')} disabled={!puedeGestionar} />
          <CampoNumero etiqueta="Caudal de gotero (l/h)" valor={campos.caudal_gotero_lph} onChange={cambiar('caudal_gotero_lph')} disabled={!puedeGestionar} />
          <CampoNumero etiqueta="Nº de goteros por planta" valor={campos.num_goteros_planta} onChange={cambiar('num_goteros_planta')} disabled={!puedeGestionar} />
          <CampoNumero etiqueta="Eficiencia de riego (%)" valor={campos.eficiencia_riego_pct} onChange={cambiar('eficiencia_riego_pct')} disabled={!puedeGestionar} />
          <CampoNumero etiqueta="Latitud" valor={campos.latitud} onChange={cambiar('latitud')} disabled={!puedeGestionar} min={-90} max={90} />
          <CampoNumero etiqueta="Longitud" valor={campos.longitud} onChange={cambiar('longitud')} disabled={!puedeGestionar} min={-180} max={180} />
        </fieldset>

        <MensajeError error={error} textoNoEncontrado="Esta parcela ya no existe." />

        <SoloGestor>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={guardando}
              className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-60"
            >
              {guardando ? 'Guardando…' : 'Guardar cambios'}
            </button>
            <button
              type="button"
              onClick={comprobar}
              disabled={comprobando || coordenadasSinGuardar || campos.latitud == null || campos.longitud == null}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-cyan-500/50 disabled:opacity-40"
            >
              {comprobando ? 'Comprobando…' : 'Comprobar estas coordenadas'}
            </button>
            {coordenadasSinGuardar && (
              <p className="text-xs text-amber-300">Guarda antes de comprobar estas coordenadas.</p>
            )}
          </div>
        </SoloGestor>

        {sonda && !coordenadasSinGuardar && (
          <p className={`text-sm ${sonda.disponible ? 'text-emerald-300' : 'text-amber-300'}`}>
            {sonda.disponible ? 'El proveedor tiene datos para estas coordenadas.' : sonda.motivo}
          </p>
        )}
      </form>
    </section>
  );
}
```

- [ ] **Step 5: Conectar la pantalla en `App.jsx`**

Modify: `vinalert-front/src/App.jsx` — añadir el import y sustituir el `.map` que siempre pinta `<Seccion>` por uno que consulta un mapa de pantallas reales:

```jsx
import Configuracion from './pantallas/Configuracion';
```

(junto a los demás imports de `./pantallas/*`)

```jsx
// Que ruta usa que componente real. Las secciones sin entrada aqui siguen
// mostrando el marcador de Seccion.jsx hasta que D3/D4 las construyan.
const PANTALLAS = {
  configuracion: Configuracion,
};
```

(declarado antes de `export default function App()`)

Y dentro de `<Route path="/p/:parcelaId">`, sustituir:

```jsx
{SECCIONES.map((s) => (
  <Route
    key={s.ruta}
    path={s.ruta}
    element={<Seccion titulo={s.titulo} descripcion={s.descripcion} />}
  />
))}
```

por:

```jsx
{SECCIONES.map((s) => {
  const Pantalla = PANTALLAS[s.ruta];
  return (
    <Route
      key={s.ruta}
      path={s.ruta}
      element={Pantalla ? <Pantalla /> : <Seccion titulo={s.titulo} descripcion={s.descripcion} />}
    />
  );
})}
```

- [ ] **Step 6: Ejecutar los tests**

Run: `cd vinalert-front && npm test`
Expected: todo en verde, `Configuracion.test.jsx` con sus 5 tests pasando y los 31 anteriores sin romperse.

- [ ] **Step 7: Commit**

```bash
git add vinalert-front/src/api/parcelas.js vinalert-front/src/App.jsx vinalert-front/src/pantallas/Configuracion.jsx vinalert-front/src/pantallas/Configuracion.test.jsx
git commit -m "feat: pantalla de configuracion de la parcela con la sonda de coordenadas"
```

---

## Task 2: Pantalla de sensores

**Files:**
- Create: `vinalert-front/src/api/sensores.js`
- Modify: `vinalert-front/src/test/respuestas.js`
- Modify: `vinalert-front/src/App.jsx`
- Create: `vinalert-front/src/pantallas/Sensores.jsx`
- Test: `vinalert-front/src/pantallas/Sensores.test.jsx`

**Interfaces:**
- Consumes: `useParcela()` → `{ parcela, puedeGestionar }` (D1). `<SoloGestor>`, `<MensajeError>` (D1). El mapa `PANTALLAS` de `App.jsx` (Task 1).
- Produces: `listarSensores(parcelaId)`, `provisionarSensores(parcelaId, cantidad)`, `actualizarSensor(parcelaId, sensorId, cambios)` en `api/sensores.js`. Fixtures `SENSOR` y `SENSOR_INACTIVO` en `test/respuestas.js`, que la Task 3 no usa pero queda disponible para quien las necesite después.

- [ ] **Step 1: Añadir las fixtures**

Modify: `vinalert-front/src/test/respuestas.js` — añadir al final:

```js
export const SENSOR = {
  id: 1,
  parcela_id: 1,
  numero: 1,
  etiqueta: 'Nodo 1',
  activo: true,
  profundidad_cm: 30,
  latitud: 42.31,
  longitud: -8.61,
  modelo: 'TEROS 12',
};

export const SENSOR_INACTIVO = {
  ...SENSOR,
  id: 2,
  numero: 2,
  etiqueta: 'Nodo 2',
  activo: false,
  profundidad_cm: null,
  latitud: null,
  longitud: null,
  modelo: null,
};
```

- [ ] **Step 2: Escribir el test de la pantalla**

Create: `vinalert-front/src/pantallas/Sensores.test.jsx`

```jsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';

import { PARCELA_GESTOR, PARCELA_LECTURA, SENSOR, SENSOR_INACTIVO } from '../test/respuestas';
import { ProveedorParcela } from '../parcela/ParcelaContext';
import Sensores from './Sensores';

vi.mock('../api/parcelas', () => ({ obtenerParcela: vi.fn() }));
vi.mock('../api/sensores', () => ({
  listarSensores: vi.fn(),
  provisionarSensores: vi.fn(),
  actualizarSensor: vi.fn(),
}));
import { obtenerParcela } from '../api/parcelas';
import { actualizarSensor, listarSensores, provisionarSensores } from '../api/sensores';

function montar(parcela) {
  obtenerParcela.mockResolvedValue(parcela);
  return render(
    <ProveedorParcela parcelaId={parcela.id}><Sensores /></ProveedorParcela>,
  );
}

beforeEach(() => vi.clearAllMocks());

test('se ve la lista de sensores', async () => {
  listarSensores.mockResolvedValue([SENSOR, SENSOR_INACTIVO]);
  montar(PARCELA_GESTOR);

  expect(await screen.findByText('Nodo 1')).toBeInTheDocument();
  expect(screen.getByText('Nodo 2')).toBeInTheDocument();
});

test('un lector no ve anadir ni editar', async () => {
  listarSensores.mockResolvedValue([SENSOR]);
  montar(PARCELA_LECTURA);

  await screen.findByText('Nodo 1');
  expect(screen.queryByRole('button', { name: 'Añadir sensores' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
});

test('anadir sensores reemplaza la lista con la respuesta del backend', async () => {
  // provisionar_sensores devuelve TODOS los sensores de la parcela, no solo
  // los nuevos -- si la pantalla concatenara en vez de reemplazar, este test
  // veria "Nodo 1" duplicado.
  listarSensores.mockResolvedValue([SENSOR]);
  const nuevoSensor = { ...SENSOR, id: 2, numero: 2, etiqueta: 'Nodo 2' };
  provisionarSensores.mockResolvedValue([SENSOR, nuevoSensor]);
  montar(PARCELA_GESTOR);

  await screen.findByText('Nodo 1');
  await userEvent.click(screen.getByRole('button', { name: 'Añadir sensores' }));
  await userEvent.type(screen.getByLabelText(/cuántos sensores/i), '2');
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

  expect(provisionarSensores).toHaveBeenCalledWith(1, 2);
  expect(await screen.findByText('Nodo 2')).toBeInTheDocument();
  expect(screen.getAllByText('Nodo 1')).toHaveLength(1);
});

test('editar un sensor guarda solo ese sensor', async () => {
  listarSensores.mockResolvedValue([SENSOR]);
  actualizarSensor.mockResolvedValue({ ...SENSOR, etiqueta: 'Renombrado' });
  montar(PARCELA_GESTOR);

  await screen.findByText('Nodo 1');
  await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
  const etiqueta = screen.getByLabelText('Etiqueta del sensor 1');
  await userEvent.clear(etiqueta);
  await userEvent.type(etiqueta, 'Renombrado');
  await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

  await waitFor(() => expect(actualizarSensor).toHaveBeenCalledWith(
    1, 1, expect.objectContaining({ etiqueta: 'Renombrado' }),
  ));
  expect(await screen.findByText('Renombrado')).toBeInTheDocument();
});

test('un error al aprovisionar se traduce con MensajeError', async () => {
  listarSensores.mockResolvedValue([SENSOR]);
  provisionarSensores.mockRejectedValue({
    response: {
      status: 422,
      data: { detail: [{ loc: ['body', 'cantidad'], msg: 'Input should be greater than or equal to 1' }] },
    },
  });
  montar(PARCELA_GESTOR);

  await screen.findByText('Nodo 1');
  await userEvent.click(screen.getByRole('button', { name: 'Añadir sensores' }));
  await userEvent.type(screen.getByLabelText(/cuántos sensores/i), '1');
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

  expect(await screen.findByText(/cantidad/)).toBeInTheDocument();
});
```

- [ ] **Step 3: Ejecutar y verificar que falla**

Run: `cd vinalert-front && npm test`
Expected: FAIL — `./Sensores` y `../api/sensores` no existen.

- [ ] **Step 4: Escribir el cliente de API de sensores**

Create: `vinalert-front/src/api/sensores.js`

```js
import cliente from './cliente';

export async function listarSensores(parcelaId) {
  const { data } = await cliente.get(`/parcelas/${parcelaId}/sensores/`);
  return data;
}

export async function provisionarSensores(parcelaId, cantidad) {
  const { data } = await cliente.post(`/parcelas/${parcelaId}/sensores/provisionar`, { cantidad });
  return data;
}

export async function actualizarSensor(parcelaId, sensorId, cambios) {
  const { data } = await cliente.patch(`/parcelas/${parcelaId}/sensores/${sensorId}`, cambios);
  return data;
}
```

- [ ] **Step 5: Escribir la pantalla**

Create: `vinalert-front/src/pantallas/Sensores.jsx`

```jsx
import { useEffect, useState } from 'react';

import { actualizarSensor, listarSensores, provisionarSensores } from '../api/sensores';
import MensajeError from '../errores/MensajeError';
import { useParcela } from '../parcela/ParcelaContext';
import SoloGestor from '../parcela/SoloGestor';

const CELDA = 'w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100';

function FilaEdicion({ sensor, onGuardar, onCancelar, guardando }) {
  const [campos, setCampos] = useState({
    etiqueta: sensor.etiqueta,
    profundidad_cm: sensor.profundidad_cm,
    latitud: sensor.latitud,
    longitud: sensor.longitud,
    modelo: sensor.modelo,
    activo: sensor.activo,
  });

  const cambiarTexto = (campo) => (e) => setCampos((c) => ({ ...c, [campo]: e.target.value || null }));
  const cambiarNumero = (campo) => (e) =>
    setCampos((c) => ({ ...c, [campo]: e.target.value === '' ? null : Number(e.target.value) }));

  return (
    <tr className="border-t border-slate-800">
      <td className="px-3 py-2 text-slate-400">{sensor.numero}</td>
      <td className="px-3 py-2">
        <input aria-label={`Etiqueta del sensor ${sensor.numero}`} value={campos.etiqueta ?? ''} onChange={cambiarTexto('etiqueta')} className={CELDA} />
      </td>
      <td className="px-3 py-2 text-center">
        <input type="checkbox" aria-label={`Activo el sensor ${sensor.numero}`} checked={campos.activo} onChange={(e) => setCampos((c) => ({ ...c, activo: e.target.checked }))} />
      </td>
      <td className="px-3 py-2">
        <input type="number" aria-label={`Profundidad del sensor ${sensor.numero}`} value={campos.profundidad_cm ?? ''} onChange={cambiarNumero('profundidad_cm')} className={CELDA} />
      </td>
      <td className="px-3 py-2">
        <input type="number" aria-label={`Latitud del sensor ${sensor.numero}`} value={campos.latitud ?? ''} onChange={cambiarNumero('latitud')} className={CELDA} />
      </td>
      <td className="px-3 py-2">
        <input type="number" aria-label={`Longitud del sensor ${sensor.numero}`} value={campos.longitud ?? ''} onChange={cambiarNumero('longitud')} className={CELDA} />
      </td>
      <td className="px-3 py-2">
        <input aria-label={`Modelo del sensor ${sensor.numero}`} value={campos.modelo ?? ''} onChange={cambiarTexto('modelo')} className={CELDA} />
      </td>
      <td className="whitespace-nowrap px-3 py-2">
        <button type="button" disabled={guardando} onClick={() => onGuardar(campos)} className="mr-2 text-cyan-300 hover:underline disabled:opacity-60">
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" onClick={onCancelar} className="text-slate-400 hover:underline">Cancelar</button>
      </td>
    </tr>
  );
}

export default function Sensores() {
  const { parcela } = useParcela();
  const [sensores, setSensores] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [editandoId, setEditandoId] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [mostrarAniadir, setMostrarAniadir] = useState(false);
  const [cantidad, setCantidad] = useState('');
  const [aniadiendo, setAniadiendo] = useState(false);

  useEffect(() => {
    let vigente = true;
    listarSensores(parcela.id)
      .then((s) => { if (vigente) { setSensores(s); setError(null); } })
      .catch((e) => { if (vigente) setError(e); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [parcela.id]);

  const confirmarAniadir = async (e) => {
    e.preventDefault();
    setError(null);
    setAniadiendo(true);
    try {
      // El endpoint devuelve la lista COMPLETA de sensores de la parcela, no
      // solo los nuevos: reemplaza, no concatena.
      setSensores(await provisionarSensores(parcela.id, Number(cantidad)));
      setCantidad('');
      setMostrarAniadir(false);
    } catch (err) {
      setError(err);
    } finally {
      setAniadiendo(false);
    }
  };

  const guardarEdicion = async (sensorId, cambios) => {
    setError(null);
    setGuardando(true);
    try {
      const actualizado = await actualizarSensor(parcela.id, sensorId, cambios);
      setSensores((prev) => prev.map((s) => (s.id === sensorId ? actualizado : s)));
      setEditandoId(null);
    } catch (err) {
      setError(err);
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) return <p className="p-8 text-slate-400">Cargando sensores…</p>;

  return (
    <section>
      <h2 className="text-xl font-semibold text-slate-50">Sensores</h2>

      <SoloGestor>
        <div className="mt-4">
          {mostrarAniadir ? (
            <form className="flex flex-wrap items-center gap-2" onSubmit={confirmarAniadir}>
              <label className="text-sm text-slate-300" htmlFor="cantidad-sensores">
                Cuántos sensores hasta el número
              </label>
              <input
                id="cantidad-sensores"
                type="number"
                min="1"
                max="100"
                required
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                className="w-20 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100"
              />
              <button type="submit" disabled={aniadiendo} className="rounded-lg bg-cyan-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-60">
                {aniadiendo ? 'Añadiendo…' : 'Confirmar'}
              </button>
              <button type="button" onClick={() => setMostrarAniadir(false)} className="text-sm text-slate-400 hover:underline">
                Cancelar
              </button>
            </form>
          ) : (
            <button type="button" onClick={() => setMostrarAniadir(true)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:border-cyan-500/50">
              Añadir sensores
            </button>
          )}
        </div>
      </SoloGestor>

      <MensajeError error={error} textoNoEncontrado="Este sensor ya no existe." />

      <table className="mt-4 w-full text-left text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2">Nº</th>
            <th className="px-3 py-2">Etiqueta</th>
            <th className="px-3 py-2">Activo</th>
            <th className="px-3 py-2">Profundidad (cm)</th>
            <th className="px-3 py-2">Latitud</th>
            <th className="px-3 py-2">Longitud</th>
            <th className="px-3 py-2">Modelo</th>
            <SoloGestor><th className="px-3 py-2">Acciones</th></SoloGestor>
          </tr>
        </thead>
        <tbody>
          {sensores.length === 0 && (
            <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">Todavía no hay sensores.</td></tr>
          )}
          {sensores.map((s) =>
            editandoId === s.id ? (
              <FilaEdicion
                key={s.id}
                sensor={s}
                guardando={guardando}
                onGuardar={(cambios) => guardarEdicion(s.id, cambios)}
                onCancelar={() => setEditandoId(null)}
              />
            ) : (
              <tr key={s.id} className="border-t border-slate-800">
                <td className="px-3 py-2 text-slate-400">{s.numero}</td>
                <td className="px-3 py-2">{s.etiqueta}</td>
                <td className="px-3 py-2">{s.activo ? 'Sí' : 'No'}</td>
                <td className="px-3 py-2">{s.profundidad_cm ?? '—'}</td>
                <td className="px-3 py-2">{s.latitud ?? '—'}</td>
                <td className="px-3 py-2">{s.longitud ?? '—'}</td>
                <td className="px-3 py-2">{s.modelo ?? '—'}</td>
                <SoloGestor>
                  <td className="px-3 py-2">
                    <button type="button" onClick={() => setEditandoId(s.id)} className="text-cyan-300 hover:underline">
                      Editar
                    </button>
                  </td>
                </SoloGestor>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 6: Conectar la pantalla en `App.jsx`**

Modify: `vinalert-front/src/App.jsx` — añadir el import junto a `Configuracion`:

```jsx
import Sensores from './pantallas/Sensores';
```

Y añadir la entrada al mapa `PANTALLAS` que creó la Task 1:

```jsx
const PANTALLAS = {
  configuracion: Configuracion,
  sensores: Sensores,
};
```

- [ ] **Step 7: Ejecutar los tests**

Run: `cd vinalert-front && npm test`
Expected: todo en verde, `Sensores.test.jsx` con sus 5 tests pasando.

- [ ] **Step 8: Commit**

```bash
git add vinalert-front/src/api/sensores.js vinalert-front/src/test/respuestas.js vinalert-front/src/App.jsx vinalert-front/src/pantallas/Sensores.jsx vinalert-front/src/pantallas/Sensores.test.jsx
git commit -m "feat: pantalla de sensores con aprovisionamiento por lote y edicion"
```

---

## Task 3: Pantalla de acceso (miembros)

**Files:**
- Create: `vinalert-front/src/api/miembros.js`
- Modify: `vinalert-front/src/test/respuestas.js`
- Modify: `vinalert-front/src/App.jsx`
- Create: `vinalert-front/src/pantallas/Miembros.jsx`
- Test: `vinalert-front/src/pantallas/Miembros.test.jsx`

**Interfaces:**
- Consumes: `useParcela()` → `{ parcela, puedeGestionar }` (D1). `<SoloGestor>`, `<MensajeError>` (D1). El mapa `PANTALLAS` de `App.jsx` (Task 1).
- Produces: `listarMiembros(parcelaId)`, `anadirMiembro(parcelaId, email, rol)`, `cambiarRol(parcelaId, usuarioId, rol)`, `retirarMiembro(parcelaId, usuarioId)` en `api/miembros.js`. Nada de esto lo consume otra tarea de este plan — es la última pantalla.

- [ ] **Step 1: Añadir las fixtures**

Modify: `vinalert-front/src/test/respuestas.js` — añadir al final:

```js
export const MIEMBRO_GESTOR = { usuario_id: 1, nombre: 'Test User', email: 'test@vinalert.dev', rol: 'gestor' };
export const MIEMBRO_LECTURA = { usuario_id: 2, nombre: 'Otra Persona', email: 'otra@vinalert.dev', rol: 'lectura' };
```

- [ ] **Step 2: Escribir el test de la pantalla**

Create: `vinalert-front/src/pantallas/Miembros.test.jsx`

```jsx
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';

import { MIEMBRO_GESTOR, MIEMBRO_LECTURA, PARCELA_GESTOR, PARCELA_LECTURA } from '../test/respuestas';
import { ProveedorParcela } from '../parcela/ParcelaContext';
import Miembros from './Miembros';

vi.mock('../api/parcelas', () => ({ obtenerParcela: vi.fn() }));
vi.mock('../api/miembros', () => ({
  listarMiembros: vi.fn(),
  anadirMiembro: vi.fn(),
  cambiarRol: vi.fn(),
  retirarMiembro: vi.fn(),
}));
import { obtenerParcela } from '../api/parcelas';
import { anadirMiembro, cambiarRol, listarMiembros, retirarMiembro } from '../api/miembros';

function montar(parcela) {
  obtenerParcela.mockResolvedValue(parcela);
  return render(
    <ProveedorParcela parcelaId={parcela.id}><Miembros /></ProveedorParcela>,
  );
}

beforeEach(() => vi.clearAllMocks());

test('cualquier miembro ve la lista', async () => {
  listarMiembros.mockResolvedValue([MIEMBRO_GESTOR, MIEMBRO_LECTURA]);
  montar(PARCELA_LECTURA);

  expect(await screen.findByText('test@vinalert.dev')).toBeInTheDocument();
  expect(screen.getByText('otra@vinalert.dev')).toBeInTheDocument();
});

test('un lector no ve los controles de gestion pero si el rol de cada uno', async () => {
  listarMiembros.mockResolvedValue([MIEMBRO_GESTOR]);
  montar(PARCELA_LECTURA);

  await screen.findByText('test@vinalert.dev');
  expect(screen.queryByRole('button', { name: 'Añadir' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Retirar' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/rol de/i)).not.toBeInTheDocument();
  expect(screen.getByText('Gestor')).toBeInTheDocument();
});

test('anadir un miembro lo agrega a la lista', async () => {
  listarMiembros.mockResolvedValue([MIEMBRO_GESTOR]);
  anadirMiembro.mockResolvedValue(MIEMBRO_LECTURA);
  montar(PARCELA_GESTOR);

  await screen.findByText('test@vinalert.dev');
  await userEvent.type(screen.getByLabelText('Email'), 'otra@vinalert.dev');
  await userEvent.click(screen.getByRole('button', { name: 'Añadir' }));

  expect(anadirMiembro).toHaveBeenCalledWith(1, 'otra@vinalert.dev', 'lectura');
  expect(await screen.findByText('otra@vinalert.dev')).toBeInTheDocument();
});

test('anadir un email sin cuenta muestra el mensaje del backend', async () => {
  listarMiembros.mockResolvedValue([MIEMBRO_GESTOR]);
  anadirMiembro.mockRejectedValue({
    response: {
      status: 404,
      data: { detail: 'No hay ninguna cuenta con ese email. Esa persona debe registrarse primero.' },
    },
  });
  montar(PARCELA_GESTOR);

  await screen.findByText('test@vinalert.dev');
  await userEvent.type(screen.getByLabelText('Email'), 'nadie@vinalert.dev');
  await userEvent.click(screen.getByRole('button', { name: 'Añadir' }));

  expect(await screen.findByText(/no hay ninguna cuenta/i)).toBeInTheDocument();
});

test('retirar pide confirmacion y llama al backend', async () => {
  listarMiembros.mockResolvedValue([MIEMBRO_GESTOR, MIEMBRO_LECTURA]);
  retirarMiembro.mockResolvedValue(undefined);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  montar(PARCELA_GESTOR);

  await screen.findByText('otra@vinalert.dev');
  const fila = screen.getByText('otra@vinalert.dev').closest('tr');
  await userEvent.click(within(fila).getByRole('button', { name: 'Retirar' }));

  expect(retirarMiembro).toHaveBeenCalledWith(1, 2);
  await waitFor(() => expect(screen.queryByText('otra@vinalert.dev')).not.toBeInTheDocument());
});

test('cancelar la confirmacion no llama al backend', async () => {
  listarMiembros.mockResolvedValue([MIEMBRO_GESTOR, MIEMBRO_LECTURA]);
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  montar(PARCELA_GESTOR);

  await screen.findByText('otra@vinalert.dev');
  const fila = screen.getByText('otra@vinalert.dev').closest('tr');
  await userEvent.click(within(fila).getByRole('button', { name: 'Retirar' }));

  expect(retirarMiembro).not.toHaveBeenCalled();
  expect(screen.getByText('otra@vinalert.dev')).toBeInTheDocument();
});

test('el guard de "sin gestor" del backend se ve y el select no cambia hasta confirmarse', async () => {
  // Mutacion real: se rompe el guard EN LA RESPUESTA SIMULADA (forzando el
  // 409 al cambiar de rol al unico gestor), no confiando en que el backend
  // real lo aplique. Esto protege el manejo del error en el FRONTEND.
  listarMiembros.mockResolvedValue([MIEMBRO_GESTOR]);
  cambiarRol.mockRejectedValue({
    response: {
      status: 409,
      data: { detail: 'No puedes dejar la parcela sin ningun gestor: nombra a otro antes.' },
    },
  });
  montar(PARCELA_GESTOR);

  await screen.findByText('test@vinalert.dev');
  const select = screen.getByLabelText(`Rol de ${MIEMBRO_GESTOR.nombre}`);
  expect(select).toHaveValue('gestor');

  await userEvent.selectOptions(select, 'lectura');

  expect(await screen.findByText(/sin ningun gestor/i)).toBeInTheDocument();
  expect(select).toHaveValue('gestor');
});
```

- [ ] **Step 3: Ejecutar y verificar que falla**

Run: `cd vinalert-front && npm test`
Expected: FAIL — `./Miembros` y `../api/miembros` no existen.

- [ ] **Step 4: Escribir el cliente de API de miembros**

Create: `vinalert-front/src/api/miembros.js`

```js
import cliente from './cliente';

export async function listarMiembros(parcelaId) {
  const { data } = await cliente.get(`/parcelas/${parcelaId}/usuarios`);
  return data;
}

export async function anadirMiembro(parcelaId, email, rol) {
  const { data } = await cliente.post(`/parcelas/${parcelaId}/usuarios`, { email, rol });
  return data;
}

export async function cambiarRol(parcelaId, usuarioId, rol) {
  const { data } = await cliente.patch(`/parcelas/${parcelaId}/usuarios/${usuarioId}`, { rol });
  return data;
}

export async function retirarMiembro(parcelaId, usuarioId) {
  await cliente.delete(`/parcelas/${parcelaId}/usuarios/${usuarioId}`);
}
```

- [ ] **Step 5: Escribir la pantalla**

Create: `vinalert-front/src/pantallas/Miembros.jsx`

```jsx
import { useEffect, useState } from 'react';

import { anadirMiembro, cambiarRol, listarMiembros, retirarMiembro } from '../api/miembros';
import MensajeError from '../errores/MensajeError';
import { useParcela } from '../parcela/ParcelaContext';
import SoloGestor from '../parcela/SoloGestor';

export default function Miembros() {
  const { parcela, puedeGestionar } = useParcela();
  const [miembros, setMiembros] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [email, setEmail] = useState('');
  const [rolNuevo, setRolNuevo] = useState('lectura');
  const [aniadiendo, setAniadiendo] = useState(false);
  const [cambiandoId, setCambiandoId] = useState(null);
  const [retirandoId, setRetirandoId] = useState(null);

  useEffect(() => {
    let vigente = true;
    listarMiembros(parcela.id)
      .then((m) => { if (vigente) { setMiembros(m); setError(null); } })
      .catch((e) => { if (vigente) setError(e); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [parcela.id]);

  const aniadir = async (e) => {
    e.preventDefault();
    setError(null);
    setAniadiendo(true);
    try {
      const nuevo = await anadirMiembro(parcela.id, email, rolNuevo);
      setMiembros((prev) => [...prev, nuevo]);
      setEmail('');
      setRolNuevo('lectura');
    } catch (err) {
      setError(err);
    } finally {
      setAniadiendo(false);
    }
  };

  const cambiar = async (usuarioId, rolPedido) => {
    setError(null);
    setCambiandoId(usuarioId);
    try {
      // El <select> es controlado por miembros[].rol: mientras la peticion
      // esta en vuelo NO se actualiza en optimista, asi que un 409 deja el
      // valor donde ya estaba sin tener que revertir nada a mano.
      const actualizado = await cambiarRol(parcela.id, usuarioId, rolPedido);
      setMiembros((prev) => prev.map((m) => (m.usuario_id === usuarioId ? actualizado : m)));
    } catch (err) {
      setError(err);
    } finally {
      setCambiandoId(null);
    }
  };

  const retirar = async (miembro) => {
    if (!window.confirm(`¿Retirar a ${miembro.nombre} de esta parcela?`)) return;
    setError(null);
    setRetirandoId(miembro.usuario_id);
    try {
      await retirarMiembro(parcela.id, miembro.usuario_id);
      setMiembros((prev) => prev.filter((m) => m.usuario_id !== miembro.usuario_id));
    } catch (err) {
      setError(err);
    } finally {
      setRetirandoId(null);
    }
  };

  if (cargando) return <p className="p-8 text-slate-400">Cargando…</p>;

  return (
    <section>
      <h2 className="text-xl font-semibold text-slate-50">Acceso</h2>

      <MensajeError error={error} textoNoEncontrado="Ese usuario ya no tiene acceso a esta parcela." />

      <table className="mt-4 w-full text-left text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2">Nombre</th>
            <th className="px-3 py-2">Email</th>
            <th className="px-3 py-2">Rol</th>
            <SoloGestor><th className="px-3 py-2">Acciones</th></SoloGestor>
          </tr>
        </thead>
        <tbody>
          {miembros.map((m) => (
            <tr key={m.usuario_id} className="border-t border-slate-800">
              <td className="px-3 py-2">{m.nombre}</td>
              <td className="px-3 py-2 text-slate-400">{m.email}</td>
              <td className="px-3 py-2">
                {puedeGestionar ? (
                  <select
                    aria-label={`Rol de ${m.nombre}`}
                    value={m.rol}
                    disabled={cambiandoId === m.usuario_id}
                    onChange={(e) => cambiar(m.usuario_id, e.target.value)}
                    className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100"
                  >
                    <option value="gestor">Gestor</option>
                    <option value="lectura">Lectura</option>
                  </select>
                ) : (
                  m.rol === 'gestor' ? 'Gestor' : 'Lectura'
                )}
              </td>
              <SoloGestor>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    disabled={retirandoId === m.usuario_id}
                    onClick={() => retirar(m)}
                    className="text-red-300 hover:underline disabled:opacity-60"
                  >
                    {retirandoId === m.usuario_id ? 'Retirando…' : 'Retirar'}
                  </button>
                </td>
              </SoloGestor>
            </tr>
          ))}
        </tbody>
      </table>

      <SoloGestor>
        <form className="mt-6 flex flex-wrap items-end gap-3" onSubmit={aniadir}>
          <label className="block">
            <span className="block text-xs font-medium text-slate-300">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-300">Rol</span>
            <select
              value={rolNuevo}
              onChange={(e) => setRolNuevo(e.target.value)}
              className="mt-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            >
              <option value="lectura">Lectura</option>
              <option value="gestor">Gestor</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={aniadiendo}
            className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-60"
          >
            {aniadiendo ? 'Añadiendo…' : 'Añadir'}
          </button>
        </form>
      </SoloGestor>
    </section>
  );
}
```

- [ ] **Step 6: Conectar la pantalla en `App.jsx`**

Modify: `vinalert-front/src/App.jsx` — añadir el import junto a los otros dos:

```jsx
import Miembros from './pantallas/Miembros';
```

Y la entrada final del mapa `PANTALLAS`:

```jsx
const PANTALLAS = {
  configuracion: Configuracion,
  sensores: Sensores,
  miembros: Miembros,
};
```

- [ ] **Step 7: Ejecutar los tests**

Run: `cd vinalert-front && npm test`
Expected: todo en verde, `Miembros.test.jsx` con sus 7 tests pasando. Total del proyecto: 31 + 5 + 5 + 7 = 48 tests.

- [ ] **Step 8: Commit**

```bash
git add vinalert-front/src/api/miembros.js vinalert-front/src/test/respuestas.js vinalert-front/src/App.jsx vinalert-front/src/pantallas/Miembros.jsx vinalert-front/src/pantallas/Miembros.test.jsx
git commit -m "feat: pantalla de acceso con altas, cambio de rol y retirada de miembros"
```

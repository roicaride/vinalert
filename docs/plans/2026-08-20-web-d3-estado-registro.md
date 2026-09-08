# Estado y registro (D3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Llenar las tres secciones de estado y registro que quedan vacías desde D1 — estado actual de la parcela, tratamientos fitosanitarios, y lecturas foliares — usando el backend que ya existe completo.

**Architecture:** Tres pantallas independientes bajo `vinalert-front/src/pantallas/`, cada una con su propio módulo `api/*.js`, siguiendo el mismo patrón que D2: `useEffect`/`useState` por pantalla, sin hook de fetching compartido, mutaciones que actualizan el estado local a partir de la respuesta. Una ampliación pequeña y localizada al `MensajeError.jsx` de D1, necesaria porque el 422 de la subida de Excel foliar manda el motivo como una frase, no como la lista de errores por campo que `MensajeError` sabía leer hasta ahora.

**Tech Stack:** React 19, Vite 7, Tailwind 4, react-router 7, axios, Vitest, Testing Library — mismo stack que D1/D2, sin dependencias nuevas.

**Spec:** `docs/specs/2026-08-20-web-d3-estado-registro-design.md`

## Global Constraints

- **`estado` es una foto del momento actual, sin gráficas ni evolución en el tiempo.** Eso es D4. No se construye ningún componente de gráfica en este plan.
- **No se puede editar una lectura foliar ni un tratamiento ya creado.** El backend no ofrece esos endpoints — solo alta, listado, y borrado (tratamientos) o alta y listado (foliar).
- **El tipo de tratamiento combina una lista fija con lo que la parcela ya ha usado**, derivado siempre de la lista COMPLETA (sin filtrar) cargada en memoria — nunca de una lista ya filtrada por tipo, o las opciones del formulario de alta se reducirían al filtrar.
- **El filtro de tratamientos por tipo se resuelve en el cliente**, sobre la lista ya cargada — nunca pidiendo de nuevo al backend con `?tipo=`.
- **`crearTratamiento` debe mandar `parcela_id` en el cuerpo** — el router de tratamientos no tiene prefijo por parcela, a diferencia de sensores/miembros/foliar.
- **Insertar un tratamiento reordena la lista por fecha descendente** — un tratamiento puede registrarse con fecha pasada, así que no basta con anteponerlo.
- **Subir un Excel foliar añade solo las filas nuevas que devuelve la respuesta** (no la lista completa, a diferencia de `provisionar_sensores` en D2), reordenadas por fecha descendente y grupo ascendente.
- **Solo borrar un tratamiento pide confirmación** (`window.confirm()`, sin componente genérico) — es la única operación destructiva de las tres pantallas.
- **`MensajeError.jsx` (D1) gana una rama para 422 con `detail` en texto plano**, sin romper la rama existente para 422 con lista de errores por campo — ambas deben seguir funcionando y tener test.
- Manager-only: acciones de alta/borrado/subida ocultas con `<SoloGestor>`, nunca solo deshabilitadas.
- Una única zona de error por pantalla, cleared en cada reintento.
- La suite de frontend debe quedar verde: `npm test` en `vinalert-front/`. Hoy está en 56 tests, 10 ficheros.
- La suite de backend no cambia: este plan no toca el backend.

## Orden y por qué

Estado, Tratamientos, Foliar — mismo orden que el spec. Ninguna depende de otra; cada una añade su propia entrada al mapa `PANTALLAS` de `App.jsx` que D2 ya dejó montado. Foliar va última porque es la única que toca un fichero compartido de D1 (`MensajeError.jsx`), y conviene que las otras dos ya estén cerradas antes de tocar código compartido.

---

## Task 1: Pantalla de estado

**Files:**
- Create: `vinalert-front/src/api/estado.js`
- Modify: `vinalert-front/src/App.jsx`
- Modify: `vinalert-front/src/test/respuestas.js`
- Create: `vinalert-front/src/pantallas/Estado.jsx`
- Test: `vinalert-front/src/pantallas/Estado.test.jsx`

**Interfaces:**
- Consumes: `useParcela()` de `../parcela/ParcelaContext` → `{ parcela }` (D1). `<MensajeError error textoNoEncontrado>` de `../errores/MensajeError` (D1). El mapa `PANTALLAS` de `App.jsx` (D2, Task 1 de D2).
- Produces: `obtenerDashboard(parcelaId)` → `GET /parcelas/{id}/dashboard`, `obtenerHistorico(parcelaId, limite)` → `GET /parcelas/{id}/historico?limite=...`, ambas en `api/estado.js`. Nada de esto lo consumen las Tasks 2 y 3.

- [x] **Step 1: Añadir las fixtures**

Modify: `vinalert-front/src/test/respuestas.js` — añadir al final:

```js
export const DASHBOARD = {
  parcela: PARCELA_GESTOR,
  estado_suelo: {
    parcela_id: 1,
    desde: '2026-08-19T00:00:00',
    hasta: '2026-08-20T00:00:00',
    n_sensores: 3,
    n_lecturas: 144,
    humedad_media: 28.4,
    humedad_sd: 2.1,
    temperatura_media: 19.6,
    temperatura_sd: 1.3,
  },
  clima_actual: {
    id: 1,
    parcela_id: 1,
    fecha_hora: '2026-08-20T09:00:00',
    temp_c: 21.5,
    humedad_relativa_pct: 65,
    lluvia_mm: 0,
    et0: 3.2,
    viento_racha_ms: 4.1,
  },
};

export const LOG_SENSOR = {
  id: 1,
  parcela_id: 1,
  sensor_id: 1,
  fecha_hora: '2026-08-20T08:00:00',
  humedad_suelo_pct: 27.8,
  temperatura_suelo: 19.1,
  bateria: 3.9,
};
```

- [x] **Step 2: Escribir el test**

Create: `vinalert-front/src/pantallas/Estado.test.jsx`

```jsx
import { render, screen } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';

import { DASHBOARD, LOG_SENSOR, PARCELA_GESTOR } from '../test/respuestas';
import { ProveedorParcela } from '../parcela/ParcelaContext';
import Estado from './Estado';

vi.mock('../api/parcelas', () => ({ obtenerParcela: vi.fn() }));
vi.mock('../api/estado', () => ({ obtenerDashboard: vi.fn(), obtenerHistorico: vi.fn() }));
import { obtenerParcela } from '../api/parcelas';
import { obtenerDashboard, obtenerHistorico } from '../api/estado';

function montar(parcela) {
  obtenerParcela.mockResolvedValue(parcela);
  return render(
    <ProveedorParcela parcelaId={parcela.id}><Estado /></ProveedorParcela>,
  );
}

beforeEach(() => vi.clearAllMocks());

test('se ve el resumen de suelo y clima', async () => {
  obtenerDashboard.mockResolvedValue(DASHBOARD);
  obtenerHistorico.mockResolvedValue([LOG_SENSOR]);
  montar(PARCELA_GESTOR);

  expect(await screen.findByText('28.4 %')).toBeInTheDocument();
  expect(screen.getByText('21.5 °C')).toBeInTheDocument();
});

test('sin clima todavia pedido, se avisa en vez de mostrar campos vacios', async () => {
  obtenerDashboard.mockResolvedValue({ ...DASHBOARD, clima_actual: null });
  obtenerHistorico.mockResolvedValue([]);
  montar(PARCELA_GESTOR);

  expect(await screen.findByText(/no se ha pedido el clima/i)).toBeInTheDocument();
});

test('se ven las ultimas lecturas, la mas reciente primero', async () => {
  const antigua = { ...LOG_SENSOR, id: 1, fecha_hora: '2026-08-20T06:00:00', humedad_suelo_pct: 25 };
  const reciente = { ...LOG_SENSOR, id: 2, fecha_hora: '2026-08-20T08:00:00', humedad_suelo_pct: 30 };
  obtenerDashboard.mockResolvedValue(DASHBOARD);
  // El backend devuelve el historico en orden ASCENDENTE (mas antigua primero).
  obtenerHistorico.mockResolvedValue([antigua, reciente]);

  montar(PARCELA_GESTOR);

  const filas = await screen.findAllByRole('row');
  // filas[0] es la cabecera; la primera fila de datos debe ser la mas reciente.
  expect(filas[1]).toHaveTextContent('30 %');
});

test('un fallo al cargar se traduce con MensajeError', async () => {
  obtenerDashboard.mockRejectedValue({ response: { status: 500 } });
  obtenerHistorico.mockResolvedValue([]);
  montar(PARCELA_GESTOR);

  expect(await screen.findByRole('alert')).toBeInTheDocument();
});
```

- [x] **Step 3: Ejecutar y verificar que falla**

Run: `cd vinalert-front && npm test`
Expected: FAIL — `./Estado` y `../api/estado` no existen.

- [x] **Step 4: Escribir el cliente de API de estado**

Create: `vinalert-front/src/api/estado.js`

```js
import cliente from './cliente';

export async function obtenerDashboard(parcelaId) {
  const { data } = await cliente.get(`/parcelas/${parcelaId}/dashboard`);
  return data;
}

export async function obtenerHistorico(parcelaId, limite = 15) {
  const { data } = await cliente.get(`/parcelas/${parcelaId}/historico`, { params: { limite } });
  return data;
}
```

- [x] **Step 5: Escribir la pantalla**

Create: `vinalert-front/src/pantallas/Estado.jsx`

```jsx
import { useEffect, useState } from 'react';

import { obtenerDashboard, obtenerHistorico } from '../api/estado';
import MensajeError from '../errores/MensajeError';
import { useParcela } from '../parcela/ParcelaContext';

function fmt(valor, unidad) {
  return valor == null ? '—' : `${valor}${unidad ? ' ' + unidad : ''}`;
}

function Dato({ etiqueta, valor }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{etiqueta}</dt>
      <dd className="text-slate-100">{valor}</dd>
    </div>
  );
}

export default function Estado() {
  const { parcela } = useParcela();
  const [dashboard, setDashboard] = useState(null);
  const [historico, setHistorico] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    Promise.all([obtenerDashboard(parcela.id), obtenerHistorico(parcela.id, 15)])
      .then(([d, h]) => { if (vigente) { setDashboard(d); setHistorico(h); setError(null); } })
      .catch((e) => { if (vigente) setError(e); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [parcela.id]);

  if (cargando) return <p className="p-8 text-slate-400">Cargando estado…</p>;
  if (error && dashboard === null) {
    return (
      <div className="p-8">
        <MensajeError error={error} textoNoEncontrado="No se pudo cargar el estado de esta parcela." />
      </div>
    );
  }

  const { estado_suelo, clima_actual } = dashboard;

  return (
    <section>
      <h2 className="text-xl font-semibold text-slate-50">Estado</h2>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="text-sm font-semibold text-slate-300">Suelo</h3>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <Dato etiqueta="Humedad media" valor={fmt(estado_suelo.humedad_media, '%')} />
            <Dato etiqueta="Desviación humedad" valor={fmt(estado_suelo.humedad_sd, '%')} />
            <Dato etiqueta="Temperatura media" valor={fmt(estado_suelo.temperatura_media, '°C')} />
            <Dato etiqueta="Desviación temperatura" valor={fmt(estado_suelo.temperatura_sd, '°C')} />
            <Dato etiqueta="Sensores activos" valor={estado_suelo.n_sensores} />
            <Dato etiqueta="Lecturas" valor={estado_suelo.n_lecturas} />
          </dl>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="text-sm font-semibold text-slate-300">Clima actual</h3>
          {clima_actual ? (
            <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <Dato etiqueta="Temperatura" valor={fmt(clima_actual.temp_c, '°C')} />
              <Dato etiqueta="Humedad relativa" valor={fmt(clima_actual.humedad_relativa_pct, '%')} />
              <Dato etiqueta="Lluvia" valor={fmt(clima_actual.lluvia_mm, 'mm')} />
              <Dato etiqueta="ET₀" valor={fmt(clima_actual.et0, 'mm')} />
              <Dato etiqueta="Viento (racha)" valor={fmt(clima_actual.viento_racha_ms, 'm/s')} />
            </dl>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Todavía no se ha pedido el clima de esta parcela.</p>
          )}
        </div>
      </div>

      <h3 className="mt-6 text-sm font-semibold text-slate-300">Últimas lecturas</h3>
      <table className="mt-2 w-full text-left text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2">Fecha y hora</th>
            <th className="px-3 py-2">Sensor</th>
            <th className="px-3 py-2">Humedad</th>
            <th className="px-3 py-2">Temperatura</th>
            <th className="px-3 py-2">Batería</th>
          </tr>
        </thead>
        <tbody>
          {historico.length === 0 && (
            <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">Todavía no hay lecturas.</td></tr>
          )}
          {[...historico].reverse().map((log) => (
            <tr key={log.id} className="border-t border-slate-800">
              <td className="px-3 py-2 text-slate-400">{new Date(log.fecha_hora).toLocaleString('es-ES')}</td>
              <td className="px-3 py-2">{log.sensor_id ?? '—'}</td>
              <td className="px-3 py-2">{fmt(log.humedad_suelo_pct, '%')}</td>
              <td className="px-3 py-2">{fmt(log.temperatura_suelo, '°C')}</td>
              <td className="px-3 py-2">{fmt(log.bateria, 'V')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

- [x] **Step 6: Conectar la pantalla en `App.jsx`**

Modify: `vinalert-front/src/App.jsx` — añadir el import junto a los otros de `./pantallas/*`:

```jsx
import Estado from './pantallas/Estado';
```

Y añadir la entrada al mapa `PANTALLAS` que ya existe (hoy tiene `configuracion`, `sensores`, `miembros`):

```jsx
const PANTALLAS = {
  configuracion: Configuracion,
  sensores: Sensores,
  miembros: Miembros,
  estado: Estado,
};
```

- [x] **Step 7: Ejecutar los tests**

Run: `cd vinalert-front && npm test`
Expected: todo en verde, `Estado.test.jsx` con sus 4 tests pasando y los 56 anteriores sin romperse.

- [x] **Step 8: Commit**

```bash
git add vinalert-front/src/api/estado.js vinalert-front/src/App.jsx vinalert-front/src/test/respuestas.js vinalert-front/src/pantallas/Estado.jsx vinalert-front/src/pantallas/Estado.test.jsx
git commit -m "feat: pantalla de estado con el resumen de suelo, clima y ultimas lecturas"
```

---

## Task 2: Pantalla de tratamientos

**Files:**
- Create: `vinalert-front/src/api/tratamientos.js`
- Modify: `vinalert-front/src/App.jsx`
- Modify: `vinalert-front/src/test/respuestas.js`
- Create: `vinalert-front/src/pantallas/Tratamientos.jsx`
- Test: `vinalert-front/src/pantallas/Tratamientos.test.jsx`

**Interfaces:**
- Consumes: `useParcela()` → `{ parcela }` (D1). `<SoloGestor>`, `<MensajeError>` (D1). El mapa `PANTALLAS` de `App.jsx` (D2/Task 1 de este plan).
- Produces: `listarTratamientos(parcelaId)`, `crearTratamiento(datos)`, `borrarTratamiento(id)` en `api/tratamientos.js`. Nada de esto lo consume la Task 3.

- [x] **Step 1: Añadir las fixtures**

Modify: `vinalert-front/src/test/respuestas.js` — añadir al final:

```js
export const TRATAMIENTO = {
  id: 1,
  parcela_id: 1,
  fecha: '2026-08-15T09:00:00',
  tipo: 'Fungicida',
  producto: 'Cobre',
  materia_activa: 'Oxicloruro de cobre',
  dosis: 3,
  unidad_dosis: 'kg/ha',
  cantidad_total: null,
  unidad_cantidad: null,
  operador: null,
  maquinaria: null,
  notas: null,
  temp_c_aplicacion: 18.2,
  viento_ms_aplicacion: 2.1,
  clima_fecha_hora: '2026-08-15T09:00:00',
  clima_fuente: 'open-meteo',
};

export const TRATAMIENTO_SIN_CLIMA = {
  ...TRATAMIENTO,
  id: 2,
  clima_fuente: 'no_disponible',
  temp_c_aplicacion: null,
  viento_ms_aplicacion: null,
};
```

- [x] **Step 2: Escribir el test**

Create: `vinalert-front/src/pantallas/Tratamientos.test.jsx`

```jsx
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';

import { PARCELA_GESTOR, PARCELA_LECTURA, TRATAMIENTO, TRATAMIENTO_SIN_CLIMA } from '../test/respuestas';
import { ProveedorParcela } from '../parcela/ParcelaContext';
import Tratamientos from './Tratamientos';

vi.mock('../api/parcelas', () => ({ obtenerParcela: vi.fn() }));
vi.mock('../api/tratamientos', () => ({
  listarTratamientos: vi.fn(),
  crearTratamiento: vi.fn(),
  borrarTratamiento: vi.fn(),
}));
import { obtenerParcela } from '../api/parcelas';
import { crearTratamiento, listarTratamientos, borrarTratamiento } from '../api/tratamientos';

function montar(parcela) {
  obtenerParcela.mockResolvedValue(parcela);
  return render(
    <ProveedorParcela parcelaId={parcela.id}><Tratamientos /></ProveedorParcela>,
  );
}

beforeEach(() => vi.clearAllMocks());

test('se ve la lista con el clima registrado', async () => {
  listarTratamientos.mockResolvedValue([TRATAMIENTO]);
  montar(PARCELA_GESTOR);

  const tabla = await screen.findByRole('table');
  expect(within(tabla).getByText('Fungicida')).toBeInTheDocument();
  expect(within(tabla).getByText('18.2 °C')).toBeInTheDocument();
});

test('sin clima disponible se muestra un guion, no el dato', async () => {
  listarTratamientos.mockResolvedValue([TRATAMIENTO_SIN_CLIMA]);
  montar(PARCELA_GESTOR);

  const tabla = await screen.findByRole('table');
  const fila = within(tabla).getByText('Fungicida').closest('tr');
  expect(fila).toHaveTextContent('—');
});

test('un lector no ve el formulario de alta ni el boton de borrar', async () => {
  listarTratamientos.mockResolvedValue([TRATAMIENTO]);
  montar(PARCELA_LECTURA);

  await screen.findByRole('table');
  expect(screen.queryByRole('button', { name: 'Registrar tratamiento' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Borrar' })).not.toBeInTheDocument();
});

test('filtrar por tipo no reduce las opciones del formulario de alta', async () => {
  // La trampa: si el filtro pidiera al backend con ?tipo=, la lista en
  // memoria se reduciria a un solo tipo y el select de alta perderia de
  // vista los demas. El filtro debe resolverse en el cliente.
  const herbicida = { ...TRATAMIENTO, id: 2, tipo: 'Herbicida' };
  listarTratamientos.mockResolvedValue([TRATAMIENTO, herbicida]);
  montar(PARCELA_GESTOR);

  const tabla = await screen.findByRole('table');
  expect(within(tabla).getByText('Fungicida')).toBeInTheDocument();

  await userEvent.selectOptions(screen.getByLabelText('Filtrar por tipo'), 'Herbicida');

  expect(within(tabla).queryByText('Fungicida')).not.toBeInTheDocument();
  expect(within(tabla).getByText('Herbicida')).toBeInTheDocument();
  expect(listarTratamientos).toHaveBeenCalledTimes(1);

  const opciones = within(screen.getByLabelText('Tipo')).getAllByRole('option').map((o) => o.textContent);
  expect(opciones).toEqual(expect.arrayContaining(['Fungicida', 'Herbicida']));
});

test('un tipo personalizado creado queda disponible como opcion despues', async () => {
  listarTratamientos.mockResolvedValue([TRATAMIENTO]);
  const personalizado = { ...TRATAMIENTO, id: 3, tipo: 'Cobertura vegetal' };
  crearTratamiento.mockResolvedValue(personalizado);
  montar(PARCELA_GESTOR);

  await screen.findByRole('table');
  await userEvent.type(screen.getByLabelText('Fecha'), '2026-08-20T09:00');
  await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'Otro');
  await userEvent.type(screen.getByLabelText('Tipo personalizado'), 'Cobertura vegetal');
  await userEvent.click(screen.getByRole('button', { name: 'Registrar tratamiento' }));

  await waitFor(() => expect(crearTratamiento).toHaveBeenCalledWith(
    expect.objectContaining({ parcela_id: 1, tipo: 'Cobertura vegetal' }),
  ));

  const opciones = within(screen.getByLabelText('Tipo')).getAllByRole('option').map((o) => o.textContent);
  expect(opciones).toContain('Cobertura vegetal');
});

test('crear un tratamiento con fecha pasada lo inserta en su sitio, no al principio', async () => {
  const reciente = { ...TRATAMIENTO, id: 1, fecha: '2026-08-19T10:00:00', tipo: 'Herbicida' };
  listarTratamientos.mockResolvedValue([reciente]);
  const pasado = { ...TRATAMIENTO, id: 2, fecha: '2026-01-01T10:00:00', tipo: 'Fungicida' };
  crearTratamiento.mockResolvedValue(pasado);
  montar(PARCELA_GESTOR);

  const tabla = await screen.findByRole('table');
  await userEvent.type(screen.getByLabelText('Fecha'), '2026-01-01T10:00');
  await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'Fungicida');
  await userEvent.click(screen.getByRole('button', { name: 'Registrar tratamiento' }));

  await waitFor(() => expect(crearTratamiento).toHaveBeenCalled());

  const filas = within(tabla).getAllByRole('row').slice(1);
  expect(filas[0]).toHaveTextContent('Herbicida');
  expect(filas[1]).toHaveTextContent('Fungicida');
});

test('borrar pide confirmacion y llama al backend', async () => {
  listarTratamientos.mockResolvedValue([TRATAMIENTO]);
  borrarTratamiento.mockResolvedValue(undefined);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  montar(PARCELA_GESTOR);

  const tabla = await screen.findByRole('table');
  await userEvent.click(within(tabla).getByRole('button', { name: 'Borrar' }));

  expect(borrarTratamiento).toHaveBeenCalledWith(1);
  await waitFor(() => expect(within(tabla).queryByText('Fungicida')).not.toBeInTheDocument());
});

test('un error al crear se traduce con MensajeError', async () => {
  listarTratamientos.mockResolvedValue([]);
  crearTratamiento.mockRejectedValue({
    response: { status: 422, data: { detail: [{ loc: ['body', 'fecha'], msg: 'field required' }] } },
  });
  montar(PARCELA_GESTOR);

  await screen.findByRole('table');
  await userEvent.type(screen.getByLabelText('Fecha'), '2026-08-20T09:00');
  await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'Fungicida');
  await userEvent.click(screen.getByRole('button', { name: 'Registrar tratamiento' }));

  expect(await screen.findByText(/fecha/)).toBeInTheDocument();
});
```

- [x] **Step 3: Ejecutar y verificar que falla**

Run: `cd vinalert-front && npm test`
Expected: FAIL — `./Tratamientos` y `../api/tratamientos` no existen.

- [x] **Step 4: Escribir el cliente de API de tratamientos**

Create: `vinalert-front/src/api/tratamientos.js`

```js
import cliente from './cliente';

export async function listarTratamientos(parcelaId) {
  const { data } = await cliente.get(`/parcelas/${parcelaId}/tratamientos`);
  return data;
}

export async function crearTratamiento(datos) {
  const { data } = await cliente.post('/tratamientos/', datos);
  return data;
}

export async function borrarTratamiento(id) {
  await cliente.delete(`/tratamientos/${id}`);
}
```

- [x] **Step 5: Escribir la pantalla**

Create: `vinalert-front/src/pantallas/Tratamientos.jsx`

```jsx
import { useEffect, useMemo, useState } from 'react';

import { crearTratamiento, listarTratamientos, borrarTratamiento } from '../api/tratamientos';
import MensajeError from '../errores/MensajeError';
import { useParcela } from '../parcela/ParcelaContext';
import SoloGestor from '../parcela/SoloGestor';

const TIPOS_HABITUALES = ['Fungicida', 'Herbicida', 'Insecticida', 'Abono foliar'];
const OTRO = 'Otro';
const CAMPO = 'mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100';

// Las opciones se derivan SIEMPRE de la lista completa, nunca de una vista
// filtrada -- de lo contrario, filtrar por un tipo dejaria el formulario de
// alta sin ver los demas tipos ya usados.
function tiposDisponibles(tratamientos) {
  const usados = [...new Set(tratamientos.map((t) => t.tipo))];
  const extra = usados.filter((t) => !TIPOS_HABITUALES.includes(t)).sort();
  return [...TIPOS_HABITUALES, ...extra];
}

function fmt(valor, unidad) {
  return valor == null ? '—' : `${valor}${unidad ? ' ' + unidad : ''}`;
}

function formVacio() {
  return {
    fecha: '', tipo: '', producto: '', materia_activa: '', dosis: '', unidad_dosis: '',
    cantidad_total: '', unidad_cantidad: '', operador: '', maquinaria: '', notas: '',
  };
}

export default function Tratamientos() {
  const { parcela } = useParcela();
  const [tratamientos, setTratamientos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [filtro, setFiltro] = useState('');
  const [borrandoId, setBorrandoId] = useState(null);
  const [form, setForm] = useState(formVacio);
  const [tipoPersonalizado, setTipoPersonalizado] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vigente = true;
    listarTratamientos(parcela.id)
      .then((t) => { if (vigente) { setTratamientos(t); setError(null); } })
      .catch((e) => { if (vigente) setError(e); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [parcela.id]);

  const opcionesTipo = useMemo(() => tiposDisponibles(tratamientos ?? []), [tratamientos]);
  const listaFiltrada = filtro ? (tratamientos ?? []).filter((t) => t.tipo === filtro) : tratamientos;

  const crear = async (e) => {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      const cuerpo = {
        parcela_id: parcela.id,
        fecha: new Date(form.fecha).toISOString(),
        tipo: form.tipo === OTRO ? tipoPersonalizado : form.tipo,
        producto: form.producto || null,
        materia_activa: form.materia_activa || null,
        dosis: form.dosis === '' ? null : Number(form.dosis),
        unidad_dosis: form.unidad_dosis || null,
        cantidad_total: form.cantidad_total === '' ? null : Number(form.cantidad_total),
        unidad_cantidad: form.unidad_cantidad || null,
        operador: form.operador || null,
        maquinaria: form.maquinaria || null,
        notas: form.notas || null,
      };
      const nuevo = await crearTratamiento(cuerpo);
      setTratamientos((prev) => [...prev, nuevo].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)));
      setForm(formVacio());
      setTipoPersonalizado('');
    } catch (err) {
      setError(err);
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (t) => {
    if (!window.confirm(`¿Borrar el tratamiento de ${t.tipo} del ${new Date(t.fecha).toLocaleDateString('es-ES')}?`)) return;
    setError(null);
    setBorrandoId(t.id);
    try {
      await borrarTratamiento(t.id);
      setTratamientos((prev) => prev.filter((x) => x.id !== t.id));
    } catch (err) {
      setError(err);
    } finally {
      setBorrandoId(null);
    }
  };

  if (cargando) return <p className="p-8 text-slate-400">Cargando tratamientos…</p>;
  if (error && tratamientos === null) {
    return (
      <div className="p-8">
        <MensajeError error={error} textoNoEncontrado="No se pudieron cargar los tratamientos." />
      </div>
    );
  }

  return (
    <section>
      <h2 className="text-xl font-semibold text-slate-50">Tratamientos</h2>

      <label className="mt-4 block max-w-xs">
        <span className="block text-xs font-medium text-slate-300">Filtrar por tipo</span>
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className={CAMPO}>
          <option value="">Todos</option>
          {opcionesTipo.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>

      <MensajeError error={error} textoNoEncontrado="No se pudieron cargar los tratamientos." />

      <table className="mt-4 w-full text-left text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2">Fecha</th>
            <th className="px-3 py-2">Tipo</th>
            <th className="px-3 py-2">Producto</th>
            <th className="px-3 py-2">Dosis</th>
            <th className="px-3 py-2">Temp. aplicación</th>
            <th className="px-3 py-2">Viento aplicación</th>
            <SoloGestor><th className="px-3 py-2">Acciones</th></SoloGestor>
          </tr>
        </thead>
        <tbody>
          {listaFiltrada.length === 0 && (
            <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">Todavía no hay tratamientos.</td></tr>
          )}
          {listaFiltrada.map((t) => (
            <tr key={t.id} className="border-t border-slate-800">
              <td className="px-3 py-2 text-slate-400">{new Date(t.fecha).toLocaleDateString('es-ES')}</td>
              <td className="px-3 py-2">{t.tipo}</td>
              <td className="px-3 py-2">{t.producto ?? '—'}</td>
              <td className="px-3 py-2">{fmt(t.dosis, t.unidad_dosis)}</td>
              <td className="px-3 py-2">{t.clima_fuente === 'no_disponible' ? '—' : fmt(t.temp_c_aplicacion, '°C')}</td>
              <td className="px-3 py-2">{t.clima_fuente === 'no_disponible' ? '—' : fmt(t.viento_ms_aplicacion, 'm/s')}</td>
              <SoloGestor>
                <td className="px-3 py-2">
                  <button type="button" disabled={borrandoId === t.id} onClick={() => borrar(t)} className="text-red-300 hover:underline disabled:opacity-60">
                    {borrandoId === t.id ? 'Borrando…' : 'Borrar'}
                  </button>
                </td>
              </SoloGestor>
            </tr>
          ))}
        </tbody>
      </table>

      <SoloGestor>
        <form className="mt-6 grid gap-4 sm:grid-cols-3" onSubmit={crear}>
          <label className="block">
            <span className="block text-xs font-medium text-slate-300">Fecha</span>
            <input
              type="datetime-local"
              required
              value={form.fecha}
              onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
              className={CAMPO}
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-300">Tipo</span>
            <select
              required
              value={form.tipo}
              onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}
              className={CAMPO}
            >
              <option value="" disabled>Elige un tipo</option>
              {opcionesTipo.map((t) => <option key={t} value={t}>{t}</option>)}
              <option value={OTRO}>Otro</option>
            </select>
          </label>
          {form.tipo === OTRO && (
            <label className="block">
              <span className="block text-xs font-medium text-slate-300">Tipo personalizado</span>
              <input
                required
                value={tipoPersonalizado}
                onChange={(e) => setTipoPersonalizado(e.target.value)}
                className={CAMPO}
              />
            </label>
          )}
          <label className="block">
            <span className="block text-xs font-medium text-slate-300">Producto</span>
            <input value={form.producto} onChange={(e) => setForm((f) => ({ ...f, producto: e.target.value }))} className={CAMPO} />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-300">Materia activa</span>
            <input value={form.materia_activa} onChange={(e) => setForm((f) => ({ ...f, materia_activa: e.target.value }))} className={CAMPO} />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-300">Dosis</span>
            <input type="number" step="any" value={form.dosis} onChange={(e) => setForm((f) => ({ ...f, dosis: e.target.value }))} className={CAMPO} />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-300">Unidad de dosis</span>
            <input value={form.unidad_dosis} onChange={(e) => setForm((f) => ({ ...f, unidad_dosis: e.target.value }))} className={CAMPO} placeholder="l/ha" />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-300">Cantidad total</span>
            <input type="number" step="any" value={form.cantidad_total} onChange={(e) => setForm((f) => ({ ...f, cantidad_total: e.target.value }))} className={CAMPO} />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-300">Unidad de cantidad</span>
            <input value={form.unidad_cantidad} onChange={(e) => setForm((f) => ({ ...f, unidad_cantidad: e.target.value }))} className={CAMPO} placeholder="l" />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-300">Operador</span>
            <input value={form.operador} onChange={(e) => setForm((f) => ({ ...f, operador: e.target.value }))} className={CAMPO} />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-300">Maquinaria</span>
            <input value={form.maquinaria} onChange={(e) => setForm((f) => ({ ...f, maquinaria: e.target.value }))} className={CAMPO} />
          </label>
          <label className="block sm:col-span-3">
            <span className="block text-xs font-medium text-slate-300">Notas</span>
            <textarea value={form.notas} onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} className={CAMPO} rows={2} />
          </label>
          <div className="sm:col-span-3">
            <button type="submit" disabled={guardando} className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-60">
              {guardando ? 'Guardando…' : 'Registrar tratamiento'}
            </button>
          </div>
        </form>
      </SoloGestor>
    </section>
  );
}
```

- [x] **Step 6: Conectar la pantalla en `App.jsx`**

Modify: `vinalert-front/src/App.jsx` — añadir el import:

```jsx
import Tratamientos from './pantallas/Tratamientos';
```

Y la entrada al mapa `PANTALLAS`:

```jsx
const PANTALLAS = {
  configuracion: Configuracion,
  sensores: Sensores,
  miembros: Miembros,
  estado: Estado,
  tratamientos: Tratamientos,
};
```

- [x] **Step 7: Ejecutar los tests**

Run: `cd vinalert-front && npm test`
Expected: todo en verde, `Tratamientos.test.jsx` con sus 8 tests pasando.

- [x] **Step 8: Commit**

```bash
git add vinalert-front/src/api/tratamientos.js vinalert-front/src/App.jsx vinalert-front/src/test/respuestas.js vinalert-front/src/pantallas/Tratamientos.jsx vinalert-front/src/pantallas/Tratamientos.test.jsx
git commit -m "feat: pantalla de tratamientos con alta, filtro en cliente y borrado"
```

---

## Task 3: Pantalla de foliar

**Files:**
- Create: `vinalert-front/src/api/foliar.js`
- Modify: `vinalert-front/src/App.jsx`
- Modify: `vinalert-front/src/test/respuestas.js`
- Modify: `vinalert-front/src/errores/MensajeError.jsx`
- Modify: `vinalert-front/src/errores/MensajeError.test.jsx`
- Create: `vinalert-front/src/pantallas/Foliar.jsx`
- Test: `vinalert-front/src/pantallas/Foliar.test.jsx`

**Interfaces:**
- Consumes: `useParcela()` → `{ parcela }` (D1). `<SoloGestor>`, `<MensajeError>` (D1, ampliado en esta tarea). El mapa `PANTALLAS` de `App.jsx`.
- Produces: `listarFoliar(parcelaId)`, `subirFoliar(parcelaId, archivo)` en `api/foliar.js`. Es la última pantalla del plan — nada la consume después.

- [x] **Step 1: Añadir la fixture**

Modify: `vinalert-front/src/test/respuestas.js` — añadir al final:

```js
export const LECTURA_FOLIAR = {
  id: 1,
  parcela_id: 1,
  fecha: '2026-08-15',
  grupo: 1,
  chl_medio: 32.4,
  chl_sd: 1.2,
  flav_medio: 0.98,
  flav_sd: 0.05,
  nbi_medio: 33.1,
  nbi_sd: 2.4,
  n_mediciones: 10,
  archivo_origen: 'foliar_15ago.xlsx',
};
```

- [x] **Step 2: Escribir el test de `MensajeError` para 422 en texto plano**

Modify: `vinalert-front/src/errores/MensajeError.test.jsx` — añadir junto al test existente `'422 lista los campos que fallan'`:

```jsx
test('422 con un detail en texto plano lo muestra tal cual', () => {
  // subir_excel_foliar manda el 422 como una frase (str(exc)), no como la
  // lista de errores por campo que manda la validacion normal de Pydantic.
  const error = {
    response: {
      status: 422,
      data: { detail: 'No se pudo abrir el archivo: formato no reconocido.' },
    },
  };
  render(<MensajeError error={error} />);
  expect(screen.getByText('No se pudo abrir el archivo: formato no reconocido.')).toBeInTheDocument();
});
```

- [x] **Step 3: Ejecutar y verificar que el nuevo test falla**

Run: `cd vinalert-front && npm test -- MensajeError`
Expected: FAIL en el test nuevo — hoy cae al genérico `'Hay datos que no son validos.'` porque `detail` no es un array.

- [x] **Step 4: Ampliar `MensajeError.jsx`**

Modify: `vinalert-front/src/errores/MensajeError.jsx` — sustituir la rama de 422:

```jsx
  } else if (status === 422) {
    if (Array.isArray(detail)) {
      const campos = detail.map((d) => `${d.loc?.[d.loc.length - 1]}: ${d.msg}`);
      texto = campos.length ? campos.join(' · ') : 'Hay datos que no son validos.';
    } else if (typeof detail === 'string') {
      texto = detail;
    } else {
      texto = 'Hay datos que no son validos.';
    }
  } else if (error.response) {
```

- [x] **Step 5: Ejecutar los tests de `MensajeError`**

Run: `cd vinalert-front && npm test -- MensajeError`
Expected: los 7 tests de `MensajeError.test.jsx` en verde (los 6 anteriores más el nuevo).

- [x] **Step 6: Escribir el test de la pantalla**

Create: `vinalert-front/src/pantallas/Foliar.test.jsx`

```jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';

import { LECTURA_FOLIAR, PARCELA_GESTOR, PARCELA_LECTURA } from '../test/respuestas';
import { ProveedorParcela } from '../parcela/ParcelaContext';
import Foliar from './Foliar';

vi.mock('../api/parcelas', () => ({ obtenerParcela: vi.fn() }));
vi.mock('../api/foliar', () => ({ listarFoliar: vi.fn(), subirFoliar: vi.fn() }));
import { obtenerParcela } from '../api/parcelas';
import { listarFoliar, subirFoliar } from '../api/foliar';

function montar(parcela) {
  obtenerParcela.mockResolvedValue(parcela);
  return render(
    <ProveedorParcela parcelaId={parcela.id}><Foliar /></ProveedorParcela>,
  );
}

beforeEach(() => vi.clearAllMocks());

test('se ven las lecturas agrupadas por fecha', async () => {
  listarFoliar.mockResolvedValue([LECTURA_FOLIAR]);
  montar(PARCELA_GESTOR);

  expect(await screen.findByText('15/8/2026')).toBeInTheDocument();
  expect(screen.getByText(/32.4/)).toBeInTheDocument();
});

test('un lector no ve la zona de subida', async () => {
  listarFoliar.mockResolvedValue([]);
  montar(PARCELA_LECTURA);

  await screen.findByText(/todav[ií]a no hay lecturas/i);
  expect(screen.queryByLabelText('Archivo Excel del medidor foliar')).not.toBeInTheDocument();
});

test('subir un excel valido anade las lecturas nuevas', async () => {
  listarFoliar.mockResolvedValue([]);
  const nueva = { ...LECTURA_FOLIAR, id: 2 };
  subirFoliar.mockResolvedValue([nueva]);
  montar(PARCELA_GESTOR);

  await screen.findByText(/todav[ií]a no hay lecturas/i);
  const archivo = new File(['contenido'], 'foliar.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  await userEvent.upload(screen.getByLabelText('Archivo Excel del medidor foliar'), archivo);
  await userEvent.click(screen.getByRole('button', { name: 'Subir' }));

  expect(subirFoliar).toHaveBeenCalledWith(1, archivo);
  expect(await screen.findByText('15/8/2026')).toBeInTheDocument();
});

test('un archivo con formato invalido se traduce con MensajeError', async () => {
  listarFoliar.mockResolvedValue([]);
  subirFoliar.mockRejectedValue({
    response: { status: 422, data: { detail: 'No se pudo abrir el archivo: formato no reconocido.' } },
  });
  montar(PARCELA_GESTOR);

  await screen.findByText(/todav[ií]a no hay lecturas/i);
  const archivo = new File(['contenido'], 'roto.xlsx', { type: 'application/octet-stream' });
  await userEvent.upload(screen.getByLabelText('Archivo Excel del medidor foliar'), archivo);
  await userEvent.click(screen.getByRole('button', { name: 'Subir' }));

  expect(await screen.findByText(/formato no reconocido/i)).toBeInTheDocument();
});
```

- [x] **Step 7: Ejecutar y verificar que falla**

Run: `cd vinalert-front && npm test`
Expected: FAIL — `./Foliar` y `../api/foliar` no existen.

- [x] **Step 8: Escribir el cliente de API de foliar**

Create: `vinalert-front/src/api/foliar.js`

```js
import cliente from './cliente';

export async function listarFoliar(parcelaId) {
  const { data } = await cliente.get(`/parcelas/${parcelaId}/foliar/`);
  return data;
}

export async function subirFoliar(parcelaId, archivo) {
  const formData = new FormData();
  formData.append('archivo', archivo);
  const { data } = await cliente.post(`/parcelas/${parcelaId}/foliar/upload`, formData);
  return data;
}
```

- [x] **Step 9: Escribir la pantalla**

Create: `vinalert-front/src/pantallas/Foliar.jsx`

```jsx
import { Fragment, useEffect, useRef, useState } from 'react';

import { listarFoliar, subirFoliar } from '../api/foliar';
import MensajeError from '../errores/MensajeError';
import { useParcela } from '../parcela/ParcelaContext';
import SoloGestor from '../parcela/SoloGestor';

function fmt(valor) {
  return valor == null ? '—' : valor;
}

// Asume que `lecturas` ya viene ordenada por fecha (descendente): agrupa
// filas consecutivas de la misma fecha bajo una unica cabecera visual.
function agruparPorFecha(lecturas) {
  const grupos = [];
  for (const l of lecturas) {
    const fecha = new Date(l.fecha).toLocaleDateString('es-ES');
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.fecha === fecha) {
      ultimo.filas.push(l);
    } else {
      grupos.push({ fecha, filas: [l] });
    }
  }
  return grupos;
}

export default function Foliar() {
  const { parcela } = useParcela();
  const [lecturas, setLecturas] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [archivo, setArchivo] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    let vigente = true;
    listarFoliar(parcela.id)
      .then((l) => { if (vigente) { setLecturas(l); setError(null); } })
      .catch((e) => { if (vigente) setError(e); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [parcela.id]);

  const subir = async (e) => {
    e.preventDefault();
    if (!archivo) return;
    setError(null);
    setSubiendo(true);
    try {
      const nuevas = await subirFoliar(parcela.id, archivo);
      setLecturas((prev) =>
        [...prev, ...nuevas].sort((a, b) => {
          const porFecha = new Date(b.fecha) - new Date(a.fecha);
          return porFecha !== 0 ? porFecha : a.grupo - b.grupo;
        }),
      );
      setArchivo(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      setError(err);
    } finally {
      setSubiendo(false);
    }
  };

  if (cargando) return <p className="p-8 text-slate-400">Cargando lecturas foliares…</p>;
  if (error && lecturas === null) {
    return (
      <div className="p-8">
        <MensajeError error={error} textoNoEncontrado="No se pudieron cargar las lecturas foliares." />
      </div>
    );
  }

  return (
    <section>
      <h2 className="text-xl font-semibold text-slate-50">Foliar</h2>

      <SoloGestor>
        <form className="mt-4 flex flex-wrap items-center gap-3" onSubmit={subir}>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            aria-label="Archivo Excel del medidor foliar"
            onChange={(e) => setArchivo(e.target.files[0] ?? null)}
            className="text-sm text-slate-300"
          />
          <button
            type="submit"
            disabled={subiendo || !archivo}
            className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-60"
          >
            {subiendo ? 'Subiendo…' : 'Subir'}
          </button>
        </form>
      </SoloGestor>

      <MensajeError error={error} textoNoEncontrado="No se pudieron cargar las lecturas foliares." />

      <table className="mt-4 w-full text-left text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2">Grupo</th>
            <th className="px-3 py-2">Clorofila</th>
            <th className="px-3 py-2">Flavonoides</th>
            <th className="px-3 py-2">NBI</th>
            <th className="px-3 py-2">Mediciones</th>
            <th className="px-3 py-2">Archivo</th>
          </tr>
        </thead>
        <tbody>
          {lecturas.length === 0 && (
            <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">Todavía no hay lecturas foliares.</td></tr>
          )}
          {agruparPorFecha(lecturas).map(({ fecha, filas }) => (
            <Fragment key={fecha}>
              <tr>
                <td colSpan={6} className="bg-slate-900/80 px-3 py-1 text-xs font-semibold text-cyan-300">
                  {fecha}
                </td>
              </tr>
              {filas.map((l) => (
                <tr key={l.id} className="border-t border-slate-800">
                  <td className="px-3 py-2">{l.grupo}</td>
                  <td className="px-3 py-2">{fmt(l.chl_medio)} ± {fmt(l.chl_sd)}</td>
                  <td className="px-3 py-2">{fmt(l.flav_medio)} ± {fmt(l.flav_sd)}</td>
                  <td className="px-3 py-2">{fmt(l.nbi_medio)} ± {fmt(l.nbi_sd)}</td>
                  <td className="px-3 py-2">{fmt(l.n_mediciones)}</td>
                  <td className="px-3 py-2 text-slate-500">{l.archivo_origen ?? '—'}</td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

- [x] **Step 10: Conectar la pantalla en `App.jsx`**

Modify: `vinalert-front/src/App.jsx` — añadir el import:

```jsx
import Foliar from './pantallas/Foliar';
```

Y la entrada final del mapa `PANTALLAS`:

```jsx
const PANTALLAS = {
  configuracion: Configuracion,
  sensores: Sensores,
  miembros: Miembros,
  estado: Estado,
  tratamientos: Tratamientos,
  foliar: Foliar,
};
```

- [x] **Step 11: Ejecutar los tests**

Run: `cd vinalert-front && npm test`
Expected: todo en verde. `Foliar.test.jsx` con sus 4 tests, `MensajeError.test.jsx` con 7 (1 más que antes). Total del proyecto: 56 + 4 (Estado) + 8 (Tratamientos) + 4 (Foliar) + 1 (MensajeError) = 73 tests.

- [x] **Step 12: Commit**

```bash
git add vinalert-front/src/api/foliar.js vinalert-front/src/App.jsx vinalert-front/src/test/respuestas.js vinalert-front/src/errores/MensajeError.jsx vinalert-front/src/errores/MensajeError.test.jsx vinalert-front/src/pantallas/Foliar.jsx vinalert-front/src/pantallas/Foliar.test.jsx
git commit -m "feat: pantalla de foliar con subida de Excel y MensajeError capaz de mostrar un 422 en texto plano"
```

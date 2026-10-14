import datos from './datos.json';

/**
 * La API de la parcela de ejemplo, dentro del navegador.
 *
 * Mientras dura la demo, el cliente HTTP responde desde aqui en vez de llamar
 * al servidor (ver api/cliente.js). Los datos son respuestas reales de la API
 * capturadas por scripts/generar_demo.py; aqui solo se desplazan las fechas
 * para que parezcan recientes, se recortan segun lo que pida cada pantalla y
 * se guardan en memoria los cambios del visitante. Nada sale del navegador y
 * al recargar todo vuelve a como estaba.
 */

const PID = datos.parcelaId;

/** El id de la parcela de ejemplo, para entrar en ella. */
export const PARCELA_DEMO = PID;
const DIA_MS = 24 * 3600 * 1000;
const FECHA = /^(\d{4})-(\d{2})-(\d{2})(T[\d:.]+)?$/;

/** Suma `dias` a cada fecha ("2026-10-14") o fecha con hora que encuentre, en cualquier profundidad. */
export function desplazarFechas(valor, dias) {
  if (typeof valor === 'string') {
    const m = valor.match(FECHA);
    if (!m) return valor;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + dias));
    const fecha = d.toISOString().slice(0, 10);
    return m[4] ? fecha + m[4] : fecha;
  }
  if (Array.isArray(valor)) return valor.map((v) => desplazarFechas(v, dias));
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, desplazarFechas(v, dias)]));
  }
  return valor;
}

/**
 * Cuantos dias hay que mover los datos para que la ultima lectura caiga hoy
 * sin quedar en el futuro (se movio un numero entero de dias: la hora del dia
 * de cada lectura se conserva).
 */
function diasDeDesplazamiento() {
  // El historico viene como lo da el backend: las mas recientes, en orden
  // cronologico ascendente. La ultima es la mas nueva.
  const ultima = new Date(datos.respuestas.historico.at(-1).fecha_hora).getTime();
  let dias = Math.round((Date.now() - ultima) / DIA_MS);
  if (ultima + dias * DIA_MS > Date.now()) dias -= 1;
  return dias;
}

let estado;
let siguienteId;

/** Vuelve a dejar la parcela como se genero. Se llama al entrar en la demo. */
export function reiniciarDemo() {
  estado = structuredClone(desplazarFechas(datos.respuestas, diasDeDesplazamiento()));
  siguienteId = 100000;
}
reiniciarDemo();

function respuesta(config, data, status = 200) {
  return { data, status, statusText: String(status), headers: {}, config, request: {} };
}

function rechazo(config, status, detail) {
  const error = new Error(typeof detail === 'string' ? detail : `HTTP ${status}`);
  error.config = config;
  error.response = { status, data: { detail }, headers: {}, config };
  error.isAxiosError = true;
  return error;
}

const NO_EN_EJEMPLO = 'En la parcela de ejemplo no se puede hacer esto. Solicita una demostración y te preparamos una cuenta.';

function cuerpo(config) {
  if (!config.data || typeof config.data !== 'string') return {};
  try {
    return JSON.parse(config.data);
  } catch {
    return {};
  }
}

function hoyIso() {
  const h = new Date();
  const dos = (n) => String(n).padStart(2, '0');
  return `${h.getFullYear()}-${dos(h.getMonth() + 1)}-${dos(h.getDate())}`;
}

function haceDias(dias) {
  const d = new Date(Date.now() - dias * DIA_MS);
  const dos = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

/** Las rutas de la parcela de ejemplo: [metodo, patron, (config, coincidencias) => datos | Promise]. */
const RUTAS = [
  ['get', /^\/auth\/me$/, () => estado.me],
  ['get', /^\/parcelas\/$/, () => [estado.parcela]],
  ['get', new RegExp(`^/parcelas/${PID}$`), () => estado.parcela],
  ['patch', new RegExp(`^/parcelas/${PID}$`), (c) => {
    estado.parcela = { ...estado.parcela, ...cuerpo(c) };
    estado.dashboard.parcela = estado.parcela;
    return estado.parcela;
  }],
  ['get', new RegExp(`^/parcelas/${PID}/dashboard$`), () => ({ ...estado.dashboard, parcela: estado.parcela })],
  ['get', new RegExp(`^/parcelas/${PID}/historico$`), (c) => {
    const { limite = 15, horas } = c.params ?? {};
    let filas = estado.historico;
    if (horas != null) {
      const desde = Date.now() - Number(horas) * 3600 * 1000;
      filas = filas.filter((l) => new Date(l.fecha_hora).getTime() >= desde);
    }
    // Las `limite` mas recientes, en orden ascendente, como el backend.
    return filas.slice(-Number(limite));
  }],
  ['get', new RegExp(`^/parcelas/${PID}/clima/horario$`), () => estado.climaHorario],
  ['get', new RegExp(`^/parcelas/${PID}/suelo/diario$`), (c) => {
    const desde = haceDias(Number(c.params?.dias ?? 30));
    return estado.sueloDiario.filter((f) => f.fecha >= desde);
  }],
  ['get', new RegExp(`^/parcelas/${PID}/clima/diario$`), (c) => {
    const dias = c.params?.dias;
    return dias == null ? estado.climaDiario : estado.climaDiario.filter((f) => f.fecha >= haceDias(Number(dias)));
  }],
  ['get', new RegExp(`^/parcelas/${PID}/clima/comprobar$`), () => ({
    disponible: true, latitud: estado.parcela.latitud, longitud: estado.parcela.longitud, motivo: null,
  })],
  ['post', new RegExp(`^/parcelas/${PID}/actualizar-clima$`), () => estado.dashboard.clima_actual],

  // Sensores
  ['get', new RegExp(`^/parcelas/${PID}/sensores/$`), () => estado.sensores],
  ['post', new RegExp(`^/parcelas/${PID}/sensores/provisionar$`), (c) => {
    const { cantidad } = cuerpo(c);
    for (let n = estado.sensores.length + 1; n <= Number(cantidad); n += 1) {
      estado.sensores.push({
        id: siguienteId++, parcela_id: PID, numero: n, etiqueta: `Sensor ${n}`, activo: true,
        profundidad_cm: null, latitud: null, longitud: null, modelo: null,
      });
    }
    return estado.sensores;
  }],
  ['patch', new RegExp(`^/parcelas/${PID}/sensores/(\\d+)$`), (c, [, id]) => {
    const i = estado.sensores.findIndex((s) => s.id === Number(id));
    if (i < 0) throw rechazo(c, 404, 'Sensor no encontrado');
    estado.sensores[i] = { ...estado.sensores[i], ...cuerpo(c) };
    return estado.sensores[i];
  }],
  ['delete', new RegExp(`^/parcelas/${PID}/sensores/(\\d+)$`), (c, [, id]) => {
    estado.sensores = estado.sensores.filter((s) => s.id !== Number(id));
    return null;
  }],

  // Cuaderno de tratamientos
  ['get', new RegExp(`^/parcelas/${PID}/tratamientos$`), () => estado.tratamientos],
  ['post', /^\/tratamientos\/$/, (c) => {
    const b = cuerpo(c);
    const clima = estado.dashboard.clima_actual ?? {};
    const nuevo = {
      id: siguienteId++, cantidad_total: null, unidad_cantidad: null, producto: null, materia_activa: null,
      dosis: null, unidad_dosis: null, operador: null, maquinaria: null, notas: null,
      ...b,
      fecha: String(b.fecha ?? '').replace(/Z$/, '').slice(0, 19),
      temp_c_aplicacion: clima.temp_c ?? null,
      viento_ms_aplicacion: clima.viento_vel_ms ?? null,
      humedad_relativa_aplicacion: clima.humedad_relativa_pct ?? null,
      lluvia_mm_aplicacion: clima.lluvia_mm ?? null,
      clima_fecha_hora: clima.fecha_hora ?? null,
      clima_fuente: clima.fecha_hora ? 'log_clima' : 'no_disponible',
    };
    estado.tratamientos = [nuevo, ...estado.tratamientos].sort((a, b2) => (a.fecha < b2.fecha ? 1 : -1));
    return nuevo;
  }, 201],
  ['delete', /^\/tratamientos\/(\d+)$/, (c, [, id]) => {
    estado.tratamientos = estado.tratamientos.filter((t) => t.id !== Number(id));
    return null;
  }],

  // Medidas foliares: "subir" un Excel anade una campana de muestra con fecha de hoy.
  ['get', new RegExp(`^/parcelas/${PID}/foliar/$`), () => estado.foliar],
  ['post', new RegExp(`^/parcelas/${PID}/foliar/upload$`), () => {
    const ultima = estado.foliar.reduce((max, f) => (f.fecha > max ? f.fecha : max), '');
    const nuevas = estado.foliar
      .filter((f) => f.fecha === ultima)
      .map((f) => ({
        ...f,
        id: siguienteId++,
        fecha: hoyIso(),
        chl_medio: f.chl_medio == null ? null : Math.round((f.chl_medio - 0.8) * 100) / 100,
        archivo_origen: 'ejemplo.xlsx',
      }));
    estado.foliar = [...nuevas, ...estado.foliar];
    return nuevas;
  }, 201],

  // Acceso
  ['get', new RegExp(`^/parcelas/${PID}/usuarios$`), () => estado.miembros],
  ['post', new RegExp(`^/parcelas/${PID}/usuarios$`), (c) => {
    const { email = '', rol = 'lectura' } = cuerpo(c);
    const normal = email.trim().toLowerCase();
    if (estado.miembros.some((m) => m.email === normal)) throw rechazo(c, 409, 'Ese usuario ya tiene acceso a esta parcela');
    const nuevo = { usuario_id: siguienteId++, nombre: '', email: normal, rol, pendiente: true };
    estado.miembros = [...estado.miembros, nuevo];
    return nuevo;
  }, 201],
  ['patch', new RegExp(`^/parcelas/${PID}/usuarios/(\\d+)$`), (c, [, id]) => {
    const i = estado.miembros.findIndex((m) => m.usuario_id === Number(id));
    if (i < 0) throw rechazo(c, 404, 'Ese usuario ya no tiene acceso a esta parcela');
    const { rol } = cuerpo(c);
    const gestores = estado.miembros.filter((m) => m.rol === 'gestor').length;
    if (estado.miembros[i].rol === 'gestor' && rol !== 'gestor' && gestores === 1) {
      throw rechazo(c, 409, 'No puedes dejar la parcela sin ningun gestor: nombra a otro antes.');
    }
    estado.miembros[i] = { ...estado.miembros[i], rol };
    return estado.miembros[i];
  }],
  ['delete', new RegExp(`^/parcelas/${PID}/usuarios/(\\d+)$`), (c, [, id]) => {
    estado.miembros = estado.miembros.filter((m) => m.usuario_id !== Number(id));
    return null;
  }],
  ['post', /^\/auth\/invitaciones\/\d+\/reenviar$/, () => null],

  // Los dispositivos solo los gestiona el superadmin: en el ejemplo no hay.
  ['get', new RegExp(`^/parcelas/${PID}/dispositivos$`), () => []],
];

/** Lo que en la demo no tiene sentido: cuenta, contrasena, borrar la parcela, administracion. */
const RECHAZADAS = [
  ['delete', new RegExp(`^/parcelas/${PID}$`)],
  ['post', /^\/parcelas\/$/],
  ['post', /^\/auth\//],
  ['put', /^\/admin\//],
  ['patch', /^\/admin\//],
  ['delete', /^\/admin\//],
  ['post', /^\/admin\//],
  ['get', /^\/admin\//],
];

/** Un adaptador de axios: recibe la config de la peticion y resuelve o rechaza como lo haria el servidor. */
export async function responder(config) {
  const metodo = (config.method ?? 'get').toLowerCase();
  const ruta = (config.url ?? '').replace(/^https?:\/\/[^/]+/, '').split('?')[0];

  for (const [m, patron, manejar, status = 200] of RUTAS) {
    if (m !== metodo) continue;
    const coincide = ruta.match(patron);
    if (!coincide) continue;
    const data = await manejar(config, coincide);
    return respuesta(config, structuredClone(data), metodo === 'delete' ? 204 : status);
  }
  if (RECHAZADAS.some(([m, patron]) => m === metodo && patron.test(ruta))) {
    throw rechazo(config, 409, NO_EN_EJEMPLO);
  }
  throw rechazo(config, 404, 'Not Found');
}

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

export const DISPOSITIVO = {
  id: 3,
  parcela_id: 1,
  nombre: 'Maestro LoRa',
  token: 'eyJhbGciOiJIUzI1NiJ9.token-de-prueba',
  activo: true,
  creado_en: '2026-08-22T10:00:00',
  ultimo_uso: '2026-08-22T12:30:00',
  intervalo_ciclo_seg: 14400,
};

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

export const MIEMBRO_GESTOR = { usuario_id: 1, nombre: 'Test User', email: 'test@vinalert.dev', rol: 'gestor' };
export const MIEMBRO_LECTURA = { usuario_id: 2, nombre: 'Otra Persona', email: 'otra@vinalert.dev', rol: 'lectura' };

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

export const SUELO_DIARIO = [
  {
    id: 1,
    parcela_id: 1,
    fecha: '2026-08-14',
    humedad_media: 27.2,
    humedad_sd: 1.8,
    humedad_max: 30.1,
    humedad_min: 24.5,
    temperatura_media: 18.5,
    temperatura_sd: 1.2,
    temperatura_max: 22.0,
    temperatura_min: 15.0,
    n_sensores: 3,
    n_lecturas: 144,
  },
  {
    id: 2,
    parcela_id: 1,
    fecha: '2026-08-15',
    humedad_media: 29.5,
    humedad_sd: 2.0,
    humedad_max: 32.4,
    humedad_min: 26.8,
    temperatura_media: 19.1,
    temperatura_sd: 1.4,
    temperatura_max: 23.5,
    temperatura_min: 15.8,
    n_sensores: 3,
    n_lecturas: 144,
  },
];

export const CLIMA_DIARIO = [
  {
    id: 1,
    parcela_id: 1,
    fecha: '2026-08-14',
    temp_max: 24.2,
    temp_min: 14.5,
    temp_media: 19.3,
    humedad_relativa_media: 68.0,
    precipitacion_total_mm: 5.2,
    et0_total_dia: 3.1,
    radiacion_total_mj_m2: 18.5,
    horas_sol: 7.2,
    viento_vel_media: 2.3,
    viento_racha_max: 5.1,
    fuente: 'open-meteo',
  },
  {
    id: 2,
    parcela_id: 1,
    fecha: '2026-08-15',
    temp_max: 26.0,
    temp_min: 15.2,
    temp_media: 20.6,
    humedad_relativa_media: 62.0,
    precipitacion_total_mm: 0.0,
    et0_total_dia: 4.2,
    radiacion_total_mj_m2: 22.1,
    horas_sol: 9.5,
    viento_vel_media: 1.8,
    viento_racha_max: 4.0,
    fuente: 'open-meteo',
  },
];





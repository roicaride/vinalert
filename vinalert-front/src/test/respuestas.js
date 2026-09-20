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

/** El administrador maestro: el unico que ve Administracion y los ESP32. */
export const USUARIO_SUPERADMIN = { ...USUARIO_ADMIN, es_superadmin: true };

/** Respuesta de GET /admin/usuarios: de la alta mas reciente a la mas antigua. */
export const CUENTAS = [
  { id: 12, nombre: 'Marta Ferreiro', email: 'marta@vinalert.dev', telefono: null, rol: 'agricultor', creado_en: '2026-09-18T10:15:00', n_parcelas: 2 },
  { id: 11, nombre: 'Xoán Otero', email: 'xoan@viticultores.gal', telefono: '600000000', rol: 'agricultor', creado_en: '2026-09-02T18:40:00', n_parcelas: 0 },
  { id: 9, nombre: 'Admin', email: 'admin@vinalert.dev', telefono: null, rol: 'admin', creado_en: null, n_parcelas: 5 },
];

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
    lluvia_prev_24h_mm: 3.4,
    prob_lluvia_24h_pct: 70,
    lluvia_prev_48h_mm: 0,
    prob_lluvia_48h_pct: 15,
    punto_rocio_c: 12.1,
    vpd_kpa: 1.8,
    nubosidad_pct: 23,
    uv_index: 1.2,
    presion_hpa: 1002.3,
    viento_vel_ms: 4.33,
    viento_dir_deg: 7,
    suelo_temp_0cm: 22.5,
    suelo_temp_6cm: 24.1,
    suelo_temp_18cm: 21.2,
    suelo_hum_0_1cm: 0.199,
    suelo_hum_1_3cm: 0.206,
    suelo_hum_3_9cm: 0.22,
    suelo_hum_9_27cm: 0.244,
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





/**
 * Respuesta de GET /parcelas/{id}/clima/horario: 3 horas pasadas y 30 de
 * prevision. Las 24 primeras de prevision suman 2.4 mm (prob. max. 40 %); las
 * 6 siguientes, 6 mm mas (prob. 90 %), asi que las 48 h llegan a 8.4 mm.
 */
export const CLIMA_HORARIO = [
  { fecha_hora: '2026-09-18T08:00:00', lluvia_mm: 0.5, prob_lluvia_pct: null, et0_mm: 0.2, temp_c: 17.0, prevision: false },
  { fecha_hora: '2026-09-18T09:00:00', lluvia_mm: 1.0, prob_lluvia_pct: null, et0_mm: 0.3, temp_c: 18.0, prevision: false },
  { fecha_hora: '2026-09-18T10:00:00', lluvia_mm: 0, prob_lluvia_pct: null, et0_mm: 0.1, temp_c: 19.0, prevision: false },
  ...Array.from({ length: 30 }, (_, i) => ({
    fecha_hora: new Date(Date.UTC(2026, 8, 18, 11 + i)).toISOString().slice(0, 19),
    lluvia_mm: i < 24 ? 0.1 : 1.0,
    prob_lluvia_pct: i < 24 ? 40 : 90,
    et0_mm: 0.1,
    temp_c: 18.0,
    prevision: true,
  })),
];

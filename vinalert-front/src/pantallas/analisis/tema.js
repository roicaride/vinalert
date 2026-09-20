/**
 * El tema de las graficas.
 *
 * Recharts pinta con SVG, asi que no ve las clases de Tailwind: los colores y
 * la tipografia hay que darselos en crudo. Estan aqui, en un sitio, para que
 * las tres graficas de Analisis no diverjan y para que cambiar una tinta sea
 * un cambio y no seis.
 *
 * ---------------------------------------------------------------------------
 * Sobre las tintas de serie
 *
 * NO son las de la marca. BROTE (#8FC93A) y AMBAR (#E0913A) puestos en la
 * misma grafica son indistinguibles para una persona con deuteranopia —la
 * forma mas comun de daltonismo, ~6% de los hombres—, y estas graficas son
 * justamente donde se toman decisiones de riego. Asi que las series salen de
 * una paleta calculada: cada trio esta comprobado para que ningun par baje de
 * ΔE 8 bajo deuteranopia ni de ΔE 15 en vision normal, y todas contrastan
 * 3:1 o mas contra LOUSA.
 *
 * El codigo de tinta es por ENTIDAD, no por orden de serie:
 *   AGUA   azul   — humedad del suelo, lluvia, NBI
 *   CALOR  ambar  — temperatura, en rampa clara/media/oscura para max/med/min
 *   VINO   granate— ET₀, flavonoides
 *   HOJA   lima   — clorofila, hoja mojada
 *   VIENTO violeta — viento medio y racha (grafica de Detalle, sola)
 *   MODELO gris    — lo que calcula Open-Meteo, como referencia
 */

export const MONO = "'IBM Plex Mono', ui-monospace, monospace";

export const SERIES = {
  agua: '#4B98E3',
  calor: '#C7832D',
  calorAlto: '#DC9E57',
  calorBajo: '#AA6C18',
  vino: '#C1558A',
  hoja: '#69A81C',
  // Rampas de un solo tono para maximo/minimo de una misma magnitud: se leen
  // como el rango de una cosa, no como variables distintas.
  aguaAlto: '#7BB1E9',
  aguaBajo: '#3E7FC3',
  viento: '#A979DD',
  vientoAlto: '#C2A2E9',
  // Una referencia calculada (no medida) va en gris: acompana, no compite.
  modelo: '#787C7B',
};

const LINEA = '#3b4144';
const OSO3 = '#787c7b';
const LOUSA = '#222a2e';

/** La rejilla del fondo: presente, nunca protagonista. */
export const GRID = { stroke: LINEA, strokeDasharray: '2 4', vertical: false };

/** Los ejes hablan en Mono, como todo lo que es una medida. */
export const EJE = {
  stroke: LINEA,
  tick: { fill: OSO3, fontSize: 10, fontFamily: MONO },
  tickLine: false,
  axisLine: { stroke: LINEA },
};

/**
 * Cada sensor tiene SU color, el mismo en todas las graficas, por su numero
 * (S1…S6, y vuelta a empezar). La profundidad va en el trazo: codificacion
 * secundaria, para que dos colores cercanos se sigan distinguiendo.
 */
export const COLORES_SENSOR = ['#4B98E3', '#C7832D', '#C1558A', '#69A81C', '#A979DD', '#27A6A3'];

export function colorSensor(numero) {
  return COLORES_SENSOR[(Math.max(1, numero) - 1) % COLORES_SENSOR.length];
}

/** 20 cm continuo, 40 cm discontinuo, 60 cm punteado; el resto, continuo. */
export function trazoProfundidad(cm) {
  if (cm === 40) return '6 3';
  if (cm === 60) return '2 3';
  return undefined;
}

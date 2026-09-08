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
 *   HOJA   lima   — clorofila
 */

export const MONO = "'IBM Plex Mono', ui-monospace, monospace";

export const SERIES = {
  agua: '#4B98E3',
  calor: '#C7832D',
  calorAlto: '#DC9E57',
  calorBajo: '#AA6C18',
  vino: '#C1558A',
  hoja: '#69A81C',
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

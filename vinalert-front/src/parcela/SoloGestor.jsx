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

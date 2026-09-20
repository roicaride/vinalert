/**
 * La piel de los botones, separada del componente para que un ENLACE pueda
 * vestirse igual que un boton. "Crear cuenta" navega —es un <a>, no un
 * <button>— pero tiene que parecer la accion principal que es.
 *
 * Cada tono declara su propio fondo. Tener un `bg-transparent` comun en la
 * base y luego `bg-brote` en el tono no funciona: las dos son la misma
 * propiedad y el orden en el atributo class no decide nada —lo decide el orden
 * en la hoja—, asi que el boton solido se quedaba sin fondo.
 */

const TONOS = {
  fantasma:
    'border border-brote bg-transparent text-brote hover:bg-brote hover:text-lousa disabled:hover:bg-transparent disabled:hover:text-brote',
  solido: 'border border-brote bg-brote text-lousa hover:border-oso hover:bg-oso',
  sutil:
    'border border-linea bg-transparent text-oso-2 hover:border-linea-viva hover:text-oso',
  peligro:
    'border border-sangre/60 bg-transparent text-sangre hover:bg-sangre hover:text-lousa',
};

const TAMANOS = {
  sm: 'px-2.5 py-1 text-[10px]',
  md: 'px-4 py-2 text-[11px]',
  lg: 'px-6 py-3 text-xs',
};

export function claseBoton(tono = 'sutil', tamano = 'md') {
  return (
    'inline-flex items-center justify-center gap-2 font-mono font-medium tracking-[0.16em] ' +
    'whitespace-nowrap uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-40 ' +
    `${TONOS[tono]} ${TAMANOS[tamano]}`
  );
}

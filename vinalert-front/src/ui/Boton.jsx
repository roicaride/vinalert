/**
 * Los botones.
 *
 * Todos hablan en Mono versal: son ordenes a un aparato. La jerarquia no se
 * hace con tamano ni con sombra, se hace con cuanto BROTE se gasta —el acento
 * es uno solo, y quien lo lleva es la accion principal de la pantalla.
 *
 * `fantasma` es el boton de la marca (linea BROTE, texto BROTE, fondo vacio,
 * y al pasar por encima se invierte). `solido` se reserva para el envio de un
 * formulario, donde el peso ayuda a cerrar. `sutil` es todo lo demas.
 */

// Cada tono declara su propio fondo. Tener un `bg-transparent` comun en la base
// y luego `bg-brote` en el tono no funciona: las dos son la misma propiedad y el
// orden en el atributo class no decide nada —lo decide el orden en la hoja—, asi
// que el boton solido se quedaba sin fondo y con el texto LOUSA invisible.
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
};

export default function Boton({
  tono = 'sutil',
  tamano = 'md',
  className = '',
  type = 'button',
  children,
  ...resto
}) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 font-mono font-medium tracking-[0.16em] uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${TONOS[tono]} ${TAMANOS[tamano]} ${className}`}
      {...resto}
    >
      {children}
    </button>
  );
}

/** Un boton que solo es texto: para "cambiar", "cancelar", "cerrar sesion". */
export function Enlace({ className = '', type = 'button', children, ...resto }) {
  return (
    <button
      type={type}
      className={`bg-transparent font-mono text-[11px] tracking-[0.16em] text-oso-3 uppercase underline-offset-4 transition-colors hover:text-brote hover:underline disabled:opacity-40 ${className}`}
      {...resto}
    >
      {children}
    </button>
  );
}

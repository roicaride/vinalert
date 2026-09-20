import { claseBoton } from './claseBoton';

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
 *
 * La piel vive en `claseBoton.js` para que un enlace pueda llevarla tambien.
 */
export default function Boton({
  tono = 'sutil',
  tamano = 'md',
  className = '',
  type = 'button',
  children,
  ...resto
}) {
  return (
    <button type={type} className={`${claseBoton(tono, tamano)} ${className}`} {...resto}>
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

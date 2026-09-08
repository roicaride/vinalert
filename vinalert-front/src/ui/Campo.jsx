import { useId } from 'react';

/**
 * Los campos de formulario.
 *
 * El control sube un tono sobre LOUSA (ALZA) en vez de hundirse: en una
 * pantalla hecha de lineas, un hueco mas oscuro se lee como un agujero. Al
 * enfocar, la linea se pone BROTE —el mismo acento que los botones— para que
 * "esto esta vivo" signifique siempre lo mismo.
 *
 * La etiqueta va en Mono versal, como cualquier rotulo, y el DOM conserva el
 * texto tal cual se escribe: la versal la pone el CSS, no JavaScript.
 */

export const claseControl =
  'w-full border border-linea bg-alza px-3 py-2 font-mono text-sm text-oso ' +
  'placeholder:font-sans placeholder:text-oso-4 outline-none transition-colors ' +
  'focus:border-brote disabled:opacity-50 disabled:cursor-not-allowed ' +
  '[color-scheme:dark]';

export default function Campo({ etiqueta, ayuda, id, className = '', children, ...resto }) {
  const generado = useId();
  const idCampo = id || generado;

  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={idCampo} className="rotulo block">
        {etiqueta}
      </label>
      {children ? (
        children(idCampo)
      ) : (
        <input id={idCampo} className={`mt-1.5 ${claseControl}`} {...resto} />
      )}
      {ayuda && <p className="mt-1.5 text-xs text-oso-3">{ayuda}</p>}
    </div>
  );
}

/** Un desplegable con la misma piel que el campo de texto. */
export function Selector({ etiqueta, ayuda, id, className = '', children, ...resto }) {
  return (
    <Campo etiqueta={etiqueta} ayuda={ayuda} id={id} className={className}>
      {(idCampo) => (
        <select id={idCampo} className={`mt-1.5 ${claseControl}`} {...resto}>
          {children}
        </select>
      )}
    </Campo>
  );
}

/** Un area de texto con la misma piel. */
export function AreaTexto({ etiqueta, ayuda, id, filas = 3, className = '', ...resto }) {
  return (
    <Campo etiqueta={etiqueta} ayuda={ayuda} id={id} className={className}>
      {(idCampo) => (
        <textarea id={idCampo} rows={filas} className={`mt-1.5 resize-y ${claseControl}`} {...resto} />
      )}
    </Campo>
  );
}

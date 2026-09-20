/**
 * Las piezas de la rejilla.
 *
 * Regla unica de la que sale todo lo demas: los paneles NO flotan, comparten
 * linea. `Rejilla` pinta el fondo de color LINEA y separa a sus hijos con un
 * hueco de 1px; como cada hijo lleva su propio fondo LOUSA, ese hueco ES el
 * borde. Nunca hay bordes dobles, nunca hay esquinas que no casan, y anadir
 * una celda no obliga a repensar que lado lleva `border-r` y cual no.
 */

/** Contenedor de celdas separadas por linea. `cols` son clases de grid. */
export function Rejilla({ cols = '', children, className = '' }) {
  return <div className={`grid gap-px bg-linea ${cols} ${className}`}>{children}</div>;
}

/**
 * Una celda de la rejilla. Si lleva `titulo`, se pinta la banda de cabecera
 * —rotulo a la izquierda, lo que le pases en `accion` a la derecha— separada
 * del cuerpo por su propia linea.
 */
export function Panel({ titulo, accion, children, className = '', cuerpo = 'p-4' }) {
  return (
    <section className={`flex min-w-0 flex-col bg-lousa ${className}`}>
      {(titulo || accion) && (
        <header className="flex min-h-11 items-center justify-between gap-3 border-b border-linea px-4 py-2.5">
          {titulo ? <h3 className="rotulo truncate">{titulo}</h3> : <span />}
          {accion}
        </header>
      )}
      <div className={`min-w-0 flex-1 ${cuerpo}`}>{children}</div>
    </section>
  );
}

/**
 * Una cifra destacada: el valor grande, su nombre debajo y, cuando el dato lo
 * trae, la dispersion debajo del nombre.
 *
 * Valor y unidad van en el MISMO nodo de texto, sin un span que agrande el
 * numero y encoja el simbolo. Es lo que hace la caja de un instrumento: una
 * sola pieza que se lee de corrido —y de paso, "28.4 %" sigue siendo un solo
 * texto localizable, que es como lo buscan los tests y como lo lee un lector
 * de pantalla.
 */
export function Cifra({ etiqueta, valor, unidad, nota, tinta = 'text-oso', className = '' }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p className={`font-mono text-2xl leading-none font-medium tabular-nums ${tinta}`}>
        {unidad ? `${valor} ${unidad}` : valor}
      </p>
      <p className="rotulo mt-2.5 truncate">{etiqueta}</p>
      {nota && <p className="mt-1 font-mono text-[11px] tabular-nums text-oso-4">{nota}</p>}
    </div>
  );
}

/**
 * La cabecera de una pantalla. El titulo va en Mono en caja normal: es la
 * misma voz de maquina que los rotulos, pero hablando despacio.
 */
export function Encabezado({ titulo, descripcion, children }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-linea px-6 py-5">
      <div className="min-w-0">
        <h2 className="font-mono text-xl leading-tight font-medium tracking-[-0.01em] text-oso">
          {titulo}
        </h2>
        {descripcion && <p className="mt-1.5 max-w-2xl text-sm text-oso-2">{descripcion}</p>}
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

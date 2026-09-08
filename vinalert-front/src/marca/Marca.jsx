/**
 * La marca de Viñalert, en una sola pieza.
 *
 * El simbolo es una silueta monocroma, asi que aqui no se carga una imagen:
 * se carga una MASCARA (ver `.marca` en index.css) y el color lo pone el
 * texto. De ahi que todo lo de este fichero se pinte con `text-*` y no con
 * `bg-*`: la marca hereda la tinta de donde la pongas, igual que una letra.
 */

/** El simbolo suelto. `alto` en px; el ancho sale del aspecto del original. */
export function Marca({ alto = 20, className = '' }) {
  return <span aria-hidden="true" className={`marca ${className}`} style={{ height: alto }} />;
}

/**
 * El simbolo calado sobre un cuadrado de color.
 *
 * Es el gesto de marca que mas se repite: identifica una parcela en la lista,
 * abre la cabecera, marca un nodo. `tinta` es el cuadrado; el simbolo siempre
 * se cala en LOUSA para que el cuadrado mande.
 */
export function CuadroMarca({ lado = 32, tinta = 'bg-oso', className = '' }) {
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center ${tinta} ${className}`}
      style={{ width: lado, height: lado }}
    >
      <Marca alto={Math.round(lado * 0.62)} className="text-lousa" />
    </span>
  );
}

/**
 * La firma: cuadrado + palabra. La palabra va en Mono con el tracking abierto
 * de los rotulos, porque Viñalert es, antes que nada, un aparato que mide.
 */
export function Firma({ lado = 26, className = '' }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <CuadroMarca lado={lado} tinta="bg-oso" />
      <span className="font-mono text-[15px] font-medium tracking-[0.06em] text-oso">Viñalert</span>
    </span>
  );
}

/**
 * La marca al 6% detras de una pantalla vacia. No es decoracion de relleno:
 * es lo que separa "aqui no hay nada todavia" de "aqui se ha roto algo".
 */
export function Filigrana({ alto = 180, className = '' }) {
  return (
    <span
      aria-hidden="true"
      className={`filigrana absolute inset-0 grid place-items-center ${className}`}
    >
      <Marca alto={alto} />
    </span>
  );
}

export default Marca;

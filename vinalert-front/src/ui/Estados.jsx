import { Filigrana } from '../marca/Marca';

/**
 * Los estados de una pantalla: lo que dice, lo que espera y lo que no tiene.
 *
 * Los tres comparten voz de Mono versal porque los tres son la maquina
 * informando de si misma. Y los tres usan el mismo codigo de tinta que el
 * resto de la aplicacion: BROTE lo que va bien, AMBAR lo que hay que mirar,
 * SANGRE lo que ha fallado.
 */

const TONOS = {
  brote: 'border-brote/45 text-brote',
  ambar: 'border-ambar/45 text-ambar',
  sangre: 'border-sangre/45 text-sangre',
  vina: 'border-vina bg-vina text-oso',
  neutro: 'border-linea text-oso-3',
};

/** Una etiqueta de estado: ONLINE, UMBRAL, GESTOR, SOLO LECTURA. */
export function Marbete({ tono = 'neutro', className = '', children }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-[10px] font-medium tracking-[0.16em] uppercase ${TONOS[tono]} ${className}`}
    >
      {children}
    </span>
  );
}

/** Un cuadradito de color: el mismo estado cuando no cabe la palabra. */
export function Testigo({ tono = 'neutro', className = '' }) {
  const fondo =
    { brote: 'bg-brote', ambar: 'bg-ambar', sangre: 'bg-sangre', vina: 'bg-vina' }[tono] ||
    'bg-oso-4';
  return <span aria-hidden="true" className={`inline-block size-2 ${fondo} ${className}`} />;
}

/**
 * La espera. El cuadrado que late es deliberado: en una pantalla que se
 * alimenta de sensores, "estoy pidiendo datos" y "no hay datos" tienen que
 * distinguirse de un vistazo.
 */
export function Cargando({ texto = 'Cargando', className = '' }) {
  return (
    <p className={`flex items-center gap-2.5 px-6 py-8 ${className}`}>
      <span aria-hidden="true" className="size-2 animate-pulse bg-brote" />
      <span className="rotulo">{texto}</span>
    </p>
  );
}

/**
 * El vacio. Nunca es solo una caja gris: dice que falta y, cuando se puede
 * hacer algo al respecto, trae la accion dentro.
 */
export function Vacio({ titulo, children, className = '' }) {
  return (
    <div className={`relative overflow-hidden border border-dashed border-linea ${className}`}>
      <Filigrana alto={120} />
      <div className="relative flex flex-col items-center gap-3 px-6 py-12 text-center">
        <p className="rotulo">{titulo}</p>
        {children}
      </div>
    </div>
  );
}

/** Un aviso en linea. `tono` decide si es informacion, cuidado o fallo. */
export function Aviso({ tono = 'ambar', className = '', children, ...resto }) {
  const tinta = { brote: 'text-brote', ambar: 'text-ambar', sangre: 'text-sangre' }[tono];
  const borde = { brote: 'border-brote', ambar: 'border-ambar', sangre: 'border-sangre' }[tono];
  return (
    <p className={`border-l-2 ${borde} bg-alza py-2 pr-3 pl-3 text-sm ${tinta} ${className}`} {...resto}>
      {children}
    </p>
  );
}

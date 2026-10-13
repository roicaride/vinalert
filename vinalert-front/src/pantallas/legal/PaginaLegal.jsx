import { Link } from 'react-router-dom';

import { Firma } from '../../marca/Marca';
import { Cargando } from '../../ui/Estados';
import { ACTUALIZADO, dato, PENDIENTE } from './datosLegales';
import PieLegal from './PieLegal';
import { useConfiguracionLegal } from './useConfiguracionLegal';

/**
 * El marco de las paginas legales: la firma para volver, el titulo, el texto
 * a una sola columna legible y, abajo, los enlaces a las demas.
 * `children` recibe la configuracion del titular.
 */
export default function PaginaLegal({ titulo, children }) {
  const config = useConfiguracionLegal();

  return (
    <div className="flex min-h-screen flex-col bg-lousa text-oso">
      <header className="flex items-stretch border-b border-linea">
        <Link to="/" className="flex items-center border-r border-linea px-5 py-3">
          <Firma />
        </Link>
      </header>
      <main className="flex-1 px-6 py-10 md:px-12">
        <article className="max-w-3xl">
          <p className="rotulo">Información legal</p>
          <h1 className="mt-3 font-mono text-2xl font-medium tracking-[-0.01em] text-oso">{titulo}</h1>
          <p className="mt-2 font-mono text-xs text-oso-3">Última actualización: {ACTUALIZADO}</p>
          {config === null ? <Cargando texto="Cargando" /> : <div className="mt-8 space-y-8">{children(config)}</div>}
        </article>
      </main>
      <footer className="border-t border-linea px-6 py-5 md:px-12">
        <PieLegal />
      </footer>
    </div>
  );
}

/** Un apartado: su titulo y el texto, con el interlineado de lectura. */
export function Apartado({ titulo, children }) {
  return (
    <section>
      <h2 className="font-mono text-base font-medium text-oso">{titulo}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-oso-2 [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-oso">
        {children}
      </div>
    </section>
  );
}

/** Un dato del titular; si falta, se marca en ambar para que se vea que hay que completarlo. */
export function Dato({ config, clave }) {
  const valor = dato(config, clave);
  return valor === PENDIENTE ? <span className="text-ambar">{PENDIENTE}</span> : <strong>{valor}</strong>;
}

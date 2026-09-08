import { NavLink } from 'react-router-dom';

import { SECCIONES } from '../secciones';

/**
 * Las secciones de la parcela.
 *
 * Sin numerar: las siete secciones no son una secuencia —nadie pasa de Estado
 * a Analisis a Tratamientos en ese orden— y numerarlas seria inventar un
 * recorrido que no existe. Lo que hay que ver de un vistazo es en cual estas,
 * y eso lo dice una barra BROTE en el canto: a la izquierda en escritorio,
 * abajo cuando la navegacion se tumba en horizontal.
 */
export default function Navegacion({ parcelaId }) {
  return (
    <nav className="flex overflow-x-auto md:flex-col md:overflow-visible">
      {SECCIONES.map((s) => (
        <NavLink
          key={s.ruta}
          to={`/p/${parcelaId}/${s.ruta}`}
          className={({ isActive }) =>
            `shrink-0 border-b-2 px-5 py-3 font-mono text-[11px] font-medium tracking-[0.16em] whitespace-nowrap uppercase transition-colors md:border-b-0 md:border-l-2 ${
              isActive
                ? 'border-brote bg-alza text-brote'
                : 'border-transparent text-oso-2 hover:bg-alza hover:text-oso'
            }`
          }
        >
          {s.etiqueta}
        </NavLink>
      ))}
    </nav>
  );
}

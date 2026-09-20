import { MONO } from './tema';

/**
 * Las piezas propias de las graficas: la ficha que sigue al cursor, la leyenda
 * y el marco. Recharts trae las suyas, pero vienen con su propio radio, su
 * propia sombra y su propia tipografia; estas hablan como el resto de la
 * aplicacion.
 */

const LOUSA = '#222a2e';

/** El recuadro que sigue al cursor. Sin sombra, sin radio: una ficha. */
export function Pista({ active, payload, label, formatearEtiqueta }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="border border-linea-viva bg-lousa px-3 py-2" style={{ fontFamily: MONO }}>
      <p className="text-[10px] tracking-[0.14em] text-oso-3 uppercase">
        {formatearEtiqueta ? formatearEtiqueta(label) : label}
      </p>
      <table className="mt-1.5 border-collapse">
        <tbody>
          {payload
            .filter((s) => s.value != null)
            .map((s, i) => (
              <tr key={`${s.name}-${i}`}>
                <td className="py-0.5 pr-3">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      style={{ background: s.color, width: 8, height: 8, display: 'block' }}
                    />
                    <span className="text-[11px] text-oso-2">{s.name}</span>
                  </span>
                </td>
                <td className="py-0.5 text-right text-[11px] tabular-nums text-oso">{s.value}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

/** La leyenda: cuadrados, no puntos, y el nombre en Mono versal. */
export function Leyenda({ payload }) {
  return (
    <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 pt-4">
      {(payload ?? []).map((s) => (
        <li key={s.value} className="flex items-center gap-2">
          <span
            aria-hidden="true"
            style={{ background: s.color, width: 9, height: 9, display: 'block' }}
          />
          <span className="font-mono text-[10px] tracking-[0.14em] text-oso-2 uppercase">
            {s.value}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** El panel de una grafica: titulo, que se esta viendo, y el lienzo. */
export function Marco({ titulo, descripcion, alto = 'h-80', children }) {
  return (
    <section className="border-b border-linea bg-lousa">
      <header className="border-b border-linea px-6 py-3">
        <h3 className="rotulo">{titulo}</h3>
        <p className="mt-1.5 text-sm text-oso-2">{descripcion}</p>
      </header>
      <div className={`w-full px-4 py-5 ${alto}`} style={{ backgroundColor: LOUSA }}>
        {children}
      </div>
    </section>
  );
}

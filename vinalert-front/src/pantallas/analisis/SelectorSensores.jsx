import { colorSensor } from './tema';

/**
 * La banda del selector de sensores. Cada boton lleva una muestra de su
 * color: es la leyenda de las graficas en modo Comparar.
 */

const BOTON =
  'border-r border-linea px-3 py-1.5 font-mono text-[10px] font-medium tracking-[0.16em] whitespace-nowrap uppercase transition-colors last:border-r-0';
const encendido = (si) => (si ? 'bg-oso text-lousa' : 'text-oso-3 hover:bg-lousa hover:text-oso');

function Muestra({ sensor }) {
  return (
    <svg aria-hidden="true" width="18" height="6" className="shrink-0">
      <line x1="0" y1="3" x2="18" y2="3" stroke={colorSensor(sensor.numero)} strokeWidth="2" />
    </svg>
  );
}

export default function SelectorSensores({ sensores, seleccion }) {
  const { ids, modo, alternar, elegirTodos, cambiarModo } = seleccion;
  const todosEncendidos = ids.length === sensores.length;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-linea bg-alza px-6 py-3">
      <span className="rotulo">Sensores</span>
      <div className="flex border border-linea">
        <button type="button" onClick={elegirTodos} aria-pressed={todosEncendidos} className={`${BOTON} ${encendido(todosEncendidos)}`}>
          Todos
        </button>
      </div>

      <div className="flex flex-wrap border border-linea">
        {sensores.map((s) => {
          const on = ids.includes(s.id);
          return (
            <button key={s.id} type="button" onClick={() => alternar(s.id)} aria-pressed={on}
              aria-label={`Sensor ${s.numero}`}
              className={`${BOTON} flex items-center gap-2 ${on ? 'bg-lousa text-oso' : 'text-oso-4 hover:text-oso-2'}`}>
              <Muestra sensor={s} />
              {`S${s.numero}`}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-4 sm:ml-4">
        <span className="rotulo">Ver</span>
        <div className="flex border border-linea">
          {[['media', 'Media'], ['comparar', 'Comparar']].map(([clave, etiqueta]) => (
            <button key={clave} type="button" onClick={() => cambiarModo(clave)} aria-pressed={modo === clave}
              className={`${BOTON} ${encendido(modo === clave)}`}>
              {etiqueta}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

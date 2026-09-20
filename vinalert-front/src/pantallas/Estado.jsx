import { useEffect, useRef, useState } from 'react';

import { obtenerClimaHorario, obtenerDashboard, obtenerHistorico } from '../api/estado';
import { actualizarClima } from '../api/parcelas';
import ModalExportar from '../componentes/ModalExportar';
import MensajeError from '../errores/MensajeError';
import { fijarFavicon } from '../marca/favicon';
import { useParcela } from '../parcela/ParcelaContext';
import Boton from '../ui/Boton';
import { claseControl } from '../ui/Campo';
import { Cargando } from '../ui/Estados';
import { Cifra, Encabezado, Panel, Rejilla } from '../ui/Panel';

function fmt(valor, unidad) {
  return valor == null ? '—' : `${valor}${unidad ? ' ' + unidad : ''}`;
}

// Las sondas de suelo miden con un decimal (2.4 %, 26.5 °C). La media que
// devuelve /dashboard sale con todos los decimales del calculo
// (0.8132450331125828), y ensenar mas cifras de las que mide el sensor seria
// inventar precision. toFixed —y no Math.round— para que 26.0 conserve su cero:
// dice que se midio hasta la decima, cosa que "26" no dice.
const DECIMALES_SONDA = 1;

// Cuantas lecturas crudas ensena la tabla. Llegan varias por minuto (una por
// sensor y ciclo), asi que 50 de golpe eran una pared: se empieza por pocas y
// quien quiera mas las pide.
const OPCIONES_LECTURAS = [10, 25, 50, 100];

/** Reparte valor y unidad para `Cifra`, ya redondeado a la resolucion de la sonda. */
function media(valor, unidad) {
  return valor == null
    ? { valor: '—' }
    : { valor: Number(valor).toFixed(DECIMALES_SONDA), unidad };
}

const PUNTOS_CARDINALES = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];

/** 7° -> "N · 7°". El numero solo no dice nada a quien mira el campo. */
function direccion(grados) {
  if (grados == null) return '—';
  return `${PUNTOS_CARDINALES[Math.round(grados / 45) % 8]} · ${Math.round(grados)}°`;
}

/** Open-Meteo da la humedad del suelo en m³/m³ (0.199); las sondas, en %. */
function fraccionEnPorcentaje(valor) {
  return valor == null ? '—' : `${(valor * 100).toFixed(1)} %`;
}

/**
 * La lluvia prevista en las `horas` siguientes: suma hora a hora y la mayor
 * probabilidad de ese tramo. Cubre siempre el mismo tiempo por delante, sea
 * la hora que sea (a las 23:00, «manana» empezaria dentro de una hora).
 */
function resumirPrevision(horario, horas) {
  const tramo = (horario ?? []).filter((h) => h.prevision).slice(0, horas);
  if (!tramo.length) return { mm: null, probabilidad: null };
  const mm = tramo.reduce((acc, h) => acc + (h.lluvia_mm ?? 0), 0);
  const probs = tramo.map((h) => h.prob_lluvia_pct).filter((p) => p != null);
  return {
    mm: Number(mm.toFixed(1)),
    probabilidad: probs.length ? Math.max(...probs) : null,
  };
}

/** La lluvia prevista para un tramo, con su probabilidad al lado. */
function Prevision({ dia, mm, probabilidad }) {
  return (
    <div className="flex items-baseline justify-between gap-4 bg-lousa px-4 py-3.5">
      <p className="rotulo">{dia}</p>
      <p className="font-mono text-base tabular-nums text-oso">
        {fmt(mm, 'mm')}
        {probabilidad != null && (
          <span className="ml-3 text-xs text-oso-3">{`prob. ${probabilidad} %`}</span>
        )}
      </p>
    </div>
  );
}

/** Un bloque del desplegable de clima: titulo y filas nombre -> valor. */
function GrupoClima({ titulo, nota, filas }) {
  return (
    <div className="bg-lousa px-4 py-4">
      <p className="rotulo">{titulo}</p>
      {nota && <p className="mt-1 text-xs text-oso-4">{nota}</p>}
      <dl className="mt-3 divide-y divide-linea">
        {filas.map(([nombre, valor]) => (
          <div key={nombre} className="flex items-baseline justify-between gap-4 py-2">
            <dt className="text-sm text-oso-2">{nombre}</dt>
            <dd className="font-mono text-sm tabular-nums text-oso">{valor}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Una celda de lectura instantanea dentro de un panel. */
function Celda({ etiqueta, valor, tinta = 'text-oso' }) {
  return (
    <div className="bg-lousa px-4 py-3.5">
      <p className="rotulo truncate">{etiqueta}</p>
      <p className={`mt-2 font-mono text-base tabular-nums ${tinta}`}>{valor}</p>
    </div>
  );
}

export default function Estado() {
  const { parcela, puedeGestionar } = useParcela();
  const [dashboard, setDashboard] = useState(null);
  const [historico, setHistorico] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [actualizandoClima, setActualizandoClima] = useState(false);
  const [mostrarModalExportar, setMostrarModalExportar] = useState(false);
  const [error, setError] = useState(null);
  // Hora a hora de Open-Meteo, para la prevision. null = sin datos (fallo o
  // sin coordenadas): la prevision sale vacia y el resto de Estado sigue.
  const [horario, setHorario] = useState(null);
  const [cuantas, setCuantas] = useState(OPCIONES_LECTURAS[0]);
  const [cargandoTabla, setCargandoTabla] = useState(false);
  // Si alguien cambia 10 → 100 → 25 deprisa, las respuestas pueden llegar
  // desordenadas: solo vale la de la ultima peticion.
  const ultimaPeticion = useRef(0);

  const cargarDatos = () => {
    return Promise.all([obtenerDashboard(parcela.id), obtenerHistorico(parcela.id, cuantas)])
      .then(([d, h]) => { setDashboard(d); setHistorico(h); setError(null); })
      .catch((e) => { setError(e); });
  };

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    cargarDatos().finally(() => { if (vigente) setCargando(false); });
    // Aparte y sin bloquear: si Open-Meteo tarda o falla, Estado ya se ve.
    obtenerClimaHorario(parcela.id)
      .then((h) => { if (vigente) setHorario(h); })
      .catch(() => { if (vigente) setHorario(null); });
    return () => { vigente = false; };
  }, [parcela.id]);

  const cambiarCuantas = (n) => {
    setCuantas(n);
    setCargandoTabla(true);
    const esta = ++ultimaPeticion.current;
    obtenerHistorico(parcela.id, n)
      .then((h) => { if (esta === ultimaPeticion.current) setHistorico(h); })
      .catch((e) => { if (esta === ultimaPeticion.current) setError(e); })
      .finally(() => { if (esta === ultimaPeticion.current) setCargandoTabla(false); });
  };

  // El icono de la pestana refleja si esta parcela esta dando senal. Quien
  // vigila un campo deja la pestana al fondo: es la unica forma de enterarse
  // sin volver a mirar.
  useEffect(() => {
    if (error) fijarFavicon('aviso');
    else if (historico?.length) fijarFavicon('ok');
    else fijarFavicon('neutro');
    return () => fijarFavicon('neutro');
  }, [error, historico]);

  if (cargando) return <Cargando texto="Cargando estado" />;
  if (error && dashboard === null) {
    return (
      <div className="p-6">
        <MensajeError error={error} textoNoEncontrado="No se pudo cargar el estado de esta parcela." />
      </div>
    );
  }

  const { estado_suelo, clima_actual } = dashboard;

  return (
    <>
      <Encabezado
        titulo="Estado de la parcela"
        descripcion="El suelo, el aire y las últimas lecturas que han llegado, con la hora a la que llegaron."
      >
        <Boton tono="sutil" onClick={() => setMostrarModalExportar(true)}>
          Exportar a Excel / CSV
        </Boton>
      </Encabezado>

      {/* ------------------------------------------------------------------ */}
      {/* El suelo: las cuatro cifras que resumen la parcela.                 */}
      {/* ------------------------------------------------------------------ */}
      <section className="border-b border-linea">
        <Rejilla cols="grid-cols-2 lg:grid-cols-4">
          <div className="bg-lousa px-6 py-5">
            <Cifra
              {...media(estado_suelo.humedad_media, '%')}
              etiqueta="Humedad del suelo"
              tinta="text-brote"
            />
          </div>
          <div className="bg-lousa px-6 py-5">
            <Cifra
              {...media(estado_suelo.temperatura_media, '°C')}
              etiqueta="Temperatura del suelo"
            />
          </div>
          <div className="bg-lousa px-6 py-5">
            <Cifra valor={estado_suelo.n_sensores} etiqueta="Sensores activos" />
          </div>
          <div className="bg-lousa px-6 py-5">
            <Cifra valor={estado_suelo.n_lecturas} etiqueta="Lecturas registradas" />
          </div>
        </Rejilla>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* El aire: lo que Open-Meteo dice de estas coordenadas.               */}
      {/* ------------------------------------------------------------------ */}
      <section className="border-b border-linea">
        <Panel
          titulo="Clima actual · Open-Meteo"
          cuerpo=""
          accion={
            <div className="flex items-center gap-4">
              {clima_actual?.fecha_hora && (
                <span className="hidden font-mono text-[11px] text-oso-3 sm:inline">
                  {new Date(clima_actual.fecha_hora).toLocaleString('es-ES')}
                </span>
              )}
              {puedeGestionar && (
                <Boton
                  tono="fantasma"
                  tamano="sm"
                  onClick={async () => {
                    setActualizandoClima(true);
                    try {
                      await actualizarClima(parcela.id);
                      await cargarDatos();
                      obtenerClimaHorario(parcela.id).then(setHorario).catch(() => setHorario(null));
                    } catch (e) {
                      setError(e);
                    } finally {
                      setActualizandoClima(false);
                    }
                  }}
                  disabled={actualizandoClima}
                >
                  {actualizandoClima ? 'Actualizando…' : 'Actualizar ahora'}
                </Boton>
              )}
            </div>
          }
        >
          {clima_actual ? (
            <>
              <Rejilla cols="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
                <Celda etiqueta="Temperatura" valor={fmt(clima_actual.temp_c, '°C')} />
                <Celda etiqueta="Humedad relativa" valor={fmt(clima_actual.humedad_relativa_pct, '%')} />
                {/* Open-Meteo da estos dos como acumulado de los 15 minutos
                    anteriores a la consulta, no del dia: se dice en la etiqueta. */}
                <Celda etiqueta="Lluvia (15 min)" valor={fmt(clima_actual.lluvia_mm, 'mm')} />
                <Celda etiqueta="ET₀ (15 min)" valor={fmt(clima_actual.et0, 'mm')} />
                <Celda etiqueta="Racha de viento" valor={fmt(clima_actual.viento_racha_ms, 'm/s')} />
                <Celda etiqueta="Radiación solar" valor={fmt(clima_actual.radiacion_wm2, 'W/m²')} />
              </Rejilla>

              {/* La prevision va a la vista siempre: es lo que decide si hoy
                  se riega o se trata. */}
              <div className="grid gap-px border-t border-linea bg-linea sm:grid-cols-[auto_1fr_1fr]">
                <div className="flex items-center bg-lousa px-4 py-3.5">
                  <p className="rotulo text-oso">Previsión de lluvia</p>
                </div>
                <Prevision dia="Próximas 24 h" {...resumirPrevision(horario, 24)} />
                <Prevision dia="Próximas 48 h" {...resumirPrevision(horario, 48)} />
              </div>

              {/* El resto, a un clic: esta ahi para quien lo busque, sin
                  cargar la pantalla de quien solo mira el estado. */}
              <details className="group border-t border-linea">
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 transition-colors hover:bg-alza [&::-webkit-details-marker]:hidden">
                  <span className="rotulo">Más datos del clima</span>
                  <span aria-hidden="true" className="font-mono text-xs text-oso-3 transition-transform group-open:rotate-180">
                    ▾
                  </span>
                </summary>
                <Rejilla cols="md:grid-cols-3" className="border-t border-linea">
                  <GrupoClima
                    titulo="Aire"
                    filas={[
                      ['Punto de rocío', fmt(clima_actual.punto_rocio_c, '°C')],
                      ['Déficit de presión de vapor', fmt(clima_actual.vpd_kpa, 'kPa')],
                      ['Nubosidad', fmt(clima_actual.nubosidad_pct, '%')],
                      ['Índice UV', fmt(clima_actual.uv_index)],
                      ['Presión', fmt(clima_actual.presion_hpa, 'hPa')],
                    ]}
                  />
                  <GrupoClima
                    titulo="Viento"
                    filas={[
                      ['Velocidad media', fmt(clima_actual.viento_vel_ms, 'm/s')],
                      ['Racha', fmt(clima_actual.viento_racha_ms, 'm/s')],
                      ['Dirección', direccion(clima_actual.viento_dir_deg)],
                    ]}
                  />
                  <GrupoClima
                    titulo="Suelo según Open-Meteo"
                    nota="Calculado para tus coordenadas, no medido: sirve para contrastar tus sondas."
                    filas={[
                      ['Temperatura a 0 cm', fmt(clima_actual.suelo_temp_0cm, '°C')],
                      ['Temperatura a 6 cm', fmt(clima_actual.suelo_temp_6cm, '°C')],
                      ['Temperatura a 18 cm', fmt(clima_actual.suelo_temp_18cm, '°C')],
                      ['Humedad de 0 a 1 cm', fraccionEnPorcentaje(clima_actual.suelo_hum_0_1cm)],
                      ['Humedad de 1 a 3 cm', fraccionEnPorcentaje(clima_actual.suelo_hum_1_3cm)],
                      ['Humedad de 3 a 9 cm', fraccionEnPorcentaje(clima_actual.suelo_hum_3_9cm)],
                      ['Humedad de 9 a 27 cm', fraccionEnPorcentaje(clima_actual.suelo_hum_9_27cm)],
                    ]}
                  />
                </Rejilla>
              </details>
            </>
          ) : (
            <p className="px-4 py-6 text-sm text-oso-3">
              Todavía no se ha pedido el clima de esta parcela.
            </p>
          )}
        </Panel>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* La telemetria, cruda. Cada lectura con el clima de ese instante.    */}
      {/* ------------------------------------------------------------------ */}
      <section>
        <Encabezado
          titulo="Últimas lecturas"
          descripcion="Cada medición de un sensor, emparejada con las condiciones que había en ese momento exacto."
        >
          <label htmlFor="cuantas-lecturas" className="rotulo">
            Mostrar
          </label>
          <select
            id="cuantas-lecturas"
            aria-label="Lecturas a mostrar"
            value={cuantas}
            onChange={(e) => cambiarCuantas(Number(e.target.value))}
            className={`${claseControl} w-24 py-1.5 text-xs`}
          >
            {OPCIONES_LECTURAS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </Encabezado>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left">
            <thead>
              <tr className="border-b border-linea bg-alza">
                <th className="rotulo px-4 py-3 font-medium">Fecha y hora</th>
                <th className="rotulo px-4 py-3 font-medium">Sensor</th>
                <th className="rotulo px-4 py-3 font-medium">Humedad suelo</th>
                <th className="rotulo px-4 py-3 font-medium">Temp. suelo</th>
                <th className="rotulo px-4 py-3 font-medium">Batería</th>
                <th className="rotulo border-l border-linea px-4 py-3 font-medium text-oso-3">
                  Temp. aire
                </th>
                <th className="rotulo px-4 py-3 font-medium text-oso-3">Humedad aire</th>
                <th className="rotulo px-4 py-3 font-medium text-oso-3" title="Acumulado de los 15 minutos anteriores a la última consulta del clima">Lluvia 15 min</th>
                <th className="rotulo px-4 py-3 font-medium text-oso-3">Viento</th>
              </tr>
            </thead>
            <tbody
              aria-busy={cargandoTabla}
              className={`divide-y divide-linea transition-opacity ${cargandoTabla ? 'opacity-40' : ''}`}
            >
              {historico.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center">
                    <span className="rotulo">Todavía no hay lecturas de sensores registradas</span>
                  </td>
                </tr>
              ) : (
                [...historico].reverse().map((log) => (
                  <tr key={log.id} className="font-mono text-xs transition-colors hover:bg-alza">
                    <td className="px-4 py-2.5 whitespace-nowrap text-oso-3">
                      {new Date(log.fecha_hora).toLocaleString('es-ES')}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-oso">
                      {log.sensor_etiqueta
                        ? `${log.sensor_etiqueta} (${log.sensor_profundidad_cm ?? ''}cm)`
                        : `Sensor #${log.sensor_id ?? '—'}`}
                    </td>
                    <td className="px-4 py-2.5 text-brote">{fmt(log.humedad_suelo_pct, '%')}</td>
                    <td className="px-4 py-2.5 text-ambar">{fmt(log.temperatura_suelo, '°C')}</td>
                    <td className="px-4 py-2.5 text-oso-3">{fmt(log.bateria, 'V')}</td>
                    <td className="border-l border-linea px-4 py-2.5 text-oso-2">
                      {fmt(log.temp_ambiente_c, '°C')}
                    </td>
                    <td className="px-4 py-2.5 text-oso-2">{fmt(log.humedad_aire_pct, '%')}</td>
                    <td className="px-4 py-2.5 text-oso-2">{fmt(log.lluvia_mm, 'mm')}</td>
                    <td className="px-4 py-2.5 text-oso-2">{fmt(log.viento_ms, 'm/s')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ModalExportar
        parcela={parcela}
        abierto={mostrarModalExportar}
        alCerrar={() => setMostrarModalExportar(false)}
      />
    </>
  );
}

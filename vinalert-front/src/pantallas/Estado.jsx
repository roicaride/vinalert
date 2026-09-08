import { useEffect, useState } from 'react';

import { obtenerDashboard, obtenerHistorico } from '../api/estado';
import { actualizarClima } from '../api/parcelas';
import ModalExportar from '../componentes/ModalExportar';
import MensajeError from '../errores/MensajeError';
import { fijarFavicon } from '../marca/favicon';
import { useParcela } from '../parcela/ParcelaContext';
import Boton from '../ui/Boton';
import { Cargando } from '../ui/Estados';
import { Cifra, Encabezado, Panel, Rejilla } from '../ui/Panel';

function fmt(valor, unidad) {
  return valor == null ? '—' : `${valor}${unidad ? ' ' + unidad : ''}`;
}

/** Reparte valor y unidad para `Cifra`, que los pinta con pesos distintos. */
function cifra(valor, unidad) {
  return valor == null ? { valor: '—' } : { valor, unidad };
}

/** La dispersion de una media, cuando el backend la trae. */
function dispersion(sd, unidad) {
  return sd == null ? null : `± ${sd} ${unidad}`;
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

  const cargarDatos = () => {
    return Promise.all([obtenerDashboard(parcela.id), obtenerHistorico(parcela.id, 50)])
      .then(([d, h]) => { setDashboard(d); setHistorico(h); setError(null); })
      .catch((e) => { setError(e); });
  };

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    cargarDatos().finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [parcela.id]);

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
              {...cifra(estado_suelo.humedad_media, '%')}
              etiqueta="Humedad del suelo"
              nota={dispersion(estado_suelo.humedad_sd, '%')}
              tinta="text-brote"
            />
          </div>
          <div className="bg-lousa px-6 py-5">
            <Cifra
              {...cifra(estado_suelo.temperatura_media, '°C')}
              etiqueta="Temperatura del suelo"
              nota={dispersion(estado_suelo.temperatura_sd, '°C')}
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
            <Rejilla cols="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
              <Celda etiqueta="Temperatura" valor={fmt(clima_actual.temp_c, '°C')} />
              <Celda etiqueta="Humedad relativa" valor={fmt(clima_actual.humedad_relativa_pct, '%')} />
              <Celda etiqueta="Lluvia" valor={fmt(clima_actual.lluvia_mm, 'mm')} />
              <Celda etiqueta="ET₀" valor={fmt(clima_actual.et0, 'mm')} />
              <Celda etiqueta="Racha de viento" valor={fmt(clima_actual.viento_racha_ms, 'm/s')} />
              <Celda etiqueta="Radiación solar" valor={fmt(clima_actual.radiacion_wm2, 'W/m²')} />
            </Rejilla>
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
        />

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
                <th className="rotulo px-4 py-3 font-medium text-oso-3">Lluvia</th>
                <th className="rotulo px-4 py-3 font-medium text-oso-3">Viento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linea">
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

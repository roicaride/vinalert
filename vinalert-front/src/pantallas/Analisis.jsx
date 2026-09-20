import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { obtenerClimaDiario, obtenerSueloDiario } from '../api/analisis';
import { obtenerClimaHorario, obtenerHistorico } from '../api/estado';
import { listarFoliar } from '../api/foliar';
import { listarSensores } from '../api/sensores';
import { listarTratamientos } from '../api/tratamientos';
import ModalExportar from '../componentes/ModalExportar';
import MensajeError from '../errores/MensajeError';
import { useParcela } from '../parcela/ParcelaContext';
import Boton from '../ui/Boton';
import { Cargando, Vacio } from '../ui/Estados';
import { Cifra, Encabezado, Rejilla } from '../ui/Panel';
import Detalle from './analisis/Detalle';
import GraficaSuelo from './analisis/GraficaSuelo';
import SelectorSensores from './analisis/SelectorSensores';
import { diarioSuelo, horasSuelo, mediaPeriodoDiaria, mediaPeriodoHoras, rellenarDias } from './analisis/series';
import { useSeleccionSensores } from './analisis/useSeleccionSensores';
import { Leyenda, Marco, Pista } from './analisis/piezas';
import { EJE, GRID, SERIES } from './analisis/tema';

const RANGOS = [
  { clave: '48h', horas: 48, etiqueta: '48 horas' },
  { clave: '7d', dias: 7, etiqueta: '7 días' },
  { clave: '30d', dias: 30, etiqueta: '30 días' },
  { clave: '90d', dias: 90, etiqueta: '90 días' },
  { clave: '1y', dias: 365, etiqueta: '1 año' },
];

function fmt(valor, unidad = '', decimales = 1) {
  if (valor == null || Number.isNaN(valor)) return '—';
  return `${Number(valor).toFixed(decimales)}${unidad ? ' ' + unidad : ''}`;
}

function TarjetaKpi({ etiqueta, valor, detalle, tinta }) {
  return (
    <div className="bg-lousa px-5 py-4">
      <Cifra etiqueta={etiqueta} valor={valor} nota={detalle} tinta={tinta} />
    </div>
  );
}

export default function Analisis() {
  const { parcela } = useParcela();
  const [claveRango, setClaveRango] = useState('30d');
  const [vista, setVista] = useState('resumen'); // 'resumen' | 'detalle'
  const [suelo, setSuelo] = useState(null);
  const [clima, setClima] = useState(null);
  const [historico, setHistorico] = useState(null);
  // Lluvia/ET₀ hora a hora (solo en 48 h). null = Open-Meteo no respondio.
  const [horario, setHorario] = useState(null);
  const [tratamientos, setTratamientos] = useState(null);
  const [foliar, setFoliar] = useState(null);
  const [mostrarModalExportar, setMostrarModalExportar] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const rangoActual = useMemo(
    () => RANGOS.find((r) => r.clave === claveRango) || RANGOS[2],
    [claveRango],
  );

  const es48h = rangoActual.clave === '48h';
  const vistaEfectiva = es48h ? 'resumen' : vista;

  // Los sensores activos de la parcela, para el selector. Si fallan, el
  // selector no sale y las graficas usan todos los que traigan los datos.
  const [sensores, setSensores] = useState([]);
  useEffect(() => {
    let vigente = true;
    listarSensores(parcela.id)
      .then((lista) => {
        if (vigente) setSensores(lista.filter((s) => s.activo).sort((a, b) => a.numero - b.numero));
      })
      .catch(() => {
        if (vigente) setSensores([]);
      });
    return () => {
      vigente = false;
    };
  }, [parcela.id]);
  const seleccion = useSeleccionSensores(parcela.id, sensores);
  // Sin lista de sensores, se usan todos los que vengan en los datos.
  const idsElegidos = useMemo(() => {
    if (sensores.length) return seleccion.ids;
    const desdeDatos = es48h ? (historico ?? []).map((l) => l.sensor_id) : (suelo ?? []).map((f) => f.sensor_id);
    return [...new Set(desdeDatos)];
  }, [sensores.length, seleccion.ids, es48h, historico, suelo]);
  const sensoresElegidos = sensores.filter((s) => idsElegidos.includes(s.id));
  // Sin sensores (aun cargando o listarSensores fallo) no hay selector que
  // ofrezca Comparar, asi que no se puede quedar en Comparar por lo guardado.
  const modoSuelo = sensores.length ? seleccion.modo : 'media';

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError(null);

    if (es48h) {
      Promise.all([
        obtenerHistorico(parcela.id, 2000, 48),
        listarTratamientos(parcela.id),
        listarFoliar(parcela.id),
        // Si Open-Meteo falla, las lecturas de los sensores se siguen viendo.
        obtenerClimaHorario(parcela.id).catch(() => null),
      ])
        .then(([h, t, f, hh]) => {
          if (vigente) {
            setHistorico(h);
            setHorario(hh);
            setSuelo(null);
            setClima(null);
            setTratamientos(t);
            setFoliar(f);
          }
        })
        .catch((err) => {
          if (vigente) setError(err);
        })
        .finally(() => {
          if (vigente) setCargando(false);
        });
    } else {
      Promise.all([
        obtenerSueloDiario(parcela.id, rangoActual.dias),
        obtenerClimaDiario(parcela.id, rangoActual.dias),
        listarTratamientos(parcela.id),
        listarFoliar(parcela.id),
      ])
        .then(([s, c, t, f]) => {
          if (vigente) {
            setSuelo(s);
            setClima(c);
            setHistorico(null);
            setTratamientos(t);
            setFoliar(f);
          }
        })
        .catch((err) => {
          if (vigente) setError(err);
        })
        .finally(() => {
          if (vigente) setCargando(false);
        });
    }

    return () => {
      vigente = false;
    };
  }, [parcela.id, claveRango, es48h, rangoActual.dias]);

  // Fusionar series para Recharts (modo 48h punto a punto o modo diario)
  const datosFusionados = useMemo(() => {
    if (es48h) {
      if (!historico || historico.length === 0) return [];

      const mapa = new Map();

      (historico ?? []).forEach((log) => {
        const dt = new Date(log.fecha_hora);
        const fechaIso = log.fecha_hora;
        const dia = String(dt.getDate()).padStart(2, '0');
        const mes = String(dt.getMonth() + 1).padStart(2, '0');
        const hora = String(dt.getHours()).padStart(2, '0');
        const min = String(dt.getMinutes()).padStart(2, '0');
        const fechaCorta = `${dia}/${mes} ${hora}:${min}`;

        if (!mapa.has(fechaIso)) {
          mapa.set(fechaIso, {
            fecha: fechaIso,
            fechaCorta,
            temp_media: log.temp_ambiente_c,
            humedad_aire: log.humedad_aire_pct,
            viento_ms: log.viento_ms,
          });
        }
        const fila = mapa.get(fechaIso);
        if (log.temp_ambiente_c != null && fila.temp_media == null) fila.temp_media = log.temp_ambiente_c;
      });

      const lista = Array.from(mapa.values()).sort((a, b) => a.fecha.localeCompare(b.fecha));

      if (lista.length === 0) return [];
      const minFecha = lista[0].fecha.slice(0, 10);
      const maxFecha = lista[lista.length - 1].fecha.slice(0, 10);

      (tratamientos ?? []).forEach((t) => {
        const fechaStr = (t.fecha || '').slice(0, 10);
        if (fechaStr >= minFecha && fechaStr <= maxFecha) {
          const puntoCercano = lista.find((p) => p.fecha.startsWith(fechaStr)) || lista[0];
          puntoCercano.tratamiento = t.tipo + (t.producto ? `: ${t.producto}` : '');
        }
      });

      (foliar ?? []).forEach((f) => {
        const fechaStr = (f.fecha || '').slice(0, 10);
        if (fechaStr >= minFecha && fechaStr <= maxFecha) {
          const puntoCercano = lista.find((p) => p.fecha.startsWith(fechaStr)) || lista[0];
          puntoCercano.foliar_chl = f.chl_medio;
          puntoCercano.foliar_flav = f.flav_medio;
          puntoCercano.foliar_nbi = f.nbi_medio;
        }
      });

      return lista;
    }

    // Modo diario (7d, 30d, 90d, 1y)
    if (!suelo && !clima) return [];

    const mapa = new Map();
    const obtenerFila = (fechaStr) => {
      const fechaCorta = fechaStr.slice(5); // MM-DD
      if (!mapa.has(fechaStr)) {
        mapa.set(fechaStr, { fecha: fechaStr, fechaCorta });
      }
      return mapa.get(fechaStr);
    };

    diarioSuelo(suelo ?? [], idsElegidos).forEach((d) => {
      Object.assign(obtenerFila(d.fecha), d);
    });

    (clima ?? []).forEach((c) => {
      const fila = obtenerFila(c.fecha);
      fila.temp_media = c.temp_media;
      fila.temp_max = c.temp_max;
      fila.temp_min = c.temp_min;
      fila.precipitacion_mm = c.precipitacion_total_mm;
      fila.et0_dia = c.et0_total_dia;
      fila.radiacion_mj = c.radiacion_total_mj_m2;
      // Para la vista Detalle.
      fila.hr_media = c.humedad_relativa_media;
      fila.hr_max = c.humedad_relativa_max;
      fila.hr_min = c.humedad_relativa_min;
      fila.hoja_mojada = c.humectacion_foliar_pct;
      fila.horas_sol = c.horas_sol != null ? Number(c.horas_sol.toFixed(1)) : null;
      fila.viento_media = c.viento_vel_media;
      fila.viento_racha = c.viento_racha_max;
      // Open-Meteo da m³/m³ (0.199); las sondas, % (19.9).
      fila.suelo_modelo_hum =
        c.suelo_modelo_humedad != null ? Number((c.suelo_modelo_humedad * 100).toFixed(1)) : null;
    });

    const todasLasFechas = Array.from(mapa.keys()).sort();
    if (todasLasFechas.length === 0) return [];

    const minFecha = todasLasFechas[0];
    const maxFecha = todasLasFechas[todasLasFechas.length - 1];

    (tratamientos ?? []).forEach((t) => {
      const fechaStr = (t.fecha || '').slice(0, 10);
      if (fechaStr >= minFecha && fechaStr <= maxFecha) {
        const fila = obtenerFila(fechaStr);
        fila.tratamiento = t.tipo + (t.producto ? `: ${t.producto}` : '');
      }
    });

    (foliar ?? []).forEach((f) => {
      const fechaStr = (f.fecha || '').slice(0, 10);
      if (fechaStr >= minFecha && fechaStr <= maxFecha) {
        const fila = obtenerFila(fechaStr);
        fila.foliar_chl = f.chl_medio;
        fila.foliar_flav = f.flav_medio;
        fila.foliar_nbi = f.nbi_medio;
      }
    });

    return rellenarDias(Array.from(mapa.values()).sort((a, b) => a.fecha.localeCompare(b.fecha)));
  }, [es48h, historico, suelo, clima, tratamientos, foliar, idsElegidos]);

  // Las horas ya pasadas del horario de Open-Meteo, con los mismos nombres
  // que usa la grafica de clima en modo diario.
  const datosHorarios = useMemo(
    () =>
      (horario ?? [])
        .filter((h) => !h.prevision)
        .map((h) => ({
          fecha: h.fecha_hora,
          precipitacion_mm: h.lluvia_mm,
          et0_dia: h.et0_mm,
          temp_media: h.temp_c,
        })),
    [horario],
  );

  const horasSueloSel = useMemo(() => horasSuelo(historico ?? [], idsElegidos), [historico, idsElegidos]);

  // Cálculos de KPIs del período
  const kpis = useMemo(() => {
    if (es48h) {
      // Lluvia y ET₀ de cada hora, sumadas una vez. Antes se sumaba la cifra
      // pegada a cada lectura: los 15 min anteriores a la ultima consulta del
      // clima, repetidos en todas las lecturas cercanas.
      const sumar = (clave) =>
        horario === null ? null : datosHorarios.reduce((acc, d) => acc + (d[clave] ?? 0), 0);
      const totalLluvia = sumar('precipitacion_mm');
      const totalEt0 = sumar('et0_dia');
      const balance = totalLluvia == null || totalEt0 == null ? null : totalLluvia - totalEt0;

      const mediaHumedad = mediaPeriodoHoras(historico ?? [], idsElegidos, 'humedad_suelo_pct');
      const mediaTempSuelo = mediaPeriodoHoras(historico ?? [], idsElegidos, 'temperatura_suelo');

      return {
        totalLluvia,
        totalEt0,
        balance,
        mediaHumedad,
        mediaTempSuelo,
        detallePeriodo: 'En las últimas 48 horas',
      };
    }

    const totalLluvia = (clima ?? []).reduce((acc, c) => acc + (c.precipitacion_total_mm ?? 0), 0);
    const totalEt0 = (clima ?? []).reduce((acc, c) => acc + (c.et0_total_dia ?? 0), 0);
    const balance = totalLluvia - totalEt0;

    const mediaHumedad = mediaPeriodoDiaria(suelo ?? [], idsElegidos, 'humedad_media');
    const mediaTempSuelo = mediaPeriodoDiaria(suelo ?? [], idsElegidos, 'temperatura_media');

    return {
      totalLluvia,
      totalEt0,
      balance,
      mediaHumedad,
      mediaTempSuelo,
      detallePeriodo: `En los últimos ${rangoActual.dias} días`,
    };
  }, [es48h, datosHorarios, horario, clima, suelo, rangoActual.dias, historico, idsElegidos]);

  const hayDatosFoliar = useMemo(() => {
    return datosFusionados.some((d) => d.foliar_nbi != null || d.foliar_chl != null || d.foliar_flav != null);
  }, [datosFusionados]);

  const sinDatos = es48h
    ? (historico?.length ?? 0) === 0
    : (suelo?.length ?? 0) === 0 && (clima?.length ?? 0) === 0 && (foliar?.length ?? 0) === 0;

  if (cargando && !suelo && !clima && !historico && !foliar) {
    return <Cargando texto="Cargando datos de análisis" />;
  }

  if (error && !suelo && !clima && !historico && !foliar) {
    return (
      <div className="p-6">
        <MensajeError error={error} textoNoEncontrado="No se pudieron cargar los datos de análisis." />
      </div>
    );
  }

  const formatearEjeX = (val) => {
    if (!val) return '';
    if (es48h) {
      const dt = new Date(val);
      if (isNaN(dt.getTime())) return val.slice(11, 16) || val;
      const hora = String(dt.getHours()).padStart(2, '0');
      const min = String(dt.getMinutes()).padStart(2, '0');
      const seg = String(dt.getSeconds()).padStart(2, '0');
      return `${hora}:${min}:${seg}`;
    }
    return val.slice(5); // MM-DD
  };

  const formatearTooltip = (val) => {
    if (!val) return '';
    if (es48h) {
      const dt = new Date(val);
      if (isNaN(dt.getTime())) return val;
      return dt.toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    }
    return val;
  };


  const pista = <Pista formatearEtiqueta={formatearTooltip} />;

  return (
    <>
      <Encabezado
        titulo="Análisis"
        descripcion="Cómo se han movido el suelo, el tiempo y la hoja durante el período, con los tratamientos encima."
      >
        <Boton tono="sutil" onClick={() => setMostrarModalExportar(true)}>
          Exportar a Excel / CSV
        </Boton>
      </Encabezado>

      {/* El rango manda sobre todo lo demás de la pantalla, así que ocupa su
          propia banda a lo ancho en vez de esconderse en la cabecera. */}
      <div className="flex flex-wrap items-center gap-4 border-b border-linea bg-alza px-6 py-3">
        <span className="rotulo">Período</span>
        <div className="flex border border-linea">
          {RANGOS.map((r) => (
            <button
              key={r.clave}
              type="button"
              onClick={() => setClaveRango(r.clave)}
              aria-pressed={claveRango === r.clave}
              className={`border-r border-linea px-3.5 py-1.5 font-mono text-[10px] font-medium tracking-[0.16em] whitespace-nowrap uppercase transition-colors last:border-r-0 ${
                claveRango === r.clave
                  ? 'bg-brote text-lousa'
                  : 'text-oso-3 hover:bg-lousa hover:text-oso'
              }`}
            >
              {r.etiqueta}
            </button>
          ))}
        </div>

        {/* Resumen = lo de siempre; Detalle = todo el clima diario. En 48 h
            no hay dias que resumir, asi que Detalle no se ofrece. */}
        <span className="rotulo sm:ml-4">Vista</span>
        <div className="flex border border-linea">
          {[
            ['resumen', 'Resumen'],
            ['detalle', 'Detalle'],
          ].map(([clave, etiqueta]) => (
            <button
              key={clave}
              type="button"
              onClick={() => setVista(clave)}
              disabled={clave === 'detalle' && es48h}
              title={clave === 'detalle' && es48h ? 'Solo con 7 días o más: son datos diarios' : undefined}
              aria-pressed={vistaEfectiva === clave}
              className={`border-r border-linea px-3.5 py-1.5 font-mono text-[10px] font-medium tracking-[0.16em] whitespace-nowrap uppercase transition-colors last:border-r-0 disabled:cursor-not-allowed disabled:opacity-40 ${
                vistaEfectiva === clave ? 'bg-oso text-lousa' : 'text-oso-3 hover:bg-lousa hover:text-oso'
              }`}
            >
              {etiqueta}
            </button>
          ))}
        </div>
      </div>

      {sensores.length > 0 && <SelectorSensores sensores={sensores} seleccion={seleccion} />}

      {error && (
        <div className="border-b border-linea px-6 py-3">
          <MensajeError error={error} textoNoEncontrado="No se pudieron cargar los datos de análisis." />
        </div>
      )}

      {sinDatos ? (
        <div className="p-6">
          <Vacio titulo={es48h ? 'Sin lecturas en 48 horas' : 'Sin datos consolidados'}>
            <p className="max-w-md text-sm text-oso-3">
              {es48h
                ? 'Todavía no hay lecturas de sensores registradas en las últimas 48 horas. Aparecerán aquí punto por punto en cuanto lleguen.'
                : 'Todavía no hay datos diarios consolidados para este período. Se consolidan cada noche con las lecturas de los sensores y el clima de Open-Meteo.'}
            </p>
          </Vacio>
        </div>
      ) : (
        <>
          {/* -------------------------------------------------------------- */}
          {/* Las cinco cifras del período. El balance es la que se mira.     */}
          {/* -------------------------------------------------------------- */}
          <section className="border-b border-linea">
            <Rejilla cols="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
              <TarjetaKpi
                etiqueta="Lluvia acumulada"
                valor={fmt(kpis.totalLluvia, 'mm')}
                detalle={kpis.detallePeriodo}
              />
              <TarjetaKpi
                etiqueta="ET₀ acumulada"
                valor={fmt(kpis.totalEt0, 'mm')}
                detalle="Lo que se ha evaporado"
              />
              <TarjetaKpi
                etiqueta="Balance hídrico"
                valor={`${kpis.balance > 0 ? '+' : ''}${fmt(kpis.balance, 'mm')}`}
                detalle="Lluvia − ET₀"
                tinta={kpis.balance == null ? 'text-oso' : kpis.balance < 0 ? 'text-ambar' : 'text-brote'}
              />
              <TarjetaKpi
                etiqueta="Humedad suelo media"
                valor={fmt(kpis.mediaHumedad, '%')}
                detalle="Media del período"
              />
              <TarjetaKpi
                etiqueta="Temp. suelo media"
                valor={fmt(kpis.mediaTempSuelo, '°C')}
                detalle="Media del período"
              />
            </Rejilla>
          </section>

          {vistaEfectiva === 'detalle' ? (
            <Detalle
              datos={datosFusionados}
              formatearEjeX={formatearEjeX}
              pista={pista}
              puntos={rangoActual.dias <= 30 ? { r: 2 } : false}
              modo={modoSuelo}
              sensores={sensoresElegidos}
            />
          ) : (
            <>
            {/* -------------------------------------------------------------- */}
            {/* 1. El suelo.                                                    */}
            {/* -------------------------------------------------------------- */}
            <GraficaSuelo
              es48h={es48h}
              modo={modoSuelo}
              sensores={sensoresElegidos}
              diario={datosFusionados}
              horas={horasSueloSel}
              formatearEjeX={formatearEjeX}
              formatearTooltip={formatearTooltip}
              puntos={es48h ? { r: 3 } : rangoActual.dias <= 30 ? { r: 2 } : false}
            />

            {/* -------------------------------------------------------------- */}
            {/* 2. El agua que entra contra la que se va, y el aire.            */}
            {/* -------------------------------------------------------------- */}
            <Marco
              titulo="Clima y balance hídrico"
              descripcion={
                es48h
                  ? 'Lluvia y ET₀ de cada hora (Open-Meteo) y temperatura del aire, en las últimas 48 horas.'
                  : 'Lluvia diaria (mm) contra la evapotranspiración ET₀ (mm), con las temperaturas del aire.'
              }
            >
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={es48h ? datosHorarios : datosFusionados} margin={{ top: 5, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="fecha" tickFormatter={formatearEjeX} minTickGap={28} {...EJE} />
                  <YAxis yAxisId="agua" unit="mm" domain={['auto', 'auto']} {...EJE} />
                  <YAxis yAxisId="temp" orientation="right" unit="°C" domain={['auto', 'auto']} {...EJE} />
                  <Tooltip content={pista} cursor={{ stroke: '#565e60', strokeDasharray: '3 3' }} />
                  <Legend content={<Leyenda />} />

                  {es48h ? (
                    // Cada barra es la lluvia de una hora: se ve cuando llovio
                    // y cuanto, sin inventar una curva entre horas.
                    <Bar yAxisId="agua" dataKey="precipitacion_mm" name="Lluvia por hora (mm)"
                      fill={SERIES.agua} maxBarSize={10} />
                  ) : (
                    <Area
                      yAxisId="agua"
                      type="monotone"
                      dataKey="precipitacion_mm"
                      name="Lluvia (mm)"
                      stroke={SERIES.agua}
                      fill={SERIES.agua}
                      fillOpacity={0.18}
                      strokeWidth={2}
                      dot={rangoActual.dias <= 30 ? { r: 2 } : false}
                      activeDot={{ r: 5, strokeWidth: 2, stroke: '#222a2e' }}
                    />
                  )}
                  <Line
                    yAxisId="agua"
                    type="monotone"
                    dataKey="et0_dia"
                    name="ET₀ (mm)"
                    stroke={SERIES.vino}
                    strokeWidth={2}
                    dot={es48h ? { r: 3 } : rangoActual.dias <= 30 ? { r: 2 } : false}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: '#222a2e' }}
                  />
                  <Line
                    yAxisId="temp"
                    type="monotone"
                    dataKey="temp_media"
                    name={es48h ? 'Temp. aire (°C)' : 'Temp. media (°C)'}
                    stroke={SERIES.calor}
                    strokeWidth={2}
                    dot={es48h ? { r: 3 } : false}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: '#222a2e' }}
                  />
                  {!es48h && (
                    <>
                      {/* Máxima y mínima son el MISMO tono que la media, más claro
                          y más oscuro: se leen como el rango de una sola cosa, no
                          como tres variables distintas. */}
                      <Line
                        yAxisId="temp"
                        type="monotone"
                        dataKey="temp_max"
                        name="Temp. máx (°C)"
                        stroke={SERIES.calorAlto}
                        strokeWidth={1}
                        strokeDasharray="2 3"
                        dot={false}
                      />
                      <Line
                        yAxisId="temp"
                        type="monotone"
                        dataKey="temp_min"
                        name="Temp. mín (°C)"
                        stroke={SERIES.calorBajo}
                        strokeWidth={1}
                        strokeDasharray="2 3"
                        dot={false}
                      />
                    </>
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </Marco>

            {/* -------------------------------------------------------------- */}
            {/* 3. La hoja. Solo si hay algo que enseñar.                       */}
            {/* -------------------------------------------------------------- */}
            {hayDatosFoliar && (
              <Marco
                titulo="Mediciones foliares"
                descripcion="Clorofila, flavonoides y balance de nitrógeno (NBI) medidos con el Dualex."
                alto="h-72"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={datosFusionados.filter(
                      (d) => d.foliar_nbi != null || d.foliar_chl != null || d.foliar_flav != null,
                    )}
                    margin={{ top: 5, right: 12, left: -12, bottom: 0 }}
                  >
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="fecha" tickFormatter={formatearEjeX} minTickGap={28} {...EJE} />
                    <YAxis domain={['auto', 'auto']} {...EJE} />
                    <Tooltip content={pista} cursor={{ stroke: '#565e60', strokeDasharray: '3 3' }} />
                    <Legend content={<Leyenda />} />

                    <Line
                      type="monotone"
                      dataKey="foliar_nbi"
                      name="NBI (balance de nitrógeno)"
                      stroke={SERIES.agua}
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6, strokeWidth: 2, stroke: '#222a2e' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="foliar_chl"
                      name="Clorofila"
                      stroke={SERIES.hoja}
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6, strokeWidth: 2, stroke: '#222a2e' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="foliar_flav"
                      name="Flavonoides"
                      stroke={SERIES.vino}
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6, strokeWidth: 2, stroke: '#222a2e' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Marco>
            )}
            </>
          )}
        </>
      )}

      <ModalExportar
        parcela={parcela}
        abierto={mostrarModalExportar}
        alCerrar={() => setMostrarModalExportar(false)}
      />
    </>
  );
}

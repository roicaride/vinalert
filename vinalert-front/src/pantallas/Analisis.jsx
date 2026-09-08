import { useEffect, useMemo, useState } from 'react';
import {
  Area,
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
import { obtenerHistorico } from '../api/estado';
import { listarFoliar } from '../api/foliar';
import { listarTratamientos } from '../api/tratamientos';
import ModalExportar from '../componentes/ModalExportar';
import MensajeError from '../errores/MensajeError';
import { useParcela } from '../parcela/ParcelaContext';
import Boton from '../ui/Boton';
import { Cargando, Vacio } from '../ui/Estados';
import { Cifra, Encabezado, Rejilla } from '../ui/Panel';
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
  const [suelo, setSuelo] = useState(null);
  const [clima, setClima] = useState(null);
  const [historico, setHistorico] = useState(null);
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

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError(null);

    if (es48h) {
      Promise.all([
        obtenerHistorico(parcela.id, 2000, 48),
        listarTratamientos(parcela.id),
        listarFoliar(parcela.id),
      ])
        .then(([h, t, f]) => {
          if (vigente) {
            setHistorico(h);
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
            humedades: [],
            temperaturas_suelo: [],
            temp_media: log.temp_ambiente_c,
            humedad_aire: log.humedad_aire_pct,
            precipitacion_mm: log.lluvia_mm,
            et0_dia: log.et0,
            viento_ms: log.viento_ms,
          });
        }
        const fila = mapa.get(fechaIso);
        if (log.humedad_suelo_pct != null) fila.humedades.push(log.humedad_suelo_pct);
        if (log.temperatura_suelo != null) fila.temperaturas_suelo.push(log.temperatura_suelo);
        if (log.temp_ambiente_c != null && fila.temp_media == null) fila.temp_media = log.temp_ambiente_c;
        if (log.lluvia_mm != null && fila.precipitacion_mm == null) fila.precipitacion_mm = log.lluvia_mm;
        if (log.et0 != null && fila.et0_dia == null) fila.et0_dia = log.et0;
      });

      const lista = Array.from(mapa.values())
        .map((f) => ({
          ...f,
          humedad_media: f.humedades.length
            ? Number((f.humedades.reduce((a, b) => a + b, 0) / f.humedades.length).toFixed(1))
            : null,
          temperatura_suelo: f.temperaturas_suelo.length
            ? Number((f.temperaturas_suelo.reduce((a, b) => a + b, 0) / f.temperaturas_suelo.length).toFixed(1))
            : null,
        }))
        .sort((a, b) => a.fecha.localeCompare(b.fecha));

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

    (suelo ?? []).forEach((s) => {
      const fila = obtenerFila(s.fecha);
      fila.humedad_media = s.humedad_media;
      fila.humedad_min = s.humedad_min;
      fila.humedad_max = s.humedad_max;
      fila.temperatura_suelo = s.temperatura_media;
    });

    (clima ?? []).forEach((c) => {
      const fila = obtenerFila(c.fecha);
      fila.temp_media = c.temp_media;
      fila.temp_max = c.temp_max;
      fila.temp_min = c.temp_min;
      fila.precipitacion_mm = c.precipitacion_total_mm;
      fila.et0_dia = c.et0_total_dia;
      fila.radiacion_mj = c.radiacion_total_mj_m2;
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

    return Array.from(mapa.values()).sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [es48h, historico, suelo, clima, tratamientos, foliar]);

  // Cálculos de KPIs del período
  const kpis = useMemo(() => {
    if (es48h) {
      const items = datosFusionados;
      const totalLluvia = items.reduce((acc, d) => acc + (d.precipitacion_mm ?? 0), 0);
      const totalEt0 = items.reduce((acc, d) => acc + (d.et0_dia ?? 0), 0);
      const balance = totalLluvia - totalEt0;

      const humValidas = items.filter((d) => d.humedad_media != null);
      const mediaHumedad = humValidas.length
        ? humValidas.reduce((acc, d) => acc + d.humedad_media, 0) / humValidas.length
        : null;

      const tempValidas = items.filter((d) => d.temperatura_suelo != null);
      const mediaTempSuelo = tempValidas.length
        ? tempValidas.reduce((acc, d) => acc + d.temperatura_suelo, 0) / tempValidas.length
        : null;

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

    const humValidas = (suelo ?? []).filter((s) => s.humedad_media != null);
    const mediaHumedad = humValidas.length
      ? humValidas.reduce((acc, s) => acc + s.humedad_media, 0) / humValidas.length
      : null;

    const tempValidas = (suelo ?? []).filter((s) => s.temperatura_media != null);
    const mediaTempSuelo = tempValidas.length
      ? tempValidas.reduce((acc, s) => acc + s.temperatura_media, 0) / tempValidas.length
      : null;

    return {
      totalLluvia,
      totalEt0,
      balance,
      mediaHumedad,
      mediaTempSuelo,
      detallePeriodo: `En los últimos ${rangoActual.dias} días`,
    };
  }, [es48h, datosFusionados, clima, suelo, rangoActual.dias]);

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
      </div>

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
                tinta={kpis.balance < 0 ? 'text-ambar' : 'text-brote'}
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

          {/* -------------------------------------------------------------- */}
          {/* 1. El suelo.                                                    */}
          {/* -------------------------------------------------------------- */}
          <Marco
            titulo="Temperatura y humedad del suelo"
            descripcion={
              es48h
                ? 'Cada lectura de los sensores, punto a punto: humedad (%) y temperatura del suelo (°C).'
                : 'Humedad media (%) y temperatura del suelo (°C), un valor por día.'
            }
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={datosFusionados} margin={{ top: 5, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="fecha" tickFormatter={formatearEjeX} minTickGap={28} {...EJE} />
                <YAxis yAxisId="izq" unit="%" domain={['auto', 'auto']} {...EJE} />
                <YAxis yAxisId="der" orientation="right" unit="°C" domain={['auto', 'auto']} {...EJE} />
                <Tooltip content={pista} cursor={{ stroke: '#565e60', strokeDasharray: '3 3' }} />
                <Legend content={<Leyenda />} />

                <Line
                  yAxisId="izq"
                  type="monotone"
                  dataKey="humedad_media"
                  name={es48h ? 'Humedad suelo real (%)' : 'Humedad suelo (%)'}
                  stroke={SERIES.agua}
                  strokeWidth={2}
                  dot={es48h ? { r: 3 } : rangoActual.dias <= 30 ? { r: 2 } : false}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: '#222a2e' }}
                />
                <Line
                  yAxisId="der"
                  type="monotone"
                  dataKey="temperatura_suelo"
                  name={es48h ? 'Temp. suelo real (°C)' : 'Temp. suelo (°C)'}
                  stroke={SERIES.calor}
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  dot={es48h ? { r: 3 } : false}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: '#222a2e' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </Marco>

          {/* -------------------------------------------------------------- */}
          {/* 2. El agua que entra contra la que se va, y el aire.            */}
          {/* -------------------------------------------------------------- */}
          <Marco
            titulo="Clima y balance hídrico"
            descripcion={
              es48h
                ? 'Lluvia, ET₀ y temperatura del aire punto a punto en las últimas 48 horas.'
                : 'Lluvia diaria (mm) contra la evapotranspiración ET₀ (mm), con las temperaturas del aire.'
            }
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={datosFusionados} margin={{ top: 5, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="fecha" tickFormatter={formatearEjeX} minTickGap={28} {...EJE} />
                <YAxis yAxisId="agua" unit="mm" domain={['auto', 'auto']} {...EJE} />
                <YAxis yAxisId="temp" orientation="right" unit="°C" domain={['auto', 'auto']} {...EJE} />
                <Tooltip content={pista} cursor={{ stroke: '#565e60', strokeDasharray: '3 3' }} />
                <Legend content={<Leyenda />} />

                <Area
                  yAxisId="agua"
                  type="monotone"
                  dataKey="precipitacion_mm"
                  name="Lluvia (mm)"
                  stroke={SERIES.agua}
                  fill={SERIES.agua}
                  fillOpacity={0.18}
                  strokeWidth={2}
                  dot={es48h ? { r: 3 } : rangoActual.dias <= 30 ? { r: 2 } : false}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: '#222a2e' }}
                />
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

      <ModalExportar
        parcela={parcela}
        abierto={mostrarModalExportar}
        alCerrar={() => setMostrarModalExportar(false)}
      />
    </>
  );
}

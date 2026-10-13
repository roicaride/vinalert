import {
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

import { Leyenda, Marco, Pista } from './piezas';
import { claveHumedad, claveTemperatura, cortarHuecos } from './series';
import { EJE, GRID, SERIES, colorSensor } from './tema';

/**
 * Las graficas de suelo de Analisis, segun los sensores elegidos.
 *
 * - Media: una grafica con humedad y temperatura (la media justa de los
 *   elegidos), como siempre.
 * - Comparar: dos graficas de un solo eje —humedad y temperatura— con una
 *   linea por sensor, para no mezclar 12 lineas en un eje doble.
 *
 * En 48 horas el eje X es tiempo de verdad (milisegundos): dos envios
 * separados por 14 horas se ven a 14 horas, y cada linea lleva sus propios
 * puntos, asi que a un sensor que falta en un envio no le pasa nada.
 */

const MARGEN = { top: 5, right: 12, left: -12, bottom: 0 };
const CURSOR = { stroke: '#565e60', strokeDasharray: '3 3' };
const PUNTO_ACTIVO = { r: 5, strokeWidth: 2, stroke: '#222a2e' };

const nombreSensor = (s) => `S${s.numero}`;

export default function GraficaSuelo({ es48h, modo, sensores, diario, horas, formatearEjeX, formatearTooltip, puntos }) {
  const pista = <Pista formatearEtiqueta={formatearTooltip} />;
  const ejeX = es48h
    ? { dataKey: 't', type: 'number', scale: 'time', domain: ['dataMin', 'dataMax'] }
    : { dataKey: 'fecha' };

  if (modo === 'media') {
    const datos = es48h ? cortarHuecos(horas.media) : diario;
    const h = es48h ? 'humedad' : 'humedad_media';
    const t = es48h ? 'temperatura' : 'temperatura_suelo';
    return (
      <Marco
        titulo="Temperatura y humedad del suelo"
        descripcion={
          es48h
            ? 'Cada envío de los sensores elegidos, en su hora real: humedad (%) y temperatura del suelo (°C). Un envío al que le falta algún sensor no se dibuja.'
            : 'Media justa de los sensores elegidos, un valor por día: humedad (%) y temperatura del suelo (°C).'
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={datos} margin={MARGEN}>
            <CartesianGrid {...GRID} />
            <XAxis {...ejeX} tickFormatter={formatearEjeX} minTickGap={28} {...EJE} />
            <YAxis yAxisId="izq" unit="%" domain={['auto', 'auto']} {...EJE} />
            <YAxis yAxisId="der" orientation="right" unit="°C" domain={['auto', 'auto']} {...EJE} />
            <Tooltip content={pista} cursor={CURSOR} />
            <Legend content={<Leyenda />} />
            <Line yAxisId="izq" type="monotone" dataKey={h} name="Humedad suelo (%)" stroke={SERIES.agua}
              strokeWidth={2} dot={puntos} activeDot={PUNTO_ACTIVO} />
            <Line yAxisId="der" type="monotone" dataKey={t} name="Temp. suelo (°C)" stroke={SERIES.calor}
              strokeWidth={2} strokeDasharray="5 3" dot={puntos} activeDot={PUNTO_ACTIVO} />
          </ComposedChart>
        </ResponsiveContainer>
      </Marco>
    );
  }

  const graficas = [
    { titulo: 'Humedad del suelo por sensor', unidad: '%', campo48: 'humedad', clave: claveHumedad },
    { titulo: 'Temperatura del suelo por sensor', unidad: '°C', campo48: 'temperatura', clave: claveTemperatura },
  ];
  return (
    <div className="grid gap-px bg-linea xl:grid-cols-2">
      {graficas.map((g) => (
        <Marco
          key={g.titulo}
          titulo={g.titulo}
          descripcion={es48h ? `Cada lectura, en su hora real (${g.unidad}).` : `Media diaria de cada sensor (${g.unidad}).`}
          alto="h-72"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={es48h ? undefined : diario} margin={MARGEN}>
              <CartesianGrid {...GRID} />
              <XAxis {...ejeX} tickFormatter={formatearEjeX} minTickGap={28} {...EJE} allowDuplicatedCategory={false} />
              <YAxis unit={g.unidad === '%' ? '%' : '°C'} domain={['auto', 'auto']} {...EJE} />
              <Tooltip content={pista} cursor={CURSOR} />
              <Legend content={<Leyenda />} />
              {sensores.map((s) => (
                <Line
                  key={s.id}
                  type="monotone"
                  data={es48h ? cortarHuecos(horas.porSensor[s.id] ?? []) : undefined}
                  dataKey={es48h ? g.campo48 : g.clave(s.id)}
                  name={nombreSensor(s)}
                  stroke={colorSensor(s.numero)}
                  strokeWidth={2}
                  dot={puntos}
                  activeDot={PUNTO_ACTIVO}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </Marco>
      ))}
    </div>
  );
}

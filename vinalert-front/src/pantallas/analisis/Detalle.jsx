import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Leyenda, Marco } from './piezas';
import { claveHumedad } from './series';
import { EJE, GRID, SERIES, colorSensor, trazoProfundidad } from './tema';

/**
 * La vista Detalle de Analisis: el clima que Open-Meteo da cada dia y que el
 * Resumen no ensena. Solo tiene sentido con datos diarios (7 dias en
 * adelante); en 48 horas no se ofrece.
 *
 * Cada grafica tiene UN eje y una sola unidad. Cuando dos magnitudes se miden
 * distinto (horas de sol y viento) van en graficas separadas en vez de
 * compartir un eje doble que obligue a adivinar que linea va con que escala.
 */

const MARGEN = { top: 5, right: 12, left: -12, bottom: 0 };
const CURSOR = { stroke: '#565e60', strokeDasharray: '3 3' };
const PUNTO_ACTIVO = { r: 5, strokeWidth: 2, stroke: '#222a2e' };

export default function Detalle({ datos, formatearEjeX, pista, puntos, modo = 'media', sensores = [] }) {
  const conDatos = (clave) => datos.some((d) => d[clave] != null);
  // En comparar los datos van en hum_s<id>, no en humedad_media: hay que
  // mirar la clave de alguno de los sensores elegidos.
  const conDatosSuelo =
    modo === 'comparar'
      ? sensores.some((s) => conDatos(claveHumedad(s.id)))
      : conDatos('humedad_media');

  return (
    <>
      <Marco
        titulo="Humedad del aire y hoja mojada"
        descripcion="Humedad relativa del aire (media, máxima y mínima del día) y probabilidad de que la hoja esté mojada, en %."
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={datos} margin={MARGEN}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="fecha" tickFormatter={formatearEjeX} minTickGap={28} {...EJE} />
            <YAxis unit="%" domain={[0, 100]} {...EJE} />
            <Tooltip content={pista} cursor={CURSOR} />
            <Legend content={<Leyenda />} />
            <Line type="monotone" dataKey="hr_media" name="Humedad aire media (%)" stroke={SERIES.agua}
              strokeWidth={2} dot={puntos} activeDot={PUNTO_ACTIVO} />
            <Line type="monotone" dataKey="hr_max" name="Humedad aire máx (%)" stroke={SERIES.aguaAlto}
              strokeWidth={1} strokeDasharray="2 3" dot={false} />
            <Line type="monotone" dataKey="hr_min" name="Humedad aire mín (%)" stroke={SERIES.aguaBajo}
              strokeWidth={1} strokeDasharray="2 3" dot={false} />
            <Line type="monotone" dataKey="hoja_mojada" name="Hoja mojada (%)" stroke={SERIES.hoja}
              strokeWidth={2} dot={puntos} activeDot={PUNTO_ACTIVO} />
          </ComposedChart>
        </ResponsiveContainer>
      </Marco>

      <div className="grid gap-px bg-linea lg:grid-cols-2">
        <Marco titulo="Horas de sol" descripcion="Horas de sol directo de cada día." alto="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={datos} margin={MARGEN}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="fecha" tickFormatter={formatearEjeX} minTickGap={28} {...EJE} />
              <YAxis unit=" h" domain={[0, 'auto']} {...EJE} />
              <Tooltip content={pista} cursor={{ fill: '#2a3337' }} />
              <Bar dataKey="horas_sol" name="Horas de sol (h)" fill={SERIES.calor} maxBarSize={18} />
            </ComposedChart>
          </ResponsiveContainer>
        </Marco>

        <Marco titulo="Viento" descripcion="Velocidad media del día y racha máxima, en m/s." alto="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={datos} margin={MARGEN}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="fecha" tickFormatter={formatearEjeX} minTickGap={28} {...EJE} />
              <YAxis unit=" m/s" domain={[0, 'auto']} {...EJE} />
              <Tooltip content={pista} cursor={CURSOR} />
              <Legend content={<Leyenda />} />
              <Line type="monotone" dataKey="viento_media" name="Viento medio (m/s)" stroke={SERIES.viento}
                strokeWidth={2} dot={puntos} activeDot={PUNTO_ACTIVO} />
              <Line type="monotone" dataKey="viento_racha" name="Racha máxima (m/s)" stroke={SERIES.vientoAlto}
                strokeWidth={1} strokeDasharray="2 3" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </Marco>
      </div>

      <Marco
        titulo="Humedad del suelo: tus sondas y el modelo"
        descripcion={
          !conDatosSuelo
            ? 'Lo que calcula Open-Meteo para tus coordenadas (capa de 0 a 7 cm). Tus sondas aparecerán aquí en cuanto haya días con lecturas.'
            : modo === 'comparar'
              ? 'La media diaria de cada sonda elegida frente a la que calcula Open-Meteo para tus coordenadas (capa de 0 a 7 cm), en %. Si una se separa mucho del resto o del modelo, merece la pena revisarla.'
              : 'La media diaria de tus sondas frente a la que calcula Open-Meteo para tus coordenadas (capa de 0 a 7 cm), las dos en %. Si se separan mucho, merece la pena revisar la sonda.'
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={datos} margin={MARGEN}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="fecha" tickFormatter={formatearEjeX} minTickGap={28} {...EJE} />
            <YAxis unit="%" domain={[0, 'auto']} {...EJE} />
            <Tooltip content={pista} cursor={CURSOR} />
            <Legend content={<Leyenda />} />
            {modo === 'comparar' ? (
              sensores.map((s) => (
                <Line key={s.id} type="monotone" dataKey={claveHumedad(s.id)}
                  name={`S${s.numero}${s.profundidad_cm != null ? ` · ${s.profundidad_cm} cm` : ''} (%)`}
                  stroke={colorSensor(s.numero)} strokeDasharray={trazoProfundidad(s.profundidad_cm)}
                  strokeWidth={2} dot={puntos} activeDot={PUNTO_ACTIVO} />
              ))
            ) : (
              <Line type="monotone" dataKey="humedad_media" name="Tus sondas (%)" stroke={SERIES.agua}
                strokeWidth={2} dot={puntos} activeDot={PUNTO_ACTIVO} connectNulls={false} />
            )}
            <Line type="monotone" dataKey="suelo_modelo_hum" name="Modelo Open-Meteo (%)" stroke={SERIES.modelo}
              strokeWidth={2} strokeDasharray="5 3" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </Marco>
    </>
  );
}

import { useState } from 'react';
import { obtenerClimaDiario, obtenerSueloDiario } from '../api/analisis';
import { obtenerHistorico } from '../api/estado';
import { listarFoliar } from '../api/foliar';
import { listarTratamientos } from '../api/tratamientos';
import { descargarCsv, exportarExcelMultilibro } from '../utils/exportar';
import { CuadroMarca } from '../marca/Marca';
import Boton, { Enlace } from '../ui/Boton';
import { Aviso } from '../ui/Estados';

export default function ModalExportar({ parcela, abierto, alCerrar }) {
  const [opcion, setOpcion] = useState('todo'); // 'todo' | 'analisis' | 'estado' | 'tratamientos' | 'foliar'
  const [formato, setFormato] = useState('xlsx'); // 'xlsx' | 'csv'
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState(null);

  if (!abierto) return null;

  const handleExportar = async () => {
    setExportando(true);
    setError(null);
    try {
      // 1. Cargar todos los datos actualizados de la parcela
      const [suelo, clima, historico, tratamientos, foliar] = await Promise.all([
        obtenerSueloDiario(parcela.id, 365),
        obtenerClimaDiario(parcela.id, 365),
        obtenerHistorico(parcela.id, 2000),
        listarTratamientos(parcela.id),
        listarFoliar(parcela.id),
      ]);

      const nombreBase = (parcela.nombre || 'parcela').replace(/\s+/g, '_').toLowerCase();

      // Preparar Pestaña 1: Análisis Diario
      const mapaDiario = new Map();
      (suelo ?? []).forEach((s) => {
        if (!mapaDiario.has(s.fecha)) mapaDiario.set(s.fecha, { fecha: s.fecha });
        const f = mapaDiario.get(s.fecha);
        f.humedad_media = s.humedad_media;
        f.humedad_min = s.humedad_min;
        f.humedad_max = s.humedad_max;
        f.temp_suelo = s.temperatura_media;
      });
      (clima ?? []).forEach((c) => {
        if (!mapaDiario.has(c.fecha)) mapaDiario.set(c.fecha, { fecha: c.fecha });
        const f = mapaDiario.get(c.fecha);
        f.lluvia_mm = c.precipitacion_total_mm;
        f.et0_dia = c.et0_total_dia;
        f.temp_aire_med = c.temp_media;
        f.temp_aire_max = c.temp_max;
        f.temp_aire_min = c.temp_min;
        f.radiacion_mj = c.radiacion_total_mj_m2;
      });
      (tratamientos ?? []).forEach((t) => {
        const fechaStr = (t.fecha || '').slice(0, 10);
        if (mapaDiario.has(fechaStr)) {
          const f = mapaDiario.get(fechaStr);
          f.tratamiento = (f.tratamiento ? f.tratamiento + ' | ' : '') + t.tipo + (t.producto ? `: ${t.producto}` : '');
        }
      });
      (foliar ?? []).forEach((fl) => {
        const fechaStr = (fl.fecha || '').slice(0, 10);
        if (mapaDiario.has(fechaStr)) {
          const f = mapaDiario.get(fechaStr);
          f.nbi = fl.nbi_medio;
          f.chl = fl.chl_medio;
          f.flav = fl.flav_medio;
        }
      });

      const filasAnalisis = Array.from(mapaDiario.values())
        .sort((a, b) => b.fecha.localeCompare(a.fecha))
        .map((d) => [
          d.fecha,
          d.humedad_media ?? '',
          d.humedad_min ?? '',
          d.humedad_max ?? '',
          d.temp_suelo ?? '',
          d.lluvia_mm ?? '',
          d.et0_dia ?? '',
          d.lluvia_mm != null && d.et0_dia != null ? Number((d.lluvia_mm - d.et0_dia).toFixed(2)) : '',
          d.radiacion_mj ?? '',
          d.temp_aire_med ?? '',
          d.temp_aire_max ?? '',
          d.temp_aire_min ?? '',
          d.tratamiento ?? '',
          d.nbi ?? '',
          d.chl ?? '',
          d.flav ?? '',
        ]);

      const cabecerasAnalisis = [
        'Fecha',
        'Humedad Suelo Media (%)',
        'Humedad Mín (%)',
        'Humedad Máx (%)',
        'Temp Suelo Media (°C)',
        'Lluvia (mm)',
        'ET₀ (mm)',
        'Balance Hídrico (mm)',
        'Radiación Solar (MJ/m²)',
        'Temp Aire Media (°C)',
        'Temp Aire Máx (°C)',
        'Temp Aire Mín (°C)',
        'Tratamientos Fitosanitarios',
        'NBI Foliar (Nitrógeno)',
        'Clorofila Foliar',
        'Flavonoides Foliar',
      ];

      // Preparar Pestaña 2: Telemetría de Sensores + Clima en ese Momento
      const cabecerasTelemetria = [
        'Fecha y Hora',
        'Sensor ID',
        'Sensor / Profundidad',
        'Humedad Suelo (%)',
        'Temp Suelo (°C)',
        'Batería (V)',
        'Temp Ambiente (°C)',
        'Humedad Aire (%)',
        'Lluvia Momento (mm)',
        'ET₀ Momento (mm)',
        'Viento (m/s)',
        'Racha Viento (m/s)',
        'Dirección Viento (°)',
        'Radiación Solar (W/m²)',
        'Presión (hPa)',
        'VPD (kPa)',
        'Punto Rocío (°C)',
        'Nubosidad (%)',
      ];
      const filasTelemetria = (historico ?? []).map((log) => [
        log.fecha_hora ? new Date(log.fecha_hora).toLocaleString('es-ES') : '',
        log.sensor_id ?? '',
        log.sensor_etiqueta ? `${log.sensor_etiqueta} (${log.sensor_profundidad_cm ?? ''}cm)` : `Sensor #${log.sensor_id ?? ''}`,
        log.humedad_suelo_pct ?? '',
        log.temperatura_suelo ?? '',
        log.bateria ?? '',
        log.temp_ambiente_c ?? '',
        log.humedad_aire_pct ?? '',
        log.lluvia_mm ?? '',
        log.et0 ?? '',
        log.viento_ms ?? '',
        log.viento_racha_ms ?? '',
        log.viento_dir_deg ?? '',
        log.radiacion_wm2 ?? '',
        log.presion_hpa ?? '',
        log.vpd_kpa ?? '',
        log.punto_rocio_c ?? '',
        log.nubosidad_pct ?? '',
      ]);

      // Preparar Pestaña 3: Cuaderno de Tratamientos
      const cabecerasTratamientos = [
        'Fecha y Hora Aplicación',
        'Tipo Tratamiento',
        'Producto Comercial',
        'Materia Activa',
        'Dosis',
        'Unidad Dosis',
        'Cantidad Total',
        'Unidad Cantidad',
        'Operador',
        'Maquinaria',
        'Temp Aplicación (°C)',
        'Humedad Aire (%)',
        'Viento Aplicación (m/s)',
        'Racha Viento (m/s)',
        'Dirección Viento (°)',
        'Lluvia Momento (mm)',
        'ET₀ (mm)',
        'Radiación Solar (W/m²)',
        'Presión (hPa)',
        'VPD (kPa)',
        'Punto Rocío (°C)',
        'Nubosidad (%)',
        'Fuente Clima',
        'Notas',
      ];
      const filasTratamientos = (tratamientos ?? []).map((t) => [
        t.fecha ? new Date(t.fecha).toLocaleString('es-ES') : '',
        t.tipo ?? '',
        t.producto ?? '',
        t.materia_activa ?? '',
        t.dosis ?? '',
        t.unidad_dosis ?? '',
        t.cantidad_total ?? '',
        t.unidad_cantidad ?? '',
        t.operador ?? '',
        t.maquinaria ?? '',
        t.temp_c_aplicacion ?? '',
        t.humedad_relativa_aplicacion ?? '',
        t.viento_ms_aplicacion ?? '',
        t.viento_racha_ms_aplicacion ?? '',
        t.viento_dir_deg_aplicacion ?? '',
        t.lluvia_mm_aplicacion ?? '',
        t.et0_aplicacion ?? '',
        t.radiacion_wm2_aplicacion ?? '',
        t.presion_hpa_aplicacion ?? '',
        t.vpd_kpa_aplicacion ?? '',
        t.punto_rocio_c_aplicacion ?? '',
        t.nubosidad_pct_aplicacion ?? '',
        t.clima_fuente ?? '',
        t.notas ?? '',
      ]);


      // Preparar Pestaña 4: Mediciones Foliares
      const cabecerasFoliar = [
        'Fecha Muestreo',
        'Grupo / Zona',
        'NBI Medio',
        'NBI Desv. Típica',
        'Clorofila Media',
        'Clorofila Desv. Típica',
        'Flavonoides Medio',
        'Flavonoides Desv. Típica',
        'Nº Mediciones',
        'Fichero Origen',
      ];
      const filasFoliar = (foliar ?? []).map((f) => [
        f.fecha ?? '',
        f.grupo ?? '',
        f.nbi_medio ?? '',
        f.nbi_sd ?? '',
        f.chl_medio ?? '',
        f.chl_sd ?? '',
        f.flav_medio ?? '',
        f.flav_sd ?? '',
        f.n_mediciones ?? '',
        f.archivo_origen ?? '',
      ]);

      // Exportar según la opción seleccionada
      if (formato === 'xlsx') {
        const pestanas = [];
        if (opcion === 'todo' || opcion === 'analisis') {
          pestanas.push({ nombre: 'Análisis Diario', cabeceras: cabecerasAnalisis, filas: filasAnalisis });
        }
        if (opcion === 'todo' || opcion === 'estado') {
          pestanas.push({ nombre: 'Telemetría y Clima', cabeceras: cabecerasTelemetria, filas: filasTelemetria });
        }
        if (opcion === 'todo' || opcion === 'tratamientos') {
          pestanas.push({ nombre: 'Cuaderno Tratamientos', cabeceras: cabecerasTratamientos, filas: filasTratamientos });
        }
        if (opcion === 'todo' || opcion === 'foliar') {
          pestanas.push({ nombre: 'Mediciones Foliares', cabeceras: cabecerasFoliar, filas: filasFoliar });
        }

        exportarExcelMultilibro(`vinalert_${nombreBase}_${opcion}`, pestanas);
      } else {
        // Formato CSV (descarga individual)
        if (opcion === 'analisis' || opcion === 'todo') {
          descargarCsv(`analisis_diario_${nombreBase}`, cabecerasAnalisis, filasAnalisis);
        } else if (opcion === 'estado') {
          descargarCsv(`telemetria_clima_${nombreBase}`, cabecerasTelemetria, filasTelemetria);
        } else if (opcion === 'tratamientos') {
          descargarCsv(`cuaderno_tratamientos_${nombreBase}`, cabecerasTratamientos, filasTratamientos);
        } else if (opcion === 'foliar') {
          descargarCsv(`mediciones_foliares_${nombreBase}`, cabecerasFoliar, filasFoliar);
        }
      }

      alCerrar();
    } catch (err) {
      setError(err?.message || 'Error al exportar los datos.');
    } finally {
      setExportando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-lousa/90 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-exportar"
      onKeyDown={(e) => { if (e.key === 'Escape') alCerrar(); }}
    >
      <div className="w-full max-w-2xl border border-linea-viva bg-lousa">
        <header className="flex items-start justify-between gap-4 border-b border-linea px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <CuadroMarca lado={30} tinta="bg-oso" />
            <div className="min-w-0">
              <h3 id="titulo-exportar" className="font-mono text-sm font-medium text-oso">
                Exportar a Excel / CSV
              </h3>
              <p className="rotulo mt-1 truncate">{parcela.nombre}</p>
            </div>
          </div>
          <Enlace onClick={alCerrar} autoFocus>
            Cerrar
          </Enlace>
        </header>

        {error && (
          <div className="border-b border-linea px-5 py-3">
            <Aviso tono="sangre" role="alert">{error}</Aviso>
          </div>
        )}

        <fieldset className="border-b border-linea px-5 py-4">
          <legend className="rotulo">Qué se exporta</legend>
          <div className="mt-3 border border-linea">
            {[
              {
                id: 'todo',
                titulo: 'Cuaderno completo',
                desc: 'Un solo archivo con cuatro pestañas: análisis diario, telemetría, tratamientos y foliar.',
              },
              {
                id: 'analisis',
                titulo: 'Resumen diario y balance hídrico',
                desc: 'Medias diarias de suelo, lluvia, ET₀ y temperaturas.',
              },
              {
                id: 'estado',
                titulo: 'Telemetría con el clima de cada lectura',
                desc: 'Cada medición de sensor con la temperatura, la humedad y el viento de ese instante.',
              },
              {
                id: 'tratamientos',
                titulo: 'Cuaderno de tratamientos',
                desc: 'Aplicaciones con producto, dosis y condiciones meteorológicas.',
              },
              {
                id: 'foliar',
                titulo: 'Mediciones foliares',
                desc: 'Histórico de clorofila, flavonoides y balance de nitrógeno.',
              },
            ].map((item) => (
              <label
                key={item.id}
                className={`flex cursor-pointer items-start gap-3 border-b border-linea px-4 py-3 transition-colors last:border-b-0 ${
                  opcion === item.id
                    ? 'border-l-2 border-l-brote bg-alza'
                    : 'border-l-2 border-l-transparent hover:bg-alza'
                }`}
              >
                <input
                  type="radio"
                  name="opcionExport"
                  value={item.id}
                  checked={opcion === item.id}
                  onChange={() => setOpcion(item.id)}
                  className="mt-1 size-3.5 accent-[#8fc93a]"
                />
                <span className="min-w-0">
                  <span
                    className={`block font-mono text-xs font-medium ${
                      opcion === item.id ? 'text-brote' : 'text-oso'
                    }`}
                  >
                    {item.titulo}
                  </span>
                  <span className="mt-1 block text-xs text-oso-3">{item.desc}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="border-b border-linea px-5 py-4">
          <legend className="rotulo">Formato</legend>
          <div className="mt-3 grid gap-px bg-linea sm:grid-cols-2">
            {[
              {
                id: 'xlsx',
                titulo: 'Excel (.xlsx)',
                desc: 'Un libro con las pestañas ya organizadas.',
              },
              {
                id: 'csv',
                titulo: 'CSV (.csv)',
                desc: 'Valores separados por punto y coma.',
              },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFormato(f.id)}
                aria-pressed={formato === f.id}
                className={`bg-lousa px-4 py-3 text-left transition-colors ${
                  formato === f.id ? 'bg-alza' : 'hover:bg-alza'
                }`}
              >
                <span
                  className={`block font-mono text-xs font-medium ${
                    formato === f.id ? 'text-brote' : 'text-oso'
                  }`}
                >
                  {f.titulo}
                </span>
                <span className="mt-1 block text-xs text-oso-3">{f.desc}</span>
              </button>
            ))}
          </div>
          {formato === 'csv' && opcion === 'todo' && (
            <p className="mt-3 text-xs text-oso-4">
              En CSV no caben pestañas: se descarga el resumen diario.
            </p>
          )}
        </fieldset>

        <div className="flex items-center justify-end gap-4 px-5 py-4">
          <Enlace onClick={alCerrar} disabled={exportando}>
            Cancelar
          </Enlace>
          <Boton tono="solido" onClick={handleExportar} disabled={exportando}>
            {exportando ? 'Generando…' : `Descargar ${formato.toUpperCase()}`}
          </Boton>
        </div>
      </div>
    </div>
  );
}

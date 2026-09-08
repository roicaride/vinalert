import { Fragment, useEffect, useRef, useState } from 'react';

import { listarFoliar, subirFoliar } from '../api/foliar';
import ModalExportar from '../componentes/ModalExportar';
import MensajeError from '../errores/MensajeError';
import { useParcela } from '../parcela/ParcelaContext';
import SoloGestor from '../parcela/SoloGestor';
import Boton from '../ui/Boton';
import { Cargando } from '../ui/Estados';
import { Encabezado } from '../ui/Panel';

function fmt(valor) {
  return valor == null ? '—' : valor;
}

// Asume que `lecturas` ya viene ordenada por fecha (descendente): agrupa
// filas consecutivas de la misma fecha bajo una unica cabecera visual.
function agruparPorFecha(lecturas) {
  const grupos = [];
  for (const l of lecturas) {
    const fecha = new Date(l.fecha).toLocaleDateString('es-ES');
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.fecha === fecha) {
      ultimo.filas.push(l);
    } else {
      grupos.push({ fecha, filas: [l] });
    }
  }
  return grupos;
}

/** Media y desviacion en el mismo nodo: se leen juntas o no se leen. */
function MedidaSd({ media, sd }) {
  return (
    <span className="font-mono text-xs tabular-nums text-oso">
      {fmt(media)}
      <span className="text-oso-4">{` ± ${fmt(sd)}`}</span>
    </span>
  );
}

export default function Foliar() {
  const { parcela } = useParcela();
  const [lecturas, setLecturas] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [mostrarModalExportar, setMostrarModalExportar] = useState(false);
  const [error, setError] = useState(null);
  const [archivo, setArchivo] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    let vigente = true;
    listarFoliar(parcela.id)
      .then((l) => { if (vigente) { setLecturas(l); setError(null); } })
      .catch((e) => { if (vigente) setError(e); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [parcela.id]);

  const subir = async (e) => {
    e.preventDefault();
    if (!archivo) return;
    setError(null);
    setSubiendo(true);
    try {
      const nuevas = await subirFoliar(parcela.id, archivo);
      setLecturas((prev) =>
        [...prev, ...nuevas].sort((a, b) => {
          const porFecha = new Date(b.fecha) - new Date(a.fecha);
          return porFecha !== 0 ? porFecha : a.grupo - b.grupo;
        }),
      );
      setArchivo(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      setError(err);
    } finally {
      setSubiendo(false);
    }
  };

  if (cargando) return <Cargando texto="Cargando lecturas foliares" />;
  if (error && lecturas === null) {
    return (
      <div className="p-6">
        <MensajeError error={error} textoNoEncontrado="No se pudieron cargar las lecturas foliares." />
      </div>
    );
  }

  return (
    <>
      <Encabezado
        titulo="Foliar"
        descripcion="Clorofila, flavonoides y balance de nitrógeno medidos con el Dualex, subidos desde su Excel."
      >
        <Boton tono="sutil" onClick={() => setMostrarModalExportar(true)}>
          Exportar a Excel / CSV
        </Boton>
      </Encabezado>

      <SoloGestor>
        <form className="flex flex-wrap items-end gap-4 border-b border-linea bg-alza px-6 py-4" onSubmit={subir}>
          <div className="min-w-0">
            <label htmlFor="archivo-foliar" className="rotulo block">
              Archivo Excel del medidor foliar
            </label>
            <input
              id="archivo-foliar"
              ref={inputRef}
              type="file"
              accept=".xlsx"
              aria-label="Archivo Excel del medidor foliar"
              onChange={(e) => setArchivo(e.target.files[0] ?? null)}
              className="mt-1.5 block max-w-full font-mono text-xs text-oso-2 file:mr-3 file:border file:border-linea file:bg-lousa file:px-3 file:py-1.5 file:font-mono file:text-[10px] file:tracking-[0.16em] file:text-oso-2 file:uppercase hover:file:border-linea-viva hover:file:text-oso"
            />
          </div>
          <Boton tono="solido" type="submit" disabled={subiendo || !archivo} className="mb-0.5 py-2.5">
            {subiendo ? 'Subiendo…' : 'Subir'}
          </Boton>
        </form>
      </SoloGestor>

      {error && (
        <div className="border-b border-linea px-6 py-3">
          <MensajeError error={error} textoNoEncontrado="No se pudieron cargar las lecturas foliares." />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left">
          <thead>
            <tr className="border-b border-linea bg-alza">
              <th className="rotulo px-4 py-3 font-medium">Grupo</th>
              <th className="rotulo px-4 py-3 font-medium">Clorofila</th>
              <th className="rotulo px-4 py-3 font-medium">Flavonoides</th>
              <th className="rotulo px-4 py-3 font-medium">NBI</th>
              <th className="rotulo px-4 py-3 font-medium">Mediciones</th>
              <th className="rotulo px-4 py-3 font-medium">Archivo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-linea">
            {lecturas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center">
                  <span className="rotulo">Todavía no hay lecturas foliares</span>
                </td>
              </tr>
            )}
            {agruparPorFecha(lecturas).map(({ fecha, filas }) => (
              <Fragment key={fecha}>
                <tr>
                  {/* La fecha manda sobre el grupo: una tanda de medidas es
                      de un dia, y separarla asi ahorra repetirla en cada fila. */}
                  <td
                    colSpan={6}
                    className="border-l-2 border-brote bg-alza px-4 py-1.5 font-mono text-[11px] font-medium tracking-[0.16em] text-brote"
                  >
                    {fecha}
                  </td>
                </tr>
                {filas.map((l) => (
                  <tr key={l.id} className="transition-colors hover:bg-alza">
                    <td className="px-4 py-2.5 font-mono text-xs text-oso-3">{l.grupo}</td>
                    <td className="px-4 py-2.5">
                      <MedidaSd media={l.chl_medio} sd={l.chl_sd} />
                    </td>
                    <td className="px-4 py-2.5">
                      <MedidaSd media={l.flav_medio} sd={l.flav_sd} />
                    </td>
                    <td className="px-4 py-2.5">
                      <MedidaSd media={l.nbi_medio} sd={l.nbi_sd} />
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-oso-2">{fmt(l.n_mediciones)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-oso-4">
                      {l.archivo_origen ?? '—'}
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <ModalExportar
        parcela={parcela}
        abierto={mostrarModalExportar}
        alCerrar={() => setMostrarModalExportar(false)}
      />
    </>
  );
}

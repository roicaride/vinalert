import { useEffect, useMemo, useState } from 'react';

import { crearTratamiento, listarTratamientos, borrarTratamiento } from '../api/tratamientos';
import ModalExportar from '../componentes/ModalExportar';
import MensajeError from '../errores/MensajeError';
import { useParcela } from '../parcela/ParcelaContext';
import SoloGestor from '../parcela/SoloGestor';
import Boton, { Enlace } from '../ui/Boton';
import Campo, { AreaTexto, Selector, claseControl } from '../ui/Campo';
import { Cargando, Marbete } from '../ui/Estados';
import { Encabezado } from '../ui/Panel';

const TIPOS_HABITUALES = ['Fungicida', 'Herbicida', 'Insecticida', 'Abono foliar'];
const OTRO = 'Otro';

// Igual que las ultimas lecturas de Estado: la tabla ensena solo los ultimos
// y quien quiera mas los pide. El backend ya los devuelve de mas nuevo a mas
// viejo y la lista entera esta en memoria, asi que recortar no cuesta otra
// peticion.
const OPCIONES_REGISTROS = [10, 25, 50, 100];

// Las opciones se derivan SIEMPRE de la lista completa, nunca de una vista
// filtrada -- de lo contrario, filtrar por un tipo dejaria el formulario de
// alta sin ver los demas tipos ya usados.
function tiposDisponibles(tratamientos) {
  const usados = [...new Set(tratamientos.map((t) => t.tipo))];
  const extra = usados.filter((t) => !TIPOS_HABITUALES.includes(t)).sort();
  return [...TIPOS_HABITUALES, ...extra];
}

function fmt(valor, unidad) {
  return valor == null ? '—' : `${valor}${unidad ? ' ' + unidad : ''}`;
}

function formVacio() {
  return {
    fecha: '', tipo: '', producto: '', materia_activa: '', dosis: '', unidad_dosis: '',
    cantidad_total: '', unidad_cantidad: '', operador: '', maquinaria: '', notas: '',
  };
}

export default function Tratamientos() {
  const { parcela } = useParcela();
  const [tratamientos, setTratamientos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [mostrarModalExportar, setMostrarModalExportar] = useState(false);
  const [error, setError] = useState(null);
  const [filtro, setFiltro] = useState('');
  const [cuantos, setCuantos] = useState(OPCIONES_REGISTROS[0]);
  const [borrandoId, setBorrandoId] = useState(null);
  const [form, setForm] = useState(formVacio);
  const [tipoPersonalizado, setTipoPersonalizado] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vigente = true;
    listarTratamientos(parcela.id)
      .then((t) => { if (vigente) { setTratamientos(t); setError(null); } })
      .catch((e) => { if (vigente) setError(e); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [parcela.id]);

  const opcionesTipo = useMemo(() => tiposDisponibles(tratamientos ?? []), [tratamientos]);
  const listaFiltrada = filtro ? (tratamientos ?? []).filter((t) => t.tipo === filtro) : tratamientos;
  const listaVisible = (listaFiltrada ?? []).slice(0, cuantos);

  const cambiar = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  const crear = async (e) => {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      const cuerpo = {
        parcela_id: parcela.id,
        fecha: new Date(form.fecha).toISOString(),
        tipo: form.tipo === OTRO ? tipoPersonalizado : form.tipo,
        producto: form.producto || null,
        materia_activa: form.materia_activa || null,
        dosis: form.dosis === '' ? null : Number(form.dosis),
        unidad_dosis: form.unidad_dosis || null,
        cantidad_total: form.cantidad_total === '' ? null : Number(form.cantidad_total),
        unidad_cantidad: form.unidad_cantidad || null,
        operador: form.operador || null,
        maquinaria: form.maquinaria || null,
        notas: form.notas || null,
      };
      const nuevo = await crearTratamiento(cuerpo);
      setTratamientos((prev) => [...prev, nuevo].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)));
      setForm(formVacio());
      setTipoPersonalizado('');
    } catch (err) {
      setError(err);
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (t) => {
    if (!window.confirm(`¿Borrar el tratamiento de ${t.tipo} del ${new Date(t.fecha).toLocaleDateString('es-ES')}?`)) return;
    setError(null);
    setBorrandoId(t.id);
    try {
      await borrarTratamiento(t.id);
      setTratamientos((prev) => prev.filter((x) => x.id !== t.id));
    } catch (err) {
      setError(err);
    } finally {
      setBorrandoId(null);
    }
  };

  if (cargando) return <Cargando texto="Cargando tratamientos" />;
  if (error && tratamientos === null) {
    return (
      <div className="p-6">
        <MensajeError error={error} textoNoEncontrado="No se pudieron cargar los tratamientos." />
      </div>
    );
  }

  return (
    <>
      <Encabezado
        titulo="Cuaderno de tratamientos"
        descripcion="Qué se aplicó, cuándo, y con qué tiempo hacía en ese momento exacto."
      >
        <Marbete tono="neutro">
          {tratamientos.length === 1 ? '1 registro' : `${tratamientos.length} registros`}
        </Marbete>
        <Boton tono="sutil" onClick={() => setMostrarModalExportar(true)}>
          Exportar a Excel / CSV
        </Boton>
      </Encabezado>

      <div className="flex flex-wrap items-end gap-4 border-b border-linea bg-alza px-6 py-3">
        <div>
          <label htmlFor="filtro-tipo" className="rotulo block">
            Filtrar por tipo
          </label>
          <select
            id="filtro-tipo"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            className={`${claseControl} mt-1.5 w-52 py-1.5 text-xs`}
          >
            <option value="">Todos</option>
            {opcionesTipo.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cuantos-tratamientos" className="rotulo block">
            Mostrar
          </label>
          <select
            id="cuantos-tratamientos"
            aria-label="Tratamientos a mostrar"
            value={cuantos}
            onChange={(e) => setCuantos(Number(e.target.value))}
            className={`${claseControl} mt-1.5 w-24 py-1.5 text-xs`}
          >
            {OPCIONES_REGISTROS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        {filtro && (
          <Enlace onClick={() => setFiltro('')} className="pb-2">
            Quitar filtro
          </Enlace>
        )}
        {listaVisible.length < listaFiltrada.length && (
          <span className="rotulo pb-2 text-oso-4">
            {`Viendo ${listaVisible.length} de ${listaFiltrada.length}`}
          </span>
        )}
      </div>

      {error && (
        <div className="border-b border-linea px-6 py-3">
          <MensajeError error={error} textoNoEncontrado="No se pudieron cargar los tratamientos." />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left">
          <thead>
            <tr className="border-b border-linea bg-alza">
              <th className="rotulo px-4 py-3 font-medium">Fecha</th>
              <th className="rotulo px-4 py-3 font-medium">Tipo</th>
              <th className="rotulo px-4 py-3 font-medium">Producto</th>
              <th className="rotulo px-4 py-3 font-medium">Dosis</th>
              <th className="rotulo border-l border-linea px-4 py-3 font-medium text-oso-3">
                Temp. aplicación
              </th>
              <th className="rotulo px-4 py-3 font-medium text-oso-3">Viento aplicación</th>
              <SoloGestor>
                <th className="rotulo px-4 py-3 font-medium">Acciones</th>
              </SoloGestor>
            </tr>
          </thead>
          <tbody className="divide-y divide-linea">
            {listaFiltrada.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center">
                  <span className="rotulo">
                    {filtro ? 'Ningún tratamiento de ese tipo' : 'Todavía no hay tratamientos'}
                  </span>
                </td>
              </tr>
            )}
            {listaVisible.map((t) => {
              const sinClima = t.clima_fuente === 'no_disponible';
              return (
                <tr key={t.id} className="font-mono text-xs transition-colors hover:bg-alza">
                  <td className="px-4 py-2.5 whitespace-nowrap text-oso-3">
                    {new Date(t.fecha).toLocaleDateString('es-ES')}
                  </td>
                  <td className="px-4 py-2.5 text-oso">{t.tipo}</td>
                  <td className="px-4 py-2.5 text-oso-2">{t.producto ?? '—'}</td>
                  <td className="px-4 py-2.5 text-oso-2">{fmt(t.dosis, t.unidad_dosis)}</td>
                  <td className="border-l border-linea px-4 py-2.5 text-oso-2">
                    {sinClima ? '—' : fmt(t.temp_c_aplicacion, '°C')}
                  </td>
                  <td className="px-4 py-2.5 text-oso-2">
                    {sinClima ? '—' : fmt(t.viento_ms_aplicacion, 'm/s')}
                  </td>
                  <SoloGestor>
                    <td className="px-4 py-2.5">
                      <Enlace
                        disabled={borrandoId === t.id}
                        onClick={() => borrar(t)}
                        className="hover:text-sangre"
                      >
                        {borrandoId === t.id ? 'Borrando…' : 'Borrar'}
                      </Enlace>
                    </td>
                  </SoloGestor>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <SoloGestor>
        <section className="border-t border-linea">
          <header className="border-b border-linea px-6 py-3">
            <h3 className="rotulo">Registrar una aplicación</h3>
            <p className="mt-1.5 text-sm text-oso-2">
              Al guardarla se anota también el tiempo que hacía a esa hora, sin que tengas que
              buscarlo.
            </p>
          </header>

          <form className="grid gap-5 px-6 py-5 sm:grid-cols-2 lg:grid-cols-3" onSubmit={crear}>
            <Campo
              etiqueta="Fecha"
              type="datetime-local"
              required
              value={form.fecha}
              onChange={cambiar('fecha')}
            />
            <Selector etiqueta="Tipo" required value={form.tipo} onChange={cambiar('tipo')}>
              <option value="" disabled>Elige un tipo</option>
              {opcionesTipo.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
              <option value={OTRO}>Otro</option>
            </Selector>
            {form.tipo === OTRO && (
              <Campo
                etiqueta="Tipo personalizado"
                required
                value={tipoPersonalizado}
                onChange={(e) => setTipoPersonalizado(e.target.value)}
              />
            )}
            <Campo etiqueta="Producto" value={form.producto} onChange={cambiar('producto')} />
            <Campo
              etiqueta="Materia activa"
              value={form.materia_activa}
              onChange={cambiar('materia_activa')}
            />
            <Campo
              etiqueta="Dosis"
              type="number"
              step="any"
              value={form.dosis}
              onChange={cambiar('dosis')}
            />
            <Campo
              etiqueta="Unidad de dosis"
              value={form.unidad_dosis}
              onChange={cambiar('unidad_dosis')}
              placeholder="l/ha"
            />
            <Campo
              etiqueta="Cantidad total"
              type="number"
              step="any"
              value={form.cantidad_total}
              onChange={cambiar('cantidad_total')}
            />
            <Campo
              etiqueta="Unidad de cantidad"
              value={form.unidad_cantidad}
              onChange={cambiar('unidad_cantidad')}
              placeholder="l"
            />
            <Campo etiqueta="Operador" value={form.operador} onChange={cambiar('operador')} />
            <Campo etiqueta="Maquinaria" value={form.maquinaria} onChange={cambiar('maquinaria')} />
            <AreaTexto
              etiqueta="Notas"
              filas={2}
              value={form.notas}
              onChange={cambiar('notas')}
              className="sm:col-span-2 lg:col-span-3"
            />

            <div className="border-t border-linea pt-5 sm:col-span-2 lg:col-span-3">
              <Boton tono="solido" type="submit" disabled={guardando}>
                {guardando ? 'Guardando…' : 'Registrar tratamiento'}
              </Boton>
            </div>
          </form>
        </section>
      </SoloGestor>

      <ModalExportar
        parcela={parcela}
        abierto={mostrarModalExportar}
        alCerrar={() => setMostrarModalExportar(false)}
      />
    </>
  );
}

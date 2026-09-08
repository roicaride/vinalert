import { useEffect, useState } from 'react';

import { actualizarSensor, borrarSensor, listarSensores, provisionarSensores } from '../api/sensores';
import MapaSensores from '../componentes/MapaSensores';
import MensajeError from '../errores/MensajeError';
import { useParcela } from '../parcela/ParcelaContext';
import SoloGestor from '../parcela/SoloGestor';
import Boton, { Enlace } from '../ui/Boton';
import { claseControl } from '../ui/Campo';
import { Aviso, Cargando, Marbete, Testigo } from '../ui/Estados';
import { Encabezado } from '../ui/Panel';

/** Un control dentro de una celda de tabla: mas estrecho que el de formulario. */
const CELDA = `${claseControl} px-2 py-1 text-xs`;

function FilaEdicion({ sensor, onGuardar, onCancelar, guardando }) {
  const [campos, setCampos] = useState({
    etiqueta: sensor.etiqueta,
    profundidad_cm: sensor.profundidad_cm,
    latitud: sensor.latitud,
    longitud: sensor.longitud,
    modelo: sensor.modelo,
    activo: sensor.activo,
  });

  const cambiarTexto = (campo) => (e) => setCampos((c) => ({ ...c, [campo]: e.target.value || null }));
  const cambiarNumero = (campo) => (e) =>
    setCampos((c) => ({ ...c, [campo]: e.target.value === '' ? null : Number(e.target.value) }));

  return (
    <tr className="border-l-2 border-brote bg-alza">
      <td className="px-4 py-2 font-mono text-xs text-oso-3">{sensor.numero}</td>
      <td className="px-2 py-2">
        <input
          aria-label={`Etiqueta del sensor ${sensor.numero}`}
          value={campos.etiqueta ?? ''}
          onChange={cambiarTexto('etiqueta')}
          className={CELDA}
        />
      </td>
      <td className="px-2 py-2 text-center">
        <input
          type="checkbox"
          aria-label={`Activo el sensor ${sensor.numero}`}
          checked={campos.activo}
          onChange={(e) => setCampos((c) => ({ ...c, activo: e.target.checked }))}
          className="size-4 accent-[#8fc93a]"
        />
      </td>
      <td className="px-2 py-2">
        <input
          type="number"
          aria-label={`Profundidad del sensor ${sensor.numero}`}
          value={campos.profundidad_cm ?? ''}
          onChange={cambiarNumero('profundidad_cm')}
          className={CELDA}
        />
      </td>
      <td className="px-2 py-2">
        <input
          type="number"
          aria-label={`Latitud del sensor ${sensor.numero}`}
          value={campos.latitud ?? ''}
          onChange={cambiarNumero('latitud')}
          className={CELDA}
        />
      </td>
      <td className="px-2 py-2">
        <input
          type="number"
          aria-label={`Longitud del sensor ${sensor.numero}`}
          value={campos.longitud ?? ''}
          onChange={cambiarNumero('longitud')}
          className={CELDA}
        />
      </td>
      <td className="px-2 py-2">
        <input
          aria-label={`Modelo del sensor ${sensor.numero}`}
          value={campos.modelo ?? ''}
          onChange={cambiarTexto('modelo')}
          className={CELDA}
        />
      </td>
      <td className="space-x-3 px-4 py-2 whitespace-nowrap">
        <Enlace disabled={guardando} onClick={() => onGuardar(campos)} className="text-brote">
          {guardando ? 'Guardando…' : 'Guardar'}
        </Enlace>
        <Enlace onClick={onCancelar}>Cancelar</Enlace>
      </td>
    </tr>
  );
}

export default function Sensores() {
  const { parcela } = useParcela();
  const [sensores, setSensores] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [editandoId, setEditandoId] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [mostrarAniadir, setMostrarAniadir] = useState(false);
  const [cantidad, setCantidad] = useState('');
  const [aniadiendo, setAniadiendo] = useState(false);
  const [aviso, setAviso] = useState(null);

  useEffect(() => {
    let vigente = true;
    listarSensores(parcela.id)
      .then((s) => { if (vigente) { setSensores(s); setError(null); } })
      .catch((e) => { if (vigente) setError(e); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [parcela.id]);

  const confirmarAniadir = async (e) => {
    e.preventDefault();
    setError(null);
    setAviso(null);
    setAniadiendo(true);
    try {
      // El endpoint devuelve la lista COMPLETA de sensores de la parcela, no
      // solo los nuevos: reemplaza, no concatena.
      const anterior = sensores.length;
      const resultado = await provisionarSensores(parcela.id, Number(cantidad));
      setSensores(resultado);
      setCantidad('');
      setMostrarAniadir(false);
      // /provisionar asegura que existan sensores HASTA ese numero, no anade
      // "cantidad" sensores nuevos: si el numero pedido no es mayor que el
      // actual, no se crea nada y el panel se cerraria sin explicar por que.
      if (resultado.length === anterior) {
        setAviso(`Ya hay ${anterior} sensor(es) numerados hasta ese punto; no se ha añadido ninguno nuevo.`);
      }
    } catch (err) {
      setError(err);
    } finally {
      setAniadiendo(false);
    }
  };

  const guardarEdicion = async (sensorId, cambios) => {
    setError(null);
    setGuardando(true);
    try {
      const actualizado = await actualizarSensor(parcela.id, sensorId, cambios);
      setSensores((prev) => prev.map((s) => (s.id === sensorId ? actualizado : s)));
      setEditandoId(null);
    } catch (err) {
      setError(err);
    } finally {
      setGuardando(false);
    }
  };

  const eliminarSensor = async (sensorId, etiqueta) => {
    if (!window.confirm(`¿Seguro que deseas eliminar el sensor "${etiqueta || sensorId}" y todas sus lecturas?`)) {
      return;
    }
    setError(null);
    try {
      await borrarSensor(parcela.id, sensorId);
      setSensores((prev) => prev.filter((s) => s.id !== sensorId));
    } catch (err) {
      setError(err);
    }
  };

  if (cargando) return <Cargando texto="Cargando sensores" />;
  if (error && sensores === null) {
    return (
      <div className="p-6">
        <MensajeError error={error} textoNoEncontrado="Este sensor ya no existe." />
      </div>
    );
  }

  const activos = sensores.filter((s) => s.activo).length;

  return (
    <>
      <Encabezado
        titulo="Sensores"
        descripcion="Cuántos nodos hay, dónde está cada uno y a qué profundidad mide."
      >
        <Marbete tono={activos ? 'brote' : 'neutro'}>
          {activos} de {sensores.length} activos
        </Marbete>
        <SoloGestor>
          {!mostrarAniadir && (
            <Boton tono="fantasma" onClick={() => setMostrarAniadir(true)}>
              Añadir sensores
            </Boton>
          )}
        </SoloGestor>
      </Encabezado>

      <SoloGestor>
        {mostrarAniadir && (
          <form
            className="flex flex-wrap items-end gap-4 border-b border-linea bg-alza px-6 py-4"
            onSubmit={confirmarAniadir}
          >
            <div>
              <label htmlFor="cantidad-sensores" className="rotulo block">
                Número total de sensores en la parcela
              </label>
              <div className="mt-1.5 flex items-center gap-3">
                <input
                  id="cantidad-sensores"
                  type="number"
                  min="1"
                  max="100"
                  required
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  className={`${claseControl} w-24`}
                />
                <span className="font-mono text-xs text-oso-3">ahora hay {sensores.length}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 pb-0.5">
              <Boton tono="solido" type="submit" disabled={aniadiendo}>
                {aniadiendo ? 'Añadiendo…' : 'Confirmar'}
              </Boton>
              <Enlace onClick={() => setMostrarAniadir(false)}>Cancelar</Enlace>
            </div>
          </form>
        )}
      </SoloGestor>

      {aviso && (
        <div className="border-b border-linea px-6 py-3">
          <Aviso tono="ambar">{aviso}</Aviso>
        </div>
      )}

      {error && (
        <div className="border-b border-linea px-6 py-3">
          <MensajeError error={error} textoNoEncontrado="Este sensor ya no existe." />
        </div>
      )}

      <MapaSensores parcela={parcela} sensores={sensores} />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left">
          <thead>
            <tr className="border-b border-linea bg-alza">
              <th className="rotulo px-4 py-3 font-medium">Nº</th>
              <th className="rotulo px-4 py-3 font-medium">Etiqueta</th>
              <th className="rotulo px-4 py-3 font-medium">Estado</th>
              <th className="rotulo px-4 py-3 font-medium">Profundidad</th>
              <th className="rotulo px-4 py-3 font-medium">Latitud</th>
              <th className="rotulo px-4 py-3 font-medium">Longitud</th>
              <th className="rotulo px-4 py-3 font-medium">Modelo</th>
              <SoloGestor>
                <th className="rotulo px-4 py-3 font-medium">Acciones</th>
              </SoloGestor>
            </tr>
          </thead>
          <tbody className="divide-y divide-linea">
            {sensores.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center">
                  <span className="rotulo">Todavía no hay sensores</span>
                </td>
              </tr>
            )}
            {sensores.map((s) =>
              editandoId === s.id ? (
                <FilaEdicion
                  key={s.id}
                  sensor={s}
                  guardando={guardando}
                  onGuardar={(cambios) => guardarEdicion(s.id, cambios)}
                  onCancelar={() => setEditandoId(null)}
                />
              ) : (
                <tr key={s.id} className="font-mono text-xs transition-colors hover:bg-alza">
                  <td className="px-4 py-2.5 text-oso-3">{s.numero}</td>
                  <td className="px-4 py-2.5 text-oso">{s.etiqueta}</td>
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2">
                      <Testigo tono={s.activo ? 'brote' : 'neutro'} />
                      <span className={s.activo ? 'text-brote' : 'text-oso-4'}>
                        {s.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-oso-2">
                    {s.profundidad_cm == null ? '—' : `${s.profundidad_cm} cm`}
                  </td>
                  <td className="px-4 py-2.5 text-oso-2">{s.latitud ?? '—'}</td>
                  <td className="px-4 py-2.5 text-oso-2">{s.longitud ?? '—'}</td>
                  <td className="px-4 py-2.5 text-oso-2">{s.modelo ?? '—'}</td>
                  <SoloGestor>
                    <td className="space-x-3 px-4 py-2.5 whitespace-nowrap">
                      <Enlace onClick={() => setEditandoId(s.id)}>Editar</Enlace>
                      <Enlace
                        onClick={() => eliminarSensor(s.id, s.etiqueta)}
                        className="hover:text-sangre"
                      >
                        Eliminar
                      </Enlace>
                    </td>
                  </SoloGestor>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  actualizarIntervaloDispositivo,
  borrarDispositivo,
  crearDispositivo,
  listarDispositivos,
  revocarDispositivo,
} from '../api/dispositivos';
import { borrarParcela, comprobarClima, editarParcela } from '../api/parcelas';
import MensajeError from '../errores/MensajeError';
import { useParcela } from '../parcela/ParcelaContext';
import SoloGestor from '../parcela/SoloGestor';
import { useSesion } from '../sesion/SesionContext';
import Boton, { Enlace } from '../ui/Boton';
import Campo, { claseControl } from '../ui/Campo';
import { Aviso, Marbete, Testigo } from '../ui/Estados';
import { Encabezado } from '../ui/Panel';

// Los 17 campos de ParcelaUpdate (app/schemas.py), agrupados como en el spec.
const CAMPOS_TEXTO = ['nombre', 'tipo_cultivo', 'variedad'];
const CAMPOS_NUMERO = [
  'superficie_total_m2', 'cobertura_cultivo_pct', 'porcentaje_cobertura_suelo',
  'profundidad_raices_cm', 'umbral_humedad_critico_pct', 'capacidad_campo_suelo', 'kc_actual',
  'distancia_filas_m', 'distancia_plantas_m', 'caudal_gotero_lph', 'num_goteros_planta',
  'eficiencia_riego_pct', 'latitud', 'longitud',
];

// Intervalo entre ciclos de medicion del maestro LoRa, en segundos. El rango
// lo valida el backend (INTERVALO_CICLO_MIN/MAX_SEG en app/schemas.py): los
// dos primeros valores estan para el banco de pruebas, no para campo — a esa
// cadencia el consumo de LoRa+WiFi vacia la bateria en horas.
const INTERVALOS_CICLO = [
  { seg: 30, etiqueta: '30 segundos (solo pruebas)' },
  { seg: 60, etiqueta: '1 minuto (solo pruebas)' },
  { seg: 300, etiqueta: '5 minutos' },
  { seg: 900, etiqueta: '15 minutos' },
  { seg: 1800, etiqueta: '30 minutos' },
  { seg: 3600, etiqueta: '1 hora' },
  { seg: 7200, etiqueta: '2 horas' },
  { seg: 14400, etiqueta: '4 horas' },
  { seg: 21600, etiqueta: '6 horas' },
  { seg: 43200, etiqueta: '12 horas' },
  { seg: 86400, etiqueta: '24 horas' },
];

function aFormulario(parcela) {
  const datos = {};
  for (const campo of [...CAMPOS_TEXTO, ...CAMPOS_NUMERO]) datos[campo] = parcela[campo] ?? null;
  return datos;
}

/** Un bloque del formulario. El nombre del grupo va en rotulo, sobre su linea. */
function Grupo({ titulo, nota, children }) {
  return (
    <fieldset className="border-b border-linea px-6 py-5">
      <legend className="sr-only">{titulo}</legend>
      <div className="mb-5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="rotulo" aria-hidden="true">{titulo}</p>
        {nota && <p className="text-xs text-oso-4">{nota}</p>}
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </fieldset>
  );
}

function CampoTexto({ etiqueta, valor, onChange, disabled, requerido }) {
  return (
    <Campo
      etiqueta={etiqueta}
      type="text"
      value={valor ?? ''}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      required={requerido}
    />
  );
}

function CampoNumero({ etiqueta, valor, onChange, disabled, min, max }) {
  return (
    <Campo
      etiqueta={etiqueta}
      type="number"
      step="any"
      min={min}
      max={max}
      value={valor ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      disabled={disabled}
    />
  );
}

export default function Configuracion() {
  const navigate = useNavigate();
  const { parcela, puedeGestionar, setParcela } = useParcela();
  const { usuario } = useSesion();
  const esSuperAdmin = usuario?.email === 'admin@vinalert.dev';

  const [campos, setCampos] = useState(() => aFormulario(parcela));
  const [coordenadasGuardadas, setCoordenadasGuardadas] = useState({
    latitud: parcela.latitud ?? null,
    longitud: parcela.longitud ?? null,
  });
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [comprobando, setComprobando] = useState(false);
  const [sonda, setSonda] = useState(null);
  const [error, setError] = useState(null);

  // Gestión de dispositivos ESP32 / Tokens IoT (Exclusivo admin@vinalert.dev)
  const [dispositivos, setDispositivos] = useState([]);
  const [nombreDisp, setNombreDisp] = useState('');
  const [creandoDisp, setCreandoDisp] = useState(false);
  const [nuevoTokenGenerado, setNuevoTokenGenerado] = useState(null);
  const [copiado, setCopiado] = useState(false);
  const [avisoIntervalo, setAvisoIntervalo] = useState(null);

  useEffect(() => {
    if (!esSuperAdmin) return;
    let vigente = true;
    listarDispositivos(parcela.id)
      .then((d) => { if (vigente) setDispositivos(d); })
      .catch(() => {});
    return () => { vigente = false; };
  }, [parcela.id, esSuperAdmin]);

  const coordenadasSinGuardar =
    campos.latitud !== coordenadasGuardadas.latitud ||
    campos.longitud !== coordenadasGuardadas.longitud;

  const cambiar = (campo) => (valor) => {
    setCampos((prev) => ({ ...prev, [campo]: valor }));
  };

  const guardar = async (e) => {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      const resp = await editarParcela(parcela.id, campos);
      setParcela(resp);
      setCampos(aFormulario(resp));
      setCoordenadasGuardadas({ latitud: resp.latitud ?? null, longitud: resp.longitud ?? null });
    } catch (err) {
      setError(err);
    } finally {
      setGuardando(false);
    }
  };

  const comprobar = async () => {
    setError(null);
    setComprobando(true);
    try {
      const resp = await comprobarClima(parcela.id);
      setSonda(resp);
    } catch (err) {
      setError(err);
    } finally {
      setComprobando(false);
    }
  };

  const eliminarParcela = async () => {
    if (
      !window.confirm(
        '¿Seguro que deseas eliminar permanentemente esta parcela y todos sus sensores, lecturas y datos asociados? Esta acción no se puede deshacer.',
      )
    ) {
      return;
    }
    setBorrando(true);
    setError(null);
    try {
      await borrarParcela(parcela.id);
      navigate('/parcelas', { replace: true });
    } catch (err) {
      setError(err);
      setBorrando(false);
    }
  };

  const handleCrearDispositivo = async (e) => {
    e.preventDefault();
    if (!nombreDisp.trim()) return;
    setCreandoDisp(true);
    setError(null);
    try {
      const nuevo = await crearDispositivo(parcela.id, { nombre: nombreDisp.trim() });
      setDispositivos((prev) => [nuevo, ...prev]);
      setNuevoTokenGenerado(nuevo.token);
      setNombreDisp('');
    } catch (err) {
      setError(err);
    } finally {
      setCreandoDisp(false);
    }
  };

  const handleToggleRevocar = async (dispId) => {
    try {
      const actualizado = await revocarDispositivo(parcela.id, dispId);
      setDispositivos((prev) => prev.map((d) => (d.id === dispId ? actualizado : d)));
    } catch (err) {
      setError(err);
    }
  };

  const handleCambiarIntervalo = async (dispId, intervaloSeg) => {
    setError(null);
    try {
      const actualizado = await actualizarIntervaloDispositivo(parcela.id, dispId, intervaloSeg);
      setDispositivos((prev) => prev.map((d) => (d.id === dispId ? actualizado : d)));
      setAvisoIntervalo(dispId);
    } catch (err) {
      // Sin actualizacion optimista: el selector es controlado, asi que al no
      // tocar el estado se queda solo en el valor que sigue vigente en el
      // backend en vez de mentir sobre un cambio que no se guardo.
      setError(err);
      setAvisoIntervalo(null);
    }
  };

  const handleBorrarDispositivo = async (dispId) => {
    if (!window.confirm('¿Deseas eliminar este dispositivo y revocar su acceso permanentemente?')) return;
    try {
      await borrarDispositivo(parcela.id, dispId);
      setDispositivos((prev) => prev.filter((d) => d.id !== dispId));
    } catch (err) {
      setError(err);
    }
  };

  const copiarToken = () => {
    if (nuevoTokenGenerado) {
      navigator.clipboard.writeText(nuevoTokenGenerado);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 3000);
    }
  };

  return (
    <>
      <Encabezado
        titulo="Configuración"
        descripcion="Los datos de la finca de los que salen todos los cálculos: superficie, suelo, riego y coordenadas."
      >
        <Marbete tono="neutro">Parcela {parcela.id}</Marbete>
      </Encabezado>

      <form onSubmit={guardar}>
        <Grupo titulo="Datos generales">
          <CampoTexto etiqueta="Nombre" valor={campos.nombre} onChange={cambiar('nombre')} disabled={!puedeGestionar} requerido />
          <CampoTexto etiqueta="Tipo de cultivo" valor={campos.tipo_cultivo} onChange={cambiar('tipo_cultivo')} disabled={!puedeGestionar} />
          <CampoTexto etiqueta="Variedad" valor={campos.variedad} onChange={cambiar('variedad')} disabled={!puedeGestionar} />
          <CampoNumero etiqueta="Superficie total (m²)" valor={campos.superficie_total_m2} onChange={cambiar('superficie_total_m2')} disabled={!puedeGestionar} />
          <CampoNumero etiqueta="Cobertura del cultivo (%)" valor={campos.cobertura_cultivo_pct} onChange={cambiar('cobertura_cultivo_pct')} disabled={!puedeGestionar} />
          <CampoNumero etiqueta="Cobertura del suelo (%)" valor={campos.porcentaje_cobertura_suelo} onChange={cambiar('porcentaje_cobertura_suelo')} disabled={!puedeGestionar} />
        </Grupo>

        <Grupo titulo="Suelo y cultivo" nota="De aquí sale el balance hídrico.">
          <CampoNumero etiqueta="Profundidad de raíces (cm)" valor={campos.profundidad_raices_cm} onChange={cambiar('profundidad_raices_cm')} disabled={!puedeGestionar} />
          <CampoNumero etiqueta="Umbral humedad crítico (%)" valor={campos.umbral_humedad_critico_pct} onChange={cambiar('umbral_humedad_critico_pct')} disabled={!puedeGestionar} />
          <CampoNumero etiqueta="Capacidad de campo (%)" valor={campos.capacidad_campo_suelo} onChange={cambiar('capacidad_campo_suelo')} disabled={!puedeGestionar} />
          <CampoNumero etiqueta="Kc actual" valor={campos.kc_actual} onChange={cambiar('kc_actual')} disabled={!puedeGestionar} />
        </Grupo>

        <Grupo titulo="Riego y coordenadas" nota="Sin coordenadas no se puede pedir el clima.">
          <CampoNumero etiqueta="Distancia entre filas (m)" valor={campos.distancia_filas_m} onChange={cambiar('distancia_filas_m')} disabled={!puedeGestionar} />
          <CampoNumero etiqueta="Distancia entre plantas (m)" valor={campos.distancia_plantas_m} onChange={cambiar('distancia_plantas_m')} disabled={!puedeGestionar} />
          <CampoNumero etiqueta="Caudal de gotero (l/h)" valor={campos.caudal_gotero_lph} onChange={cambiar('caudal_gotero_lph')} disabled={!puedeGestionar} />
          <CampoNumero etiqueta="Nº de goteros por planta" valor={campos.num_goteros_planta} onChange={cambiar('num_goteros_planta')} disabled={!puedeGestionar} />
          <CampoNumero etiqueta="Eficiencia de riego (%)" valor={campos.eficiencia_riego_pct} onChange={cambiar('eficiencia_riego_pct')} disabled={!puedeGestionar} />
          <CampoNumero etiqueta="Latitud" valor={campos.latitud} onChange={cambiar('latitud')} disabled={!puedeGestionar} min={-90} max={90} />
          <CampoNumero etiqueta="Longitud" valor={campos.longitud} onChange={cambiar('longitud')} disabled={!puedeGestionar} min={-180} max={180} />
        </Grupo>

        <div className="space-y-4 border-b border-linea px-6 py-5">
          <MensajeError error={error} textoNoEncontrado="Esta parcela ya no existe." />

          <SoloGestor>
            <div className="flex flex-wrap items-center gap-4">
              <Boton tono="solido" type="submit" disabled={guardando || borrando}>
                {guardando ? 'Guardando…' : 'Guardar cambios'}
              </Boton>
              <Boton
                tono="fantasma"
                onClick={comprobar}
                disabled={
                  comprobando ||
                  coordenadasSinGuardar ||
                  campos.latitud == null ||
                  campos.longitud == null ||
                  borrando
                }
              >
                {comprobando ? 'Comprobando…' : 'Comprobar estas coordenadas'}
              </Boton>
              {coordenadasSinGuardar && (
                <p className="text-xs text-ambar">Guarda antes de comprobar estas coordenadas.</p>
              )}
            </div>
          </SoloGestor>

          {sonda && !coordenadasSinGuardar && (
            <Aviso tono={sonda.disponible ? 'brote' : 'ambar'}>
              {sonda.disponible
                ? 'El proveedor tiene datos para estas coordenadas.'
                : sonda.motivo}
            </Aviso>
          )}
        </div>
      </form>

      {/* ------------------------------------------------------------------ */}
      {/* Dispositivos ESP32. Solo para quien administra el hardware.         */}
      {/* ------------------------------------------------------------------ */}
      {esSuperAdmin && (
        <SoloGestor>
          <section className="border-b border-linea">
            <header className="border-b border-linea px-6 py-4">
              <h3 className="rotulo">Dispositivos ESP32</h3>
              <p className="mt-1.5 max-w-2xl text-sm text-oso-2">
                Cada microcontrolador en campo necesita su propia clave para enviar lecturas. Si un
                aparato se pierde o se sustituye, se le cancela el acceso desde aquí sin tocar a los
                demás.
              </p>
            </header>

            <form onSubmit={handleCrearDispositivo} className="flex flex-wrap items-end gap-4 px-6 py-4">
              <div>
                <label htmlFor="nombre-dispositivo" className="rotulo block">
                  Nombre del dispositivo
                </label>
                <input
                  id="nombre-dispositivo"
                  type="text"
                  placeholder="Ej. Gateway concentrador"
                  value={nombreDisp}
                  onChange={(e) => setNombreDisp(e.target.value)}
                  className={`${claseControl} mt-1.5 w-72`}
                />
              </div>
              <Boton tono="solido" type="submit" disabled={creandoDisp || !nombreDisp.trim()} className="py-2.5">
                {creandoDisp ? 'Generando…' : 'Generar clave'}
              </Boton>
            </form>

            {nuevoTokenGenerado && (
              <div className="mx-6 mb-4 border-l-2 border-brote bg-alza p-4">
                <div className="flex items-center justify-between gap-4">
                  <p className="rotulo text-brote">Clave generada · válida 100 años</p>
                  <Enlace onClick={() => setNuevoTokenGenerado(null)}>Cerrar</Enlace>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    aria-label="Clave del dispositivo"
                    value={nuevoTokenGenerado}
                    className={`${claseControl} min-w-0 flex-1 select-all text-brote`}
                  />
                  <Boton tono="fantasma" onClick={copiarToken} className="py-2.5">
                    {copiado ? 'Copiado' : 'Copiar'}
                  </Boton>
                </div>
                <p className="mt-3 text-xs text-oso-3">
                  Pégala en el código del ESP32, en la variable{' '}
                  <code className="font-mono text-brote">bearerToken</code>. No vuelve a mostrarse.
                </p>
              </div>
            )}

            <div className="overflow-x-auto border-t border-linea">
              <table className="w-full min-w-[720px] text-left">
                <thead>
                  <tr className="border-b border-linea bg-alza">
                    <th className="rotulo px-4 py-3 font-medium">Dispositivo</th>
                    <th className="rotulo px-4 py-3 font-medium">Estado</th>
                    <th className="rotulo px-4 py-3 font-medium">Intervalo de envío</th>
                    <th className="rotulo px-4 py-3 font-medium">Última lectura</th>
                    <th className="rotulo px-4 py-3 text-right font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-linea">
                  {dispositivos.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center">
                        <span className="rotulo">Ninguna clave generada en esta parcela</span>
                      </td>
                    </tr>
                  ) : (
                    dispositivos.map((d) => (
                      <tr key={d.id} className="transition-colors hover:bg-alza">
                        <td className="px-4 py-3 font-mono text-xs text-oso">{d.nombre}</td>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-2">
                            <Testigo tono={d.activo ? 'brote' : 'sangre'} />
                            <span
                              className={`font-mono text-[10px] tracking-[0.16em] uppercase ${
                                d.activo ? 'text-brote' : 'text-sangre'
                              }`}
                            >
                              {d.activo ? 'Activo' : 'Acceso revocado'}
                            </span>
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            aria-label={`Intervalo de envío de ${d.nombre}`}
                            value={d.intervalo_ciclo_seg}
                            onChange={(e) => handleCambiarIntervalo(d.id, Number(e.target.value))}
                            className={`${claseControl} w-52 px-2 py-1 text-xs`}
                          >
                            {!INTERVALOS_CICLO.some((o) => o.seg === d.intervalo_ciclo_seg) && (
                              // El backend acepta cualquier valor del rango, no solo los de la
                              // lista. Sin esta opcion, un select controlado sin coincidencia
                              // caeria en la primera y mostraria un intervalo que no es el real.
                              <option value={d.intervalo_ciclo_seg}>
                                {d.intervalo_ciclo_seg} segundos (personalizado)
                              </option>
                            )}
                            {INTERVALOS_CICLO.map((opcion) => (
                              <option key={opcion.seg} value={opcion.seg}>{opcion.etiqueta}</option>
                            ))}
                          </select>
                          {avisoIntervalo === d.id && (
                            <p className="mt-1.5 font-mono text-[10px] text-brote">
                              Se aplicará cuando el dispositivo vuelva a conectar.
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-oso-3">
                          {d.ultimo_uso ? new Date(d.ultimo_uso).toLocaleString('es-ES') : 'Sin lecturas aún'}
                        </td>
                        <td className="space-x-4 px-4 py-3 text-right whitespace-nowrap">
                          <Enlace onClick={() => handleToggleRevocar(d.id)}>
                            {d.activo ? 'Cancelar acceso' : 'Reactivar'}
                          </Enlace>
                          <Enlace onClick={() => handleBorrarDispositivo(d.id)} className="hover:text-sangre">
                            Eliminar
                          </Enlace>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </SoloGestor>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Lo irreversible, al final y separado por su propia linea SANGRE.    */}
      {/* ------------------------------------------------------------------ */}
      <SoloGestor>
        <section className="border-l-2 border-sangre px-6 py-5">
          <h3 className="rotulo text-sangre">Eliminar la parcela</h3>
          <p className="mt-2 max-w-2xl text-sm text-oso-2">
            Se borran también sus sensores, sus lecturas, sus tratamientos y todo su histórico. No
            hay vuelta atrás.
          </p>
          <Boton
            tono="peligro"
            onClick={eliminarParcela}
            disabled={borrando || guardando}
            className="mt-4"
          >
            {borrando ? 'Eliminando parcela…' : 'Eliminar esta parcela'}
          </Boton>
        </section>
      </SoloGestor>
    </>
  );
}

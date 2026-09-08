import { useEffect, useState } from 'react';

import { anadirMiembro, cambiarRol, listarMiembros, retirarMiembro } from '../api/miembros';
import MensajeError from '../errores/MensajeError';
import { useParcela } from '../parcela/ParcelaContext';
import SoloGestor from '../parcela/SoloGestor';
import { useSesion } from '../sesion/SesionContext';
import Boton, { Enlace } from '../ui/Boton';
import { claseControl } from '../ui/Campo';
import { Cargando, Marbete } from '../ui/Estados';
import { Encabezado } from '../ui/Panel';

export default function Miembros() {
  const { parcela, puedeGestionar, setParcela } = useParcela();
  const { usuario } = useSesion();
  const [miembros, setMiembros] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [email, setEmail] = useState('');
  const [rolNuevo, setRolNuevo] = useState('lectura');
  const [aniadiendo, setAniadiendo] = useState(false);
  const [cambiandoId, setCambiandoId] = useState(null);
  const [retirandoId, setRetirandoId] = useState(null);

  useEffect(() => {
    let vigente = true;
    listarMiembros(parcela.id)
      .then((m) => { if (vigente) { setMiembros(m); setError(null); } })
      .catch((e) => { if (vigente) setError(e); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [parcela.id]);

  const aniadir = async (e) => {
    e.preventDefault();
    setError(null);
    setAniadiendo(true);
    try {
      const nuevo = await anadirMiembro(parcela.id, email, rolNuevo);
      setMiembros((prev) => [...prev, nuevo]);
      setEmail('');
      setRolNuevo('lectura');
    } catch (err) {
      setError(err);
    } finally {
      setAniadiendo(false);
    }
  };

  const cambiar = async (usuarioId, rolPedido) => {
    setError(null);
    setCambiandoId(usuarioId);
    try {
      // El <select> es controlado por miembros[].rol: mientras la peticion
      // esta en vuelo NO se actualiza en optimista, asi que un 409 deja el
      // valor donde ya estaba sin tener que revertir nada a mano.
      const actualizado = await cambiarRol(parcela.id, usuarioId, rolPedido);
      setMiembros((prev) => prev.map((m) => (m.usuario_id === usuarioId ? actualizado : m)));
      // Si el gestor se ha cambiado el rol a si mismo, el contexto compartido
      // (del que depende puedeGestionar en TODAS las pantallas de D2) tiene
      // que enterarse ya, o el resto de la app se queda con permisos caducados.
      if (usuarioId === usuario.id) {
        setParcela({ ...parcela, mi_rol: actualizado.rol });
      }
    } catch (err) {
      setError(err);
    } finally {
      setCambiandoId(null);
    }
  };

  const retirar = async (miembro) => {
    if (!window.confirm(`¿Retirar a ${miembro.nombre} de esta parcela?`)) return;
    setError(null);
    setRetirandoId(miembro.usuario_id);
    try {
      await retirarMiembro(parcela.id, miembro.usuario_id);
      setMiembros((prev) => prev.filter((m) => m.usuario_id !== miembro.usuario_id));
    } catch (err) {
      setError(err);
    } finally {
      setRetirandoId(null);
    }
  };

  if (cargando) return <Cargando texto="Cargando acceso" />;
  if (error && miembros === null) {
    return (
      <div className="p-6">
        <MensajeError
          error={error}
          textoNoEncontrado="Ese usuario ya no tiene acceso a esta parcela."
          preferirDetalle
        />
      </div>
    );
  }

  const gestores = miembros.filter((m) => m.rol === 'gestor').length;

  return (
    <>
      <Encabezado
        titulo="Acceso"
        descripcion="Quién entra en esta parcela y qué puede hacer dentro. Un gestor edita; un lector solo mira."
      >
        <Marbete tono="brote">{gestores === 1 ? '1 gestor' : `${gestores} gestores`}</Marbete>
        <Marbete tono="neutro">
          {miembros.length - gestores === 1 ? '1 lector' : `${miembros.length - gestores} lectores`}
        </Marbete>
      </Encabezado>

      {error && (
        <div className="border-b border-linea px-6 py-3">
          <MensajeError
            error={error}
            textoNoEncontrado="Ese usuario ya no tiene acceso a esta parcela."
            preferirDetalle
          />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-left">
          <thead>
            <tr className="border-b border-linea bg-alza">
              <th className="rotulo px-4 py-3 font-medium">Nombre</th>
              <th className="rotulo px-4 py-3 font-medium">Email</th>
              <th className="rotulo px-4 py-3 font-medium">Rol</th>
              <SoloGestor>
                <th className="rotulo px-4 py-3 font-medium">Acciones</th>
              </SoloGestor>
            </tr>
          </thead>
          <tbody className="divide-y divide-linea">
            {miembros.map((m) => (
              <tr key={m.usuario_id} className="transition-colors hover:bg-alza">
                <td className="px-4 py-2.5 text-sm text-oso">
                  {m.nombre}
                  {m.usuario_id === usuario.id && (
                    <span className="rotulo ml-2 text-oso-4">Tú</span>
                  )}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-oso-3">{m.email}</td>
                <td className="px-4 py-2.5">
                  {puedeGestionar ? (
                    <select
                      aria-label={`Rol de ${m.nombre}`}
                      value={m.rol}
                      disabled={cambiandoId === m.usuario_id}
                      onChange={(e) => cambiar(m.usuario_id, e.target.value)}
                      className={`${claseControl} w-32 px-2 py-1 text-xs`}
                    >
                      <option value="gestor">Gestor</option>
                      <option value="lectura">Lectura</option>
                    </select>
                  ) : (
                    <Marbete tono={m.rol === 'gestor' ? 'brote' : 'neutro'}>
                      {m.rol === 'gestor' ? 'Gestor' : 'Lectura'}
                    </Marbete>
                  )}
                </td>
                <SoloGestor>
                  <td className="px-4 py-2.5">
                    {m.usuario_id !== usuario.id && (
                      <Enlace
                        disabled={retirandoId === m.usuario_id}
                        onClick={() => retirar(m)}
                        className="hover:text-sangre"
                      >
                        {retirandoId === m.usuario_id ? 'Retirando…' : 'Retirar'}
                      </Enlace>
                    )}
                  </td>
                </SoloGestor>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SoloGestor>
        <form className="flex flex-wrap items-end gap-4 border-t border-linea px-6 py-5" onSubmit={aniadir}>
          <div>
            <label htmlFor="email-miembro" className="rotulo block">
              Email
            </label>
            <input
              id="email-miembro"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="persona@ejemplo.com"
              className={`${claseControl} mt-1.5 w-64`}
            />
          </div>
          <div>
            <label htmlFor="rol-miembro" className="rotulo block">
              Rol
            </label>
            <select
              id="rol-miembro"
              value={rolNuevo}
              onChange={(e) => setRolNuevo(e.target.value)}
              className={`${claseControl} mt-1.5 w-40`}
            >
              <option value="lectura">Lectura</option>
              <option value="gestor">Gestor</option>
            </select>
          </div>
          <Boton tono="solido" type="submit" disabled={aniadiendo} className="mb-px py-2.5">
            {aniadiendo ? 'Añadiendo…' : 'Añadir'}
          </Boton>
          <p className="mb-1 max-w-xs text-xs text-oso-4">
            La persona ya tiene que estar registrada en Viñalert.
          </p>
        </form>
      </SoloGestor>
    </>
  );
}

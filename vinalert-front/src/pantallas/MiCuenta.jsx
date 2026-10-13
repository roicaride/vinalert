import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { cambiarPassword, cerrarSesiones } from '../api/auth';
import MensajeError from '../errores/MensajeError';
import CabeceraCuenta from '../layout/CabeceraCuenta';
import { useSesion } from '../sesion/SesionContext';
import Boton from '../ui/Boton';
import Campo from '../ui/Campo';
import { Aviso } from '../ui/Estados';
import { Encabezado, Panel } from '../ui/Panel';
import { AYUDA_PASSWORD } from './acceso/acceso';

/**
 * Lo que una persona hace con su propia cuenta. Cambiar la contraseña cierra
 * las sesiones de los demas dispositivos (este sigue dentro con un token
 * nuevo); "cerrar sesion en todos" sirve para un movil perdido o un ordenador
 * compartido de la cooperativa.
 */
export default function MiCuenta() {
  const navigate = useNavigate();
  const { usuario, cerrarSesion } = useSesion();

  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [noCoinciden, setNoCoinciden] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [cambiada, setCambiada] = useState(false);
  const [error, setError] = useState(null);
  const [cerrando, setCerrando] = useState(false);
  const [errorCerrar, setErrorCerrar] = useState(null);

  const cambiar = async (e) => {
    e.preventDefault();
    setError(null);
    setCambiada(false);
    setNoCoinciden(nueva !== repetida);
    if (nueva !== repetida) return;
    setGuardando(true);
    try {
      await cambiarPassword(actual, nueva);
      setCambiada(true);
      setActual('');
      setNueva('');
      setRepetida('');
    } catch (err) {
      setError(err);
    } finally {
      setGuardando(false);
    }
  };

  const cerrarTodas = async () => {
    setErrorCerrar(null);
    setCerrando(true);
    try {
      await cerrarSesiones();
      cerrarSesion();
      navigate('/login', { replace: true });
    } catch (err) {
      setErrorCerrar(err);
      setCerrando(false);
    }
  };

  const status = error?.response?.status;

  return (
    <div className="flex min-h-screen flex-col bg-lousa">
      <CabeceraCuenta />
      <Encabezado titulo="Mi cuenta" descripcion={`${usuario?.nombre ?? ''} · ${usuario?.email ?? ''}`} />

      <div className="grid gap-px bg-linea md:grid-cols-2">
        <Panel titulo="Cambiar contraseña" cuerpo="p-6">
          <form className="max-w-sm space-y-5" onSubmit={cambiar}>
            <Campo
              etiqueta="Contraseña actual"
              id="actual"
              type="password"
              autoComplete="current-password"
              required
              value={actual}
              onChange={(e) => setActual(e.target.value)}
            />
            <Campo
              etiqueta="Contraseña nueva"
              id="nueva"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              ayuda={AYUDA_PASSWORD}
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
            />
            <Campo
              etiqueta="Repite la contraseña nueva"
              id="repetida"
              type="password"
              autoComplete="new-password"
              required
              value={repetida}
              onChange={(e) => setRepetida(e.target.value)}
            />
            {noCoinciden && (
              <Aviso tono="sangre" role="alert">
                Las contraseñas nuevas no coinciden.
              </Aviso>
            )}
            {cambiada && (
              <Aviso tono="brote" role="status">
                Contraseña cambiada. Las sesiones de tus otros dispositivos se han cerrado.
              </Aviso>
            )}
            {status === 400 ? (
              <Aviso tono="sangre" role="alert">
                {error.response.data?.detail ?? 'La contraseña actual no es correcta.'}
              </Aviso>
            ) : (
              <MensajeError error={error} />
            )}
            <Boton tono="solido" type="submit" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Cambiar contraseña'}
            </Boton>
          </form>
        </Panel>

        <Panel titulo="Sesiones" cuerpo="p-6">
          <div className="max-w-sm space-y-4">
            <p className="text-sm text-oso-2">
              Si has perdido el móvil o entraste desde un ordenador que no es tuyo, cierra la sesión en todos
              los dispositivos. Tendrás que volver a entrar también en este.
            </p>
            <MensajeError error={errorCerrar} />
            <Boton tono="sutil" onClick={cerrarTodas} disabled={cerrando}>
              {cerrando ? 'Cerrando…' : 'Cerrar sesión en todos los dispositivos'}
            </Boton>
          </div>
        </Panel>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { login, me } from '../api/auth';
import { MOTIVO_CADUCADA, destinoSeguro } from '../api/cliente';
import MensajeError from '../errores/MensajeError';
import { useSesion } from '../sesion/SesionContext';
import Boton from '../ui/Boton';
import Campo from '../ui/Campo';
import { Aviso } from '../ui/Estados';
import MarcoAcceso, { EnlaceAcceso } from './acceso/MarcoAcceso';

/**
 * Entrar. Las cuentas se dan de alta por invitacion, asi que aqui no hay
 * registro: quien no tiene cuenta la pide desde la portada.
 */
export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const { setUsuario } = useSesion();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  const caducada = params.get('motivo') === MOTIVO_CADUCADA;
  const destino = destinoSeguro(params.get('destino') || location.state?.destino);

  const enviar = async (e) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await login(email, password);
      setUsuario(await me());
      navigate(destino, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setEnviando(false);
    }
  };

  const status = error?.response?.status;

  return (
    <MarcoAcceso rotulo="Acceso" titulo="Acceso a Viñalert">
      {caducada && !error && (
        <Aviso tono="ambar" className="mt-4">
          Tu sesión ha caducado. Vuelve a entrar y seguimos donde estabas.
        </Aviso>
      )}

      <form className="mt-7 space-y-5" onSubmit={enviar}>
        <Campo
          etiqueta="Email"
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@email.com"
        />

        <Campo
          etiqueta="Contraseña"
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />

        {status === 401 ? (
          <Aviso tono="sangre" role="alert">
            Email o contraseña incorrectos.
          </Aviso>
        ) : status === 429 ? (
          <Aviso tono="ambar" role="alert">
            Demasiados intentos. Espera {error.response.data?.detail?.minutos ?? 15} min o{' '}
            <EnlaceAcceso to="/recuperar">recupera tu contraseña</EnlaceAcceso>.
          </Aviso>
        ) : (
          <MensajeError error={error} />
        )}

        <Boton tono="solido" type="submit" disabled={enviando} className="w-full">
          {enviando ? 'Iniciando sesión…' : 'Iniciar sesión'}
        </Boton>
      </form>

      <div className="mt-7 border-t border-linea pt-5">
        <EnlaceAcceso to="/recuperar">¿Has olvidado tu contraseña?</EnlaceAcceso>
      </div>
    </MarcoAcceso>
  );
}

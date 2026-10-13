import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { aceptarInvitacion, me, verInvitacion } from '../api/auth';
import MensajeError from '../errores/MensajeError';
import { useSesion } from '../sesion/SesionContext';
import Boton from '../ui/Boton';
import Campo from '../ui/Campo';
import { Aviso, Cargando } from '../ui/Estados';
import { AYUDA_PASSWORD, esEnlaceInvalido } from './acceso/acceso';
import MarcoAcceso from './acceso/MarcoAcceso';

/**
 * Aceptar una invitacion: la cuenta ya existe (pendiente) y aqui la persona
 * pone su nombre y su contraseña. El email viene fijado por la invitacion: es
 * el buzon al que llego el enlace, y por eso queda verificado.
 */
export default function Invitacion() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const { setUsuario } = useSesion();

  const [info, setInfo] = useState(null);
  const [errorCarga, setErrorCarga] = useState(null);
  const [nombre, setNombre] = useState('');
  const [password, setPassword] = useState('');
  const [repetida, setRepetida] = useState('');
  const [noCoinciden, setNoCoinciden] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let vigente = true;
    verInvitacion(token)
      .then((i) => { if (vigente) setInfo(i); })
      .catch((e) => { if (vigente) setErrorCarga(e); });
    return () => { vigente = false; };
  }, [token]);

  const enviar = async (e) => {
    e.preventDefault();
    setError(null);
    setNoCoinciden(password !== repetida);
    if (password !== repetida) return;
    setEnviando(true);
    try {
      await aceptarInvitacion(token, nombre, password);
      setUsuario(await me());
      navigate('/parcelas', { replace: true });
    } catch (err) {
      setError(err);
      setEnviando(false);
    }
  };

  const invalido = esEnlaceInvalido(errorCarga) || esEnlaceInvalido(error);

  return (
    <MarcoAcceso rotulo="Invitación" titulo="Bienvenido a Viñalert">
      {invalido ? (
        <Aviso tono="sangre" className="mt-6" role="alert">
          El enlace no es válido: ha caducado o ya se ha usado. Pide a quien te invitó que te lo reenvíe.
        </Aviso>
      ) : errorCarga ? (
        <div className="mt-6">
          <MensajeError error={errorCarga} />
        </div>
      ) : info === null ? (
        <Cargando texto="Comprobando la invitación" />
      ) : (
        <>
          <p className="mt-4 text-sm text-oso-2">
            {info.invitado_por ? `${info.invitado_por} te ha invitado` : 'Te han invitado'}
            {info.parcela ? <> a la parcela <strong className="text-oso">{info.parcela}</strong></> : null}.
            Elige tu nombre y una contraseña para entrar.
          </p>
          <form className="mt-6 space-y-5" onSubmit={enviar}>
            <Campo etiqueta="Email" id="email" type="email" value={info.email} readOnly />
            <Campo
              etiqueta="Tu nombre"
              id="nombre"
              type="text"
              autoComplete="name"
              required
              maxLength={120}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Ana Pérez"
            />
            <Campo
              etiqueta="Contraseña"
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              ayuda={AYUDA_PASSWORD}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Campo
              etiqueta="Repite la contraseña"
              id="repetida"
              type="password"
              autoComplete="new-password"
              required
              value={repetida}
              onChange={(e) => setRepetida(e.target.value)}
            />
            {noCoinciden && (
              <Aviso tono="sangre" role="alert">
                Las contraseñas no coinciden.
              </Aviso>
            )}
            <MensajeError error={error} />
            <p className="text-xs leading-relaxed text-oso-3">
              Al activar tu cuenta aceptas las{' '}
              <Link to="/condiciones" className="underline hover:text-oso">condiciones de uso</Link>. Tu nombre y tu
              email se usan para darte acceso y avisarte de lo que afecta a tu cuenta; tienes los detalles y tus
              derechos en la <Link to="/privacidad" className="underline hover:text-oso">política de privacidad</Link>.
            </p>
            <Boton tono="solido" type="submit" disabled={enviando} className="w-full">
              {enviando ? 'Activando…' : 'Activar mi cuenta'}
            </Boton>
          </form>
        </>
      )}
    </MarcoAcceso>
  );
}

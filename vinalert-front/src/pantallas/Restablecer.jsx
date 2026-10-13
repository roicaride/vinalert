import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { restablecer } from '../api/auth';
import MensajeError from '../errores/MensajeError';
import Boton from '../ui/Boton';
import Campo from '../ui/Campo';
import { Aviso } from '../ui/Estados';
import { AYUDA_PASSWORD, esEnlaceInvalido } from './acceso/acceso';
import MarcoAcceso, { EnlaceAcceso } from './acceso/MarcoAcceso';

/** Elegir contraseña nueva desde el enlace del email. */
export default function Restablecer() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  const [password, setPassword] = useState('');
  const [repetida, setRepetida] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState(false);
  const [noCoinciden, setNoCoinciden] = useState(false);
  const [error, setError] = useState(null);

  const enviar = async (e) => {
    e.preventDefault();
    setError(null);
    setNoCoinciden(password !== repetida);
    if (password !== repetida) return;
    setEnviando(true);
    try {
      await restablecer(token, password);
      setHecho(true);
    } catch (err) {
      setError(err);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <MarcoAcceso rotulo="Acceso" titulo="Elige una contraseña nueva">
      {hecho ? (
        <Aviso tono="brote" className="mt-6" role="status">
          Contraseña cambiada. Hemos cerrado las sesiones que tuvieras abiertas.{' '}
          <EnlaceAcceso to="/login">Inicia sesión</EnlaceAcceso> con la nueva.
        </Aviso>
      ) : esEnlaceInvalido(error) ? (
        <Aviso tono="sangre" className="mt-6" role="alert">
          El enlace no es válido: ha caducado o ya se ha usado.{' '}
          <EnlaceAcceso to="/recuperar">Pedir otro enlace</EnlaceAcceso>
        </Aviso>
      ) : (
        <form className="mt-7 space-y-5" onSubmit={enviar}>
          <Campo
            etiqueta="Contraseña nueva"
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
          <Boton tono="solido" type="submit" disabled={enviando} className="w-full">
            {enviando ? 'Guardando…' : 'Guardar contraseña'}
          </Boton>
        </form>
      )}
    </MarcoAcceso>
  );
}

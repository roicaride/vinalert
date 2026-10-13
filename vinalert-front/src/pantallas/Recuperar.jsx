import { useState } from 'react';

import { recuperar } from '../api/auth';
import MensajeError from '../errores/MensajeError';
import Boton from '../ui/Boton';
import Campo from '../ui/Campo';
import { Aviso } from '../ui/Estados';
import MarcoAcceso, { EnlaceAcceso } from './acceso/MarcoAcceso';

/**
 * Pedir el enlace para restablecer la contraseña. Despues de enviar, el
 * mensaje es siempre el mismo, haya cuenta o no: decir "ese email no existe"
 * serviria para averiguar quien tiene cuenta.
 */
export default function Recuperar() {
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState(null);

  const enviar = async (e) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await recuperar(email);
      setEnviado(true);
    } catch (err) {
      setError(err);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <MarcoAcceso rotulo="Acceso" titulo="Recuperar la contraseña">
      {enviado ? (
        <Aviso tono="brote" className="mt-6" role="status">
          Si hay una cuenta con ese email, te hemos enviado un enlace para elegir una contraseña nueva.
          Caduca en 1 hora. Mira también en la carpeta de spam.
        </Aviso>
      ) : (
        <form className="mt-7 space-y-5" onSubmit={enviar}>
          <p className="text-sm text-oso-2">
            Escribe el email con el que entras y te enviaremos un enlace para elegir una contraseña nueva.
          </p>
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
          <MensajeError error={error} />
          <Boton tono="solido" type="submit" disabled={enviando} className="w-full">
            {enviando ? 'Enviando…' : 'Enviar enlace'}
          </Boton>
        </form>
      )}

      <div className="mt-7 border-t border-linea pt-5">
        <EnlaceAcceso to="/login">Volver a iniciar sesión</EnlaceAcceso>
      </div>
    </MarcoAcceso>
  );
}

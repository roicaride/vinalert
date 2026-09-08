import { useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { login, me, registro } from '../api/auth';
import { MOTIVO_CADUCADA } from '../api/cliente';
import MensajeError from '../errores/MensajeError';
import { CuadroMarca, Marca } from '../marca/Marca';
import { SECCIONES } from '../secciones';
import { useSesion } from '../sesion/SesionContext';
import Boton, { Enlace } from '../ui/Boton';
import Campo from '../ui/Campo';
import { Aviso } from '../ui/Estados';

/**
 * La puerta.
 *
 * Es la unica pantalla sin datos, asi que es donde la marca puede hablar sin
 * quitarle sitio a nada: el simbolo grande a la izquierda y, debajo, la lista
 * de lo que hay dentro. Esa lista sale de SECCIONES —la misma fuente que la
 * navegacion— para que nunca prometa una pantalla que no existe.
 */
export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const { setUsuario } = useSesion();

  const [modo, setModo] = useState('login'); // 'login' | 'registro'
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  const caducada = params.get('motivo') === MOTIVO_CADUCADA;
  const destino = params.get('destino') || location.state?.destino || '/';

  const enviar = async (e) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      if (modo === 'registro') {
        await registro({ nombre, email, password });
      }
      await login(email, password);
      setUsuario(await me());
      navigate(destino, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="grid min-h-screen bg-linea md:grid-cols-[1.15fr_1fr] md:gap-px">
      {/* ------------------------------------------------------------------ */}
      {/* La marca. Lo unico que se ve antes de entrar.                       */}
      {/* ------------------------------------------------------------------ */}
      <section className="flex flex-col justify-between gap-10 bg-lousa px-8 py-10 md:px-12 md:py-14">
        <div className="flex items-center gap-3">
          <CuadroMarca lado={34} tinta="bg-oso" />
          <span className="font-mono text-lg font-medium tracking-[0.06em] text-oso">Viñalert</span>
        </div>

        <div className="max-w-lg">
          <p className="rotulo">Sensores en campo</p>
          <h2 className="mt-4 font-mono text-3xl leading-[1.15] font-medium tracking-[-0.02em] text-oso md:text-[2.6rem]">
            Lo que el suelo está haciendo ahora mismo.
          </h2>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-oso-2">
            Humedad y temperatura del suelo, el clima de la parcela y el cuaderno de tratamientos,
            en la misma pantalla y con la misma hora.
          </p>
        </div>

        <div className="border-t border-linea pt-5">
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {SECCIONES.map((s) => (
              <li key={s.ruta} className="rotulo flex items-center gap-2 text-oso-3">
                <Marca alto={9} className="text-vina" />
                {s.etiqueta}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* El formulario.                                                      */}
      {/* ------------------------------------------------------------------ */}
      <section className="flex items-center justify-center bg-lousa px-6 py-10 md:px-10">
        <div className="w-full max-w-sm">
          <p className="rotulo">{modo === 'login' ? 'Acceso' : 'Registro'}</p>
          <h1 className="mt-3 font-mono text-xl font-medium tracking-[-0.01em] text-oso">
            {modo === 'login' ? 'Acceso a Viñalert' : 'Crear cuenta en Viñalert'}
          </h1>

          {caducada && (
            <Aviso tono="ambar" className="mt-4">
              Tu sesión ha caducado. Vuelve a entrar y seguimos donde estabas.
            </Aviso>
          )}

          <form className="mt-7 space-y-5" onSubmit={enviar}>
            {modo === 'registro' && (
              <Campo
                etiqueta="Nombre completo"
                id="nombre"
                type="text"
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. Roi González"
              />
            )}

            <Campo
              etiqueta="Email"
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
            />

            <Campo
              etiqueta="Contraseña"
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />

            <MensajeError
              error={error}
              textoNoEncontrado={
                modo === 'login'
                  ? 'Email o contraseña incorrectos.'
                  : 'No se pudo crear la cuenta.'
              }
            />

            <Boton tono="solido" type="submit" disabled={enviando} className="w-full">
              {enviando
                ? modo === 'login'
                  ? 'Entrando…'
                  : 'Creando cuenta…'
                : modo === 'login'
                  ? 'Entrar'
                  : 'Registrarse y entrar'}
            </Boton>
          </form>

          <div className="mt-7 border-t border-linea pt-5">
            <Enlace
              onClick={() => {
                setModo(modo === 'login' ? 'registro' : 'login');
                setError(null);
              }}
            >
              {modo === 'login' ? 'Crear una cuenta' : 'Ya tengo cuenta'}
            </Enlace>
          </div>
        </div>
      </section>
    </div>
  );
}

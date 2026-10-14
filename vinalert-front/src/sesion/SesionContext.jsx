import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { sesion } from '../api/cliente';
import { me } from '../api/auth';
import Boton from '../ui/Boton';
import { Aviso } from '../ui/Estados';

const SesionContext = createContext(null);

/**
 * Sin red al abrir la app no se pierde la sesion: en el campo la cobertura va
 * y viene, y volver a escribir la contraseña cada vez seria absurdo. Solo un
 * 401 de /auth/me (token caducado o revocado) la cierra.
 */
function SinConexion({ onReintentar }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-lousa px-6">
      <div className="w-full max-w-sm space-y-5">
        <Aviso tono="ambar" role="alert">
          Sin conexión con el servidor. Tu sesión sigue abierta: comprueba la cobertura y vuelve a intentarlo.
        </Aviso>
        <Boton tono="solido" onClick={onReintentar} className="w-full">
          Reintentar
        </Boton>
      </div>
    </div>
  );
}

export function ProveedorSesion({ children }) {
  const [usuario, setUsuario] = useState(null);
  // Empieza en true solo si hay token que resolver. Sin token no hay nada que
  // esperar y podemos decidir de inmediato.
  const [cargando, setCargando] = useState(Boolean(sesion.leerToken()));
  const [sinConexion, setSinConexion] = useState(false);

  // Pide /auth/me y reparte el resultado. Los setState van siempre dentro de
  // la promesa, nunca sincronos en el efecto.
  const resolver = useCallback((esVigente) => {
    me()
      .then((u) => { if (esVigente()) setUsuario(u); })
      .catch((e) => {
        if (e?.response?.status === 401) {
          sesion.limpiar();
        } else if (esVigente()) {
          setSinConexion(true);
        }
      })
      .finally(() => { if (esVigente()) setCargando(false); });
  }, []);

  useEffect(() => {
    if (!sesion.leerToken()) return undefined;
    let vigente = true;
    resolver(() => vigente);
    return () => { vigente = false; };
  }, [resolver]);

  const reintentar = () => {
    setSinConexion(false);
    setCargando(true);
    resolver(() => true);
  };

  const cerrarSesion = useCallback(() => {
    sesion.limpiar();
    setUsuario(null);
  }, []);

  if (sinConexion) return <SinConexion onReintentar={reintentar} />;

  return (
    <SesionContext.Provider value={{ usuario, cargando, setUsuario, cerrarSesion }}>
      {children}
    </SesionContext.Provider>
  );
}

export function useSesion() {
  const valor = useContext(SesionContext);
  return valor ?? { usuario: null, cargando: false, setUsuario: () => {}, cerrarSesion: () => {} };
}

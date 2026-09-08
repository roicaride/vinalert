import { createContext, useContext, useEffect, useState } from 'react';

import { sesion } from '../api/cliente';
import { me } from '../api/auth';

const SesionContext = createContext(null);

export function ProveedorSesion({ children }) {
  const [usuario, setUsuario] = useState(null);
  // Empieza en true solo si hay token que resolver. Sin token no hay nada que
  // esperar y podemos decidir de inmediato.
  const [cargando, setCargando] = useState(Boolean(sesion.leerToken()));

  useEffect(() => {
    if (!sesion.leerToken()) return;

    let vigente = true;
    me()
      .then((u) => { if (vigente) setUsuario(u); })
      .catch(() => { sesion.limpiar(); })
      .finally(() => { if (vigente) setCargando(false); });

    return () => { vigente = false; };
  }, []);

  const cerrarSesion = () => {
    sesion.limpiar();
    setUsuario(null);
  };

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


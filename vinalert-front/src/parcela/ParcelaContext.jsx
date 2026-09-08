import { createContext, useContext, useEffect, useState } from 'react';

import { obtenerParcela } from '../api/parcelas';
import MensajeError from '../errores/MensajeError';
import { Cargando } from '../ui/Estados';

const ParcelaContext = createContext(null);

export function ProveedorParcela({ parcelaId, children }) {
  const [parcela, setParcela] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    obtenerParcela(parcelaId)
      .then((p) => { if (vigente) { setParcela(p); setError(null); } })
      .catch((e) => { if (vigente) setError(e); })
      .finally(() => { if (vigente) setCargando(false); });

    return () => { vigente = false; };
  }, [parcelaId]);

  // El permiso sale de mi_rol y de nada mas. Deducirlo de otra cosa —del rol
  // global, de si eres el creador— seria adivinar, y adivinar mal significa
  // ensenar botones que devuelven 403.
  const puedeGestionar = parcela?.mi_rol === 'gestor';

  return (
    <ParcelaContext.Provider value={{ parcela, puedeGestionar, cargando, error, setParcela }}>
      {cargando
        ? <Cargando texto="Cargando parcela" />
        : error
          ? <div className="p-6"><MensajeError error={error} textoNoEncontrado="Esta parcela no existe o no tienes acceso a ella." /></div>
          : children}
    </ParcelaContext.Provider>
  );
}

export function useParcela() {
  const valor = useContext(ParcelaContext);
  if (valor === null) {
    throw new Error('useParcela debe usarse dentro de <ProveedorParcela>');
  }
  return valor;
}

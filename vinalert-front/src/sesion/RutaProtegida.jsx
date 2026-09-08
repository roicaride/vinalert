import { Navigate, useLocation } from 'react-router-dom';

import { useSesion } from './SesionContext';
import { Cargando } from '../ui/Estados';

export default function RutaProtegida({ children }) {
  const { usuario, cargando } = useSesion();
  const location = useLocation();

  // Mientras no sepamos quien eres no decidimos nada: redirigir aqui haria
  // parpadear el login en cada carga de pagina.
  if (cargando) return <Cargando texto="Comprobando la sesión" />;

  if (!usuario) {
    return <Navigate to="/login" replace state={{ destino: location.pathname }} />;
  }
  return children;
}

import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';


import { configurarSalidaDeSesion } from './api/cliente';
import { listarParcelas } from './api/parcelas';
import AppLayout from './layout/AppLayout';
import { ProveedorParcela } from './parcela/ParcelaContext';
import Configuracion from './pantallas/Configuracion';
import Sensores from './pantallas/Sensores';
import Miembros from './pantallas/Miembros';
import Estado from './pantallas/Estado';
import Tratamientos from './pantallas/Tratamientos';
import Foliar from './pantallas/Foliar';
import Analisis from './pantallas/Analisis';
import Login from './pantallas/Login';
import Seccion from './pantallas/Seccion';
import SeleccionParcela from './pantallas/SeleccionParcela';
import MensajeError from './errores/MensajeError';
import { Cargando } from './ui/Estados';
import { SECCION_POR_DEFECTO, SECCIONES } from './secciones';
import RutaProtegida from './sesion/RutaProtegida';
import { ProveedorSesion, useSesion } from './sesion/SesionContext';


// El componente mas externo dentro de <BrowserRouter>, y a proposito el unico
// sitio donde se registra la salida de sesion. Se hace aqui EN EL CUERPO del
// componente (durante el render), no en un useEffect: los efectos de los
// hijos corren ANTES que los del padre (ProveedorSesion, un hijo, pide
// /auth/me desde su propio efecto), asi que un useEffect aqui dejaria una
// ventana real en la que un 401 llega sin manejador y cae al respaldo de
// recargar la pagina entera en vez de dar una transicion. Registrando el
// manejador durante el render se cierra esa ventana: el render del padre
// termina antes de que React ni siquiera empiece a renderizar a sus hijos,
// y mucho antes de que se disparen sus efectos.
function ConectorSesion({ children }) {
  const navigate = useNavigate();

  configurarSalidaDeSesion(({ motivo, destino }) => {
    navigate(`/login?motivo=${motivo}&destino=${encodeURIComponent(destino)}`, { replace: true });
  });

  return children;
}

function ParcelaLayout() {
  const { parcelaId } = useParams();
  return (
    <ProveedorParcela parcelaId={parcelaId}>
      <AppLayout />
    </ProveedorParcela>
  );
}

function Entrada() {
  const [parcelas, setParcelas] = useState(null);
  const [error, setError] = useState(null);
  const location = useLocation();
  const { usuario } = useSesion();

  useEffect(() => {
    let vigente = true;
    listarParcelas()
      .then((p) => { if (vigente) { setParcelas(p); setError(null); } })
      .catch((e) => { if (vigente) setError(e); });
    return () => { vigente = false; };
  }, [location.pathname]);

  if (error) {
    return (
      <div className="p-6">
        <MensajeError error={error} textoNoEncontrado="No se pudieron cargar tus parcelas." />
      </div>
    );
  }
  if (parcelas === null) return <Cargando texto="Cargando parcelas" />;
  
  // Si entra a la raíz "/" con una sola parcela y no es admin, entrar directo a ella.
  if (parcelas.length === 1 && location.pathname !== '/parcelas' && usuario?.rol !== 'admin') {
    return <Navigate to={`/p/${parcelas[0].id}`} replace />;
  }

  return <SeleccionParcela parcelas={parcelas} />;
}


// Que ruta usa que componente real.
const PANTALLAS = {
  configuracion: Configuracion,
  sensores: Sensores,
  miembros: Miembros,
  estado: Estado,
  tratamientos: Tratamientos,
  foliar: Foliar,
  analisis: Analisis,
};

export default function App() {
  return (
    <BrowserRouter>
      <ConectorSesion>
        <ProveedorSesion>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<RutaProtegida><Entrada /></RutaProtegida>} />
            <Route path="/parcelas" element={<RutaProtegida><Entrada /></RutaProtegida>} />
            <Route
              path="/p/:parcelaId"
              element={<RutaProtegida><ParcelaLayout /></RutaProtegida>}
            >
              <Route index element={<Navigate to={SECCION_POR_DEFECTO} replace />} />
              {SECCIONES.map((s) => {
                const Pantalla = PANTALLAS[s.ruta];
                return (
                  <Route
                    key={s.ruta}
                    path={s.ruta}
                    element={Pantalla ? <Pantalla /> : <Seccion titulo={s.titulo} descripcion={s.descripcion} />}
                  />
                );
              })}
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ProveedorSesion>
      </ConectorSesion>
    </BrowserRouter>
  );
}

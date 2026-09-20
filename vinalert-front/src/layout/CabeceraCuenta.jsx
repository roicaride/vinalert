import { Link, NavLink, useNavigate } from 'react-router-dom';

import { Firma } from '../marca/Marca';
import { useSesion } from '../sesion/SesionContext';
import { Enlace } from '../ui/Boton';
import { Marbete } from '../ui/Estados';

/**
 * La cabecera de las pantallas que no son de una parcela: la eleccion de
 * parcela y Administracion. Firma, las dos secciones de la cuenta —la segunda
 * solo para el superadmin—, quien eres y la salida.
 */
export default function CabeceraCuenta() {
  const { usuario, cerrarSesion } = useSesion();
  const navigate = useNavigate();
  const esAdmin = usuario?.rol === 'admin';

  const pestana = ({ isActive }) =>
    `flex items-center border-r border-linea px-5 font-mono text-[11px] font-medium tracking-[0.16em] uppercase transition-colors ${
      isActive ? 'bg-alza text-brote' : 'text-oso-2 hover:bg-alza hover:text-oso'
    }`;

  return (
    <header className="flex shrink-0 flex-wrap items-stretch justify-between border-b border-linea">
      <div className="flex items-stretch">
        <Link to="/" className="flex items-center border-r border-linea px-5 py-3">
          <Firma />
        </Link>
        <nav className="flex items-stretch">
          <NavLink to="/parcelas" className={pestana}>
            Parcelas
          </NavLink>
          {usuario?.es_superadmin && (
            <NavLink to="/admin" className={pestana}>
              Administración
            </NavLink>
          )}
        </nav>
      </div>
      <div className="flex items-stretch">
        <div className="hidden items-center gap-3 border-l border-linea px-5 py-3 sm:flex">
          {esAdmin && <Marbete tono="ambar">Administrador</Marbete>}
          <div className="min-w-0">
            <p className="truncate text-sm leading-tight text-oso">{usuario?.nombre}</p>
            <p className="mt-0.5 truncate font-mono text-[11px] text-oso-3">{usuario?.email}</p>
          </div>
        </div>
        <div className="flex items-center border-l border-linea px-5 py-3">
          <Enlace onClick={() => { cerrarSesion(); navigate('/login'); }}>Cerrar sesión</Enlace>
        </div>
      </div>
    </header>
  );
}

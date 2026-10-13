import { useSearchParams } from 'react-router-dom';

import CabeceraCuenta from '../layout/CabeceraCuenta';
import { useSesion } from '../sesion/SesionContext';
import { Aviso } from '../ui/Estados';
import { Encabezado } from '../ui/Panel';
import Accesos from './admin/Accesos';
import ConfiguracionLegal from './admin/ConfiguracionLegal';
import Cuentas from './admin/Cuentas';
import EstadoSistema from './admin/EstadoSistema';

/**
 * Administracion: todo lo que el superadmin gestiona sin entrar al servidor
 * ni a la base de datos. La pestaña va en la URL (?seccion=) para poder
 * enlazarla y para que recargar no te devuelva a la primera.
 *
 * El permiso lo decide el backend (todo /admin/* da 403 a quien no es
 * superadmin); aqui solo se evita pintar pestañas que no le van a cargar.
 */
const SECCIONES = [
  {
    clave: 'cuentas',
    nombre: 'Cuentas',
    descripcion:
      'Todas las cuentas de Viñalert: invitar, desactivar, eliminar y dar permisos. Las contraseñas no se pueden leer, ni desde aquí ni desde la base de datos.',
    Pantalla: Cuentas,
  },
  {
    clave: 'estado',
    nombre: 'Estado',
    descripcion: 'Si los trabajos periódicos van bien, si el correo está configurado y qué dispositivos se han callado.',
    Pantalla: EstadoSistema,
  },
  {
    clave: 'accesos',
    nombre: 'Accesos',
    descripcion: 'Intentos de inicio de sesión y de recuperación de contraseña de los últimos 90 días.',
    Pantalla: Accesos,
  },
  {
    clave: 'configuracion',
    nombre: 'Configuración',
    descripcion: 'Los datos del titular y del encargado que publican el aviso legal y la política de privacidad.',
    Pantalla: ConfiguracionLegal,
  },
];

export default function Administracion() {
  const { usuario } = useSesion();
  const [params, setParams] = useSearchParams();
  const actual = SECCIONES.find((s) => s.clave === params.get('seccion')) ?? SECCIONES[0];
  const { Pantalla } = actual;

  return (
    <div className="flex min-h-screen flex-col bg-lousa text-oso">
      <CabeceraCuenta />
      <Encabezado titulo="Administración" descripcion={actual.descripcion} />
      {usuario && !usuario.es_superadmin ? (
        <div className="p-6">
          <Aviso tono="ambar">Esta sección es solo para el administrador de Viñalert.</Aviso>
        </div>
      ) : (
        <>
          <nav aria-label="Secciones de administración" className="flex overflow-x-auto border-b border-linea">
            {SECCIONES.map((s) => (
              <button
                key={s.clave}
                type="button"
                aria-current={s.clave === actual.clave ? 'page' : undefined}
                onClick={() => setParams(s.clave === 'cuentas' ? {} : { seccion: s.clave })}
                className={`shrink-0 border-r border-linea px-5 py-3 font-mono text-[11px] font-medium tracking-[0.16em] uppercase transition-colors ${
                  s.clave === actual.clave ? 'bg-alza text-brote' : 'text-oso-2 hover:bg-alza hover:text-oso'
                }`}
              >
                {s.nombre}
              </button>
            ))}
          </nav>
          <main className="flex-1">
            <Pantalla />
          </main>
        </>
      )}
    </div>
  );
}

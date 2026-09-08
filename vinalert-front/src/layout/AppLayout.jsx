import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router-dom';

import { listarParcelas } from '../api/parcelas';
import { CuadroMarca, Firma, Marca } from '../marca/Marca';
import { useParcela } from '../parcela/ParcelaContext';
import { useSesion } from '../sesion/SesionContext';
import Boton, { Enlace } from '../ui/Boton';
import { Marbete } from '../ui/Estados';
import Navegacion from './Navegacion';

/**
 * El chasis.
 *
 * La aplicacion ocupa la ventana entera y se divide con lineas de 1px que van
 * de borde a borde: cabecera arriba, navegacion a la izquierda, barra de
 * estado abajo, y el unico sitio que hace scroll es el contenido. No hay
 * margen exterior a proposito —esto es un panel de control, no un documento—
 * y por eso las lineas llegan siempre al final de la pantalla.
 */

/** El reloj de la barra de estado. Se refresca al minuto, no al segundo. */
function useHoraLocal() {
  const [hora, setHora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setHora(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return hora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

export default function AppLayout() {
  const { parcelaId } = useParams();
  const { parcela } = useParcela();
  const { usuario, cerrarSesion } = useSesion();
  const navigate = useNavigate();
  const hora = useHoraLocal();

  const esAdmin = usuario?.rol === 'admin';
  const soloLectura = parcela.mi_rol === 'lectura' && !esAdmin;
  const [numParcelas, setNumParcelas] = useState(1);

  useEffect(() => {
    let vigente = true;
    listarParcelas()
      .then((p) => { if (vigente) setNumParcelas(p.length); })
      .catch(() => {});
    return () => { vigente = false; };
  }, [parcelaId]);

  return (
    <div className="flex min-h-screen flex-col bg-lousa text-oso">
      {/* ------------------------------------------------------------------ */}
      {/* Cabecera: quien eres, donde estas, y como salir.                    */}
      {/* ------------------------------------------------------------------ */}
      <header className="flex shrink-0 flex-wrap items-stretch justify-between border-b border-linea">
        <div className="flex min-w-0 items-stretch">
          <div className="flex items-center border-r border-linea px-5 py-3">
            <Firma />
          </div>

          <div className="flex min-w-0 items-center gap-3 border-r border-linea px-5 py-3">
            <CuadroMarca lado={30} tinta="bg-vina" />
            <div className="min-w-0">
              <p className="truncate text-sm leading-tight font-medium text-oso">
                {parcela.nombre}
              </p>
              <p className="rotulo mt-0.5 truncate">
                Parcela {parcela.id}
                {parcela.variedad && ` · ${parcela.variedad}`}
              </p>
            </div>
            {(numParcelas > 1 || esAdmin) && (
              <Enlace onClick={() => navigate('/parcelas')} className="ml-1 shrink-0">
                Cambiar
              </Enlace>
            )}
          </div>
        </div>

        <div className="flex items-stretch">
          <div className="hidden items-center gap-3 border-l border-linea px-5 py-3 sm:flex">
            {esAdmin ? (
              <Marbete tono="ambar">Administrador</Marbete>
            ) : (
              <Marbete tono={soloLectura ? 'neutro' : 'brote'}>
                {soloLectura ? 'Solo lectura' : 'Gestor'}
              </Marbete>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm leading-tight text-oso">{usuario?.nombre}</p>
              <p className="mt-0.5 truncate font-mono text-[11px] text-oso-3">{usuario?.email}</p>
            </div>
          </div>
          <div className="flex items-center border-l border-linea px-5 py-3">
            <Enlace onClick={() => { cerrarSesion(); navigate('/login'); }}>
              Cerrar sesión
            </Enlace>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Cuerpo: navegacion fija, contenido con su propio scroll.            */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="flex shrink-0 flex-col justify-between border-b border-linea md:w-56 md:border-r md:border-b-0">
          <Navegacion parcelaId={parcelaId} />

          {esAdmin && (
            <div className="hidden border-t border-linea p-4 md:block">
              <Boton tono="fantasma" className="w-full" onClick={() => navigate('/parcelas')}>
                Nueva parcela
              </Boton>
            </div>
          )}
        </aside>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Barra de estado. Lo mismo que mira quien vigila la parcela: donde   */}
      {/* estoy, con que permiso, y que hora es —porque cada lectura lleva    */}
      {/* hora y sin la referencia local no significan nada.                  */}
      {/* ------------------------------------------------------------------ */}
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-linea px-4 py-2">
        <div className="flex items-center gap-2">
          <Marca alto={11} className="text-oso-4" />
          <span className="rotulo text-oso-4">Viñalert</span>
        </div>
        {/* En móvil solo sobrevive la hora: parcela y rol ya están en la
            cabecera, y repetirlos aquí parte la barra en dos líneas. */}
        <div className="flex items-center gap-x-5">
          <span className="rotulo hidden text-oso-4 sm:inline">Parcela {parcela.id}</span>
          <span className="rotulo hidden text-oso-4 sm:inline">
            {esAdmin ? 'Administrador' : soloLectura ? 'Solo lectura' : 'Gestor'}
          </span>
          <span className="rotulo text-oso-4">Hora local {hora}</span>
        </div>
      </footer>
    </div>
  );
}

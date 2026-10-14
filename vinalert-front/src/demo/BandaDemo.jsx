import { useNavigate } from 'react-router-dom';

import { CORREO_CONTACTO } from '../pantallas/portada/textos';
import { Enlace } from '../ui/Boton';
import { modoDemo } from './modo';

/**
 * La banda de arriba mientras se recorre la parcela de ejemplo: que se sepa
 * que los datos son inventados y que nada se guarda, y como seguir.
 */
export default function BandaDemo() {
  const navigate = useNavigate();
  if (!modoDemo.activo()) return null;

  const asunto = encodeURIComponent('Demostración de Viñalert');

  // Primero se sale de la parcela y despues se cierra la sesion de la demo
  // (pantallas/Demo.jsx, SalirDemo): al reves, la ruta protegida veria la
  // sesion cerrada y mandaria al login.
  const salir = () => navigate('/salir-demo', { replace: true });

  return (
    <div role="status" className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-brote/40 bg-alza px-4 py-2.5">
      <p className="text-sm text-oso">
        <span className="mr-2 inline-block size-2 bg-brote align-middle" aria-hidden="true" />
        Estás en una parcela de ejemplo con datos inventados. Puedes tocarlo todo: nada se guarda.
      </p>
      <div className="ml-auto flex items-center gap-5">
        <a
          href={`mailto:${CORREO_CONTACTO}?subject=${asunto}`}
          className="font-mono text-[11px] tracking-[0.16em] text-brote uppercase underline-offset-4 hover:underline"
        >
          Solicitar una demostración
        </a>
        <Enlace onClick={salir}>Salir del ejemplo</Enlace>
      </div>
    </div>
  );
}

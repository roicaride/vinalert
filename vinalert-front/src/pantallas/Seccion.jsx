import { Encabezado } from '../ui/Panel';
import { Vacio } from '../ui/Estados';

/** Marcador de las secciones que todavia no tienen pantalla. */
export default function Seccion({ titulo, descripcion }) {
  return (
    <>
      <Encabezado titulo={titulo} descripcion={descripcion} />
      <div className="p-6">
        <Vacio titulo="Todavía no construido">
          <p className="max-w-sm text-sm text-oso-3">
            Esta sección aparece en la navegación porque ya está reservada, pero aún no muestra
            datos.
          </p>
        </Vacio>
      </div>
    </>
  );
}

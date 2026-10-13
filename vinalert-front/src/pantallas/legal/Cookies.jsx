import PaginaLegal, { Apartado } from './PaginaLegal';

const ALMACENADOS = [
  {
    nombre: 'access_token',
    finalidad: 'Mantener tu sesión iniciada.',
    duracion: 'Hasta que cierras sesión o caduca la sesión (7 días).',
  },
  {
    nombre: 'vinalert_idioma',
    finalidad: 'Recordar el idioma que eliges en la portada.',
    duracion: 'Hasta que borras los datos del navegador.',
  },
];

/**
 * Politica de cookies. Viñalert no usa cookies: guarda dos datos tecnicos en
 * el almacenamiento local del navegador, exentos de consentimiento (art. 22.2
 * LSSI y guia de la AEPD). Por eso no hay banner. Si algun dia se anade
 * analitica, esto deja de ser cierto y hara falta pedir consentimiento.
 */
export default function Cookies() {
  return (
    <PaginaLegal titulo="Política de cookies">
      {() => (
        <>
          <Apartado titulo="Qué guardamos en tu navegador">
            <p>
              Viñalert no usa cookies propias ni de terceros con fines analíticos, publicitarios o de seguimiento. Solo
              guarda en el almacenamiento local de tu navegador los dos datos técnicos que necesita para funcionar:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] border border-linea text-left">
                <thead>
                  <tr className="border-b border-linea bg-alza">
                    <th className="rotulo px-3 py-2 font-medium">Nombre</th>
                    <th className="rotulo px-3 py-2 font-medium">Para qué</th>
                    <th className="rotulo px-3 py-2 font-medium">Duración</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-linea">
                  {ALMACENADOS.map((a) => (
                    <tr key={a.nombre}>
                      <td className="px-3 py-2 font-mono text-xs text-oso">{a.nombre}</td>
                      <td className="px-3 py-2">{a.finalidad}</td>
                      <td className="px-3 py-2">{a.duracion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Apartado>

          <Apartado titulo="Por qué no te pedimos consentimiento">
            <p>
              Son estrictamente necesarios para prestar el servicio que pides (iniciar sesión) o los eliges tú (el
              idioma), y por eso están exentos de consentimiento según el artículo 22.2 de la LSSI y la guía sobre el uso
              de cookies de la Agencia Española de Protección de Datos.
            </p>
          </Apartado>

          <Apartado titulo="Servicios de terceros">
            <p>
              Cuando se muestra el mapa de sensores, tu navegador descarga las imágenes de los servidores del Instituto
              Geográfico Nacional, que reciben tu dirección IP para poder enviarlas.
            </p>
          </Apartado>

          <Apartado titulo="Cómo borrarlos">
            <p>
              Cerrar sesión borra el dato de sesión. Puedes borrar ambos en cualquier momento desde la configuración de tu
              navegador, en el apartado de datos de sitios web.
            </p>
          </Apartado>
        </>
      )}
    </PaginaLegal>
  );
}

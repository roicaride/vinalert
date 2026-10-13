import { Link } from 'react-router-dom';

import PaginaLegal, { Apartado, Dato } from './PaginaLegal';

/** Condiciones de uso de la herramienta para las personas con cuenta. */
export default function Condiciones() {
  return (
    <PaginaLegal titulo="Condiciones de uso">
      {(c) => (
        <>
          <Apartado titulo="Quién puede usar Viñalert">
            <p>
              Viñalert es una herramienta de <Dato config={c} clave="titular_nombre" /> para la gestión de sus
              parcelas. Solo pueden usarla las personas invitadas por el titular o por quien gestiona una parcela. Al
              activar tu cuenta aceptas estas condiciones y quedas informado de la{' '}
              <Link to="/privacidad" className="underline">política de privacidad</Link>.
            </p>
          </Apartado>

          <Apartado titulo="Tu cuenta">
            <ul>
              <li>La cuenta es personal: no compartas tu contraseña ni dejes la sesión abierta en equipos ajenos.</li>
              <li>
                Si crees que alguien conoce tu contraseña, cámbiala desde «Mi cuenta» y cierra la sesión en todos los
                dispositivos.
              </li>
              <li>
                El titular puede desactivar o eliminar una cuenta cuando deje de ser necesaria o si se usa de forma
                indebida.
              </li>
            </ul>
          </Apartado>

          <Apartado titulo="Permisos">
            <p>
              En cada parcela tienes el permiso que te ha dado quien la gestiona: de lectura (consultar y exportar) o de
              gestión (además, configurar sensores, anotar tratamientos y dar acceso a otras personas). Quien gestiona una
              parcela es responsable de a quién da acceso.
            </p>
          </Apartado>

          <Apartado titulo="Uso correcto">
            <ul>
              <li>Usa la herramienta solo para la gestión de las parcelas a las que tienes acceso.</li>
              <li>No intentes acceder a datos o funciones para las que no tienes permiso, ni interferir en el servicio.</li>
              <li>
                Lo que anotas en el cuaderno de tratamientos debe ser veraz: puede tener valor ante una inspección.
              </li>
            </ul>
          </Apartado>

          <Apartado titulo="Datos y servicio">
            <p>
              El clima procede de servicios de terceros y es orientativo; las lecturas dependen del estado de los sensores
              de campo. El servicio puede interrumpirse por mantenimiento o por causas ajenas al titular. Las decisiones
              agronómicas son responsabilidad de quien las toma.
            </p>
          </Apartado>

          <Apartado titulo="Cambios en estas condiciones">
            <p>
              Si estas condiciones cambian, se publicará la nueva versión en esta página con su fecha. Para cualquier duda:{' '}
              <Dato config={c} clave="titular_email" />.
            </p>
          </Apartado>
        </>
      )}
    </PaginaLegal>
  );
}

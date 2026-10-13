import { Link } from 'react-router-dom';

import PaginaLegal, { Apartado, Dato } from './PaginaLegal';

/**
 * Politica de privacidad (RGPD art. 13). Describe lo que la aplicacion hace de
 * verdad: si cambia lo que se guarda o cuanto tiempo, hay que cambiar esto.
 */
export default function Privacidad() {
  return (
    <PaginaLegal titulo="Política de privacidad">
      {(c) => (
        <>
          <Apartado titulo="Responsable del tratamiento">
            <ul>
              <li><Dato config={c} clave="titular_nombre" /> (NIF / CIF <Dato config={c} clave="titular_nif" />)</li>
              <li>Domicilio: <Dato config={c} clave="titular_domicilio" /></li>
              <li>Email para cualquier cuestión de privacidad: <Dato config={c} clave="titular_email" /></li>
            </ul>
          </Apartado>

          <Apartado titulo="Encargado del tratamiento">
            <p>
              <Dato config={c} clave="encargado_nombre" /> desarrolla y mantiene la herramienta por cuenta del
              responsable, con acceso a los datos solo para ese fin y conforme al artículo 28 del RGPD. Contacto:{' '}
              <Dato config={c} clave="encargado_email" />.
            </p>
          </Apartado>

          <Apartado titulo="Qué datos tratamos">
            <ul>
              <li>
                <strong>Datos de tu cuenta:</strong> nombre, email y, si lo das, teléfono. La contraseña se guarda
                transformada de forma irreversible: nadie puede leerla, tampoco el administrador.
              </li>
              <li>
                <strong>Registro de accesos:</strong> cada intento de inicio de sesión o de recuperación de contraseña,
                con el email escrito, la dirección IP, la fecha y el resultado.
              </li>
              <li>
                <strong>Datos de la explotación:</strong> parcelas y su ubicación, lecturas de los sensores, análisis
                foliares y el cuaderno de tratamientos, que puede incluir el nombre de quien aplica cada tratamiento y la
                maquinaria usada.
              </li>
              <li>
                <strong>Datos técnicos en tu navegador:</strong> la sesión iniciada y el idioma elegido (ver la{' '}
                <Link to="/cookies" className="underline">política de cookies</Link>).
              </li>
            </ul>
          </Apartado>

          <Apartado titulo="Finalidad y base jurídica">
            <ul>
              <li>
                <strong>Darte acceso a la herramienta y gestionar tu cuenta</strong> (invitación, inicio de sesión,
                recuperación de contraseña): es necesario para prestar el servicio que ha contratado el responsable o al
                que te ha dado acceso (art. 6.1.b y 6.1.f del RGPD).
              </li>
              <li>
                <strong>Proteger las cuentas</strong> frente a accesos indebidos, con el registro de accesos y los límites
                de intentos: interés legítimo del responsable en la seguridad del servicio (art. 6.1.f).
              </li>
              <li>
                <strong>Llevar el cuaderno de explotación</strong> y los registros de tratamientos fitosanitarios que
                exige la normativa agraria: cumplimiento de una obligación legal (art. 6.1.c).
              </li>
            </ul>
            <p>No se toman decisiones automatizadas sobre las personas ni se elaboran perfiles, y no se usan los datos con fines publicitarios.</p>
          </Apartado>

          <Apartado titulo="Destinatarios">
            <p>Los datos no se ceden a terceros salvo obligación legal. Para prestar el servicio intervienen:</p>
            <ul>
              <li>El encargado del tratamiento indicado arriba.</li>
              <li>Alojamiento de servidores y base de datos: <Dato config={c} clave="proveedor_alojamiento" />.</li>
              <li>Envío de emails (invitaciones y recuperación de contraseña): <Dato config={c} clave="proveedor_correo" />.</li>
              <li>
                Open-Meteo, al que se envían únicamente las coordenadas de cada parcela para obtener su clima, sin ningún
                dato de las personas.
              </li>
              <li>
                El Instituto Geográfico Nacional, cuyos servidores reciben la dirección IP de tu navegador cuando se
                muestra el mapa de sensores.
              </li>
            </ul>
            <p>No están previstas transferencias internacionales de datos fuera del Espacio Económico Europeo.</p>
          </Apartado>

          <Apartado titulo="Cuánto tiempo se conservan">
            <ul>
              <li>Datos de la cuenta: mientras la cuenta exista. Al eliminarla se borran nombre, email y teléfono.</li>
              <li>Registro de accesos: 90 días.</li>
              <li>Enlaces de invitación y de recuperación: caducan a los 7 días y a la hora, respectivamente.</li>
              <li>
                Datos de la explotación: mientras la parcela exista en la herramienta y, en el caso de los tratamientos,
                al menos el plazo de conservación que exige la normativa del cuaderno de explotación.
              </li>
              <li>Copias de seguridad: se renuevan de forma periódica y las antiguas se eliminan.</li>
            </ul>
          </Apartado>

          <Apartado titulo="Tus derechos">
            <p>
              Puedes pedir el acceso a tus datos, su rectificación o supresión, la limitación u oposición a su tratamiento
              y su portabilidad, escribiendo a <Dato config={c} clave="titular_email" />. Desde la sección «Mi cuenta»
              puedes cambiar tu contraseña y cerrar tus sesiones abiertas.
            </p>
            <p>
              Si consideras que no se han atendido tus derechos, puedes reclamar ante la{' '}
              <a href="https://www.aepd.es" className="underline">Agencia Española de Protección de Datos (AEPD)</a>.
            </p>
          </Apartado>

          <Apartado titulo="Seguridad">
            <p>
              La conexión va cifrada, las contraseñas se guardan de forma irreversible, los intentos de acceso están
              limitados y cada persona solo ve las parcelas a las que se le ha dado acceso.
            </p>
          </Apartado>
        </>
      )}
    </PaginaLegal>
  );
}

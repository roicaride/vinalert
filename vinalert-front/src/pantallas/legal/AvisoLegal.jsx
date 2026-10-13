import { Link } from 'react-router-dom';

import PaginaLegal, { Apartado, Dato } from './PaginaLegal';

/** Aviso legal: la informacion general que exige el art. 10 de la LSSI. */
export default function AvisoLegal() {
  return (
    <PaginaLegal titulo="Aviso legal">
      {(c) => (
        <>
          <Apartado titulo="Titular del sitio web">
            <p>
              En cumplimiento del artículo 10 de la Ley 34/2002, de servicios de la sociedad de la información y de
              comercio electrónico (LSSI), se informa de que este sitio web y la herramienta Viñalert son de:
            </p>
            <ul>
              <li>Titular: <Dato config={c} clave="titular_nombre" /></li>
              <li>NIF / CIF: <Dato config={c} clave="titular_nif" /></li>
              <li>Domicilio: <Dato config={c} clave="titular_domicilio" /></li>
              <li>Email: <Dato config={c} clave="titular_email" /></li>
              <li>Teléfono: <Dato config={c} clave="titular_telefono" /></li>
              <li>Datos registrales: <Dato config={c} clave="titular_registro" /></li>
            </ul>
            <p>
              El desarrollo y el mantenimiento técnico los realiza <Dato config={c} clave="encargado_nombre" /> por
              encargo del titular.
            </p>
          </Apartado>

          <Apartado titulo="Objeto">
            <p>
              Viñalert es una herramienta de viticultura de precisión: recoge las lecturas de los sensores instalados en
              las parcelas, el clima de cada parcela y el cuaderno de tratamientos, y los presenta para su análisis. Es de
              uso privado del titular y de las personas a las que este da acceso.
            </p>
          </Apartado>

          <Apartado titulo="Acceso">
            <p>
              El acceso a la herramienta está restringido: solo pueden entrar las personas invitadas por el titular o
              por quien gestiona cada parcela. Cada cuenta es personal y su titular es responsable de custodiar la
              contraseña. Las condiciones de uso están en <Link to="/condiciones" className="underline">Condiciones de uso</Link>.
            </p>
          </Apartado>

          <Apartado titulo="Propiedad intelectual e industrial">
            <p>
              El diseño, el código y la marca Viñalert están protegidos por la normativa de propiedad intelectual e
              industrial. Los datos de cada explotación (parcelas, lecturas, análisis y tratamientos) pertenecen a quien
              los genera y no se ceden a terceros por usar la herramienta.
            </p>
            <p>Se usan datos de terceros con licencia abierta, que se citan como exigen sus licencias:</p>
            <ul>
              <li>
                Datos meteorológicos: <a href="https://open-meteo.com" className="underline">Open-Meteo.com</a>, bajo
                licencia CC BY 4.0.
              </li>
              <li>
                Mapas y ortofotos: PNOA cedido por © <a href="https://www.ign.es" className="underline">Instituto Geográfico
                Nacional</a>, bajo licencia CC BY 4.0.
              </li>
            </ul>
          </Apartado>

          <Apartado titulo="Responsabilidad">
            <p>
              Los datos meteorológicos proceden de modelos y estaciones de terceros y tienen carácter orientativo. Las
              lecturas de los sensores dependen del estado de los equipos de campo. Las decisiones agronómicas y de
              tratamiento, y la veracidad de lo que se anota en el cuaderno, corresponden a quien las toma y las anota.
            </p>
            <p>
              El titular procura que el servicio esté disponible y funcione correctamente, pero no garantiza que no haya
              interrupciones o errores, y no responde de los daños que se deriven de ellos más allá de lo que establezca la
              ley.
            </p>
          </Apartado>

          <Apartado titulo="Legislación aplicable">
            <p>
              Este aviso se rige por la legislación española. Para cualquier controversia, las partes se someten a los
              juzgados y tribunales que correspondan conforme a la ley.
            </p>
          </Apartado>
        </>
      )}
    </PaginaLegal>
  );
}

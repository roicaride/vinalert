import { Link } from 'react-router-dom';

import { CuadroMarca, Marca } from '../../marca/Marca';
import { SECCIONES } from '../../secciones';

/**
 * La puerta, comun a todas las pantallas sin sesion: entrar, recuperar la
 * contraseña, restablecerla y aceptar una invitacion.
 *
 * Es donde la marca puede hablar sin quitarle sitio a nada: el simbolo grande a
 * la izquierda y, debajo, la lista de lo que hay dentro. Esa lista sale de
 * SECCIONES —la misma fuente que la navegacion— para que nunca prometa una
 * pantalla que no existe.
 */
export default function MarcoAcceso({ rotulo, titulo, children }) {
  return (
    <div className="grid min-h-screen bg-linea md:grid-cols-[1.15fr_1fr] md:gap-px">
      <section className="flex flex-col justify-between gap-10 bg-lousa px-8 py-10 md:px-12 md:py-14">
        <Link to="/" className="flex w-fit items-center gap-3">
          <CuadroMarca lado={34} tinta="bg-oso" />
          <span className="font-mono text-lg font-medium tracking-[0.06em] text-oso">Viñalert</span>
        </Link>

        <div className="max-w-lg">
          <p className="rotulo">Sensores en campo</p>
          <h2 className="mt-4 font-mono text-3xl leading-[1.15] font-medium tracking-[-0.02em] text-oso md:text-[2.6rem]">
            Lo que el suelo está haciendo ahora mismo.
          </h2>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-oso-2">
            Humedad y temperatura del suelo, el clima de la parcela y el cuaderno de tratamientos,
            en la misma pantalla y con la misma hora.
          </p>
        </div>

        <div className="border-t border-linea pt-5">
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {SECCIONES.map((s) => (
              <li key={s.ruta} className="rotulo flex items-center gap-2 text-oso-3">
                <Marca alto={9} className="text-vina" />
                {s.etiqueta}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="flex items-center justify-center bg-lousa px-6 py-10 md:px-10">
        <div className="w-full max-w-sm">
          <p className="rotulo">{rotulo}</p>
          <h1 className="mt-3 font-mono text-xl font-medium tracking-[-0.01em] text-oso">{titulo}</h1>
          {children}
        </div>
      </section>
    </div>
  );
}

/** Un enlace de texto dentro de las pantallas de acceso. */
export function EnlaceAcceso({ to, children }) {
  return (
    <Link to={to} className="text-sm text-oso-2 underline underline-offset-2 hover:text-oso">
      {children}
    </Link>
  );
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { CuadroMarca, Filigrana, Marca } from '../marca/Marca';
import { claseBoton } from '../ui/claseBoton';
import { Testigo } from '../ui/Estados';
import { Rejilla } from '../ui/Panel';
import { CORREO_CONTACTO, EQUIPO, IDIOMAS } from './portada/textos';
import { useIdioma } from './portada/useIdioma';

/**
 * La portada: lo que ve quien todavia no es usuario.
 *
 * Habla con el mismo lenguaje que la aplicacion —LOUSA, rejilla de lineas,
 * Mono para lo que mide— para que pasar de aqui al panel se sienta como
 * entrar en el mismo sitio y no como cambiar de web.
 *
 * El gesto de la portada es la lista de nodos de la derecha: es el producto
 * contado con su propio vocabulario (N-01 ─ ONLINE), no una ilustracion.
 * Esta marcada como vista de ejemplo porque no son datos de nadie.
 */

const ANCHO = 'px-6 md:px-12';

function useHora() {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

/** La cabecera comun de cada seccion: rotulo, titulo y, si hay, una entradilla. */
function CabeceraSeccion({ rotulo, titulo, texto }) {
  return (
    <header className={`border-b border-linea ${ANCHO} py-12 md:py-16`}>
      <p className="rotulo">{rotulo}</p>
      <h2 className="mt-4 max-w-3xl font-mono text-2xl leading-tight font-medium tracking-[-0.02em] text-oso md:text-4xl">
        {titulo}
      </h2>
      {texto && <p className="mt-4 max-w-2xl text-base leading-relaxed text-oso-2">{texto}</p>}
    </header>
  );
}

function SelectorIdioma({ codigo, cambiar, etiqueta }) {
  return (
    <div role="group" aria-label={etiqueta} className="flex border border-linea">
      {IDIOMAS.map((i) => (
        <button
          key={i.codigo}
          type="button"
          lang={i.codigo}
          aria-label={i.nombre}
          aria-pressed={codigo === i.codigo}
          onClick={() => cambiar(i.codigo)}
          className={`border-r border-linea px-2 py-1 font-mono text-[10px] font-medium tracking-[0.12em] transition-colors last:border-r-0 ${
            codigo === i.codigo ? 'bg-oso text-lousa' : 'text-oso-3 hover:bg-alza hover:text-oso'
          }`}
        >
          {i.corto}
        </button>
      ))}
    </div>
  );
}

export default function Portada() {
  const [codigo, t, cambiarIdioma] = useIdioma();
  const hora = useHora();
  const correo = `mailto:${CORREO_CONTACTO}?subject=${encodeURIComponent(t.contacto.asunto)}`;

  const nodos = [
    { id: 'N-01', valor: t.portada.online, tinta: 'text-brote', tono: 'brote' },
    { id: 'N-02', valor: t.portada.online, tinta: 'text-brote', tono: 'brote' },
    { id: 'N-03', valor: t.portada.inactivo, tinta: 'text-oso-3', tono: 'neutro' },
    { id: 'N-04', valor: hora, tinta: 'text-oso-2', tono: 'neutro' },
    { id: t.portada.pasarela, valor: '868 MHz', tinta: 'text-oso-2', tono: 'vina' },
  ];

  const secciones = [
    ['#como-funciona', t.nav.como],
    ['#ofrecemos', t.nav.ofrecemos],
    ['#equipo', t.nav.equipo],
    ['#contacto', t.nav.contacto],
  ];

  return (
    <div className="min-h-screen bg-lousa text-oso">
      {/* ------------------------------------------------------------------ */}
      {/* Cabecera fija: marca, secciones, idioma y acceso.                   */}
      {/* ------------------------------------------------------------------ */}
      <header className="sticky top-0 z-40 flex items-stretch justify-between border-b border-linea bg-lousa/95 backdrop-blur-sm">
        <Link to="/" className="flex items-center gap-2.5 border-r border-linea px-4 py-3 md:px-6">
          <CuadroMarca lado={26} tinta="bg-oso" />
          <span className="hidden font-mono text-[15px] font-medium tracking-[0.06em] text-oso sm:inline">
            Viñalert
          </span>
        </Link>

        <nav aria-label={t.nav.principal} className="hidden items-stretch lg:flex">
          {secciones.map(([href, texto]) => (
            <a
              key={href}
              href={href}
              className="flex items-center px-5 font-mono text-[11px] font-medium tracking-[0.16em] text-oso-2 uppercase transition-colors hover:bg-alza hover:text-oso"
            >
              {texto}
            </a>
          ))}
        </nav>

        <div className="flex items-stretch">
          <div className="flex items-center border-l border-linea px-3 md:px-5">
            <SelectorIdioma codigo={codigo} cambiar={cambiarIdioma} etiqueta={t.nav.idioma} />
          </div>
          <div className="flex items-center gap-4 border-l border-linea px-4 md:px-5">
            <Link
              to="/login"
              className="font-mono text-[11px] font-medium tracking-[0.16em] text-oso uppercase underline-offset-4 hover:text-brote hover:underline"
            >
              {t.nav.entrar}
            </Link>
            {/* El hidden va en un envoltorio: en el propio enlace chocaria con el
                inline-flex de claseBoton y ganaria el que la hoja pone despues. */}
            <span className="hidden sm:flex">
              <Link to="/login?modo=registro" className={claseBoton('fantasma')}>
                {t.nav.crear}
              </Link>
            </span>
          </div>
        </div>
      </header>

      <main>
        {/* ---------------------------------------------------------------- */}
        {/* Portada.                                                          */}
        {/* ---------------------------------------------------------------- */}
        <section className="grid gap-px border-b border-linea bg-linea lg:grid-cols-[1.35fr_1fr]">
          <div className={`flex flex-col justify-center bg-lousa ${ANCHO} py-16 md:py-28`}>
            <p className="rotulo">{t.portada.rotulo}</p>
            <h1 className="mt-6 max-w-2xl font-mono text-[2.6rem] leading-[1.05] font-medium tracking-[-0.03em] text-oso md:text-7xl">
              {t.portada.titulo}
            </h1>
            <p className="mt-8 max-w-xl text-lg leading-relaxed text-oso-2">{t.portada.texto}</p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link to="/login?modo=registro" className={claseBoton('solido', 'lg')}>
                {t.nav.crear}
              </Link>
              <a href={correo} className={claseBoton('fantasma', 'lg')}>
                {t.portada.demo}
              </a>
            </div>
          </div>

          <div className="relative flex flex-col bg-lousa">
            <Filigrana alto={320} />
            <div className="relative flex items-center justify-between border-b border-linea px-6 py-3">
              <p className="rotulo">{t.portada.ejemplo}</p>
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className="size-2 animate-pulse bg-brote" />
                <span className="font-mono text-[11px] tabular-nums text-oso-3">{hora}</span>
              </span>
            </div>
            <ul className="relative flex flex-1 flex-col justify-center divide-y divide-linea px-6 py-4">
              {nodos.map((n, i) => (
                <li
                  key={n.id}
                  className="flex items-center justify-between gap-4 py-5 motion-safe:animate-[encender_.45s_ease-out_both]"
                  style={{ animationDelay: `${150 + i * 110}ms` }}
                >
                  <span className="flex items-center gap-3">
                    <Testigo tono={n.tono} />
                    <span className="font-mono text-sm tracking-[0.14em] text-oso-2 uppercase">{n.id}</span>
                  </span>
                  <span className={`font-mono text-sm tracking-[0.14em] tabular-nums uppercase ${n.tinta}`}>
                    {n.valor}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Como funciona. Es una secuencia de verdad, por eso va numerada.   */}
        {/* ---------------------------------------------------------------- */}
        <section id="como-funciona" className="scroll-mt-14 border-b border-linea">
          <CabeceraSeccion rotulo={t.como.rotulo} titulo={t.como.titulo} texto={t.como.texto} />
          <Rejilla cols="sm:grid-cols-2 lg:grid-cols-4">
            {t.como.pasos.map((p, i) => (
              <div key={p.titulo} className={`bg-lousa ${ANCHO} py-10 md:px-8`}>
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-4xl font-medium tabular-nums text-brote">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {i < t.como.pasos.length - 1 && (
                    <span aria-hidden="true" className="hidden font-mono text-lg text-oso-4 lg:inline">
                      →
                    </span>
                  )}
                </div>
                <h3 className="mt-6 font-mono text-base font-medium tracking-[0.06em] text-oso">{p.titulo}</h3>
                <p className="mt-3 text-sm leading-relaxed text-oso-2">{p.texto}</p>
              </div>
            ))}
          </Rejilla>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Que ofrecemos.                                                    */}
        {/* ---------------------------------------------------------------- */}
        <section id="ofrecemos" className="scroll-mt-14 border-b border-linea">
          <CabeceraSeccion rotulo={t.ofrecemos.rotulo} titulo={t.ofrecemos.titulo} />
          <Rejilla cols="sm:grid-cols-2 lg:grid-cols-4">
            {t.ofrecemos.items.map((item) => (
              <div key={item.titulo} className="bg-lousa px-6 py-8 transition-colors hover:bg-alza md:px-8">
                <Testigo tono="brote" />
                <h3 className="mt-5 font-mono text-sm font-medium tracking-[0.04em] text-oso">{item.titulo}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-oso-2">{item.texto}</p>
              </div>
            ))}
          </Rejilla>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Ficha tecnica: la marca grande a un lado, los datos al otro.      */}
        {/* ---------------------------------------------------------------- */}
        <section className="grid gap-px border-b border-linea bg-linea md:grid-cols-2">
          <div className={`flex flex-col justify-between gap-12 bg-lousa ${ANCHO} py-12 md:py-16`}>
            <div>
              <p className="rotulo">{t.ficha.rotulo}</p>
              <h2 className="mt-4 font-mono text-2xl font-medium tracking-[-0.02em] text-oso md:text-4xl">
                {t.ficha.titulo}
              </h2>
            </div>
            <Marca alto={180} className="text-vina" />
          </div>
          <dl className={`divide-y divide-linea bg-lousa ${ANCHO} py-8 md:py-12`}>
            {t.ficha.filas.map(([clave, valor]) => (
              <div key={clave} className="flex items-baseline justify-between gap-6 py-4">
                <dt className="rotulo">{clave}</dt>
                <dd className="text-right font-mono text-sm text-oso">{valor}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Quienes somos. Las personas se rellenan en textos.js.             */}
        {/* ---------------------------------------------------------------- */}
        <section id="equipo" className="scroll-mt-14 border-b border-linea">
          <CabeceraSeccion rotulo={t.equipo.rotulo} titulo={t.equipo.titulo} texto={t.equipo.texto} />
          <Rejilla cols="md:grid-cols-3">
            {EQUIPO.map((persona, i) => {
              const hueco = !persona.nombre;
              return (
                <article key={i} className={`flex items-start gap-5 bg-lousa ${ANCHO} py-10 md:px-8`}>
                  <CuadroMarca lado={56} tinta={persona.tinta} />
                  <div className="min-w-0">
                    <h3 className={`font-mono text-base font-medium ${hueco ? 'text-oso-3' : 'text-oso'}`}>
                      {persona.nombre ?? t.equipo.nombre}
                    </h3>
                    <p className="rotulo mt-1.5">{persona.cargo ?? t.equipo.cargo}</p>
                    <p className={`mt-3 text-sm leading-relaxed ${hueco ? 'text-oso-4' : 'text-oso-2'}`}>
                      {persona.linea ?? t.equipo.linea}
                    </p>
                  </div>
                </article>
              );
            })}
          </Rejilla>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Contacto.                                                         */}
        {/* ---------------------------------------------------------------- */}
        <section id="contacto" className="grid scroll-mt-14 gap-px bg-linea md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="grid min-h-56 place-items-center bg-vina">
            <Marca alto={140} className="text-oso" />
          </div>
          <div className={`bg-lousa ${ANCHO} py-14 md:py-20`}>
            <p className="rotulo">{t.contacto.rotulo}</p>
            <h2 className="mt-4 font-mono text-3xl font-medium tracking-[-0.02em] text-oso md:text-5xl">
              {t.contacto.titulo}
            </h2>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-oso-2">{t.contacto.texto}</p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <a href={correo} className={claseBoton('solido', 'lg')}>
                {t.portada.demo}
              </a>
              <span className="font-mono text-sm text-oso-3">{CORREO_CONTACTO}</span>
            </div>
          </div>
        </section>
      </main>

      <footer className={`flex flex-wrap items-center justify-between gap-4 border-t border-linea ${ANCHO} py-6`}>
        <div className="flex items-center gap-3">
          <Marca alto={14} className="text-oso-4" />
          <span className="rotulo text-oso-4">
            © {new Date().getFullYear()} Viñalert · {t.pie.derechos}
          </span>
        </div>
        <div className="flex items-center gap-5">
          <Link to="/login" className="rotulo text-oso-3 hover:text-brote">
            {t.nav.entrar}
          </Link>
          <Link to="/login?modo=registro" className="rotulo text-oso-3 hover:text-brote">
            {t.nav.crear}
          </Link>
        </div>
      </footer>
    </div>
  );
}

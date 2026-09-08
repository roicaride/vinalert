import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { crearParcela } from '../api/parcelas';
import MensajeError from '../errores/MensajeError';
import { CuadroMarca, Firma } from '../marca/Marca';
import { useSesion } from '../sesion/SesionContext';
import Boton, { Enlace } from '../ui/Boton';
import Campo from '../ui/Campo';
import { Marbete, Vacio } from '../ui/Estados';
import { Encabezado } from '../ui/Panel';

/**
 * La eleccion de parcela.
 *
 * Cada parcela es una celda de la rejilla con su cuadrado de marca delante: en
 * VIÑA las que gestionas, apagado las que solo puedes leer. El color del
 * cuadrado y el marbete dicen lo mismo por dos vias distintas, y eso es
 * deliberado —quien no distingue el verde sigue leyendo "solo lectura".
 */
export default function SeleccionParcela({ parcelas }) {
  const navigate = useNavigate();
  const { usuario, cerrarSesion } = useSesion();

  const [mostrandoCrear, setMostrandoCrear] = useState(false);
  const [nombre, setNombre] = useState('');
  const [tipoCultivo, setTipoCultivo] = useState('Viñedo');
  const [variedad, setVariedad] = useState('Albariño');
  const [superficie, setSuperficie] = useState('');
  const [latitud, setLatitud] = useState('');
  const [longitud, setLongitud] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const esAdmin = usuario?.rol === 'admin';

  const guardarParcela = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      const nueva = await crearParcela({
        nombre,
        tipo_cultivo: tipoCultivo || 'Viñedo',
        variedad: variedad || null,
        superficie_total_m2: superficie ? parseFloat(superficie) : null,
        latitud: latitud ? parseFloat(latitud) : null,
        longitud: longitud ? parseFloat(longitud) : null,
      });
      // Llevar directo a la configuración de la nueva parcela para añadir sensores y miembros
      navigate(`/p/${nueva.id}/configuracion`);
    } catch (err) {
      setError(err);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-lousa text-oso">
      <header className="flex shrink-0 flex-wrap items-stretch justify-between border-b border-linea">
        <div className="flex items-center border-r border-linea px-5 py-3">
          <Firma />
        </div>
        <div className="flex items-stretch">
          <div className="hidden items-center gap-3 border-l border-linea px-5 py-3 sm:flex">
            {esAdmin && <Marbete tono="ambar">Administrador</Marbete>}
            <div className="min-w-0">
              <p className="truncate text-sm leading-tight text-oso">{usuario?.nombre}</p>
              <p className="mt-0.5 truncate font-mono text-[11px] text-oso-3">{usuario?.email}</p>
            </div>
          </div>
          <div className="flex items-center border-l border-linea px-5 py-3">
            <Enlace onClick={() => { cerrarSesion(); navigate('/login'); }}>Cerrar sesión</Enlace>
          </div>
        </div>
      </header>

      <Encabezado
        titulo={esAdmin ? 'Todas las parcelas' : 'Elige una parcela'}
        descripcion="Abre una finca para ver su monitorización y su cuaderno de campo."
      >
        {esAdmin && (
          <Boton
            tono={mostrandoCrear ? 'sutil' : 'fantasma'}
            onClick={() => setMostrandoCrear(!mostrandoCrear)}
          >
            {mostrandoCrear ? 'Cancelar' : 'Nueva parcela'}
          </Boton>
        )}
      </Encabezado>

      {mostrandoCrear && (
        <section className="border-b border-linea p-6">
          <div className="border border-linea">
            <header className="border-b border-linea px-4 py-3">
              <h2 className="rotulo">Crear parcela</h2>
              <p className="mt-1.5 text-sm text-oso-2">
                Sus sensores y sus miembros se configuran justo después de crearla.
              </p>
            </header>

            <form className="space-y-5 p-4" onSubmit={guardarParcela}>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                <Campo
                  etiqueta="Nombre de la parcela"
                  id="nombre_parcela"
                  type="text"
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej. Finca Monte Alto"
                />
                <Campo
                  etiqueta="Variedad de uva"
                  id="variedad_parcela"
                  type="text"
                  value={variedad}
                  onChange={(e) => setVariedad(e.target.value)}
                  placeholder="Ej. Albariño, Mencía"
                />
                <Campo
                  etiqueta="Tipo de cultivo"
                  id="cultivo_parcela"
                  type="text"
                  value={tipoCultivo}
                  onChange={(e) => setTipoCultivo(e.target.value)}
                />
                <Campo
                  etiqueta="Superficie (m²)"
                  id="superficie_parcela"
                  type="number"
                  step="any"
                  value={superficie}
                  onChange={(e) => setSuperficie(e.target.value)}
                  placeholder="15000"
                />
                <Campo
                  etiqueta="Latitud"
                  id="latitud_parcela"
                  type="number"
                  step="any"
                  value={latitud}
                  onChange={(e) => setLatitud(e.target.value)}
                  placeholder="42.3150"
                  ayuda="Con las coordenadas se pide el clima a Open-Meteo."
                />
                <Campo
                  etiqueta="Longitud"
                  id="longitud_parcela"
                  type="number"
                  step="any"
                  value={longitud}
                  onChange={(e) => setLongitud(e.target.value)}
                  placeholder="-8.6120"
                />
              </div>

              <MensajeError error={error} textoNoEncontrado="No se pudo crear la parcela." />

              <div className="flex justify-end gap-3 border-t border-linea pt-4">
                <Boton tono="sutil" onClick={() => setMostrandoCrear(false)}>
                  Cancelar
                </Boton>
                <Boton tono="solido" type="submit" disabled={guardando}>
                  {guardando ? 'Creando…' : 'Crear parcela'}
                </Boton>
              </div>
            </form>
          </div>
        </section>
      )}

      <main className="flex-1 p-6">
        {parcelas.length === 0 ? (
          <Vacio titulo={esAdmin ? 'Ninguna parcela registrada' : 'Sin parcelas asignadas'}>
            <p className="max-w-sm text-sm text-oso-3">
              {esAdmin
                ? 'Pulsa «Nueva parcela» para dar de alta la primera.'
                : 'Todavía no tienes ninguna parcela asignada. Pide acceso a tu administrador.'}
            </p>
          </Vacio>
        ) : (
          // La rejilla de huecos de 1px no sirve aquí: el número de parcelas no
          // llena la última fila y el fondo de las líneas se vería como un bloque
          // vacío. Con el borde en cada celda, una fila a medias simplemente
          // termina.
          <div className="border-t border-l border-linea">
            <div className="grid sm:grid-cols-2 xl:grid-cols-3">
              {parcelas.map((p) => {
                const soloLectura = p.mi_rol === 'lectura';
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => navigate(`/p/${p.id}`)}
                    className="group flex flex-col gap-4 border-r border-b border-linea bg-lousa p-5 text-left transition-colors hover:bg-alza"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <CuadroMarca lado={36} tinta={soloLectura ? 'bg-linea-viva' : 'bg-vina'} />
                      <Marbete tono={soloLectura ? 'neutro' : 'brote'}>
                        {soloLectura ? 'Solo lectura' : 'Gestor'}
                      </Marbete>
                    </div>

                    <div className="min-w-0">
                      <p className="truncate font-mono text-base font-medium text-oso group-hover:text-brote">
                        {p.nombre}
                      </p>
                      <p className="rotulo mt-1.5 truncate">
                        Parcela {p.id}
                        {p.variedad && ` · ${p.tipo_cultivo || 'Viñedo'} · ${p.variedad}`}
                      </p>
                    </div>

                    {p.superficie_total_m2 && (
                      <p className="border-t border-linea pt-3 font-mono text-xs tabular-nums text-oso-3">
                        {(p.superficie_total_m2 / 10000).toFixed(2)} ha · {p.superficie_total_m2} m²
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

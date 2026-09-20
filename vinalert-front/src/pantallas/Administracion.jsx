import { useEffect, useMemo, useState } from 'react';

import { listarUsuarios } from '../api/admin';
import MensajeError from '../errores/MensajeError';
import CabeceraCuenta from '../layout/CabeceraCuenta';
import Boton from '../ui/Boton';
import { claseControl } from '../ui/Campo';
import { Aviso, Cargando, Marbete } from '../ui/Estados';
import { Cifra, Encabezado, Rejilla } from '../ui/Panel';
import { descargarCsv, exportarExcelMultilibro } from '../utils/exportar';

/**
 * Administracion: todas las cuentas de Viñalert, para quien administra la
 * plataforma. Es la forma de ver quien se ha registrado —y sacarlo a Excel—
 * sin entrar en la base de datos a mano.
 *
 * El permiso lo decide el backend (GET /admin/usuarios da 403 a cualquiera
 * que no sea el superadmin): esta pantalla solo traduce ese 403 a una frase.
 */

const CABECERAS = ['Nombre', 'Email', 'Teléfono', 'Rol', 'Fecha de alta', 'Parcelas'];

// La fecha llega como "2026-09-18T10:15:00", hora local sin zona. Se trocea
// el texto en vez de pasar por Date: asi no hay conversion de zona horaria
// que la mueva de dia segun donde este el navegador.
function partesFecha(iso) {
  const [fecha, hora = ''] = iso.split('T');
  const [a, m, d] = fecha.split('-');
  return { a, m, d, hora: hora.slice(0, 5) };
}

function fechaCorta(iso) {
  const { a, m, d } = partesFecha(iso);
  return `${Number(d)}/${Number(m)}/${a}`;
}

function fechaExportacion(iso) {
  if (!iso) return '';
  const { a, m, d, hora } = partesFecha(iso);
  return `${d}/${m}/${a} ${hora}`;
}

/** Sin mayusculas ni tildes: «XOAN» encuentra a «Xoán». */
function normalizar(texto) {
  return (texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function hoyIso() {
  const h = new Date();
  const dos = (n) => String(n).padStart(2, '0');
  return `${h.getFullYear()}-${dos(h.getMonth() + 1)}-${dos(h.getDate())}`;
}

export default function Administracion() {
  const [cuentas, setCuentas] = useState(null);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    let vigente = true;
    listarUsuarios()
      .then((c) => { if (vigente) setCuentas(c); })
      .catch((e) => { if (vigente) setError(e); });
    return () => { vigente = false; };
  }, []);

  const visibles = useMemo(() => {
    if (!cuentas) return [];
    const q = normalizar(busqueda.trim());
    if (!q) return cuentas;
    return cuentas.filter((c) => normalizar(c.nombre).includes(q) || normalizar(c.email).includes(q));
  }, [cuentas, busqueda]);

  const resumen = useMemo(() => {
    const lista = cuentas ?? [];
    const hace30 = new Date();
    hace30.setDate(hace30.getDate() - 30);
    const limite = hace30.toISOString().slice(0, 10);
    return {
      total: lista.length,
      recientes: lista.filter((c) => c.creado_en && c.creado_en.slice(0, 10) >= limite).length,
      sinParcela: lista.filter((c) => c.n_parcelas === 0).length,
    };
  }, [cuentas]);

  const filasExportacion = () =>
    visibles.map((c) => [c.nombre, c.email, c.telefono ?? '', c.rol, fechaExportacion(c.creado_en), c.n_parcelas]);

  const exportarExcel = () =>
    exportarExcelMultilibro(`vinalert_cuentas_${hoyIso()}`, [
      { nombre: 'Cuentas', cabeceras: CABECERAS, filas: filasExportacion() },
    ]);

  const exportarCsv = () => descargarCsv(`vinalert_cuentas_${hoyIso()}`, CABECERAS, filasExportacion());

  let cuerpo;
  if (error?.response?.status === 403) {
    cuerpo = (
      <div className="p-6">
        <Aviso tono="ambar">
          Esta sección es solo para el administrador de Viñalert.
        </Aviso>
      </div>
    );
  } else if (error) {
    cuerpo = (
      <div className="p-6">
        <MensajeError error={error} textoNoEncontrado="No se pudo cargar el listado de cuentas." />
      </div>
    );
  } else if (cuentas === null) {
    cuerpo = <Cargando texto="Cargando cuentas" />;
  } else {
    cuerpo = (
      <>
        <section className="border-b border-linea">
          <Rejilla cols="grid-cols-1 sm:grid-cols-3">
            <div className="bg-lousa px-6 py-5">
              <Cifra valor={resumen.total} etiqueta="Cuentas" />
            </div>
            <div className="bg-lousa px-6 py-5">
              <Cifra valor={resumen.recientes} etiqueta="Altas en los últimos 30 días" tinta="text-brote" />
            </div>
            <div className="bg-lousa px-6 py-5">
              <Cifra valor={resumen.sinParcela} etiqueta="Sin ninguna parcela" />
            </div>
          </Rejilla>
        </section>

        <div className="flex flex-wrap items-end gap-4 border-b border-linea bg-alza px-6 py-3">
          {/* El ancho va en el envoltorio: en el input chocaria con el w-full
              de claseControl y ganaria el que la hoja ponga despues. */}
          <div className="w-full max-w-sm">
            <label htmlFor="buscar-cuentas" className="rotulo block">
              Buscar
            </label>
            <input
              id="buscar-cuentas"
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Nombre o email"
              className={`${claseControl} mt-1.5 py-1.5 text-xs`}
            />
          </div>
          {busqueda && (
            <p className="pb-2 font-mono text-xs text-oso-3">
              {visibles.length} de {cuentas.length}
            </p>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="border-b border-linea bg-alza">
                <th className="rotulo px-4 py-3 font-medium">Nombre</th>
                <th className="rotulo px-4 py-3 font-medium">Email</th>
                <th className="rotulo px-4 py-3 font-medium">Rol</th>
                <th className="rotulo px-4 py-3 font-medium">Alta</th>
                <th className="rotulo px-4 py-3 text-right font-medium">Parcelas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linea">
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center">
                    <span className="rotulo">
                      {busqueda ? `Ninguna cuenta coincide con «${busqueda}»` : 'Todavía no hay cuentas'}
                    </span>
                  </td>
                </tr>
              )}
              {visibles.map((c) => (
                <tr key={c.id} className="transition-colors hover:bg-alza">
                  <td className="px-4 py-2.5 text-sm text-oso">{c.nombre}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-oso-2">{c.email}</td>
                  <td className="px-4 py-2.5">
                    <Marbete tono={c.rol === 'admin' ? 'ambar' : 'neutro'}>
                      {c.rol === 'admin' ? 'Administrador' : 'Agricultor'}
                    </Marbete>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap text-oso-3">
                    {c.creado_en ? (
                      <>
                        {fechaCorta(c.creado_en)}
                        <span className="text-oso-4">{` · ${partesFecha(c.creado_en).hora}`}</span>
                      </>
                    ) : (
                      <span title="Cuenta anterior a que se guardase la fecha de alta">—</span>
                    )}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right font-mono text-xs tabular-nums ${
                      c.n_parcelas ? 'text-oso' : 'text-oso-4'
                    }`}
                  >
                    {c.n_parcelas}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-lousa text-oso">
      <CabeceraCuenta />
      <Encabezado
        titulo="Administración"
        descripcion="Todas las cuentas registradas en Viñalert. Las contraseñas no se pueden leer —ni desde aquí ni desde la base de datos—, así que no aparecen ni en la tabla ni en la exportación."
      >
        {cuentas && (
          <>
            <Boton tono="sutil" onClick={exportarExcel} disabled={!visibles.length}>
              Exportar Excel
            </Boton>
            <Boton tono="sutil" onClick={exportarCsv} disabled={!visibles.length}>
              Exportar CSV
            </Boton>
          </>
        )}
      </Encabezado>
      <main className="flex-1">{cuerpo}</main>
    </div>
  );
}

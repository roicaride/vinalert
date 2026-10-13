import { Fragment, useEffect, useMemo, useState } from 'react';

import { invitarCliente, listarUsuarios } from '../../api/admin';
import MensajeError from '../../errores/MensajeError';
import { useSesion } from '../../sesion/SesionContext';
import Boton, { Enlace } from '../../ui/Boton';
import { claseControl } from '../../ui/Campo';
import { Aviso, Cargando, Marbete } from '../../ui/Estados';
import { Cifra, Rejilla } from '../../ui/Panel';
import GestionCuenta from './GestionCuenta';

/**
 * La pestaña Cuentas del panel: todas las cuentas de Viñalert, con lo que el
 * superadmin puede hacer con cada una (ver GestionCuenta) y su exportacion.
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

export default function Cuentas() {
  const { usuario } = useSesion();
  const [abierta, setAbierta] = useState(null);
  const [cuentas, setCuentas] = useState(null);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [emailInvitado, setEmailInvitado] = useState('');
  const [nombreInvitado, setNombreInvitado] = useState('');
  const [invitando, setInvitando] = useState(false);
  const [avisoInvitacion, setAvisoInvitacion] = useState(null);
  const [errorInvitacion, setErrorInvitacion] = useState(null);

  const invitar = async (e) => {
    e.preventDefault();
    setAvisoInvitacion(null);
    setErrorInvitacion(null);
    setInvitando(true);
    try {
      const nueva = await invitarCliente(emailInvitado, nombreInvitado);
      setCuentas((prev) => [nueva, ...(prev ?? [])]);
      setAvisoInvitacion(`Invitación enviada a ${nueva.email}.`);
      setEmailInvitado('');
      setNombreInvitado('');
    } catch (err) {
      setErrorInvitacion(err);
    } finally {
      setInvitando(false);
    }
  };

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

  // La libreria de Excel pesa unos 400 KB: se descarga solo al exportar.
  const exportarExcel = async () => {
    const { exportarExcelMultilibro } = await import('../../utils/exportar');
    exportarExcelMultilibro(`vinalert_cuentas_${hoyIso()}`, [
      { nombre: 'Cuentas', cabeceras: CABECERAS, filas: filasExportacion() },
    ]);
  };

  const exportarCsv = async () => {
    const { descargarCsv } = await import('../../utils/exportar');
    descargarCsv(`vinalert_cuentas_${hoyIso()}`, CABECERAS, filasExportacion());
  };

  const actualizar = (nueva) => setCuentas((prev) => prev.map((c) => (c.id === nueva.id ? { ...c, ...nueva } : c)));
  const quitar = (id) => {
    setCuentas((prev) => prev.filter((c) => c.id !== id));
    setAbierta(null);
  };

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

        {/* Alta de clientes: solo por invitacion. El cliente entra sin
            parcelas, crea las suyas e invita a su gente. */}
        <form className="flex flex-wrap items-end gap-4 border-b border-linea px-6 py-4" onSubmit={invitar}>
          <div className="w-full max-w-xs">
            <label htmlFor="email-cliente" className="rotulo block">
              Email del cliente
            </label>
            <input
              id="email-cliente"
              type="email"
              required
              value={emailInvitado}
              onChange={(e) => setEmailInvitado(e.target.value)}
              placeholder="bodega@ejemplo.es"
              className={`${claseControl} mt-1.5`}
            />
          </div>
          <div className="w-full max-w-xs">
            <label htmlFor="nombre-cliente" className="rotulo block">
              Nombre del cliente
            </label>
            <input
              id="nombre-cliente"
              type="text"
              required
              maxLength={120}
              value={nombreInvitado}
              onChange={(e) => setNombreInvitado(e.target.value)}
              placeholder="Bodega o persona"
              className={`${claseControl} mt-1.5`}
            />
          </div>
          <Boton tono="solido" type="submit" disabled={invitando} className="mb-px py-2.5">
            {invitando ? 'Invitando…' : 'Invitar cliente'}
          </Boton>
          {avisoInvitacion && <Aviso tono="brote" role="status" className="w-full">{avisoInvitacion}</Aviso>}
          {errorInvitacion && (
            <div className="w-full">
              <MensajeError error={errorInvitacion} />
            </div>
          )}
        </form>

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
                <th className="rotulo px-4 py-3 font-medium"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linea">
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center">
                    <span className="rotulo">
                      {busqueda ? `Ninguna cuenta coincide con «${busqueda}»` : 'Todavía no hay cuentas'}
                    </span>
                  </td>
                </tr>
              )}
              {visibles.map((c) => (
                <Fragment key={c.id}>
                <tr className="transition-colors hover:bg-alza">
                  <td className="px-4 py-2.5 text-sm text-oso">
                    {c.nombre || <span className="text-oso-4">—</span>}
                    {c.pendiente && <Marbete tono="ambar" className="ml-2">Pendiente</Marbete>}
                    {c.activo === false && <Marbete tono="sangre" className="ml-2">Desactivada</Marbete>}
                    {c.es_superadmin && <Marbete tono="brote" className="ml-2">Superadmin</Marbete>}
                  </td>
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
                  <td className="px-4 py-2.5 text-right">
                    <Enlace
                      aria-expanded={abierta === c.id}
                      onClick={() => setAbierta(abierta === c.id ? null : c.id)}
                    >
                      {abierta === c.id ? 'Cerrar' : 'Gestionar'}
                    </Enlace>
                  </td>
                </tr>
                {abierta === c.id && (
                  <tr>
                    <td colSpan={6} className="border-t border-linea bg-alza p-0">
                      <GestionCuenta
                        cuenta={c}
                        esPropia={c.id === usuario?.id}
                        onCambio={actualizar}
                        onEliminada={() => quitar(c.id)}
                      />
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  return (
    <>
      {cuentas && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-b border-linea px-6 py-3">
          <Boton tono="sutil" onClick={exportarExcel} disabled={!visibles.length}>
            Exportar Excel
          </Boton>
          <Boton tono="sutil" onClick={exportarCsv} disabled={!visibles.length}>
            Exportar CSV
          </Boton>
        </div>
      )}
      {cuerpo}
    </>
  );
}

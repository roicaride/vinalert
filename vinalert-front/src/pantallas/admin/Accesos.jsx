import { useEffect, useState } from 'react';

import { listarAccesos } from '../../api/admin';
import MensajeError from '../../errores/MensajeError';
import Boton from '../../ui/Boton';
import { claseControl } from '../../ui/Campo';
import { Cargando, Marbete } from '../../ui/Estados';
import { horaMadridDesdeUtc } from './fechas';

const PAGINA = 100;

const TIPOS = { login: 'Inicio de sesión', recuperacion: 'Recuperar contraseña', restablecimiento: 'Contraseña restablecida' };
const RESULTADOS = { exito: ['brote', 'Correcto'], fallo: ['sangre', 'Fallido'], bloqueado: ['ambar', 'Bloqueado'] };

/** Quien intenta entrar y como le ha ido. Se guardan 90 dias. */
export default function Accesos() {
  const [email, setEmail] = useState('');
  const [filtroEmail, setFiltroEmail] = useState('');
  const [resultado, setResultado] = useState('');
  const [filas, setFilas] = useState(null);
  const [hayMas, setHayMas] = useState(false);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let vigente = true;
    listarAccesos({ email: filtroEmail, resultado, limite: PAGINA })
      .then((f) => {
        if (!vigente) return;
        setFilas(f);
        setHayMas(f.length === PAGINA);
        setError(null);
      })
      .catch((e) => { if (vigente) setError(e); });
    return () => { vigente = false; };
  }, [filtroEmail, resultado]);

  const cargarMas = async () => {
    setCargandoMas(true);
    try {
      const mas = await listarAccesos({ email: filtroEmail, resultado, antesDe: filas[filas.length - 1].id, limite: PAGINA });
      setFilas((prev) => [...prev, ...mas]);
      setHayMas(mas.length === PAGINA);
    } catch (e) {
      setError(e);
    } finally {
      setCargandoMas(false);
    }
  };

  return (
    <>
      <form
        className="flex flex-wrap items-end gap-4 border-b border-linea bg-alza px-6 py-3"
        onSubmit={(e) => { e.preventDefault(); setFiltroEmail(email.trim()); }}
      >
        <div className="w-full max-w-xs">
          <label htmlFor="accesos-email" className="rotulo block">Email</label>
          <input
            id="accesos-email"
            type="search"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Todos"
            className={`${claseControl} mt-1.5 py-1.5 text-xs`}
          />
        </div>
        <div>
          <label htmlFor="accesos-resultado" className="rotulo block">Resultado</label>
          <select
            id="accesos-resultado"
            value={resultado}
            onChange={(e) => setResultado(e.target.value)}
            className={`${claseControl} mt-1.5 w-40 py-1.5 text-xs`}
          >
            <option value="">Todos</option>
            <option value="exito">Correctos</option>
            <option value="fallo">Fallidos</option>
            <option value="bloqueado">Bloqueados</option>
          </select>
        </div>
        <Boton tono="sutil" type="submit" className="mb-px">Filtrar</Boton>
      </form>

      {error && (
        <div className="p-6">
          <MensajeError error={error} />
        </div>
      )}
      {filas === null && !error && <Cargando texto="Cargando accesos" />}
      {filas && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="border-b border-linea bg-alza">
                <th className="rotulo px-4 py-3 font-medium">Cuándo</th>
                <th className="rotulo px-4 py-3 font-medium">Email</th>
                <th className="rotulo px-4 py-3 font-medium">Qué</th>
                <th className="rotulo px-4 py-3 font-medium">IP</th>
                <th className="rotulo px-4 py-3 font-medium">Resultado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linea">
              {filas.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center">
                    <span className="rotulo">Ningún intento con esos filtros</span>
                  </td>
                </tr>
              )}
              {filas.map((a) => {
                const [tono, texto] = RESULTADOS[a.resultado] ?? ['neutro', a.resultado];
                return (
                  <tr key={a.id}>
                    <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap text-oso-2">{horaMadridDesdeUtc(a.momento)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-oso">{a.email}</td>
                    <td className="px-4 py-2.5 text-sm text-oso-2">{TIPOS[a.tipo] ?? a.tipo}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-oso-2">{a.ip}</td>
                    <td className="px-4 py-2.5"><Marbete tono={tono}>{texto}</Marbete></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {hayMas && (
            <div className="border-t border-linea px-6 py-4">
              <Boton tono="sutil" onClick={cargarMas} disabled={cargandoMas}>
                {cargandoMas ? 'Cargando…' : 'Cargar más'}
              </Boton>
            </div>
          )}
        </div>
      )}
    </>
  );
}

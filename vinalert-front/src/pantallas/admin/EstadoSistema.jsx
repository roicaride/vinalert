import { useEffect, useState } from 'react';

import { estadoSistema } from '../../api/admin';
import MensajeError from '../../errores/MensajeError';
import Boton from '../../ui/Boton';
import { Aviso, Cargando, Marbete } from '../../ui/Estados';
import { Panel, Rejilla } from '../../ui/Panel';
import { horaMadridDesdeUtc } from './fechas';

const HORAS = (seg) => {
  const h = seg / 3600;
  return Number.isInteger(h) ? `${h} h` : `${Math.round(seg / 60)} min`;
};

/**
 * Lo que antes solo se sabia mirando los logs del servidor: si los trabajos
 * periodicos corren y van bien, si el correo esta configurado y que aparatos
 * del campo se han callado.
 */
export default function EstadoSistema() {
  const [estado, setEstado] = useState(null);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vigente = true;
    estadoSistema()
      .then((e) => { if (vigente) { setEstado(e); setError(null); } })
      .catch((e) => { if (vigente) setError(e); });
    return () => { vigente = false; };
  }, [version]);

  if (error) {
    return (
      <div className="p-6">
        <MensajeError error={error} />
      </div>
    );
  }
  if (!estado) return <Cargando texto="Comprobando el sistema" />;

  const sinSenal = estado.dispositivos.filter((d) => d.sin_senal).length;
  const conFallos = estado.jobs.filter((j) => j.ultimo_error || j.fallos).length;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b border-linea px-6 py-3">
        <Marbete tono={estado.correo_configurado ? 'brote' : 'ambar'}>
          {estado.correo_configurado ? 'Correo configurado' : 'Correo sin configurar'}
        </Marbete>
        <Marbete tono="neutro">Clima: {estado.proveedor_clima}</Marbete>
        <Marbete tono={conFallos ? 'sangre' : 'brote'}>
          {conFallos ? `${conFallos} trabajo(s) con fallos` : 'Trabajos sin fallos'}
        </Marbete>
        <Marbete tono={sinSenal ? 'sangre' : 'brote'}>
          {sinSenal ? `${sinSenal} dispositivo(s) sin señal` : 'Todos los dispositivos envían'}
        </Marbete>
        <Boton tono="sutil" className="ml-auto" onClick={() => setVersion((v) => v + 1)}>
          Actualizar
        </Boton>
      </div>
      {!estado.correo_configurado && (
        <div className="border-b border-linea px-6 py-3">
          <Aviso tono="ambar">
            Sin SMTP_HOST en la configuración del servidor, las invitaciones y los enlaces de recuperación no
            se envían: solo se escriben en el log.
          </Aviso>
        </div>
      )}

      <Rejilla cols="grid-cols-1">
        <Panel titulo="Trabajos periódicos" cuerpo="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="border-b border-linea bg-alza">
                  <th className="rotulo px-4 py-3 font-medium">Trabajo</th>
                  <th className="rotulo px-4 py-3 font-medium">Última ejecución</th>
                  <th className="rotulo px-4 py-3 font-medium">Último éxito</th>
                  <th className="rotulo px-4 py-3 text-right font-medium">Parcelas</th>
                  <th className="rotulo px-4 py-3 font-medium">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-linea">
                {estado.jobs.map((j) => (
                  <tr key={j.job_id}>
                    <td className="px-4 py-2.5 text-sm text-oso">{j.nombre}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-oso-2">{horaMadridDesdeUtc(j.ultimo_inicio)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-oso-2">{horaMadridDesdeUtc(j.ultimo_exito)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-oso-2">
                      {j.procesadas ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-sm">
                      {j.ultimo_error ? (
                        <span className="font-mono text-xs text-sangre">{j.ultimo_error}</span>
                      ) : !j.ultimo_inicio ? (
                        <span className="text-oso-3">Aún no ha corrido</span>
                      ) : j.fallos ? (
                        <span className="text-ambar">{j.fallos} parcela(s) con fallos</span>
                      ) : (
                        <span className="text-brote">Correcto</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel titulo="Dispositivos" cuerpo="p-0">
          {estado.dispositivos.length === 0 ? (
            <p className="px-4 py-6 text-sm text-oso-3">No hay dispositivos dados de alta.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left">
                <thead>
                  <tr className="border-b border-linea bg-alza">
                    <th className="rotulo px-4 py-3 font-medium">Dispositivo</th>
                    <th className="rotulo px-4 py-3 font-medium">Parcela</th>
                    <th className="rotulo px-4 py-3 font-medium">Último envío</th>
                    <th className="rotulo px-4 py-3 font-medium">Ciclo</th>
                    <th className="rotulo px-4 py-3 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-linea">
                  {estado.dispositivos.map((d) => (
                    <tr key={d.id}>
                      <td className="px-4 py-2.5 text-sm text-oso">{d.nombre}</td>
                      <td className="px-4 py-2.5 text-sm text-oso-2">{d.parcela}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-oso-2">
                        {d.ultimo_uso ? horaMadridDesdeUtc(d.ultimo_uso) : 'Nunca'}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-oso-2">{HORAS(d.intervalo_ciclo_seg)}</td>
                      <td className="px-4 py-2.5">
                        {!d.activo ? (
                          <Marbete tono="neutro">Revocado</Marbete>
                        ) : d.sin_senal ? (
                          <Marbete tono="sangre">Sin señal</Marbete>
                        ) : d.ultimo_uso ? (
                          <Marbete tono="brote">Envía</Marbete>
                        ) : (
                          <Marbete tono="ambar">Sin estrenar</Marbete>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </Rejilla>
    </>
  );
}

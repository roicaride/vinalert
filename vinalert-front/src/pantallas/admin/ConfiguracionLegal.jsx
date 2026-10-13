import { useEffect, useState } from 'react';

import { guardarConfiguracion } from '../../api/admin';
import { configuracionPublica } from '../../api/configuracion';
import MensajeError from '../../errores/MensajeError';
import Boton from '../../ui/Boton';
import Campo from '../../ui/Campo';
import { Aviso, Cargando } from '../../ui/Estados';
import { Panel, Rejilla } from '../../ui/Panel';
import { CAMPOS_LEGALES } from '../legal/datosLegales';

/**
 * Los datos que publican el aviso legal y la politica de privacidad. Se
 * editan aqui para que cambiarlos no exija tocar el codigo ni desplegar.
 * Un campo vacio se publica como "pendiente de completar".
 */
export default function ConfiguracionLegal() {
  const [valores, setValores] = useState(null);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    let vigente = true;
    configuracionPublica()
      .then((c) => { if (vigente) setValores(c); })
      .catch((e) => { if (vigente) setError(e); });
    return () => { vigente = false; };
  }, []);

  const guardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setGuardado(false);
    setError(null);
    try {
      const cambios = Object.fromEntries(
        CAMPOS_LEGALES.flatMap((g) => g.campos).map(({ clave }) => [clave, valores[clave] ?? '']),
      );
      setValores(await guardarConfiguracion(cambios));
      setGuardado(true);
    } catch (err) {
      setError(err);
    } finally {
      setGuardando(false);
    }
  };

  if (valores === null && !error) return <Cargando texto="Cargando configuración" />;

  return (
    <form onSubmit={guardar}>
      <div className="border-b border-linea px-6 py-4">
        <p className="max-w-3xl text-sm text-oso-2">
          Estos datos aparecen en el aviso legal y en la política de privacidad. El titular es quien usa la
          herramienta y decide sobre los datos (responsable del tratamiento); el encargado es quien la mantiene
          por encargo suyo.
        </p>
      </div>
      {valores && (
        <Rejilla cols="grid-cols-1 lg:grid-cols-3">
          {CAMPOS_LEGALES.map((grupo) => (
            <Panel key={grupo.titulo} titulo={grupo.titulo} cuerpo="space-y-4 p-6">
              {grupo.campos.map(({ clave, etiqueta, ayuda }) => (
                <Campo
                  key={clave}
                  id={`config-${clave}`}
                  etiqueta={etiqueta}
                  ayuda={ayuda}
                  maxLength={500}
                  value={valores[clave] ?? ''}
                  onChange={(e) => setValores((v) => ({ ...v, [clave]: e.target.value }))}
                />
              ))}
            </Panel>
          ))}
        </Rejilla>
      )}
      <div className="flex flex-wrap items-center gap-4 border-t border-linea px-6 py-4">
        <Boton tono="solido" type="submit" disabled={guardando || !valores}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </Boton>
        {guardado && <Aviso tono="brote" role="status">Guardado. Las páginas legales ya muestran estos datos.</Aviso>}
        <MensajeError error={error} />
      </div>
    </form>
  );
}

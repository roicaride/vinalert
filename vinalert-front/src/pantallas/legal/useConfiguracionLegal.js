import { useEffect, useState } from 'react';

import { configuracionPublica } from '../../api/configuracion';

/**
 * Los datos del titular para las paginas legales y la portada. Si el
 * servidor no responde, las paginas se pintan igual con los datos marcados
 * como pendientes: un aviso legal que no carga es peor que uno incompleto.
 */
export function useConfiguracionLegal() {
  const [config, setConfig] = useState(null);

  useEffect(() => {
    let vigente = true;
    configuracionPublica()
      .then((c) => { if (vigente) setConfig(c ?? {}); })
      .catch(() => { if (vigente) setConfig({}); });
    return () => { vigente = false; };
  }, []);

  return config;
}

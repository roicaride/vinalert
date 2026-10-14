import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { me } from '../api/auth';
import { modoDemo } from '../demo/modo';
import { useSesion } from '../sesion/SesionContext';
import { Cargando } from '../ui/Estados';

/**
 * La puerta de la parcela de ejemplo: activa el modo demo en esta pestaña,
 * deja la parcela como recien generada y entra en ella como gestor. A partir
 * de aqui todas las pantallas son las reales, pero responden desde el
 * navegador (demo/api.js) y nada se guarda.
 */
export default function Demo() {
  const navigate = useNavigate();
  const { setUsuario } = useSesion();

  useEffect(() => {
    let vigente = true;
    modoDemo.entrar();
    import('../demo/api').then(async ({ PARCELA_DEMO, reiniciarDemo }) => {
      reiniciarDemo();
      const usuario = await me();
      if (!vigente) return;
      setUsuario(usuario);
      navigate(`/p/${PARCELA_DEMO}/estado`, { replace: true });
    });
    return () => { vigente = false; };
  }, [navigate, setUsuario]);

  return <Cargando texto="Preparando la parcela de ejemplo" />;
}

/** Cierra la sesion de la demo (sin tocar la real, si la hay) y vuelve a la portada. */
export function SalirDemo() {
  const navigate = useNavigate();
  const { cerrarSesion } = useSesion();

  useEffect(() => {
    if (modoDemo.activo()) cerrarSesion();
    navigate('/', { replace: true });
  }, [cerrarSesion, navigate]);

  return <Cargando texto="Saliendo del ejemplo" />;
}

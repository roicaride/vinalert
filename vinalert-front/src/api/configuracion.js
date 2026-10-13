import cliente from './cliente';

/** Datos del titular y del encargado para las páginas legales. Público, sin sesión. */
export async function configuracionPublica() {
  const { data } = await cliente.get('/configuracion/publica');
  return data;
}

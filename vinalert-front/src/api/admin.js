import cliente from './cliente';

/** Todas las cuentas, de la alta más reciente a la más antigua. Solo superadmin. */
export async function listarUsuarios() {
  const { data } = await cliente.get('/admin/usuarios');
  return data;
}

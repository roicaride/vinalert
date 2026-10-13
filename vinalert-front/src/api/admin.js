import cliente from './cliente';

/** Todas las cuentas, de la alta más reciente a la más antigua. Solo superadmin. */
export async function listarUsuarios() {
  const { data } = await cliente.get('/admin/usuarios');
  return data;
}

/** Da de alta a un cliente nuevo (sin parcelas) y le envia la invitacion. */
export async function invitarCliente(email, nombre) {
  const { data } = await cliente.post('/admin/invitaciones', { email, nombre });
  return data;
}

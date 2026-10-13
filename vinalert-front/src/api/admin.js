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

/** Cambia activo, es_superadmin o acceso_total. Solo los campos que se pasen. */
export async function editarCuenta(usuarioId, cambios) {
  const { data } = await cliente.patch(`/admin/usuarios/${usuarioId}`, cambios);
  return data;
}

/** Borra los datos personales de la cuenta (derecho de supresión). */
export async function eliminarCuenta(usuarioId) {
  await cliente.delete(`/admin/usuarios/${usuarioId}`);
}

/** Envía a esa persona un enlace para elegir contraseña (o su invitación si está pendiente). */
export async function enviarRestablecer(usuarioId) {
  const { data } = await cliente.post(`/admin/usuarios/${usuarioId}/restablecer`);
  return data;
}

export async function estadoSistema() {
  const { data } = await cliente.get('/admin/estado');
  return data;
}

/** Intentos de acceso, del más reciente al más antiguo. `antesDe` es el id del último de la página anterior. */
export async function listarAccesos({ email, resultado, antesDe, limite = 100 } = {}) {
  const params = { limite };
  if (email) params.email = email;
  if (resultado) params.resultado = resultado;
  if (antesDe) params.antes_de = antesDe;
  const { data } = await cliente.get('/admin/accesos', { params });
  return data;
}

export async function guardarConfiguracion(cambios) {
  const { data } = await cliente.put('/admin/configuracion', cambios);
  return data;
}

import cliente, { sesion } from './cliente';

export async function login(email, password) {
  const form = new URLSearchParams();
  form.append('username', email);
  form.append('password', password);

  const { data } = await cliente.post('/auth/token', form, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  sesion.guardarToken(data.access_token);
  return data;
}

export async function me() {
  const { data } = await cliente.get('/auth/me');
  return data;
}

/** Siempre responde lo mismo, exista o no la cuenta. */
export async function recuperar(email) {
  const { data } = await cliente.post('/auth/recuperar', { email });
  return data;
}

export async function restablecer(token, password) {
  await cliente.post('/auth/restablecer', { token, password });
}

/** Quien invita y a que parcela, para la pantalla de bienvenida. */
export async function verInvitacion(token) {
  const { data } = await cliente.get('/auth/invitacion', { params: { token } });
  return data;
}

/** Activa la cuenta y deja la sesion iniciada. */
export async function aceptarInvitacion(token, nombre, password) {
  const { data } = await cliente.post('/auth/invitacion/aceptar', { token, nombre, password });
  sesion.guardarToken(data.access_token);
  return data;
}

/** Cierra las demas sesiones; la de este navegador sigue con el token nuevo. */
export async function cambiarPassword(actual, nueva) {
  const { data } = await cliente.post('/auth/cambiar-password', { actual, nueva });
  sesion.guardarToken(data.access_token);
  return data;
}

export async function cerrarSesiones() {
  await cliente.post('/auth/cerrar-sesiones');
}


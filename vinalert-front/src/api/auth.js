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

export async function registro({ nombre, email, password }) {
  const { data } = await cliente.post('/auth/register', {
    nombre,
    email,
    password,
  });
  return data;
}


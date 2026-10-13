import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';

import App from '../App';

vi.mock('../api/auth', () => ({ me: vi.fn(), login: vi.fn() }));
vi.mock('../api/parcelas', () => ({ listarParcelas: vi.fn(), obtenerParcela: vi.fn() }));
import { login, me } from '../api/auth';
import { listarParcelas } from '../api/parcelas';
import { USUARIO } from '../test/respuestas';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

function entrar(password = 'clave12345') {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ana@vinalert.dev' } });
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
}

test('el boton del login se llama «Iniciar sesión»', async () => {
  window.history.replaceState({}, '', '/login');
  render(<App />);

  expect(await screen.findByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument();
});

test('ya no se puede crear una cuenta desde el login: solo por invitacion', async () => {
  window.history.replaceState({}, '', '/login?modo=registro');
  render(<App />);

  await screen.findByRole('button', { name: 'Iniciar sesión' });
  expect(screen.queryByText(/crear una cuenta/i)).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Nombre completo')).not.toBeInTheDocument();
});

test('enlaza a recuperar la contraseña', async () => {
  window.history.replaceState({}, '', '/login');
  render(<App />);

  const enlace = await screen.findByRole('link', { name: /has olvidado tu contraseña/i });
  expect(enlace).toHaveAttribute('href', '/recuperar');
});

test('una contraseña incorrecta lo dice, sin hablar de sesion caducada', async () => {
  login.mockRejectedValue({ response: { status: 401, data: { detail: 'Email o contraseña incorrectos' } } });
  window.history.replaceState({}, '', '/login');
  render(<App />);
  await screen.findByLabelText('Email');

  entrar('mala');

  expect(await screen.findByText('Email o contraseña incorrectos.')).toBeInTheDocument();
  expect(screen.queryByText(/sesión ha caducado/i)).not.toBeInTheDocument();
});

test('demasiados intentos dice cuanto esperar y ofrece recuperar', async () => {
  login.mockRejectedValue({
    response: { status: 429, data: { detail: { codigo: 'demasiados_intentos', minutos: 7 } } },
  });
  window.history.replaceState({}, '', '/login');
  render(<App />);
  await screen.findByLabelText('Email');

  entrar('mala');

  expect(await screen.findByText(/espera 7 min/i)).toBeInTheDocument();
  expect(screen.getAllByRole('link', { name: /recupera/i }).length).toBeGreaterThan(0);
});

test('con destino=/login, tras entrar no se queda en el formulario', async () => {
  login.mockResolvedValue({ access_token: 't' });
  me.mockResolvedValue(USUARIO);
  listarParcelas.mockResolvedValue([]);
  window.history.replaceState({}, '', '/login?destino=%2Flogin');
  render(<App />);
  await screen.findByLabelText('Email');

  entrar();

  await screen.findByText(/sin parcelas/i);
  expect(screen.queryByRole('button', { name: 'Iniciar sesión' })).not.toBeInTheDocument();
});

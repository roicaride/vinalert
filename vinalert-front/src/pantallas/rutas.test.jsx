import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';

import { LLAVE_TOKEN } from '../api/cliente';
import { PARCELA_GESTOR, PARCELA_LECTURA, USUARIO } from '../test/respuestas';
import App from '../App';

vi.mock('../api/auth', () => ({ me: vi.fn(), login: vi.fn() }));
vi.mock('../api/parcelas', () => ({ listarParcelas: vi.fn(), obtenerParcela: vi.fn() }));
import { login, me } from '../api/auth';
import { listarParcelas, obtenerParcela } from '../api/parcelas';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/');
});

test('sin sesion se ve el login', async () => {
  render(<App />);
  expect(await screen.findByRole('heading', { name: /acceso/i })).toBeInTheDocument();
});

test('con una sola parcela se entra directo, sin pantalla de seleccion', async () => {
  localStorage.setItem(LLAVE_TOKEN, 'valido');
  me.mockResolvedValue(USUARIO);
  listarParcelas.mockResolvedValue([PARCELA_GESTOR]);
  obtenerParcela.mockResolvedValue(PARCELA_GESTOR);

  render(<App />);

  expect(await screen.findByText('Parcela Test')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: /elige una parcela/i })).not.toBeInTheDocument();
});

test('con varias parcelas aparece la seleccion', async () => {
  localStorage.setItem(LLAVE_TOKEN, 'valido');
  me.mockResolvedValue(USUARIO);
  listarParcelas.mockResolvedValue([PARCELA_GESTOR, PARCELA_LECTURA]);

  render(<App />);

  expect(await screen.findByRole('heading', { name: /elige una parcela/i })).toBeInTheDocument();
  expect(screen.getByText('Compartida')).toBeInTheDocument();
});

test('la seleccion marca las parcelas en las que solo puedes leer', async () => {
  localStorage.setItem(LLAVE_TOKEN, 'valido');
  me.mockResolvedValue(USUARIO);
  listarParcelas.mockResolvedValue([PARCELA_GESTOR, PARCELA_LECTURA]);

  render(<App />);

  expect(await screen.findByText(/solo lectura/i)).toBeInTheDocument();
});

test('el login avisa cuando la sesion ha caducado', async () => {
  window.history.replaceState({}, '', '/login?motivo=sesion_caducada');

  render(<App />);

  expect(await screen.findByText(/ha caducado/i)).toBeInTheDocument();
});

function completarYEnviarLogin() {
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@a.com' } });
  fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: 'secreto' } });
  fireEvent.click(screen.getByRole('button', { name: /entrar/i }));
}

test('tras entrar sin sesion a una ruta protegida, el login te devuelve a ella (canal del state)', async () => {
  // Sin token: RutaProtegida manda al login con state={{ destino: '/p/1/estado' }},
  // sin tocar la URL. Este es el canal que cubre el caso mas habitual: llegar
  // por primera vez a un enlace protegido sin sesion.
  window.history.replaceState({}, '', '/p/1/estado');

  login.mockResolvedValue({ access_token: 'nuevo' });
  me.mockResolvedValue(USUARIO);
  listarParcelas.mockResolvedValue([PARCELA_GESTOR]);
  obtenerParcela.mockResolvedValue(PARCELA_GESTOR);

  render(<App />);

  await screen.findByRole('heading', { name: /acceso/i });
  completarYEnviarLogin();

  expect(await screen.findByText('Parcela Test')).toBeInTheDocument();
});

test('tras llegar al login con ?destino=, el login te devuelve a esa ruta (canal de la URL)', async () => {
  // El interceptor del 401 manda al login con ?destino=... en la URL, no con
  // state del router. Este es el canal que ya cubria "el login avisa cuando
  // la sesion ha caducado"; aqui se comprueba que ademas navega al destino.
  window.history.replaceState({}, '', `/login?destino=${encodeURIComponent('/p/1/estado')}`);

  login.mockResolvedValue({ access_token: 'nuevo' });
  me.mockResolvedValue(USUARIO);
  listarParcelas.mockResolvedValue([PARCELA_GESTOR]);
  obtenerParcela.mockResolvedValue(PARCELA_GESTOR);

  render(<App />);

  await screen.findByRole('heading', { name: /acceso/i });
  completarYEnviarLogin();

  expect(await screen.findByText('Parcela Test')).toBeInTheDocument();
});

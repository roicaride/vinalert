import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';

import App from '../App';

vi.mock('../api/auth', () => ({ me: vi.fn(), login: vi.fn(), registro: vi.fn() }));
vi.mock('../api/parcelas', () => ({ listarParcelas: vi.fn(), obtenerParcela: vi.fn() }));
import { login, registro } from '../api/auth';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

function rellenarRegistro() {
  fireEvent.change(screen.getByLabelText('Nombre completo'), { target: { value: 'Ana' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ana@vinalert.dev' } });
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'clave12345' } });
  fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
}

test('el boton del login se llama «Iniciar sesión»', async () => {
  window.history.replaceState({}, '', '/login');
  render(<App />);

  expect(await screen.findByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument();
});

test('registrarse con un email que ya existe lo dice claro y ofrece iniciar sesion', async () => {
  // El backend responde 400 "Email ya registrado"; antes llegaba como
  // «el servidor ha devuelto un error inesperado».
  registro.mockRejectedValue({ response: { status: 400, data: { detail: 'Email ya registrado' } } });
  window.history.replaceState({}, '', '/login?modo=registro');
  render(<App />);
  await screen.findByLabelText('Nombre completo');

  rellenarRegistro();

  expect(await screen.findByText(/ya hay una cuenta con ese email/i)).toBeInTheDocument();
  expect(login).not.toHaveBeenCalled();
});

test('un registro que el servidor no acepta explica que revisar, en castellano', async () => {
  registro.mockRejectedValue({
    response: { status: 422, data: { detail: [{ loc: ['body', 'email'], msg: 'value is not a valid email address' }] } },
  });
  window.history.replaceState({}, '', '/login?modo=registro');
  render(<App />);
  await screen.findByLabelText('Nombre completo');

  rellenarRegistro();

  expect(await screen.findByText(/revisa el email/i)).toBeInTheDocument();
  expect(screen.queryByText(/value is not a valid/i)).not.toBeInTheDocument();
});

test('la contraseña del registro pide al menos 8 caracteres antes de enviar', async () => {
  window.history.replaceState({}, '', '/login?modo=registro');
  render(<App />);

  expect(await screen.findByLabelText('Contraseña')).toHaveAttribute('minlength', '8');
  expect(screen.getByText(/mínimo 8 caracteres/i)).toBeInTheDocument();
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';

import { LLAVE_TOKEN } from '../api/cliente';
import { USUARIO } from '../test/respuestas';
import App from '../App';

vi.mock('../api/auth', () => ({
  me: vi.fn(),
  login: vi.fn(),
  cambiarPassword: vi.fn(),
  cerrarSesiones: vi.fn(),
}));
vi.mock('../api/parcelas', () => ({ listarParcelas: vi.fn(), obtenerParcela: vi.fn() }));
import { cambiarPassword, cerrarSesiones, me } from '../api/auth';
import { listarParcelas } from '../api/parcelas';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  localStorage.setItem(LLAVE_TOKEN, 'valido');
  me.mockResolvedValue(USUARIO);
  listarParcelas.mockResolvedValue([]);
});

function abrir() {
  window.history.replaceState({}, '', '/cuenta');
  render(<App />);
}

function rellenar(actual, nueva, repetida = nueva) {
  fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: actual } });
  fireEvent.change(screen.getByLabelText('Contraseña nueva'), { target: { value: nueva } });
  fireEvent.change(screen.getByLabelText('Repite la contraseña nueva'), { target: { value: repetida } });
  fireEvent.click(screen.getByRole('button', { name: /cambiar contraseña/i }));
}

test('la cabecera de la cuenta enlaza a Mi cuenta', async () => {
  window.history.replaceState({}, '', '/parcelas');
  render(<App />);
  expect(await screen.findByRole('link', { name: 'Mi cuenta' })).toHaveAttribute('href', '/cuenta');
});

test('muestra quien eres', async () => {
  abrir();
  expect(await screen.findByText(USUARIO.email)).toBeInTheDocument();
});

test('cambiar la contraseña lo confirma', async () => {
  cambiarPassword.mockResolvedValue({ access_token: 'nuevo' });
  abrir();
  await screen.findByLabelText('Contraseña actual');

  rellenar('clave12345', 'cepas-de-albariño');

  expect(await screen.findByText(/contraseña cambiada/i)).toBeInTheDocument();
  expect(cambiarPassword).toHaveBeenCalledWith('clave12345', 'cepas-de-albariño');
});

test('si las nuevas no coinciden no envia nada', async () => {
  abrir();
  await screen.findByLabelText('Contraseña actual');

  rellenar('clave12345', 'cepas-de-albariño', 'otra-cosa-distinta');

  expect(await screen.findByText(/no coinciden/i)).toBeInTheDocument();
  expect(cambiarPassword).not.toHaveBeenCalled();
});

test('la actual incorrecta lo dice', async () => {
  cambiarPassword.mockRejectedValue({ response: { status: 400, data: { detail: 'La contraseña actual no es correcta.' } } });
  abrir();
  await screen.findByLabelText('Contraseña actual');

  rellenar('mala', 'cepas-de-albariño');

  expect(await screen.findByText('La contraseña actual no es correcta.')).toBeInTheDocument();
});

test('cerrar sesion en todos los dispositivos saca tambien de este', async () => {
  cerrarSesiones.mockResolvedValue();
  abrir();

  fireEvent.click(await screen.findByRole('button', { name: /cerrar sesión en todos los dispositivos/i }));

  await waitFor(() => expect(cerrarSesiones).toHaveBeenCalled());
  expect(await screen.findByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument();
  expect(localStorage.getItem(LLAVE_TOKEN)).toBeNull();
});

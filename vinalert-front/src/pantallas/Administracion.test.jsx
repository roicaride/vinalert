import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';

import { LLAVE_TOKEN } from '../api/cliente';
import { CUENTAS, USUARIO, USUARIO_SUPERADMIN } from '../test/respuestas';
import App from '../App';

vi.mock('../api/auth', () => ({ me: vi.fn(), login: vi.fn(), registro: vi.fn() }));
vi.mock('../api/parcelas', () => ({ listarParcelas: vi.fn(), obtenerParcela: vi.fn() }));
vi.mock('../api/admin', () => ({ listarUsuarios: vi.fn() }));
vi.mock('../utils/exportar', () => ({ exportarExcelMultilibro: vi.fn(), descargarCsv: vi.fn() }));
import { me } from '../api/auth';
import { listarUsuarios } from '../api/admin';
import { listarParcelas } from '../api/parcelas';
import { descargarCsv, exportarExcelMultilibro } from '../utils/exportar';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  localStorage.setItem(LLAVE_TOKEN, 'valido');
});

function entrarEnAdmin(usuario = USUARIO_SUPERADMIN) {
  me.mockResolvedValue(usuario);
  window.history.replaceState({}, '', '/admin');
  return render(<App />);
}

test('el admin ve todas las cuentas con su alta y sus parcelas', async () => {
  listarUsuarios.mockResolvedValue(CUENTAS);
  entrarEnAdmin();

  const tabla = await screen.findByRole('table');
  const filas = within(tabla).getAllByRole('row').slice(1);
  expect(filas).toHaveLength(3);
  expect(filas[0]).toHaveTextContent('Marta Ferreiro');
  expect(filas[0]).toHaveTextContent('marta@vinalert.dev');
  expect(filas[0]).toHaveTextContent('18/9/2026');
  expect(filas[0]).toHaveTextContent('2');
  // Cuenta anterior a que se guardase la fecha de alta.
  expect(filas[2]).toHaveTextContent('—');
});

test('el buscador filtra por nombre y por email, sin distinguir mayusculas ni tildes', async () => {
  listarUsuarios.mockResolvedValue(CUENTAS);
  entrarEnAdmin();
  const tabla = await screen.findByRole('table');

  fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'XOAN' } });
  expect(within(tabla).getAllByRole('row').slice(1)).toHaveLength(1);
  expect(within(tabla).getByText('xoan@viticultores.gal')).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'vinalert.dev' } });
  expect(within(tabla).getAllByRole('row').slice(1)).toHaveLength(2);
});

test('exportar a Excel descarga las cuentas que se estan viendo', async () => {
  listarUsuarios.mockResolvedValue(CUENTAS);
  entrarEnAdmin();
  await screen.findByRole('table');
  fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'marta' } });

  fireEvent.click(screen.getByRole('button', { name: 'Exportar Excel' }));

  expect(exportarExcelMultilibro).toHaveBeenCalledTimes(1);
  const [nombre, [pestana]] = exportarExcelMultilibro.mock.calls[0];
  expect(nombre).toMatch(/^vinalert_cuentas_\d{4}-\d{2}-\d{2}$/);
  expect(pestana.cabeceras).toEqual(['Nombre', 'Email', 'Teléfono', 'Rol', 'Fecha de alta', 'Parcelas']);
  expect(pestana.filas).toEqual([['Marta Ferreiro', 'marta@vinalert.dev', '', 'agricultor', '18/09/2026 10:15', 2]]);
});

test('exportar a CSV usa las mismas columnas', async () => {
  listarUsuarios.mockResolvedValue(CUENTAS);
  entrarEnAdmin();
  await screen.findByRole('table');

  fireEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));

  const [, cabeceras, filas] = descargarCsv.mock.calls[0];
  expect(cabeceras[1]).toBe('Email');
  expect(filas).toHaveLength(3);
  expect(filas[2][4]).toBe('');
});

test('quien no es el administrador ve que la seccion no es para el', async () => {
  listarUsuarios.mockRejectedValue({ response: { status: 403 } });
  entrarEnAdmin(USUARIO);

  expect(await screen.findByText(/solo para el administrador/i)).toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

test('la seleccion de parcelas ensena el acceso a Administracion solo al superadmin', async () => {
  listarParcelas.mockResolvedValue([]);
  me.mockResolvedValue(USUARIO_SUPERADMIN);
  window.history.replaceState({}, '', '/parcelas');
  const { unmount } = render(<App />);
  expect(await screen.findByRole('link', { name: 'Administración' })).toHaveAttribute('href', '/admin');
  unmount();

  me.mockResolvedValue(USUARIO);
  render(<App />);
  await screen.findByRole('heading', { name: /elige una parcela/i });
  expect(screen.queryByRole('link', { name: 'Administración' })).not.toBeInTheDocument();
});

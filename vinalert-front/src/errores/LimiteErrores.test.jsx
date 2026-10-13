import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import LimiteErrores from './LimiteErrores';

function Rompe() {
  throw new Error('datos inesperados');
}

let consola;
beforeEach(() => {
  // React escribe el error en consola; aqui es esperado.
  consola = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => consola.mockRestore());

test('un fallo al pintar muestra un mensaje en vez de una pantalla en blanco', () => {
  render(<LimiteErrores><Rompe /></LimiteErrores>);

  expect(screen.getByRole('alert')).toHaveTextContent(/algo ha fallado/i);
  expect(screen.getByRole('button', { name: 'Recargar' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /volver al inicio/i })).toHaveAttribute('href', '/');
});

test('recargar vuelve a cargar la pagina', () => {
  const recargar = vi.fn();
  render(<LimiteErrores alRecargar={recargar}><Rompe /></LimiteErrores>);

  fireEvent.click(screen.getByRole('button', { name: 'Recargar' }));

  expect(recargar).toHaveBeenCalled();
});

test('sin errores pinta lo de dentro', () => {
  render(<LimiteErrores><p>todo bien</p></LimiteErrores>);
  expect(screen.getByText('todo bien')).toBeInTheDocument();
});

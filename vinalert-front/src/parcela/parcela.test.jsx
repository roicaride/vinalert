import { render, screen } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';

import { PARCELA_GESTOR, PARCELA_LECTURA } from '../test/respuestas';
import { ProveedorParcela, useParcela } from './ParcelaContext';
import SoloGestor from './SoloGestor';

vi.mock('../api/parcelas', () => ({ obtenerParcela: vi.fn() }));
import { obtenerParcela } from '../api/parcelas';

function Pantalla() {
  const { parcela } = useParcela();
  return (
    <div>
      <p>{parcela.nombre}</p>
      <SoloGestor><button type="button">Editar parcela</button></SoloGestor>
    </div>
  );
}

function montar() {
  return render(
    <ProveedorParcela parcelaId={1}><Pantalla /></ProveedorParcela>,
  );
}

beforeEach(() => vi.clearAllMocks());

test('un gestor ve la accion de gestion', async () => {
  obtenerParcela.mockResolvedValue(PARCELA_GESTOR);

  montar();

  expect(await screen.findByText('Parcela Test')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Editar parcela' })).toBeInTheDocument();
});

test('un lector NO ve la accion de gestion', async () => {
  obtenerParcela.mockResolvedValue(PARCELA_LECTURA);

  montar();

  expect(await screen.findByText('Compartida')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Editar parcela' })).not.toBeInTheDocument();
});

test('el permiso sale de mi_rol, no de adivinarlo', async () => {
  // La trampa: misma parcela, mismo todo, solo cambia mi_rol. Si el permiso
  // se dedujera de otra cosa, este test no distinguiria los dos casos.
  obtenerParcela.mockResolvedValue({ ...PARCELA_GESTOR, mi_rol: 'lectura' });

  montar();

  expect(await screen.findByText('Parcela Test')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Editar parcela' })).not.toBeInTheDocument();
});

test('si obtenerParcela falla, no se renderizan los hijos y se ve un mensaje de error', async () => {
  // Sin esto, un 403 o un 404 dejarian parcela en null pero cargando en
  // false: los hijos se renderizarian igual y Pantalla reventaria al leer
  // parcela.nombre.
  obtenerParcela.mockRejectedValue({ response: { status: 403 } });

  montar();

  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.queryByText('Parcela Test')).not.toBeInTheDocument();
  expect(screen.queryByText('Compartida')).not.toBeInTheDocument();
});

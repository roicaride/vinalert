import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';

import { PARCELA_GESTOR, PARCELA_LECTURA, SENSOR, SENSOR_INACTIVO } from '../test/respuestas';
import { ProveedorParcela } from '../parcela/ParcelaContext';
import Sensores from './Sensores';

vi.mock('../api/parcelas', () => ({ obtenerParcela: vi.fn() }));
vi.mock('../api/sensores', () => ({
  listarSensores: vi.fn(),
  provisionarSensores: vi.fn(),
  actualizarSensor: vi.fn(),
  borrarSensor: vi.fn(),
}));
import { obtenerParcela } from '../api/parcelas';
import { actualizarSensor, borrarSensor, listarSensores, provisionarSensores } from '../api/sensores';


function montar(parcela) {
  obtenerParcela.mockResolvedValue(parcela);
  return render(
    <ProveedorParcela parcelaId={parcela.id}><Sensores /></ProveedorParcela>,
  );
}

beforeEach(() => vi.clearAllMocks());

test('se ve la lista de sensores', async () => {
  listarSensores.mockResolvedValue([SENSOR, SENSOR_INACTIVO]);
  montar(PARCELA_GESTOR);

  expect((await screen.findAllByText('Nodo 1')).length).toBeGreaterThanOrEqual(1);
  expect((await screen.findAllByText('Nodo 2')).length).toBeGreaterThanOrEqual(1);
});

test('un lector no ve anadir ni editar', async () => {
  listarSensores.mockResolvedValue([SENSOR]);
  montar(PARCELA_LECTURA);

  await screen.findAllByText('Nodo 1');
  expect(screen.queryByRole('button', { name: 'Añadir sensores' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
});

test('anadir sensores reemplaza la lista con la respuesta del backend', async () => {
  listarSensores.mockResolvedValue([SENSOR]);
  const nuevoSensor = { ...SENSOR, id: 2, numero: 2, etiqueta: 'Nodo 2' };
  provisionarSensores.mockResolvedValue([SENSOR, nuevoSensor]);
  montar(PARCELA_GESTOR);

  await screen.findAllByText('Nodo 1');
  await userEvent.click(screen.getByRole('button', { name: 'Añadir sensores' }));
  await userEvent.type(screen.getByLabelText(/número total de sensores/i), '2');
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

  expect(provisionarSensores).toHaveBeenCalledWith(1, 2);
  expect((await screen.findAllByText('Nodo 2')).length).toBeGreaterThanOrEqual(1);
  expect(screen.getAllByRole('row')).toHaveLength(3); // cabecera + 2 sensores
});

test('anadir sensores que no aumenta el total avisa de que no se ha creado nada', async () => {
  listarSensores.mockResolvedValue([SENSOR]);
  provisionarSensores.mockResolvedValue([SENSOR]);
  montar(PARCELA_GESTOR);

  await screen.findAllByText('Nodo 1');
  await userEvent.click(screen.getByRole('button', { name: 'Añadir sensores' }));
  await userEvent.type(screen.getByLabelText(/número total de sensores/i), '1');
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

  expect(provisionarSensores).toHaveBeenCalledWith(1, 1);
  expect(await screen.findByText(/no se ha añadido ninguno nuevo/i)).toBeInTheDocument();
});

test('editar un sensor guarda solo ese sensor', async () => {
  listarSensores.mockResolvedValue([SENSOR]);
  actualizarSensor.mockResolvedValue({ ...SENSOR, etiqueta: 'Renombrado' });
  montar(PARCELA_GESTOR);

  await screen.findAllByText('Nodo 1');
  await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
  const etiqueta = screen.getByLabelText('Etiqueta del sensor 1');
  await userEvent.clear(etiqueta);
  await userEvent.type(etiqueta, 'Renombrado');
  await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

  await waitFor(() => expect(actualizarSensor).toHaveBeenCalledWith(
    1, 1, expect.objectContaining({ etiqueta: 'Renombrado' }),
  ));
  expect((await screen.findAllByText('Renombrado')).length).toBeGreaterThanOrEqual(1);
});

test('un error al aprovisionar se traduce con MensajeError', async () => {
  listarSensores.mockResolvedValue([SENSOR]);
  provisionarSensores.mockRejectedValue({
    response: {
      status: 422,
      data: { detail: [{ loc: ['body', 'cantidad'], msg: 'Input should be greater than or equal to 1' }] },
    },
  });
  montar(PARCELA_GESTOR);

  await screen.findAllByText('Nodo 1');
  await userEvent.click(screen.getByRole('button', { name: 'Añadir sensores' }));
  await userEvent.type(screen.getByLabelText(/número total de sensores/i), '1');
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

  expect(await screen.findByText(/cantidad/)).toBeInTheDocument();
});

test('carga fallida al listar sensores muestra error sin crashear', async () => {
  listarSensores.mockRejectedValue({
    response: {
      status: 500,
      data: { detail: 'Internal server error' },
    },
  });
  montar(PARCELA_GESTOR);

  expect(await screen.findByRole('alert')).toBeInTheDocument();
});

test('un gestor puede eliminar un sensor tras confirmar', async () => {
  listarSensores.mockResolvedValue([SENSOR]);
  borrarSensor.mockResolvedValue();
  const spyConfirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

  montar(PARCELA_GESTOR);

  await screen.findAllByText('Nodo 1');
  const btnEliminar = screen.getByRole('button', { name: 'Eliminar' });
  await userEvent.click(btnEliminar);

  expect(spyConfirm).toHaveBeenCalled();
  expect(borrarSensor).toHaveBeenCalledWith(1, 1);
  await waitFor(() => expect(screen.queryByText('Nodo 1')).not.toBeInTheDocument());

  spyConfirm.mockRestore();
});



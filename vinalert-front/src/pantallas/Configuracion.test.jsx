import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';

import { PARCELA_GESTOR, PARCELA_LECTURA } from '../test/respuestas';
import { ProveedorParcela } from '../parcela/ParcelaContext';
import Configuracion from './Configuracion';

vi.mock('../api/parcelas', () => ({
  obtenerParcela: vi.fn(),
  editarParcela: vi.fn(),
  comprobarClima: vi.fn(),
  borrarParcela: vi.fn(),
}));
vi.mock('../api/dispositivos', () => ({
  listarDispositivos: vi.fn().mockResolvedValue([]),
  crearDispositivo: vi.fn(),
  revocarDispositivo: vi.fn(),
  borrarDispositivo: vi.fn(),
}));
import { borrarParcela, comprobarClima, editarParcela, obtenerParcela } from '../api/parcelas';
import { listarDispositivos, crearDispositivo, revocarDispositivo, borrarDispositivo } from '../api/dispositivos';


function montar(parcela) {
  obtenerParcela.mockResolvedValue(parcela);
  return render(
    <MemoryRouter>
      <ProveedorParcela parcelaId={parcela.id}>
        <Configuracion />
      </ProveedorParcela>
    </MemoryRouter>,
  );
}

beforeEach(() => vi.clearAllMocks());

test('un gestor ve los datos y puede guardar', async () => {
  editarParcela.mockResolvedValue({ ...PARCELA_GESTOR, nombre: 'Parcela Nueva' });
  montar(PARCELA_GESTOR);

  const nombre = await screen.findByLabelText('Nombre');
  expect(nombre).toHaveValue('Parcela Test');
  expect(nombre).not.toBeDisabled();

  await userEvent.clear(nombre);
  await userEvent.type(nombre, 'Parcela Nueva');
  await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

  await waitFor(() => expect(editarParcela).toHaveBeenCalledWith(
    1,
    expect.objectContaining({ nombre: 'Parcela Nueva' }),
  ));
});

test('tras guardar, el formulario refleja lo que devuelve el backend', async () => {
  // El backend usa exclude_none=True: un campo que el usuario "vacio" y
  // guardo puede quedarse con el valor viejo del lado del servidor. El
  // formulario tiene que reflejar lo que el backend realmente devuelve, no
  // lo que el usuario submitio.
  editarParcela.mockResolvedValue({ ...PARCELA_GESTOR, kc_actual: 0.8 });
  montar(PARCELA_GESTOR);

  const kc = await screen.findByLabelText('Kc actual');
  await userEvent.clear(kc);
  await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

  await waitFor(() => expect(kc).toHaveValue(0.8));
});

test('un lector ve el formulario pero no puede tocarlo', async () => {
  montar(PARCELA_LECTURA);

  const nombre = await screen.findByLabelText('Nombre');
  expect(nombre).toHaveValue('Compartida');
  expect(nombre).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Comprobar estas coordenadas' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Eliminar esta parcela' })).not.toBeInTheDocument();
});

test('un error al guardar se traduce con MensajeError', async () => {
  editarParcela.mockRejectedValue({
    response: {
      status: 422,
      data: { detail: [{ loc: ['body', 'latitud'], msg: 'Input should be less than or equal to 90' }] },
    },
  });
  montar(PARCELA_GESTOR);

  await screen.findByLabelText('Nombre');
  await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

  expect(await screen.findByText(/latitud/)).toBeInTheDocument();
});

test('la sonda se deshabilita si hay coordenadas sin guardar', async () => {
  montar(PARCELA_GESTOR);

  const latitud = await screen.findByLabelText('Latitud');
  const boton = screen.getByRole('button', { name: 'Comprobar estas coordenadas' });
  expect(boton).not.toBeDisabled();

  await userEvent.clear(latitud);
  await userEvent.type(latitud, '43');

  expect(boton).toBeDisabled();
  expect(screen.getByText(/guarda antes de comprobar/i)).toBeInTheDocument();
});

test('la sonda muestra el resultado de comprobar', async () => {
  comprobarClima.mockResolvedValue({ disponible: false, latitud: 42.31, longitud: -8.61, motivo: 'El proveedor no respondio.' });
  montar(PARCELA_GESTOR);

  await screen.findByLabelText('Nombre');
  await userEvent.click(screen.getByRole('button', { name: 'Comprobar estas coordenadas' }));

  expect(comprobarClima).toHaveBeenCalledWith(1);
  expect(await screen.findByText('El proveedor no respondio.')).toBeInTheDocument();
});

test('un gestor puede borrar la parcela previa confirmacion', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  borrarParcela.mockResolvedValue();
  montar(PARCELA_GESTOR);

  const botonBorrar = await screen.findByRole('button', { name: 'Eliminar esta parcela' });
  await userEvent.click(botonBorrar);

  expect(window.confirm).toHaveBeenCalled();
  expect(borrarParcela).toHaveBeenCalledWith(1);
});

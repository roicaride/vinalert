import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';

import { PARCELA_GESTOR, PARCELA_LECTURA, TRATAMIENTO, TRATAMIENTO_SIN_CLIMA } from '../test/respuestas';
import { ProveedorParcela } from '../parcela/ParcelaContext';
import Tratamientos from './Tratamientos';

vi.mock('../api/parcelas', () => ({ obtenerParcela: vi.fn() }));
vi.mock('../api/tratamientos', () => ({
  listarTratamientos: vi.fn(),
  crearTratamiento: vi.fn(),
  borrarTratamiento: vi.fn(),
}));
import { obtenerParcela } from '../api/parcelas';
import { crearTratamiento, listarTratamientos, borrarTratamiento } from '../api/tratamientos';

function montar(parcela) {
  obtenerParcela.mockResolvedValue(parcela);
  return render(
    <ProveedorParcela parcelaId={parcela.id}><Tratamientos /></ProveedorParcela>,
  );
}

beforeEach(() => vi.clearAllMocks());

test('se ve la lista con el clima registrado', async () => {
  listarTratamientos.mockResolvedValue([TRATAMIENTO]);
  montar(PARCELA_GESTOR);

  const tabla = await screen.findByRole('table');
  expect(within(tabla).getByText('Fungicida')).toBeInTheDocument();
  expect(within(tabla).getByText('18.2 °C')).toBeInTheDocument();
});

test('sin clima disponible se muestra un guion, no el dato', async () => {
  listarTratamientos.mockResolvedValue([TRATAMIENTO_SIN_CLIMA]);
  montar(PARCELA_GESTOR);

  const tabla = await screen.findByRole('table');
  const fila = within(tabla).getByText('Fungicida').closest('tr');
  expect(fila).toHaveTextContent('—');
});

test('un lector no ve el formulario de alta ni el boton de borrar', async () => {
  listarTratamientos.mockResolvedValue([TRATAMIENTO]);
  montar(PARCELA_LECTURA);

  await screen.findByRole('table');
  expect(screen.queryByRole('button', { name: 'Registrar tratamiento' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Borrar' })).not.toBeInTheDocument();
});

test('filtrar por tipo no reduce las opciones del formulario de alta', async () => {
  // La trampa: si el filtro pidiera al backend con ?tipo=, la lista en
  // memoria se reduciria a un solo tipo y el select de alta perderia de
  // vista los demas. El filtro debe resolverse en el cliente.
  const herbicida = { ...TRATAMIENTO, id: 2, tipo: 'Herbicida' };
  listarTratamientos.mockResolvedValue([TRATAMIENTO, herbicida]);
  montar(PARCELA_GESTOR);

  const tabla = await screen.findByRole('table');
  expect(within(tabla).getByText('Fungicida')).toBeInTheDocument();

  await userEvent.selectOptions(screen.getByLabelText('Filtrar por tipo'), 'Herbicida');

  expect(within(tabla).queryByText('Fungicida')).not.toBeInTheDocument();
  expect(within(tabla).getByText('Herbicida')).toBeInTheDocument();
  expect(listarTratamientos).toHaveBeenCalledTimes(1);

  const opciones = within(screen.getByLabelText('Tipo')).getAllByRole('option').map((o) => o.textContent);
  expect(opciones).toEqual(expect.arrayContaining(['Fungicida', 'Herbicida']));
});

test('un tipo personalizado creado queda disponible como opcion despues', async () => {
  listarTratamientos.mockResolvedValue([TRATAMIENTO]);
  const personalizado = { ...TRATAMIENTO, id: 3, tipo: 'Cobertura vegetal' };
  crearTratamiento.mockResolvedValue(personalizado);
  montar(PARCELA_GESTOR);

  await screen.findByRole('table');
  await userEvent.type(screen.getByLabelText('Fecha'), '2026-08-20T09:00');
  await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'Otro');
  await userEvent.type(screen.getByLabelText('Tipo personalizado'), 'Cobertura vegetal');
  await userEvent.click(screen.getByRole('button', { name: 'Registrar tratamiento' }));

  await waitFor(() => expect(crearTratamiento).toHaveBeenCalledWith(
    expect.objectContaining({ parcela_id: 1, tipo: 'Cobertura vegetal' }),
  ));

  const opciones = within(screen.getByLabelText('Tipo')).getAllByRole('option').map((o) => o.textContent);
  expect(opciones).toContain('Cobertura vegetal');
});

test('crear un tratamiento con fecha pasada lo inserta en su sitio, no al principio', async () => {
  const reciente = { ...TRATAMIENTO, id: 1, fecha: '2026-08-19T10:00:00', tipo: 'Herbicida' };
  listarTratamientos.mockResolvedValue([reciente]);
  const pasado = { ...TRATAMIENTO, id: 2, fecha: '2026-01-01T10:00:00', tipo: 'Fungicida' };
  crearTratamiento.mockResolvedValue(pasado);
  montar(PARCELA_GESTOR);

  const tabla = await screen.findByRole('table');
  await userEvent.type(screen.getByLabelText('Fecha'), '2026-01-01T10:00');
  await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'Fungicida');
  await userEvent.click(screen.getByRole('button', { name: 'Registrar tratamiento' }));

  await waitFor(() => expect(crearTratamiento).toHaveBeenCalled());

  const filas = within(tabla).getAllByRole('row').slice(1);
  expect(filas[0]).toHaveTextContent('Herbicida');
  expect(filas[1]).toHaveTextContent('Fungicida');
});

test('solo se ven los ultimos, y el desplegable enseña mas', async () => {
  // El backend los devuelve de mas nuevo a mas viejo: los ultimos son los
  // primeros de la lista.
  const muchos = Array.from({ length: 12 }, (_, i) => ({
    ...TRATAMIENTO, id: i + 1, producto: `Producto ${i + 1}`,
  }));
  listarTratamientos.mockResolvedValue(muchos);
  montar(PARCELA_GESTOR);

  const tabla = await screen.findByRole('table');
  expect(within(tabla).getAllByRole('row')).toHaveLength(11); // cabecera + 10
  expect(within(tabla).getByText('Producto 1')).toBeInTheDocument();
  expect(within(tabla).queryByText('Producto 11')).not.toBeInTheDocument();

  await userEvent.selectOptions(screen.getByLabelText('Tratamientos a mostrar'), '25');

  expect(within(tabla).getAllByRole('row')).toHaveLength(13); // cabecera + 12
  expect(within(tabla).getByText('Producto 11')).toBeInTheDocument();
  expect(listarTratamientos).toHaveBeenCalledTimes(1);
});

test('borrar pide confirmacion y llama al backend', async () => {
  listarTratamientos.mockResolvedValue([TRATAMIENTO]);
  borrarTratamiento.mockResolvedValue(undefined);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  montar(PARCELA_GESTOR);

  const tabla = await screen.findByRole('table');
  await userEvent.click(within(tabla).getByRole('button', { name: 'Borrar' }));

  expect(borrarTratamiento).toHaveBeenCalledWith(1);
  await waitFor(() => expect(within(tabla).queryByText('Fungicida')).not.toBeInTheDocument());
});

test('un error al crear se traduce con MensajeError', async () => {
  listarTratamientos.mockResolvedValue([]);
  crearTratamiento.mockRejectedValue({
    response: { status: 422, data: { detail: [{ loc: ['body', 'fecha'], msg: 'field required' }] } },
  });
  montar(PARCELA_GESTOR);

  await screen.findByRole('table');
  await userEvent.type(screen.getByLabelText('Fecha'), '2026-08-20T09:00');
  await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'Fungicida');
  await userEvent.click(screen.getByRole('button', { name: 'Registrar tratamiento' }));

  expect(await screen.findByText(/fecha/)).toBeInTheDocument();
});

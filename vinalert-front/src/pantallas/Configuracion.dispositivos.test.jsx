// La seccion de dispositivos ESP32 solo la ve admin@vinalert.dev, asi que
// vive en su propio fichero: mockear useSesion para el fichero entero haria
// aparecer esta seccion en los tests de Configuracion.test.jsx, que montan la
// pantalla como un gestor cualquiera.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';

import { DISPOSITIVO, PARCELA_GESTOR, USUARIO_ADMIN } from '../test/respuestas';
import { ProveedorParcela } from '../parcela/ParcelaContext';
import Configuracion from './Configuracion';

vi.mock('../api/parcelas', () => ({
  obtenerParcela: vi.fn(),
  editarParcela: vi.fn(),
  comprobarClima: vi.fn(),
  borrarParcela: vi.fn(),
}));
vi.mock('../api/dispositivos', () => ({
  listarDispositivos: vi.fn(),
  crearDispositivo: vi.fn(),
  revocarDispositivo: vi.fn(),
  borrarDispositivo: vi.fn(),
  actualizarIntervaloDispositivo: vi.fn(),
}));
vi.mock('../sesion/SesionContext', () => ({
  useSesion: () => ({ usuario: USUARIO_ADMIN, cargando: false, setUsuario: vi.fn(), cerrarSesion: vi.fn() }),
}));

import { obtenerParcela } from '../api/parcelas';
import { actualizarIntervaloDispositivo, listarDispositivos } from '../api/dispositivos';

function montar() {
  obtenerParcela.mockResolvedValue(PARCELA_GESTOR);
  return render(
    <MemoryRouter>
      <ProveedorParcela parcelaId={PARCELA_GESTOR.id}>
        <Configuracion />
      </ProveedorParcela>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listarDispositivos.mockResolvedValue([DISPOSITIVO]);
});

test('el intervalo de envio del dispositivo se muestra con su valor actual', async () => {
  montar();

  const selector = await screen.findByLabelText('Intervalo de envío de Maestro LoRa');
  expect(selector).toHaveValue('14400');
});

test('cambiar el intervalo lo guarda en el backend', async () => {
  actualizarIntervaloDispositivo.mockResolvedValue({ ...DISPOSITIVO, intervalo_ciclo_seg: 7200 });
  montar();

  const selector = await screen.findByLabelText('Intervalo de envío de Maestro LoRa');
  await userEvent.selectOptions(selector, '7200');

  await waitFor(() => expect(actualizarIntervaloDispositivo).toHaveBeenCalledWith(1, 3, 7200));
  await waitFor(() => expect(selector).toHaveValue('7200'));
});

test('tras cambiar el intervalo se avisa de que no es inmediato', async () => {
  actualizarIntervaloDispositivo.mockResolvedValue({ ...DISPOSITIVO, intervalo_ciclo_seg: 7200 });
  montar();

  const selector = await screen.findByLabelText('Intervalo de envío de Maestro LoRa');
  await userEvent.selectOptions(selector, '7200');

  expect(await screen.findByText(/vuelva a conectar/i)).toBeInTheDocument();
});

test('si el backend rechaza el cambio, el selector no se queda con el valor nuevo', async () => {
  actualizarIntervaloDispositivo.mockRejectedValue({
    response: { status: 422, data: { detail: [{ loc: ['body', 'intervalo_ciclo_seg'], msg: 'Input should be greater than or equal to 30' }] } },
  });
  montar();

  const selector = await screen.findByLabelText('Intervalo de envío de Maestro LoRa');
  await userEvent.selectOptions(selector, '7200');

  await waitFor(() => expect(selector).toHaveValue('14400'));
});

test('un intervalo que no esta entre las opciones se muestra tal cual, sin mentir', async () => {
  // El backend acepta cualquier valor entre 30 y 86400; la web solo ofrece 11.
  // Un select controlado sin option coincidente cae en la primera opcion, con
  // lo que el usuario leeria "30 segundos" teniendo el dispositivo a 3000.
  listarDispositivos.mockResolvedValue([{ ...DISPOSITIVO, intervalo_ciclo_seg: 3000 }]);
  montar();

  const selector = await screen.findByLabelText('Intervalo de envío de Maestro LoRa');
  expect(selector).toHaveValue('3000');
});

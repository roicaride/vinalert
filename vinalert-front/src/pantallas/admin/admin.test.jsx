import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';

import { LLAVE_TOKEN } from '../../api/cliente';
import { CUENTAS, USUARIO_SUPERADMIN } from '../../test/respuestas';
import App from '../../App';

vi.mock('../../api/auth', () => ({ me: vi.fn(), login: vi.fn() }));
vi.mock('../../api/parcelas', () => ({ listarParcelas: vi.fn(), obtenerParcela: vi.fn() }));
vi.mock('../../api/admin', () => ({
  listarUsuarios: vi.fn(),
  invitarCliente: vi.fn(),
  editarCuenta: vi.fn(),
  eliminarCuenta: vi.fn(),
  enviarRestablecer: vi.fn(),
  estadoSistema: vi.fn(),
  listarAccesos: vi.fn(),
  guardarConfiguracion: vi.fn(),
}));
vi.mock('../../api/configuracion', () => ({ configuracionPublica: vi.fn() }));
vi.mock('../../utils/exportar', () => ({ exportarExcelMultilibro: vi.fn(), descargarCsv: vi.fn() }));
import { me } from '../../api/auth';
import {
  editarCuenta,
  eliminarCuenta,
  enviarRestablecer,
  estadoSistema,
  guardarConfiguracion,
  listarAccesos,
  listarUsuarios,
} from '../../api/admin';
import { configuracionPublica } from '../../api/configuracion';

const MARTA = CUENTAS[0];

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  localStorage.setItem(LLAVE_TOKEN, 'valido');
  me.mockResolvedValue(USUARIO_SUPERADMIN);
  listarUsuarios.mockResolvedValue(CUENTAS.map((c) => ({ ...c, activo: true, es_superadmin: c.id === 9, acceso_total: c.rol === 'admin' })));
});

function abrir(ruta = '/admin') {
  window.history.replaceState({}, '', ruta);
  render(<App />);
}

async function gestionar(email) {
  // El email propio sale tambien en la cabecera: se busca dentro de la tabla.
  const tabla = await screen.findByRole('table');
  const fila = within(tabla).getByText(email).closest('tr');
  fireEvent.click(within(fila).getByRole('button', { name: /gestionar/i }));
  return screen.findByRole('region', { name: `Gestionar ${email}` });
}

// --- Cuentas -----------------------------------------------------------------

test('desactivar una cuenta lo refleja en la fila', async () => {
  editarCuenta.mockResolvedValue({ ...MARTA, activo: false, es_superadmin: false, acceso_total: false });
  abrir();

  const panel = await gestionar(MARTA.email);
  fireEvent.click(within(panel).getByRole('button', { name: 'Desactivar cuenta' }));

  await waitFor(() => expect(editarCuenta).toHaveBeenCalledWith(12, { activo: false }));
  const fila = screen.getByText(MARTA.email).closest('tr');
  expect(within(fila).getByText('Desactivada')).toBeInTheDocument();
});

test('nombrar superadmin y dar acceso a todas las parcelas', async () => {
  editarCuenta
    .mockResolvedValueOnce({ ...MARTA, activo: true, es_superadmin: true, acceso_total: false })
    .mockResolvedValueOnce({ ...MARTA, activo: true, es_superadmin: true, acceso_total: true });
  abrir();

  const panel = await gestionar(MARTA.email);
  fireEvent.click(within(panel).getByRole('button', { name: 'Nombrar superadmin' }));
  await waitFor(() => expect(editarCuenta).toHaveBeenCalledWith(12, { es_superadmin: true }));
  fireEvent.click(await within(panel).findByRole('button', { name: 'Dar acceso a todas las parcelas' }));
  await waitFor(() => expect(editarCuenta).toHaveBeenCalledWith(12, { acceso_total: true }));
});

test('un rechazo del backend se explica en el panel', async () => {
  editarCuenta.mockRejectedValue({ response: { status: 409, data: { detail: 'Tiene que quedar al menos un superadmin.' } } });
  abrir();

  const panel = await gestionar(MARTA.email);
  fireEvent.click(within(panel).getByRole('button', { name: 'Nombrar superadmin' }));

  expect(await within(panel).findByText('Tiene que quedar al menos un superadmin.')).toBeInTheDocument();
});

test('enviar un enlace para restablecer avisa a quien se ha enviado', async () => {
  enviarRestablecer.mockResolvedValue({ detail: `Enlace enviado a ${MARTA.email}.` });
  abrir();

  const panel = await gestionar(MARTA.email);
  fireEvent.click(within(panel).getByRole('button', { name: /enlace para restablecer/i }));

  expect(await within(panel).findByText(`Enlace enviado a ${MARTA.email}.`)).toBeInTheDocument();
});

test('eliminar pide confirmacion y quita la cuenta del listado', async () => {
  const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
  eliminarCuenta.mockResolvedValue();
  abrir();

  const panel = await gestionar(MARTA.email);
  fireEvent.click(within(panel).getByRole('button', { name: 'Eliminar cuenta' }));

  await waitFor(() => expect(screen.queryByText(MARTA.email)).not.toBeInTheDocument());
  expect(confirmar).toHaveBeenCalled();
  expect(eliminarCuenta).toHaveBeenCalledWith(12);
  confirmar.mockRestore();
});

test('cancelar la confirmacion no elimina nada', async () => {
  const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
  abrir();

  const panel = await gestionar(MARTA.email);
  fireEvent.click(within(panel).getByRole('button', { name: 'Eliminar cuenta' }));

  expect(eliminarCuenta).not.toHaveBeenCalled();
  confirmar.mockRestore();
});

test('en tu propia fila no se puede desactivar ni eliminar', async () => {
  abrir();
  const panel = await gestionar('admin@vinalert.dev');
  expect(within(panel).queryByRole('button', { name: 'Desactivar cuenta' })).not.toBeInTheDocument();
  expect(within(panel).queryByRole('button', { name: 'Eliminar cuenta' })).not.toBeInTheDocument();
});

// --- Estado ------------------------------------------------------------------

test('el estado muestra los trabajos y los dispositivos sin señal', async () => {
  estadoSistema.mockResolvedValue({
    hora_servidor: '2026-10-13T12:00:00',
    correo_configurado: false,
    proveedor_clima: 'open_meteo',
    jobs: [
      { job_id: 'refrescar_clima', nombre: 'Refresco del clima', ultimo_inicio: '2026-10-13T09:00:00', ultimo_fin: '2026-10-13T09:00:05', ultimo_exito: '2026-10-13T09:00:05', procesadas: 3, fallos: 1, ultimo_error: null },
      { job_id: 'consolidar_diario', nombre: 'Consolidación diaria', ultimo_inicio: '2026-10-13T09:00:00', ultimo_fin: '2026-10-13T09:00:01', ultimo_exito: null, procesadas: null, fallos: null, ultimo_error: 'RuntimeError: sin red' },
    ],
    dispositivos: [
      { id: 1, nombre: 'Maestro norte', parcela_id: 1, parcela: 'Viña Norte', activo: true, ultimo_uso: '2026-10-12T20:00:00', intervalo_ciclo_seg: 14400, sin_senal: true },
    ],
  });
  abrir('/admin?seccion=estado');

  expect(await screen.findByText('Refresco del clima')).toBeInTheDocument();
  expect(screen.getByText('RuntimeError: sin red')).toBeInTheDocument();
  expect(screen.getByText(/correo sin configurar/i)).toBeInTheDocument();
  const fila = screen.getByText('Maestro norte').closest('tr');
  expect(within(fila).getByText('Sin señal')).toBeInTheDocument();
  expect(within(fila).getByText('Viña Norte')).toBeInTheDocument();
});

// --- Accesos -----------------------------------------------------------------

test('el registro de accesos se filtra y carga mas', async () => {
  const pagina = Array.from({ length: 100 }, (_, i) => ({
    id: 500 - i, momento: '2026-10-13T10:00:00', tipo: 'login', email: `u${i}@x.es`, ip: '1.1.1.1', resultado: 'fallo',
  }));
  listarAccesos
    .mockResolvedValueOnce(pagina)
    .mockResolvedValueOnce([{ id: 10, momento: '2026-10-12T10:00:00', tipo: 'login', email: 'viejo@x.es', ip: '1.1.1.1', resultado: 'exito' }])
    .mockResolvedValueOnce([]);
  abrir('/admin?seccion=accesos');

  expect(await screen.findByText('u0@x.es')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }));
  expect(await screen.findByText('viejo@x.es')).toBeInTheDocument();
  expect(listarAccesos).toHaveBeenLastCalledWith(expect.objectContaining({ antesDe: 401 }));

  fireEvent.change(screen.getByLabelText('Resultado'), { target: { value: 'exito' } });
  await waitFor(() => expect(listarAccesos).toHaveBeenLastCalledWith(expect.objectContaining({ resultado: 'exito' })));
});

// --- Configuracion -------------------------------------------------------------

test('la configuracion carga los datos del titular y guarda los cambios', async () => {
  configuracionPublica.mockResolvedValue({ titular_nombre: 'Bodegas Ejemplo S.L.', titular_nif: null });
  guardarConfiguracion.mockResolvedValue({ titular_nombre: 'Bodegas Ejemplo S.L.', titular_nif: 'B12345678' });
  abrir('/admin?seccion=configuracion');

  expect(await screen.findByDisplayValue('Bodegas Ejemplo S.L.')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('NIF / CIF'), { target: { value: 'B12345678' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

  expect(await screen.findByText(/guardado/i)).toBeInTheDocument();
  expect(guardarConfiguracion).toHaveBeenCalledWith(expect.objectContaining({ titular_nif: 'B12345678' }));
});

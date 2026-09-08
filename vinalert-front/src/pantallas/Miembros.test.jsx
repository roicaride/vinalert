import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';

import { MIEMBRO_GESTOR, MIEMBRO_LECTURA, PARCELA_GESTOR, PARCELA_LECTURA, USUARIO } from '../test/respuestas';
import { ProveedorParcela, useParcela } from '../parcela/ParcelaContext';
import Miembros from './Miembros';

vi.mock('../api/parcelas', () => ({ obtenerParcela: vi.fn() }));
vi.mock('../api/miembros', () => ({
  listarMiembros: vi.fn(),
  anadirMiembro: vi.fn(),
  cambiarRol: vi.fn(),
  retirarMiembro: vi.fn(),
}));
vi.mock('../sesion/SesionContext', () => ({ useSesion: vi.fn() }));
import { obtenerParcela } from '../api/parcelas';
import { anadirMiembro, cambiarRol, listarMiembros, retirarMiembro } from '../api/miembros';
import { useSesion } from '../sesion/SesionContext';

// Observa el permiso derivado del contexto compartido para poder comprobar,
// desde fuera, que un autocambio de rol lo actualiza de verdad -- no basta
// con mirar la lista local del propio Miembros.jsx.
function SondaPermiso() {
  const { puedeGestionar } = useParcela();
  return <p data-testid="sonda-permiso">{puedeGestionar ? 'puede-gestionar' : 'no-puede-gestionar'}</p>;
}

function montar(parcela, { conSonda = false } = {}) {
  obtenerParcela.mockResolvedValue(parcela);
  return render(
    <ProveedorParcela parcelaId={parcela.id}>
      {conSonda && <SondaPermiso />}
      <Miembros />
    </ProveedorParcela>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useSesion.mockReturnValue({ usuario: USUARIO });
});

test('cualquier miembro ve la lista', async () => {
  listarMiembros.mockResolvedValue([MIEMBRO_GESTOR, MIEMBRO_LECTURA]);
  montar(PARCELA_LECTURA);

  expect(await screen.findByText('test@vinalert.dev')).toBeInTheDocument();
  expect(screen.getByText('otra@vinalert.dev')).toBeInTheDocument();
});

test('un lector no ve los controles de gestion pero si el rol de cada uno', async () => {
  listarMiembros.mockResolvedValue([MIEMBRO_GESTOR]);
  montar(PARCELA_LECTURA);

  await screen.findByText('test@vinalert.dev');
  expect(screen.queryByRole('button', { name: 'Añadir' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Retirar' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/rol de/i)).not.toBeInTheDocument();
  expect(screen.getByText('Gestor')).toBeInTheDocument();
});

test('anadir un miembro lo agrega a la lista', async () => {
  listarMiembros.mockResolvedValue([MIEMBRO_GESTOR]);
  anadirMiembro.mockResolvedValue(MIEMBRO_LECTURA);
  montar(PARCELA_GESTOR);

  await screen.findByText('test@vinalert.dev');
  await userEvent.type(screen.getByLabelText('Email'), 'otra@vinalert.dev');
  await userEvent.click(screen.getByRole('button', { name: 'Añadir' }));

  expect(anadirMiembro).toHaveBeenCalledWith(1, 'otra@vinalert.dev', 'lectura');
  expect(await screen.findByText('otra@vinalert.dev')).toBeInTheDocument();
});

test('anadir un email sin cuenta muestra el mensaje del backend', async () => {
  listarMiembros.mockResolvedValue([MIEMBRO_GESTOR]);
  anadirMiembro.mockRejectedValue({
    response: {
      status: 404,
      data: { detail: 'No hay ninguna cuenta con ese email. Esa persona debe registrarse primero.' },
    },
  });
  montar(PARCELA_GESTOR);

  await screen.findByText('test@vinalert.dev');
  await userEvent.type(screen.getByLabelText('Email'), 'nadie@vinalert.dev');
  await userEvent.click(screen.getByRole('button', { name: 'Añadir' }));

  expect(await screen.findByText(/no hay ninguna cuenta/i)).toBeInTheDocument();
});

test('retirar pide confirmacion y llama al backend', async () => {
  listarMiembros.mockResolvedValue([MIEMBRO_GESTOR, MIEMBRO_LECTURA]);
  retirarMiembro.mockResolvedValue(undefined);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  montar(PARCELA_GESTOR);

  await screen.findByText('otra@vinalert.dev');
  const fila = screen.getByText('otra@vinalert.dev').closest('tr');
  await userEvent.click(within(fila).getByRole('button', { name: 'Retirar' }));

  expect(retirarMiembro).toHaveBeenCalledWith(1, 2);
  await waitFor(() => expect(screen.queryByText('otra@vinalert.dev')).not.toBeInTheDocument());
});

test('cancelar la confirmacion no llama al backend', async () => {
  listarMiembros.mockResolvedValue([MIEMBRO_GESTOR, MIEMBRO_LECTURA]);
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  montar(PARCELA_GESTOR);

  await screen.findByText('otra@vinalert.dev');
  const fila = screen.getByText('otra@vinalert.dev').closest('tr');
  await userEvent.click(within(fila).getByRole('button', { name: 'Retirar' }));

  expect(retirarMiembro).not.toHaveBeenCalled();
  expect(screen.getByText('otra@vinalert.dev')).toBeInTheDocument();
});

test('el guard de "sin gestor" del backend se ve y el select no cambia hasta confirmarse', async () => {
  // Mutacion real: se rompe el guard EN LA RESPUESTA SIMULADA (forzando el
  // 409 al cambiar de rol al unico gestor), no confiando en que el backend
  // real lo aplique. Esto protege el manejo del error en el FRONTEND.
  listarMiembros.mockResolvedValue([MIEMBRO_GESTOR]);
  cambiarRol.mockRejectedValue({
    response: {
      status: 409,
      data: { detail: 'No puedes dejar la parcela sin ningun gestor: nombra a otro antes.' },
    },
  });
  montar(PARCELA_GESTOR);

  await screen.findByText('test@vinalert.dev');
  const select = screen.getByLabelText(`Rol de ${MIEMBRO_GESTOR.nombre}`);
  expect(select).toHaveValue('gestor');

  await userEvent.selectOptions(select, 'lectura');

  expect(await screen.findByText(/sin ningun gestor/i)).toBeInTheDocument();
  expect(select).toHaveValue('gestor');
});

test('un gestor que se cambia su propio rol actualiza el permiso compartido', async () => {
  // Con solo 1 gestor el backend rechazaria la auto-degradacion con 409 (ver
  // el test del guard de "sin gestor"), asi que aqui hace falta un segundo
  // gestor para que la peticion resuelva con exito y podamos comprobar la
  // sincronizacion del contexto compartido, no el manejo del error.
  const OTRO_GESTOR = { usuario_id: 3, nombre: 'Otro Gestor', email: 'otro@vinalert.dev', rol: 'gestor' };
  listarMiembros.mockResolvedValue([MIEMBRO_GESTOR, OTRO_GESTOR]);
  cambiarRol.mockResolvedValue({ ...MIEMBRO_GESTOR, rol: 'lectura' });
  montar(PARCELA_GESTOR, { conSonda: true });

  await screen.findByText('test@vinalert.dev');
  expect(screen.getByTestId('sonda-permiso')).toHaveTextContent('puede-gestionar');

  const select = screen.getByLabelText(`Rol de ${MIEMBRO_GESTOR.nombre}`);
  await userEvent.selectOptions(select, 'lectura');

  // El contexto compartido (del que depende puedeGestionar en TODAS las
  // pantallas de D2) tiene que reflejar el autocambio, no solo la lista
  // local de este componente.
  await waitFor(() => expect(screen.getByTestId('sonda-permiso')).toHaveTextContent('no-puede-gestionar'));
});

test('el boton "Retirar" no aparece en la fila propia, pero si en las demas', async () => {
  listarMiembros.mockResolvedValue([MIEMBRO_GESTOR, MIEMBRO_LECTURA]);
  montar(PARCELA_GESTOR);

  await screen.findByText('test@vinalert.dev');
  const filaPropia = screen.getByText('test@vinalert.dev').closest('tr');
  const filaOtra = screen.getByText('otra@vinalert.dev').closest('tr');

  expect(within(filaPropia).queryByRole('button', { name: 'Retirar' })).not.toBeInTheDocument();
  expect(within(filaOtra).getByRole('button', { name: 'Retirar' })).toBeInTheDocument();
});

test('la carga fallida muestra error sin crashear', async () => {
  listarMiembros.mockRejectedValue({
    response: {
      status: 403,
      data: { detail: 'No tienes acceso a esta parcela.' },
    },
  });
  montar(PARCELA_GESTOR);

  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.getByText(/no tienes permiso/i)).toBeInTheDocument();
});

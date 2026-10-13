import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import App from '../App';

vi.mock('../api/auth', () => ({
  me: vi.fn(),
  login: vi.fn(),
  recuperar: vi.fn(),
  restablecer: vi.fn(),
  verInvitacion: vi.fn(),
  aceptarInvitacion: vi.fn(),
}));
vi.mock('../api/parcelas', () => ({ listarParcelas: vi.fn(), obtenerParcela: vi.fn() }));
import { aceptarInvitacion, me, recuperar, restablecer, verInvitacion } from '../api/auth';
import { listarParcelas } from '../api/parcelas';
import { USUARIO } from '../test/respuestas';

const ENLACE_INVALIDO = {
  response: { status: 400, data: { detail: { codigo: 'enlace_invalido', mensaje: 'x' } } },
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

function abrir(ruta) {
  window.history.replaceState({}, '', ruta);
  render(<App />);
}

describe('recuperar la contraseña', () => {
  test('tras enviar, dice siempre lo mismo', async () => {
    recuperar.mockResolvedValue({ detail: 'x' });
    abrir('/recuperar');

    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'ana@x.es' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar enlace/i }));

    expect(await screen.findByText(/si hay una cuenta con ese email/i)).toBeInTheDocument();
    expect(recuperar).toHaveBeenCalledWith('ana@x.es');
  });
});

describe('restablecer la contraseña', () => {
  function rellenar(a, b) {
    fireEvent.change(screen.getByLabelText('Contraseña nueva'), { target: { value: a } });
    fireEvent.change(screen.getByLabelText('Repite la contraseña'), { target: { value: b } });
    fireEvent.click(screen.getByRole('button', { name: /guardar contraseña/i }));
  }

  test('las dos contraseñas tienen que coincidir', async () => {
    abrir('/restablecer?token=abc');
    await screen.findByLabelText('Contraseña nueva');

    rellenar('cepas-de-albariño', 'cepas-de-albarino');

    expect(await screen.findByText(/no coinciden/i)).toBeInTheDocument();
    expect(restablecer).not.toHaveBeenCalled();
  });

  test('si todo va bien, invita a entrar con la nueva', async () => {
    restablecer.mockResolvedValue();
    abrir('/restablecer?token=abc');
    await screen.findByLabelText('Contraseña nueva');

    rellenar('cepas-de-albariño', 'cepas-de-albariño');

    expect(await screen.findByText(/contraseña cambiada/i)).toBeInTheDocument();
    expect(restablecer).toHaveBeenCalledWith('abc', 'cepas-de-albariño');
  });

  test('un enlace caducado lo explica y ofrece pedir otro', async () => {
    restablecer.mockRejectedValue(ENLACE_INVALIDO);
    abrir('/restablecer?token=viejo');
    await screen.findByLabelText('Contraseña nueva');

    rellenar('cepas-de-albariño', 'cepas-de-albariño');

    expect(await screen.findByText(/ha caducado o ya se ha usado/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /pedir otro enlace/i })).toHaveAttribute('href', '/recuperar');
  });

  test('una contraseña que no cumple la politica muestra el motivo en castellano', async () => {
    restablecer.mockRejectedValue({
      response: {
        status: 422,
        data: { detail: [{ loc: ['body', 'password'], msg: 'Value error, Esa contraseña es demasiado común. Elige otra.' }] },
      },
    });
    abrir('/restablecer?token=abc');
    await screen.findByLabelText('Contraseña nueva');

    rellenar('contraseña123', 'contraseña123');

    expect(await screen.findByText('Esa contraseña es demasiado común. Elige otra.')).toBeInTheDocument();
  });
});

describe('aceptar una invitacion', () => {
  test('muestra quien invita y a que parcela, y al aceptar entra', async () => {
    verInvitacion.mockResolvedValue({ email: 'ana@x.es', invitado_por: 'Roi', parcela: 'Viña Norte' });
    aceptarInvitacion.mockResolvedValue({ access_token: 't' });
    me.mockResolvedValue(USUARIO);
    listarParcelas.mockResolvedValue([]);
    abrir('/invitacion?token=abc');

    expect(await screen.findByText(/Roi te ha invitado/i)).toBeInTheDocument();
    expect(screen.getByText(/Viña Norte/)).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('ana@x.es');
    expect(screen.getByLabelText('Email')).toHaveAttribute('readonly');

    fireEvent.change(screen.getByLabelText('Tu nombre'), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'cepas-de-albariño' } });
    fireEvent.change(screen.getByLabelText('Repite la contraseña'), { target: { value: 'cepas-de-albariño' } });
    fireEvent.click(screen.getByRole('button', { name: /activar mi cuenta/i }));

    await waitFor(() => expect(aceptarInvitacion).toHaveBeenCalledWith('abc', 'Ana', 'cepas-de-albariño'));
    expect(await screen.findByText(/sin parcelas/i)).toBeInTheDocument();
  });

  test('un enlace no valido lo explica', async () => {
    verInvitacion.mockRejectedValue(ENLACE_INVALIDO);
    abrir('/invitacion?token=viejo');

    expect(await screen.findByText(/ha caducado o ya se ha usado/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Tu nombre')).not.toBeInTheDocument();
  });
});

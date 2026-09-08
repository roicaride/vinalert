import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';

import { LLAVE_TOKEN } from '../api/cliente';
import { USUARIO } from '../test/respuestas';
import { ProveedorSesion, useSesion } from './SesionContext';
import RutaProtegida from './RutaProtegida';

vi.mock('../api/auth', () => ({ me: vi.fn() }));
import { me } from '../api/auth';

function Privado() {
  const { usuario } = useSesion();
  return <p>hola {usuario.nombre}</p>;
}

function montar() {
  return render(
    <MemoryRouter initialEntries={['/privado']}>
      <ProveedorSesion>
        <Routes>
          <Route path="/login" element={<p>pantalla de login</p>} />
          <Route
            path="/privado"
            element={<RutaProtegida><Privado /></RutaProtegida>}
          />
        </Routes>
      </ProveedorSesion>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

test('con token valido, carga el usuario y deja pasar', async () => {
  localStorage.setItem(LLAVE_TOKEN, 'valido');
  me.mockResolvedValue(USUARIO);

  montar();

  expect(await screen.findByText('hola Test User')).toBeInTheDocument();
});

test('sin token, no llama a la API y manda al login', async () => {
  montar();

  expect(await screen.findByText('pantalla de login')).toBeInTheDocument();
  expect(me).not.toHaveBeenCalled();
});

test('no redirige mientras la sesion se esta resolviendo', async () => {
  localStorage.setItem(LLAVE_TOKEN, 'valido');
  let resolver;
  me.mockReturnValue(new Promise((r) => { resolver = r; }));

  montar();

  // Con la promesa aun sin resolver, no puede haber decidido nada todavia:
  // redirigir aqui produciria un parpadeo al login en cada carga de pagina.
  expect(screen.queryByText('pantalla de login')).not.toBeInTheDocument();
  expect(screen.queryByText('hola Test User')).not.toBeInTheDocument();

  resolver(USUARIO);
  expect(await screen.findByText('hola Test User')).toBeInTheDocument();
});

test('si /auth/me falla, limpia el token y manda al login', async () => {
  localStorage.setItem(LLAVE_TOKEN, 'basura');
  me.mockRejectedValue(new Error('401'));

  montar();

  expect(await screen.findByText('pantalla de login')).toBeInTheDocument();
  await waitFor(() => expect(localStorage.getItem(LLAVE_TOKEN)).toBeNull());
});

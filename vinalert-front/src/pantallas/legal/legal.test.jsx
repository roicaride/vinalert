import { render, screen, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';

import App from '../../App';

vi.mock('../../api/auth', () => ({ me: vi.fn(), login: vi.fn(), verInvitacion: vi.fn(), aceptarInvitacion: vi.fn() }));
vi.mock('../../api/parcelas', () => ({ listarParcelas: vi.fn(), obtenerParcela: vi.fn() }));
vi.mock('../../api/configuracion', () => ({ configuracionPublica: vi.fn() }));
import { verInvitacion } from '../../api/auth';
import { configuracionPublica } from '../../api/configuracion';

const TITULAR = {
  titular_nombre: 'Bodegas Ejemplo S.L.',
  titular_nif: 'B12345678',
  titular_domicilio: 'Rúa do Viño 1, 36600 Vilagarcía',
  titular_email: 'privacidad@bodegasejemplo.es',
  titular_telefono: null,
  titular_registro: null,
  encargado_nombre: 'Estudio Técnico',
  encargado_nif: null,
  encargado_email: 'soporte@estudio.es',
  proveedor_alojamiento: 'Proveedor UE (Alemania)',
  proveedor_correo: null,
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  configuracionPublica.mockResolvedValue(TITULAR);
});

function abrir(ruta) {
  window.history.replaceState({}, '', ruta);
  render(<App />);
}

test('el aviso legal muestra los datos del titular que se configuran en el panel', async () => {
  abrir('/aviso-legal');

  expect(await screen.findByRole('heading', { name: 'Aviso legal' })).toBeInTheDocument();
  expect(await screen.findAllByText(/Bodegas Ejemplo S\.L\./)).not.toHaveLength(0);
  expect(screen.getByText(/B12345678/)).toBeInTheDocument();
  expect(screen.getAllByText(/privacidad@bodegasejemplo\.es/).length).toBeGreaterThan(0);
});

test('un dato sin rellenar se publica como pendiente, nunca inventado', async () => {
  configuracionPublica.mockResolvedValue({});
  abrir('/aviso-legal');

  expect((await screen.findAllByText(/pendiente de completar/i)).length).toBeGreaterThan(0);
});

test('la politica de privacidad informa de lo que exige el RGPD', async () => {
  abrir('/privacidad');

  expect(await screen.findByRole('heading', { name: 'Política de privacidad' })).toBeInTheDocument();
  await screen.findAllByText(/Bodegas Ejemplo S\.L\./);
  for (const apartado of [/responsable/i, /encargado/i, /finalidad/i, /base jurídica/i, /conserva/i, /derechos/i]) {
    expect(screen.getAllByRole('heading', { name: apartado }).length).toBeGreaterThan(0);
  }
  expect(screen.getByText(/90 días/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /aepd/i })).toHaveAttribute('href', 'https://www.aepd.es');
});

test('la politica de cookies explica que solo hay almacenamiento tecnico', async () => {
  abrir('/cookies');

  expect(await screen.findByRole('heading', { name: 'Política de cookies' })).toBeInTheDocument();
  // El contenido se pinta cuando llega la configuracion, despues del titulo.
  expect(await screen.findByText('access_token')).toBeInTheDocument();
  expect(screen.getByText('vinalert_idioma')).toBeInTheDocument();
});

test('las condiciones de uso existen', async () => {
  abrir('/condiciones');
  expect(await screen.findByRole('heading', { name: 'Condiciones de uso' })).toBeInTheDocument();
});

test('las paginas legales se enlazan entre si', async () => {
  abrir('/privacidad');
  const pie = await screen.findByRole('navigation', { name: 'Información legal' });
  for (const nombre of ['Aviso legal', 'Privacidad', 'Cookies', 'Condiciones de uso']) {
    expect(within(pie).getByRole('link', { name: nombre })).toBeInTheDocument();
  }
});

test('la portada enlaza a las paginas legales y usa el email del titular', async () => {
  localStorage.setItem('vinalert_idioma', 'es');
  abrir('/');

  const pie = await screen.findByRole('navigation', { name: 'Información legal' });
  expect(within(pie).getByRole('link', { name: 'Privacidad' })).toHaveAttribute('href', '/privacidad');
  const solicitar = await screen.findAllByRole('link', { name: 'Solicitar acceso' });
  await vi.waitFor(() => expect(solicitar[0].getAttribute('href')).toContain('privacidad@bodegasejemplo.es'));
});

test('el login enlaza a las paginas legales', async () => {
  abrir('/login');
  const pie = await screen.findByRole('navigation', { name: 'Información legal' });
  expect(within(pie).getByRole('link', { name: 'Aviso legal' })).toBeInTheDocument();
});

test('al aceptar una invitacion se informa de la politica de privacidad', async () => {
  verInvitacion.mockResolvedValue({ email: 'nueva@x.es', invitado_por: 'Roi', parcela: 'Viña Norte' });
  abrir('/invitacion?token=abc');

  await screen.findByLabelText('Tu nombre');
  const aviso = screen.getByText(/al activar tu cuenta/i);
  expect(within(aviso).getByRole('link', { name: /política de privacidad/i })).toHaveAttribute('href', '/privacidad');
});

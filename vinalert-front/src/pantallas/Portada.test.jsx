import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';

import { LLAVE_TOKEN } from '../api/cliente';
import { PARCELA_GESTOR, USUARIO } from '../test/respuestas';
import App from '../App';

vi.mock('../api/auth', () => ({ me: vi.fn(), login: vi.fn(), registro: vi.fn() }));
vi.mock('../api/parcelas', () => ({ listarParcelas: vi.fn(), obtenerParcela: vi.fn() }));
import { me } from '../api/auth';
import { listarParcelas, obtenerParcela } from '../api/parcelas';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  // jsdom se declara en ingles; la portada elige idioma por el navegador, asi
  // que se fija aqui para que cada test decida de que idioma parte.
  vi.spyOn(navigator, 'language', 'get').mockReturnValue('es-ES');
  window.history.replaceState({}, '', '/');
});

test('sin sesion, la raiz ensena la portada y no el panel', async () => {
  render(<App />);

  expect(
    await screen.findByRole('heading', { level: 1, name: 'Deja que la viña hable.' }),
  ).toBeInTheDocument();
  expect(listarParcelas).not.toHaveBeenCalled();
});

test('arriba a la derecha estan iniciar sesion y crear cuenta, cada uno a su modo del login', async () => {
  render(<App />);

  const entrar = await screen.findAllByRole('link', { name: 'Iniciar sesión' });
  expect(entrar[0]).toHaveAttribute('href', '/login');
  const crear = screen.getAllByRole('link', { name: 'Crear cuenta' });
  expect(crear[0]).toHaveAttribute('href', '/login?modo=registro');
});

test('crear cuenta abre el login ya en modo registro', async () => {
  window.history.replaceState({}, '', '/login?modo=registro');

  render(<App />);

  expect(
    await screen.findByRole('heading', { name: /crear cuenta en viñalert/i }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText('Nombre completo')).toBeInTheDocument();
});

test('con sesion, la raiz lleva al panel sin pasar por la portada', async () => {
  localStorage.setItem(LLAVE_TOKEN, 'valido');
  me.mockResolvedValue(USUARIO);
  listarParcelas.mockResolvedValue([PARCELA_GESTOR]);
  obtenerParcela.mockResolvedValue(PARCELA_GESTOR);

  render(<App />);

  expect(await screen.findByText('Parcela Test')).toBeInTheDocument();
  expect(screen.queryByText('Deja que la viña hable.')).not.toBeInTheDocument();
});

test('el selector cambia la portada entre castellano, galego e ingles', async () => {
  render(<App />);
  await screen.findByRole('heading', { level: 1, name: 'Deja que la viña hable.' });

  fireEvent.click(screen.getByRole('button', { name: 'Galego' }));
  expect(screen.getByRole('heading', { level: 1, name: 'Deixa que a viña fale.' })).toBeInTheDocument();
  expect(document.documentElement.lang).toBe('gl');

  fireEvent.click(screen.getByRole('button', { name: 'English' }));
  expect(screen.getByRole('heading', { level: 1, name: 'Let the vineyard speak.' })).toBeInTheDocument();
  expect(screen.getAllByRole('link', { name: 'Sign in' })[0]).toHaveAttribute('href', '/login');
});

test('el idioma elegido se recuerda en la siguiente visita', async () => {
  const { unmount } = render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Galego' }));
  unmount();

  render(<App />);

  expect(
    await screen.findByRole('heading', { level: 1, name: 'Deixa que a viña fale.' }),
  ).toBeInTheDocument();
});

test('sin eleccion previa, un navegador en galego ve la portada en galego', async () => {
  vi.spyOn(navigator, 'language', 'get').mockReturnValue('gl-ES');

  render(<App />);

  expect(
    await screen.findByRole('heading', { level: 1, name: 'Deixa que a viña fale.' }),
  ).toBeInTheDocument();
});

test('solicitar una demostracion abre el correo con el asunto ya puesto', async () => {
  render(<App />);

  const [demo] = await screen.findAllByRole('link', { name: 'Solicitar una demostración' });
  expect(demo.getAttribute('href')).toMatch(/^mailto:.+\?subject=/);
});

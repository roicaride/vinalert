import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';

import App from '../App';
import { LLAVE_TOKEN } from '../api/cliente';
import datos from './datos.json';
import { modoDemo } from './modo';

// Recharts y Leaflet no pintan en jsdom; lo que se prueba aqui es la entrada,
// la salida y que todo vaya contra la API del navegador, no las graficas.
vi.mock('../componentes/MapaSensores', () => ({ default: () => <div>mapa</div> }));

const NOMBRE = datos.respuestas.parcela.nombre;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('vinalert_idioma', 'es');
});

function abrir(ruta) {
  window.history.replaceState({}, '', ruta);
  return render(<App />);
}

test('la landing enlaza a la parcela de ejemplo', async () => {
  abrir('/');
  const enlace = await screen.findByRole('link', { name: 'Ver una parcela de ejemplo' });
  expect(enlace).toHaveAttribute('href', '/demo');
});

test('entrar en el ejemplo abre la parcela sin cuenta y sin llamar al servidor', async () => {
  // axios sale a la red por XMLHttpRequest en el navegador.
  const red = vi.spyOn(XMLHttpRequest.prototype, 'open');
  abrir('/demo');

  expect(await screen.findByText(/parcela de ejemplo con datos inventados/i)).toBeInTheDocument();
  expect((await screen.findAllByText(NOMBRE)).length).toBeGreaterThan(0);
  await waitFor(() => expect(window.location.pathname).toBe(`/p/${datos.parcelaId}/estado`));
  // Ni una peticion ha salido por el adaptador de red de axios.
  expect(red).not.toHaveBeenCalled();
  red.mockRestore();
});

test('como gestor, ve los controles de edicion', async () => {
  abrir('/demo');
  await screen.findByText(/parcela de ejemplo con datos inventados/i);
  window.history.pushState({}, '', `/p/${datos.parcelaId}/tratamientos`);
  fireEvent(window, new PopStateEvent('popstate'));
  expect(await screen.findByRole('button', { name: /registrar|anotar|añadir|guardar/i })).toBeInTheDocument();
});

test('salir del ejemplo vuelve a la portada y no toca la sesion real', async () => {
  localStorage.setItem(LLAVE_TOKEN, 'token-real-del-usuario');
  abrir('/demo');
  fireEvent.click(await screen.findByRole('button', { name: 'Salir del ejemplo' }));

  await waitFor(() => expect(window.location.pathname).toBe('/'));
  expect(modoDemo.activo()).toBe(false);
  expect(localStorage.getItem(LLAVE_TOKEN)).toBe('token-real-del-usuario');
});

test('la banda ofrece pedir una demostracion de verdad', async () => {
  abrir('/demo');
  const pedir = await screen.findByRole('link', { name: 'Solicitar una demostración' });
  expect(pedir.getAttribute('href')).toMatch(/^mailto:hortalert@gmail\.com\?subject=/);
});

// Lo que haria un visitante: anotar un tratamiento y verlo en el cuaderno.
test('en el ejemplo se registra un tratamiento desde el formulario y aparece en el cuaderno', async () => {
  abrir('/demo');
  await screen.findByText(/parcela de ejemplo con datos inventados/i);
  window.history.pushState({}, '', `/p/${datos.parcelaId}/tratamientos`);
  fireEvent(window, new PopStateEvent('popstate'));

  fireEvent.change(await screen.findByLabelText('Fecha'), { target: { value: '2026-10-14T09:30' } });
  fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'Fungicida' } });
  fireEvent.change(screen.getByLabelText('Producto'), { target: { value: 'Producto de prueba' } });
  fireEvent.click(screen.getByRole('button', { name: 'Registrar tratamiento' }));

  expect(await screen.findByText('Producto de prueba')).toBeInTheDocument();
});

test('al recargar el ejemplo, lo anotado desaparece', async () => {
  const { unmount } = abrir('/demo');
  await screen.findByText(/parcela de ejemplo con datos inventados/i);
  unmount();
  abrir('/demo');
  window.history.pushState({}, '', `/p/${datos.parcelaId}/tratamientos`);
  fireEvent(window, new PopStateEvent('popstate'));
  await screen.findByText(/registrar una aplicación/i);
  expect(screen.queryByText('Producto de prueba')).not.toBeInTheDocument();
});

test('la banda del ejemplo sigue visible en Mi cuenta', async () => {
  abrir('/demo');
  await screen.findByText(/parcela de ejemplo con datos inventados/i);
  window.history.pushState({}, '', '/cuenta');
  fireEvent(window, new PopStateEvent('popstate'));
  await screen.findByRole('heading', { name: 'Mi cuenta' });
  expect(screen.getByText(/parcela de ejemplo con datos inventados/i)).toBeInTheDocument();
});

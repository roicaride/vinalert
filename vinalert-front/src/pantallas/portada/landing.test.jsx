import { render, screen, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';

import App from '../../App';
import { EQUIPO, TEXTOS } from './textos';

vi.mock('../../api/auth', () => ({ me: vi.fn(), login: vi.fn() }));
vi.mock('../../api/parcelas', () => ({ listarParcelas: vi.fn(), obtenerParcela: vi.fn() }));
vi.mock('../../api/configuracion', () => ({ configuracionPublica: vi.fn().mockResolvedValue({}) }));

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('vinalert_idioma', 'es');
  window.history.replaceState({}, '', '/');
});

function abrir() {
  render(<App />);
  return screen.findByRole('heading', { level: 1 });
}

// La landing no puede prometer lo que el producto ya no hace: la logica de
// riego se retiro en septiembre de 2026 y los permisos por parcela son dos.
test.each(['es', 'gl', 'en'])('en %s no se promete riego ni tres niveles de permiso', (idioma) => {
  const todo = JSON.stringify(TEXTOS[idioma]).toLowerCase();
  for (const promesa of ['riego', 'regar', 'de rega', 'regadío', 'irrigat', 'when to water', 'cando regar', '3 niveis', '3 niveles', '3 levels']) {
    expect(todo).not.toContain(promesa);
  }
});

test('la portada muestra el corte del suelo con las tres sondas', async () => {
  await abrir();
  const corte = screen.getByRole('img', { name: /corte del suelo/i });
  expect(within(corte).getAllByText(/cm$/)).toHaveLength(3);
});

test('hay una sola llamada a la accion de contacto: solicitar una demostracion', async () => {
  await abrir();
  expect(screen.queryByRole('link', { name: 'Solicitar acceso' })).not.toBeInTheDocument();
  const demos = screen.getAllByRole('link', { name: 'Solicitar una demostración' });
  expect(demos.length).toBeGreaterThan(0);
  for (const d of demos) expect(d.getAttribute('href')).toMatch(/^mailto:.+\?subject=/);
});

test('la trayectoria cuenta la instalacion, el premio y el programa', async () => {
  await abrir();
  const banda = screen.getByRole('region', { name: 'Trayectoria' });
  expect(within(banda).getByText(/18 sensores/)).toBeInTheDocument();
  expect(within(banda).getByText(/Semente Ribeira Sacra/)).toBeInTheDocument();
  expect(within(banda).getByText(/Incuba Emprende/)).toBeInTheDocument();
});

test('el equipo son los tres cofundadores, con su LinkedIn', async () => {
  await abrir();
  const equipo = screen.getByRole('region', { name: TEXTOS.es.equipo.titulo });
  for (const persona of EQUIPO) {
    expect(within(equipo).getByRole('heading', { name: persona.nombre })).toBeInTheDocument();
    const enlace = within(equipo).getByRole('link', { name: `LinkedIn de ${persona.nombre}` });
    expect(enlace.getAttribute('href')).toMatch(/^https:\/\/(www\.)?linkedin\.com\/in\//);
    expect(enlace).toHaveAttribute('rel', expect.stringContaining('noopener'));
  }
  expect(within(equipo).queryByText(/\[Nombre/)).not.toBeInTheDocument();
});

test('la ficha tecnica dice como se accede y de donde salen los mapas', async () => {
  await abrir();
  expect(screen.getByText('Por invitación')).toBeInTheDocument();
  expect(screen.getByText(/IGN · PNOA/)).toBeInTheDocument();
});

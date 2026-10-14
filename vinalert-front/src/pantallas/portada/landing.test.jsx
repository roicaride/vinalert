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
  // Lo que importa es que ya hay un cliente; las cifras van como detalle.
  expect(within(banda).getAllByRole('heading', { level: 3 })[0]).toHaveTextContent(/ya en uso/i);
  expect(within(banda).getByText(/centro de investigación de una universidad pública/)).toBeInTheDocument();
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

test('la ficha tecnica cuenta lo que hace el equipo, no a que proveedores llama', async () => {
  await abrir();
  const ficha = screen.getByRole('region', { name: TEXTOS.es.ficha.titulo });
  expect(within(ficha).getByText(/por invitación/i)).toBeInTheDocument();
  expect(within(ficha).getByText(/sin cobertura/i)).toBeInTheDocument();
  for (const proveedor of [/open-meteo/i, /IGN/, /PNOA/]) {
    expect(within(ficha).queryByText(proveedor)).not.toBeInTheDocument();
  }
});

test.each(['es', 'gl', 'en'])('en %s la landing no nombra proveedores de datos', (idioma) => {
  const t = TEXTOS[idioma];
  const visible = JSON.stringify([t.portada, t.trayectoria, t.como, t.ofrecemos, t.ficha]).toLowerCase();
  for (const proveedor of ['open-meteo', 'pnoa', 'ign ']) {
    expect(visible).not.toContain(proveedor);
  }
});

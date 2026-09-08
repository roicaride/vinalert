import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';

import { LLAVE_TOKEN } from './api/cliente';
import Navegacion from './layout/Navegacion';
import { SECCIONES, SECCION_POR_DEFECTO } from './secciones';
import { PARCELA_GESTOR, USUARIO } from './test/respuestas';

vi.mock('./api/auth', () => ({ me: vi.fn(), login: vi.fn() }));
vi.mock('./api/parcelas', () => ({ listarParcelas: vi.fn(), obtenerParcela: vi.fn() }));
import { me } from './api/auth';
import { listarParcelas, obtenerParcela } from './api/parcelas';
import App from './App';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/');
});

test('cada seccion declara los cuatro campos que consumen sus dos usuarios', () => {
  // La barra lateral usa `etiqueta`; el marcador de seccion usa `titulo` y
  // `descripcion`; las rutas usan `ruta`. Si alguien anade una seccion a medias,
  // falla aqui y no en la pantalla.
  for (const s of SECCIONES) {
    expect(s.ruta, `seccion sin ruta: ${JSON.stringify(s)}`).toBeTruthy();
    expect(s.etiqueta, `seccion ${s.ruta} sin etiqueta`).toBeTruthy();
    expect(s.titulo, `seccion ${s.ruta} sin titulo`).toBeTruthy();
    expect(s.descripcion, `seccion ${s.ruta} sin descripcion`).toBeTruthy();
  }
});

test('la seccion por defecto existe en la lista', () => {
  expect(SECCIONES.map((s) => s.ruta)).toContain(SECCION_POR_DEFECTO);
});

test('la barra lateral pinta un enlace por cada seccion, sin sobrar ni faltar', () => {
  // Guarda estructural: navegacion y rutas salen de la MISMA lista. Antes
  // estaban duplicadas en dos ficheros, y bastaba con tocar uno para dejar una
  // ruta sin enlace o un enlace que no lleva a ninguna parte.
  render(<MemoryRouter><Navegacion parcelaId={1} /></MemoryRouter>);

  const enlaces = screen.getAllByRole('link');
  expect(enlaces).toHaveLength(SECCIONES.length);

  for (const s of SECCIONES) {
    expect(screen.getByRole('link', { name: s.etiqueta })).toHaveAttribute(
      'href',
      `/p/1/${s.ruta}`,
    );
  }
});

test('un fallo al cargar las parcelas se distingue de no tener ninguna', async () => {
  // Tratarlos igual le diria al usuario que no tiene parcelas cuando lo que
  // pasa es que la API esta caida.
  localStorage.setItem(LLAVE_TOKEN, 'valido');
  me.mockResolvedValue(USUARIO);
  listarParcelas.mockRejectedValue({ response: { status: 500 } });
  obtenerParcela.mockResolvedValue(PARCELA_GESTOR);

  render(<App />);

  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.queryByText(/todavía no tienes ninguna parcela/i)).not.toBeInTheDocument();
});

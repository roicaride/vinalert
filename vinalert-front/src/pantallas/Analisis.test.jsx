import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';

import {
  CLIMA_DIARIO,
  LECTURA_FOLIAR,
  PARCELA_GESTOR,
  SUELO_DIARIO,
  TRATAMIENTO,
} from '../test/respuestas';
import { ProveedorParcela } from '../parcela/ParcelaContext';
import Analisis from './Analisis';

vi.mock('../api/parcelas', () => ({ obtenerParcela: vi.fn() }));
vi.mock('../api/analisis', () => ({
  obtenerSueloDiario: vi.fn(),
  obtenerClimaDiario: vi.fn(),
}));
vi.mock('../api/estado', () => ({
  obtenerHistorico: vi.fn(),
}));
vi.mock('../api/tratamientos', () => ({ listarTratamientos: vi.fn() }));
vi.mock('../api/foliar', () => ({ listarFoliar: vi.fn() }));

import { obtenerParcela } from '../api/parcelas';
import { obtenerClimaDiario, obtenerSueloDiario } from '../api/analisis';
import { obtenerHistorico } from '../api/estado';
import { listarTratamientos } from '../api/tratamientos';
import { listarFoliar } from '../api/foliar';

function montar(parcela = PARCELA_GESTOR) {
  obtenerParcela.mockResolvedValue(parcela);
  return render(
    <ProveedorParcela parcelaId={parcela.id}><Analisis /></ProveedorParcela>,
  );
}

beforeEach(() => vi.clearAllMocks());

test('se ven los KPIs del período y las secciones de gráficas', async () => {
  obtenerSueloDiario.mockResolvedValue(SUELO_DIARIO);
  obtenerClimaDiario.mockResolvedValue(CLIMA_DIARIO);
  listarTratamientos.mockResolvedValue([TRATAMIENTO]);
  listarFoliar.mockResolvedValue([LECTURA_FOLIAR]);

  montar();

  expect(await screen.findByText('Análisis')).toBeInTheDocument();
  // Lluvia total: 5.2 mm
  expect(screen.getByText('5.2 mm')).toBeInTheDocument();
  // ET0 total: 3.1 + 4.2 = 7.3 mm
  expect(screen.getByText('7.3 mm')).toBeInTheDocument();
  // Balance: 5.2 - 7.3 = -2.1 mm
  expect(screen.getByText('-2.1 mm')).toBeInTheDocument();
  // Títulos de gráficas
  expect(screen.getByText(/temperatura y humedad del suelo/i)).toBeInTheDocument();
  expect(screen.getByText(/clima y balance hídrico/i)).toBeInTheDocument();
  expect(screen.getByText(/mediciones foliares/i)).toBeInTheDocument();
});

test('cambiar el rango temporal recarga los datos con el nuevo número de días o 48h', async () => {
  obtenerSueloDiario.mockResolvedValue(SUELO_DIARIO);
  obtenerClimaDiario.mockResolvedValue(CLIMA_DIARIO);
  obtenerHistorico.mockResolvedValue([]);
  listarTratamientos.mockResolvedValue([]);
  listarFoliar.mockResolvedValue([]);

  montar();

  await screen.findByText('Análisis');
  expect(obtenerSueloDiario).toHaveBeenCalledWith(1, 30);

  const boton7d = screen.getByRole('button', { name: '7 días' });
  await userEvent.click(boton7d);

  await waitFor(() => expect(obtenerSueloDiario).toHaveBeenCalledWith(1, 7));
  expect(obtenerClimaDiario).toHaveBeenCalledWith(1, 7);

  const boton48h = screen.getByRole('button', { name: '48 horas' });
  await userEvent.click(boton48h);

  await waitFor(() => expect(obtenerHistorico).toHaveBeenCalledWith(1, 2000, 48));
});


test('sin datos consolidados muestra un aviso claro', async () => {
  obtenerSueloDiario.mockResolvedValue([]);
  obtenerClimaDiario.mockResolvedValue([]);
  listarTratamientos.mockResolvedValue([]);
  listarFoliar.mockResolvedValue([]);

  montar();

  expect(await screen.findByText(/todavía no hay datos diarios consolidados/i)).toBeInTheDocument();
});

test('un error al cargar las series se traduce con MensajeError', async () => {
  obtenerSueloDiario.mockRejectedValue({ response: { status: 500 } });
  obtenerClimaDiario.mockResolvedValue([]);
  listarTratamientos.mockResolvedValue([]);
  listarFoliar.mockResolvedValue([]);

  montar();

  expect(await screen.findByRole('alert')).toBeInTheDocument();
});

test('el boton de exportar a Excel / CSV se habilita cuando hay datos', async () => {
  obtenerSueloDiario.mockResolvedValue(SUELO_DIARIO);
  obtenerClimaDiario.mockResolvedValue(CLIMA_DIARIO);
  listarTratamientos.mockResolvedValue([TRATAMIENTO]);
  listarFoliar.mockResolvedValue([LECTURA_FOLIAR]);

  montar();

  const botonExportar = await screen.findByRole('button', { name: /exportar a excel/i });
  expect(botonExportar).toBeInTheDocument();
  expect(botonExportar).not.toBeDisabled();
});


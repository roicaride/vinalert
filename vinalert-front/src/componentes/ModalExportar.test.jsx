import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';

import { SUELO_DIARIO } from '../test/respuestas';
import ModalExportar from './ModalExportar';

vi.mock('../api/analisis', () => ({ obtenerSueloDiario: vi.fn(), obtenerClimaDiario: vi.fn() }));
vi.mock('../api/estado', () => ({ obtenerHistorico: vi.fn() }));
vi.mock('../api/tratamientos', () => ({ listarTratamientos: vi.fn() }));
vi.mock('../api/foliar', () => ({ listarFoliar: vi.fn() }));
vi.mock('../utils/exportar', () => ({ exportarExcelMultilibro: vi.fn(), descargarCsv: vi.fn() }));
import { obtenerClimaDiario, obtenerSueloDiario } from '../api/analisis';
import { obtenerHistorico } from '../api/estado';
import { listarFoliar } from '../api/foliar';
import { listarTratamientos } from '../api/tratamientos';
import { exportarExcelMultilibro } from '../utils/exportar';

beforeEach(() => {
  vi.clearAllMocks();
  obtenerSueloDiario.mockResolvedValue(SUELO_DIARIO);
  obtenerClimaDiario.mockResolvedValue([]);
  obtenerHistorico.mockResolvedValue([]);
  listarTratamientos.mockResolvedValue([]);
  listarFoliar.mockResolvedValue([]);
});

test('el Excel lleva la media justa diaria y una pestaña con cada sensor', async () => {
  render(<ModalExportar parcela={{ id: 1, nombre: 'Prueba' }} abierto alCerrar={() => {}} />);

  fireEvent.click(screen.getByRole('button', { name: 'Descargar XLSX' }));

  await waitFor(() => expect(exportarExcelMultilibro).toHaveBeenCalled());
  const [, pestanas] = exportarExcelMultilibro.mock.calls[0];

  const diaria = pestanas.find((p) => p.nombre === 'Análisis Diario');
  const dia15 = diaria.filas.find((f) => f[0] === '2026-08-15');
  expect(dia15[1]).toBe(27); // (32 + 22) / 2: justa, no ponderada por lecturas

  const porSensor = pestanas.find((p) => p.nombre === 'Suelo por sensor');
  expect(porSensor.cabeceras[0]).toBe('Fecha');
  expect(porSensor.filas).toHaveLength(4);
  expect(porSensor.filas[0]).toEqual(['2026-08-14', 'S1', 20, 30, 31, 29, 18, 19, 17, 100]);
});

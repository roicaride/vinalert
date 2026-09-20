import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';

import {
  CLIMA_DIARIO,
  CLIMA_HORARIO,
  LOG_SENSOR,
  LECTURA_FOLIAR,
  PARCELA_GESTOR,
  SENSORES_PARCELA,
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
  obtenerClimaHorario: vi.fn(),
}));
vi.mock('../api/tratamientos', () => ({ listarTratamientos: vi.fn() }));
vi.mock('../api/foliar', () => ({ listarFoliar: vi.fn() }));
vi.mock('../api/sensores', () => ({ listarSensores: vi.fn() }));

import { obtenerParcela } from '../api/parcelas';
import { obtenerClimaDiario, obtenerSueloDiario } from '../api/analisis';
import { obtenerClimaHorario, obtenerHistorico } from '../api/estado';
import { listarTratamientos } from '../api/tratamientos';
import { listarFoliar } from '../api/foliar';
import { listarSensores } from '../api/sensores';

function montar(parcela = PARCELA_GESTOR) {
  obtenerParcela.mockResolvedValue(parcela);
  return render(
    <ProveedorParcela parcelaId={parcela.id}><Analisis /></ProveedorParcela>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  obtenerClimaHorario.mockResolvedValue([]);
  listarSensores.mockResolvedValue(SENSORES_PARCELA);
});

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


test('la vista Detalle cambia las graficas base por las del clima completo', async () => {
  obtenerSueloDiario.mockResolvedValue(SUELO_DIARIO);
  obtenerClimaDiario.mockResolvedValue(CLIMA_DIARIO);
  listarTratamientos.mockResolvedValue([]);
  listarFoliar.mockResolvedValue([]);
  montar();

  await screen.findByText(/clima y balance hídrico/i);
  expect(screen.getByRole('button', { name: 'Resumen' })).toHaveAttribute('aria-pressed', 'true');

  await userEvent.click(screen.getByRole('button', { name: 'Detalle' }));

  expect(screen.getByText('Humedad del aire y hoja mojada')).toBeInTheDocument();
  expect(screen.getByText('Horas de sol')).toBeInTheDocument();
  expect(screen.getByText('Viento')).toBeInTheDocument();
  expect(screen.getByText('Humedad del suelo: tus sondas y el modelo')).toBeInTheDocument();
  expect(screen.queryByText(/clima y balance hídrico/i)).not.toBeInTheDocument();
  // Las cifras del periodo siguen arriba en las dos vistas.
  expect(screen.getByText('5.2 mm')).toBeInTheDocument();
});

test('en 48 horas no hay vista Detalle: son lecturas sueltas, no dias', async () => {
  obtenerSueloDiario.mockResolvedValue(SUELO_DIARIO);
  obtenerClimaDiario.mockResolvedValue(CLIMA_DIARIO);
  obtenerHistorico.mockResolvedValue([]);
  listarTratamientos.mockResolvedValue([]);
  listarFoliar.mockResolvedValue([]);
  montar();
  await screen.findByText(/clima y balance hídrico/i);

  await userEvent.click(screen.getByRole('button', { name: '48 horas' }));

  await waitFor(() => expect(screen.getByRole('button', { name: 'Detalle' })).toBeDisabled());
});

test('en 48 horas la lluvia y la ET0 son las de cada hora, sumadas una sola vez', async () => {
  // Antes se sumaba la lluvia pegada a cada lectura: la misma cifra de 15
  // minutos repetida en todas las lecturas cercanas.
  const lecturas = Array.from({ length: 20 }, (_, i) => ({
    ...LOG_SENSOR, id: i + 1, fecha_hora: `2026-09-18T09:${String(i).padStart(2, '0')}:00`, lluvia_mm: 5, et0: 1,
  }));
  obtenerSueloDiario.mockResolvedValue(SUELO_DIARIO);
  obtenerClimaDiario.mockResolvedValue(CLIMA_DIARIO);
  obtenerHistorico.mockResolvedValue(lecturas);
  obtenerClimaHorario.mockResolvedValue(CLIMA_HORARIO);
  listarTratamientos.mockResolvedValue([]);
  listarFoliar.mockResolvedValue([]);
  montar();
  await screen.findByText(/clima y balance hídrico/i);

  await userEvent.click(screen.getByRole('button', { name: '48 horas' }));

  // Solo las 3 horas pasadas: 0.5 + 1.0 + 0 mm y 0.2 + 0.3 + 0.1 mm.
  expect(await screen.findByText('1.5 mm')).toBeInTheDocument();
  expect(screen.getByText('0.6 mm')).toBeInTheDocument();
  expect(screen.getByText('+0.9 mm')).toBeInTheDocument();
});

test('en 48 horas la humedad del suelo del KPI es la media justa de los sensores elegidos', async () => {
  // Sensor 1 (id 1) manda 3 lecturas a 30 %, sensor 2 (id 2) manda 1 a 10 %:
  // media justa (30 + 10) / 2 = 20 %, no la media por lectura (100/4 = 25 %).
  const lecturas = [
    { ...LOG_SENSOR, id: 1, sensor_id: 1, fecha_hora: '2026-09-18T09:00:00', humedad_suelo_pct: 30 },
    { ...LOG_SENSOR, id: 2, sensor_id: 1, fecha_hora: '2026-09-18T09:05:00', humedad_suelo_pct: 30 },
    { ...LOG_SENSOR, id: 3, sensor_id: 1, fecha_hora: '2026-09-18T09:10:00', humedad_suelo_pct: 30 },
    { ...LOG_SENSOR, id: 4, sensor_id: 2, fecha_hora: '2026-09-18T09:00:00', humedad_suelo_pct: 10 },
  ];
  obtenerSueloDiario.mockResolvedValue(SUELO_DIARIO);
  obtenerClimaDiario.mockResolvedValue(CLIMA_DIARIO);
  obtenerHistorico.mockResolvedValue(lecturas);
  listarTratamientos.mockResolvedValue([]);
  listarFoliar.mockResolvedValue([]);
  montar();
  await screen.findByText(/clima y balance hídrico/i);

  await userEvent.click(screen.getByRole('button', { name: '48 horas' }));

  expect(await screen.findByText('20.0 %')).toBeInTheDocument();
});

function montarDiario() {
  obtenerSueloDiario.mockResolvedValue(SUELO_DIARIO);
  obtenerClimaDiario.mockResolvedValue(CLIMA_DIARIO);
  listarTratamientos.mockResolvedValue([]);
  listarFoliar.mockResolvedValue([]);
  montar();
}

test('por defecto la humedad y la temperatura del periodo son la media justa de todos', async () => {
  montarDiario();

  expect(await screen.findByText('26.0 %')).toBeInTheDocument();
  expect(screen.getByText('17.5 °C')).toBeInTheDocument();
  // El sensor dado de baja no aparece en el selector.
  expect(screen.getByRole('button', { name: 'Sensor 1, 20 cm' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Sensor 3, 60 cm' })).not.toBeInTheDocument();
});

test('las cifras siguen a los sensores elegidos', async () => {
  montarDiario();
  await screen.findByText('26.0 %');

  await userEvent.click(screen.getByRole('button', { name: '20 cm' }));

  expect(await screen.findByText('31.0 %')).toBeInTheDocument();
  expect(screen.getByText('19.0 °C')).toBeInTheDocument();
});

test('Comparar parte la grafica de suelo en humedad y temperatura por sensor', async () => {
  montarDiario();
  await screen.findByText(/temperatura y humedad del suelo/i);

  await userEvent.click(screen.getByRole('button', { name: 'Comparar' }));

  expect(screen.getByText('Humedad del suelo por sensor')).toBeInTheDocument();
  expect(screen.getByText('Temperatura del suelo por sensor')).toBeInTheDocument();
  expect(screen.queryByText(/temperatura y humedad del suelo/i)).not.toBeInTheDocument();
  // El clima no depende de los sensores.
  expect(screen.getByText(/clima y balance hídrico/i)).toBeInTheDocument();
});

test('sin lista de sensores se ve la media aunque hubiera Comparar guardado', async () => {
  localStorage.setItem('vinalert_sensores_1', JSON.stringify({ ids: [1], modo: 'comparar' }));
  listarSensores.mockRejectedValue(new Error('x'));
  montarDiario();

  expect(await screen.findByText('Temperatura y humedad del suelo')).toBeInTheDocument();
  expect(screen.queryByText('Humedad del suelo por sensor')).not.toBeInTheDocument();
  // La cifra sigue siendo la media justa de todos los sensores de los datos.
  expect(screen.getByText('26.0 %')).toBeInTheDocument();
});

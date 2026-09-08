import { render, screen } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';

import { DASHBOARD, LOG_SENSOR, PARCELA_GESTOR } from '../test/respuestas';
import { ProveedorParcela } from '../parcela/ParcelaContext';
import Estado from './Estado';

vi.mock('../api/parcelas', () => ({ obtenerParcela: vi.fn(), actualizarClima: vi.fn() }));
vi.mock('../api/estado', () => ({ obtenerDashboard: vi.fn(), obtenerHistorico: vi.fn() }));
import { obtenerParcela, actualizarClima } from '../api/parcelas';
import { obtenerDashboard, obtenerHistorico } from '../api/estado';


function montar(parcela) {
  obtenerParcela.mockResolvedValue(parcela);
  return render(
    <ProveedorParcela parcelaId={parcela.id}><Estado /></ProveedorParcela>,
  );
}

beforeEach(() => vi.clearAllMocks());

test('se ve el resumen de suelo y clima', async () => {
  obtenerDashboard.mockResolvedValue(DASHBOARD);
  obtenerHistorico.mockResolvedValue([LOG_SENSOR]);
  montar(PARCELA_GESTOR);

  expect(await screen.findByText('28.4 %')).toBeInTheDocument();
  expect(screen.getByText('21.5 °C')).toBeInTheDocument();
});

test('sin clima todavia pedido, se avisa en vez de mostrar campos vacios', async () => {
  obtenerDashboard.mockResolvedValue({ ...DASHBOARD, clima_actual: null });
  obtenerHistorico.mockResolvedValue([]);
  montar(PARCELA_GESTOR);

  expect(await screen.findByText(/no se ha pedido el clima/i)).toBeInTheDocument();
});

test('se ven las ultimas lecturas, la mas reciente primero', async () => {
  const antigua = { ...LOG_SENSOR, id: 1, fecha_hora: '2026-08-20T06:00:00', humedad_suelo_pct: 25 };
  const reciente = { ...LOG_SENSOR, id: 2, fecha_hora: '2026-08-20T08:00:00', humedad_suelo_pct: 30 };
  obtenerDashboard.mockResolvedValue(DASHBOARD);
  // El backend devuelve el historico en orden ASCENDENTE (mas antigua primero).
  obtenerHistorico.mockResolvedValue([antigua, reciente]);

  montar(PARCELA_GESTOR);

  const filas = await screen.findAllByRole('row');
  // filas[0] es la cabecera; la primera fila de datos debe ser la mas reciente.
  expect(filas[1]).toHaveTextContent('30 %');
});

test('un fallo al cargar se traduce con MensajeError', async () => {
  obtenerDashboard.mockRejectedValue({ response: { status: 500 } });
  obtenerHistorico.mockResolvedValue([]);
  montar(PARCELA_GESTOR);

  expect(await screen.findByRole('alert')).toBeInTheDocument();
});

test('el boton de exportar a Excel / CSV se habilita cuando hay lecturas', async () => {
  obtenerDashboard.mockResolvedValue(DASHBOARD);
  obtenerHistorico.mockResolvedValue([LOG_SENSOR]);
  montar(PARCELA_GESTOR);

  const botonExportar = await screen.findByRole('button', { name: /exportar a excel/i });
  expect(botonExportar).toBeInTheDocument();
  expect(botonExportar).not.toBeDisabled();
});



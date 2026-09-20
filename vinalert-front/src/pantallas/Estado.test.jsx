import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';

import { CLIMA_HORARIO, DASHBOARD, LOG_SENSOR, PARCELA_GESTOR } from '../test/respuestas';
import { ProveedorParcela } from '../parcela/ParcelaContext';
import Estado from './Estado';

vi.mock('../api/parcelas', () => ({ obtenerParcela: vi.fn(), actualizarClima: vi.fn() }));
vi.mock('../api/estado', () => ({ obtenerDashboard: vi.fn(), obtenerHistorico: vi.fn(), obtenerClimaHorario: vi.fn() }));
import { obtenerParcela, actualizarClima } from '../api/parcelas';
import { obtenerClimaHorario, obtenerDashboard, obtenerHistorico } from '../api/estado';


function montar(parcela) {
  obtenerParcela.mockResolvedValue(parcela);
  return render(
    <ProveedorParcela parcelaId={parcela.id}><Estado /></ProveedorParcela>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  obtenerClimaHorario.mockResolvedValue(CLIMA_HORARIO);
});

test('se ve el resumen de suelo y clima', async () => {
  obtenerDashboard.mockResolvedValue(DASHBOARD);
  obtenerHistorico.mockResolvedValue([LOG_SENSOR]);
  montar(PARCELA_GESTOR);

  expect(await screen.findByText('28.4 %')).toBeInTheDocument();
  expect(screen.getByText('21.5 °C')).toBeInTheDocument();
});

test('las medias del suelo se redondean a la resolucion del sensor, sin dispersion', async () => {
  // Valores reales devueltos por /dashboard el 17-09-2026: la media sale con
  // todos los decimales del calculo, pero las sondas miden con uno (2.4 %,
  // 26.5 °C), asi que mostrar mas seria inventar precision.
  obtenerDashboard.mockResolvedValue({
    ...DASHBOARD,
    estado_suelo: {
      ...DASHBOARD.estado_suelo,
      humedad_media: 0.8132450331125828,
      humedad_sd: 1.161417266199003,
      temperatura_media: 25.90927152317881,
      temperatura_sd: 0.3,
    },
  });
  obtenerHistorico.mockResolvedValue([]);
  montar(PARCELA_GESTOR);

  expect(await screen.findByText('0.8 %')).toBeInTheDocument();
  expect(screen.getByText('25.9 °C')).toBeInTheDocument();
  expect(screen.queryByText(/±/)).not.toBeInTheDocument();
});

test('una media redonda conserva su decimal: 26.0 no es lo mismo que 26', async () => {
  obtenerDashboard.mockResolvedValue({
    ...DASHBOARD,
    estado_suelo: { ...DASHBOARD.estado_suelo, temperatura_media: 25.98 },
  });
  obtenerHistorico.mockResolvedValue([]);
  montar(PARCELA_GESTOR);

  expect(await screen.findByText('26.0 °C')).toBeInTheDocument();
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



test('por defecto solo se piden las 10 ultimas lecturas', async () => {
  obtenerDashboard.mockResolvedValue(DASHBOARD);
  obtenerHistorico.mockResolvedValue([LOG_SENSOR]);
  montar(PARCELA_GESTOR);

  await screen.findByText('28.4 %');
  expect(obtenerHistorico).toHaveBeenCalledWith(PARCELA_GESTOR.id, 10);
});

test('el desplegable pide mas lecturas sin recargar el resto de la pantalla', async () => {
  const lectura = (id, pct) => ({ ...LOG_SENSOR, id, humedad_suelo_pct: pct, fecha_hora: `2026-08-20T0${id}:00:00` });
  obtenerDashboard.mockResolvedValue(DASHBOARD);
  obtenerHistorico.mockResolvedValueOnce([lectura(1, 11)]);
  montar(PARCELA_GESTOR);
  await screen.findByText('11 %');

  obtenerHistorico.mockResolvedValueOnce([lectura(1, 11), lectura(2, 22), lectura(3, 33)]);
  await userEvent.selectOptions(screen.getByLabelText('Lecturas a mostrar'), '50');

  expect(await screen.findByText('33 %')).toBeInTheDocument();
  expect(obtenerHistorico).toHaveBeenLastCalledWith(PARCELA_GESTOR.id, 50);
  await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(4));
  // El resumen no se vuelve a pedir: solo cambia la tabla.
  expect(obtenerDashboard).toHaveBeenCalledTimes(1);
});

test('la prevision de lluvia de las proximas 24 h y 48 h se ve sin abrir nada', async () => {
  obtenerDashboard.mockResolvedValue(DASHBOARD);
  obtenerHistorico.mockResolvedValue([]);
  montar(PARCELA_GESTOR);

  const en24 = (await screen.findByText('Próximas 24 h')).closest('div');
  expect(en24).toHaveTextContent('2.4 mm');
  expect(en24).toHaveTextContent('40 %');
  const en48 = screen.getByText('Próximas 48 h').closest('div');
  expect(en48).toHaveTextContent('8.4 mm');
  expect(en48).toHaveTextContent('90 %');
});

test('si Open-Meteo no responde, la prevision sale vacia y el resto de Estado se ve', async () => {
  obtenerClimaHorario.mockRejectedValue({ response: { status: 503 } });
  obtenerDashboard.mockResolvedValue(DASHBOARD);
  obtenerHistorico.mockResolvedValue([]);
  montar(PARCELA_GESTOR);

  expect(await screen.findByText('28.4 %')).toBeInTheDocument();
  expect((await screen.findByText('Próximas 24 h')).closest('div')).toHaveTextContent('—');
});

test('la lluvia y la ET0 del clima actual dicen que son de los ultimos 15 minutos', async () => {
  obtenerDashboard.mockResolvedValue(DASHBOARD);
  obtenerHistorico.mockResolvedValue([]);
  montar(PARCELA_GESTOR);

  expect(await screen.findByText('Lluvia (15 min)')).toBeInTheDocument();
  expect(screen.getByText('ET₀ (15 min)')).toBeInTheDocument();
});

test('el resto del clima esta en un desplegable cerrado, con el suelo del modelo en %', async () => {
  obtenerDashboard.mockResolvedValue(DASHBOARD);
  obtenerHistorico.mockResolvedValue([]);
  montar(PARCELA_GESTOR);

  const resumen = await screen.findByText('Más datos del clima');
  const desplegable = resumen.closest('details');
  expect(desplegable).not.toHaveAttribute('open');

  await userEvent.click(resumen);

  expect(desplegable).toHaveAttribute('open');
  expect(within(desplegable).getByText('12.1 °C')).toBeInTheDocument(); // punto de rocio
  expect(within(desplegable).getByText('1.8 kPa')).toBeInTheDocument(); // VPD
  expect(within(desplegable).getByText('N · 7°')).toBeInTheDocument(); // direccion del viento
  expect(within(desplegable).getByText('19.9 %')).toBeInTheDocument(); // 0.199 m³/m³
});

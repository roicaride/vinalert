import cliente from './cliente';

export async function obtenerDashboard(parcelaId) {
  const { data } = await cliente.get(`/parcelas/${parcelaId}/dashboard`);
  return data;
}

export async function obtenerHistorico(parcelaId, limite = 15, horas = null) {
  const params = { limite };
  if (horas != null) params.horas = horas;
  const { data } = await cliente.get(`/parcelas/${parcelaId}/historico`, { params });
  return data;
}


/**
 * Lluvia, probabilidad de lluvia, ET₀ y temperatura de cada hora: 48 h hacia
 * atras y 48 h de prevision (`prevision: true`). Open-Meteo, sin guardar.
 */
export async function obtenerClimaHorario(parcelaId) {
  const { data } = await cliente.get(`/parcelas/${parcelaId}/clima/horario`);
  return data;
}

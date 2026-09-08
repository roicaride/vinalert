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


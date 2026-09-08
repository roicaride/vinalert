import cliente from './cliente';

export async function obtenerSueloDiario(parcelaId, dias = 30) {
  const { data } = await cliente.get(`/parcelas/${parcelaId}/suelo/diario`, {
    params: { dias },
  });
  return data;
}

export async function obtenerClimaDiario(parcelaId, dias = 30) {
  const { data } = await cliente.get(`/parcelas/${parcelaId}/clima/diario`, {
    params: { dias },
  });
  return data;
}

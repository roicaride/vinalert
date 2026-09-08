import cliente from './cliente';

export async function listarSensores(parcelaId) {
  const { data } = await cliente.get(`/parcelas/${parcelaId}/sensores/`);
  return data;
}

export async function provisionarSensores(parcelaId, cantidad) {
  const { data } = await cliente.post(`/parcelas/${parcelaId}/sensores/provisionar`, { cantidad });
  return data;
}

export async function actualizarSensor(parcelaId, sensorId, cambios) {
  const { data } = await cliente.patch(`/parcelas/${parcelaId}/sensores/${sensorId}`, cambios);
  return data;
}

export async function borrarSensor(parcelaId, sensorId) {
  await cliente.delete(`/parcelas/${parcelaId}/sensores/${sensorId}`);
}


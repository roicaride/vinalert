import cliente from './cliente';

export async function listarDispositivos(parcelaId) {
  const { data } = await cliente.get(`/parcelas/${parcelaId}/dispositivos`);
  return data;
}

export async function crearDispositivo(parcelaId, { nombre }) {
  const { data } = await cliente.post(`/parcelas/${parcelaId}/dispositivos`, { nombre });
  return data;
}

export async function revocarDispositivo(parcelaId, dispositivoId) {
  const { data } = await cliente.patch(`/parcelas/${parcelaId}/dispositivos/${dispositivoId}/revocar`);
  return data;
}

export async function borrarDispositivo(parcelaId, dispositivoId) {
  const { data } = await cliente.delete(`/parcelas/${parcelaId}/dispositivos/${dispositivoId}`);
  return data;
}

export async function actualizarIntervaloDispositivo(parcelaId, dispositivoId, intervaloSeg) {
  const { data } = await cliente.patch(
    `/parcelas/${parcelaId}/dispositivos/${dispositivoId}`,
    { intervalo_ciclo_seg: intervaloSeg },
  );
  return data;
}

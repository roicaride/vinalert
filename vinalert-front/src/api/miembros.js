import cliente from './cliente';

export async function listarMiembros(parcelaId) {
  const { data } = await cliente.get(`/parcelas/${parcelaId}/usuarios`);
  return data;
}

export async function anadirMiembro(parcelaId, email, rol) {
  const { data } = await cliente.post(`/parcelas/${parcelaId}/usuarios`, { email, rol });
  return data;
}

export async function cambiarRol(parcelaId, usuarioId, rol) {
  const { data } = await cliente.patch(`/parcelas/${parcelaId}/usuarios/${usuarioId}`, { rol });
  return data;
}

export async function retirarMiembro(parcelaId, usuarioId) {
  await cliente.delete(`/parcelas/${parcelaId}/usuarios/${usuarioId}`);
}

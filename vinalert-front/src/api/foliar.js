import cliente from './cliente';

export async function listarFoliar(parcelaId) {
  const { data } = await cliente.get(`/parcelas/${parcelaId}/foliar/`);
  return data;
}

export async function subirFoliar(parcelaId, archivo) {
  const formData = new FormData();
  formData.append('archivo', archivo);
  const { data } = await cliente.post(`/parcelas/${parcelaId}/foliar/upload`, formData);
  return data;
}

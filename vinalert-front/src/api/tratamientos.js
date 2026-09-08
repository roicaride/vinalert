import cliente from './cliente';

export async function listarTratamientos(parcelaId) {
  const { data } = await cliente.get(`/parcelas/${parcelaId}/tratamientos`);
  return data;
}

export async function crearTratamiento(datos) {
  const { data } = await cliente.post('/tratamientos/', datos);
  return data;
}

export async function borrarTratamiento(id) {
  await cliente.delete(`/tratamientos/${id}`);
}

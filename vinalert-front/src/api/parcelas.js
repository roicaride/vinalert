import cliente from './cliente';

export async function listarParcelas() {
  const { data } = await cliente.get('/parcelas/');
  return data;
}

export async function obtenerParcela(id) {
  const { data } = await cliente.get(`/parcelas/${id}`);
  return data;
}

export async function editarParcela(id, cambios) {
  const { data } = await cliente.patch(`/parcelas/${id}`, cambios);
  return data;
}

export async function crearParcela(datos) {
  const { data } = await cliente.post('/parcelas/', datos);
  return data;
}

export async function borrarParcela(id) {
  const { data } = await cliente.delete(`/parcelas/${id}`);
  return data;
}

export async function comprobarClima(id) {
  const { data } = await cliente.get(`/parcelas/${id}/clima/comprobar`);
  return data;
}

export async function actualizarClima(id) {
  const { data } = await cliente.post(`/parcelas/${id}/actualizar-clima`);
  return data;
}




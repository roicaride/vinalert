import { Aviso } from '../ui/Estados';

/**
 * Traduce un error de axios a algo que una persona entienda.
 *
 * El backend distingue los codigos a proposito: 403 es "no puedes", 404 es "no
 * existe o no es tuyo", 409 trae un texto ya escrito para el usuario, y 422 son
 * errores de validacion campo a campo. El 401 no llega aqui: lo captura el
 * interceptor del cliente.
 */
export default function MensajeError({ error, textoNoEncontrado = 'No se ha encontrado.', preferirDetalle = false }) {
  if (!error) return null;

  const status = error.response?.status;
  const detail = error.response?.data?.detail;

  let texto;
  if (status === 403) {
    texto = 'No tienes permiso para hacer esto en esta parcela.';
  } else if (status === 404) {
    texto = preferirDetalle && typeof detail === 'string' ? detail : textoNoEncontrado;
  } else if (status === 409) {
    texto = typeof detail === 'string' ? detail : 'La operacion entra en conflicto con el estado actual.';
  } else if (status === 422) {
    if (Array.isArray(detail)) {
      const campos = detail.map((d) => `${d.loc?.[d.loc.length - 1]}: ${d.msg}`);
      texto = campos.length ? campos.join(' · ') : 'Hay datos que no son validos.';
    } else if (typeof detail === 'string') {
      texto = detail;
    } else {
      texto = 'Hay datos que no son validos.';
    }
  } else if (error.response) {
    texto = 'El servidor ha devuelto un error inesperado.';
  } else {
    texto = 'No se pudo contactar con el servidor.';
  }

  return (
    <Aviso role="alert" tono="sangre">
      {texto}
    </Aviso>
  );
}

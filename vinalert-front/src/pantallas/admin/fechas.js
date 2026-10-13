/**
 * Las marcas de tiempo internas del panel (jobs, accesos, ultimo envio de un
 * dispositivo) llegan en UTC sin zona. Se muestran siempre en hora de Madrid,
 * este donde este el navegador.
 */
export function horaMadridDesdeUtc(iso) {
  if (!iso) return '—';
  const fecha = new Date(`${iso}Z`);
  if (Number.isNaN(fecha.getTime())) return iso;
  return fecha.toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

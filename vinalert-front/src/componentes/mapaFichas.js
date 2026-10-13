/**
 * El HTML de las fichas del mapa de sensores. Aparte del componente para
 * poder probarlo sin montar Leaflet.
 *
 * Leaflet pinta popups y tooltips con innerHTML, asi que TODO texto que venga
 * de la BD pasa por escaparHtml: la etiqueta y el modelo los escribe un
 * gestor, y la ficha la abre cualquiera con acceso a la parcela.
 */

export const LOUSA = '#222a2e';
export const OSO = '#efede6';
export const BROTE = '#8fc93a';
export const APAGADO = '#565e60';
export const LINEA = '#3b4144';
export const MONO = "'IBM Plex Mono', ui-monospace, monospace";

const ENTIDADES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escaparHtml(valor) {
  if (valor == null) return '';
  return String(valor).replace(/[&<>"']/g, (c) => ENTIDADES[c]);
}

export function nombreNodo(s) {
  return s.etiqueta || `Sensor ${s.numero}`;
}

export function fichaNodo(s) {
  const linea = (etiqueta, valor) =>
    `<tr><td style="padding:2px 12px 2px 0;color:#9d9f9c;font-size:9px;letter-spacing:.14em;text-transform:uppercase;">${etiqueta}</td>
      <td style="padding:2px 0;color:${OSO};text-align:right;">${escaparHtml(valor)}</td></tr>`;

  return `<div style="font-family:${MONO};font-size:11px;color:${OSO};min-width:180px;">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:6px;border-bottom:1px solid ${LINEA};">
      <span style="font-weight:600;">${escaparHtml(nombreNodo(s))}</span>
      <span style="font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:${s.activo ? BROTE : '#9d9f9c'};">
        ${s.activo ? 'Activo' : 'Inactivo'}
      </span>
    </div>
    <table style="width:100%;margin-top:6px;border-collapse:collapse;">
      ${linea('Nº', s.numero)}
      ${s.profundidad_cm ? linea('Profundidad', `${s.profundidad_cm} cm`) : ''}
      ${s.modelo ? linea('Modelo', s.modelo) : ''}
      ${linea('Coordenadas', `${s.latitud.toFixed(5)}, ${s.longitud.toFixed(5)}`)}
    </table>
  </div>`;
}

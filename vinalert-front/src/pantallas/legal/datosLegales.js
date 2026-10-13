/**
 * Los datos que publican las paginas legales, tal como se editan en
 * Administracion > Configuracion. Las claves son las de GET /configuracion/publica.
 */
export const CAMPOS_LEGALES = [
  {
    titulo: 'Titular (responsable del tratamiento)',
    campos: [
      { clave: 'titular_nombre', etiqueta: 'Razón social o nombre' },
      { clave: 'titular_nif', etiqueta: 'NIF / CIF' },
      { clave: 'titular_domicilio', etiqueta: 'Domicilio' },
      { clave: 'titular_email', etiqueta: 'Email de contacto', ayuda: 'También es al que se piden los accesos desde la portada.' },
      { clave: 'titular_telefono', etiqueta: 'Teléfono' },
      { clave: 'titular_registro', etiqueta: 'Datos registrales', ayuda: 'Registro Mercantil, tomo, folio y hoja, si es una sociedad.' },
    ],
  },
  {
    titulo: 'Encargado del tratamiento',
    campos: [
      { clave: 'encargado_nombre', etiqueta: 'Nombre del encargado', ayuda: 'Quien desarrolla y mantiene la herramienta.' },
      { clave: 'encargado_nif', etiqueta: 'NIF / CIF del encargado' },
      { clave: 'encargado_email', etiqueta: 'Email del encargado' },
    ],
  },
  {
    titulo: 'Proveedores',
    campos: [
      { clave: 'proveedor_alojamiento', etiqueta: 'Alojamiento', ayuda: 'Empresa y país de los servidores. Ej.: «Hetzner Online GmbH (Alemania)».' },
      { clave: 'proveedor_correo', etiqueta: 'Envío de emails', ayuda: 'Ej.: «Brevo (Sendinblue SAS, Francia)».' },
    ],
  },
];

export const PENDIENTE = '[pendiente de completar]';

/** El valor de un dato, o la marca de pendiente: nunca se publica un dato inventado. */
export function dato(config, clave) {
  const v = config?.[clave];
  return v && String(v).trim() ? v : PENDIENTE;
}

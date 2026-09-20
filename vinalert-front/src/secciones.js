/**
 * Las secciones de una parcela: fuente unica.
 *
 * Vive aqui y no en App.jsx ni en Navegacion.jsx porque los dos la necesitan
 * —uno para declarar las rutas, el otro para pintar los enlaces— y tenerla
 * duplicada garantiza que algun dia divergiran: D2, D3 y D4 van a anadir
 * pantallas, y bastara con que alguien toque un fichero y no el otro para que
 * exista una ruta sin enlace, o un enlace que lleva a ninguna parte.
 *
 * `etiqueta` es el texto corto de la barra lateral.
 */
export const SECCIONES = [
  { ruta: 'estado', etiqueta: 'Estado' },
  { ruta: 'analisis', etiqueta: 'Análisis' },
  { ruta: 'tratamientos', etiqueta: 'Tratamientos' },
  { ruta: 'foliar', etiqueta: 'Foliar' },
  { ruta: 'sensores', etiqueta: 'Sensores' },
  { ruta: 'miembros', etiqueta: 'Acceso' },
  { ruta: 'configuracion', etiqueta: 'Configuración' },
];

/** La seccion a la que se entra al abrir una parcela. */
export const SECCION_POR_DEFECTO = 'estado';

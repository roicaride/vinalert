/**
 * Las secciones de una parcela: fuente unica.
 *
 * Vive aqui y no en App.jsx ni en Navegacion.jsx porque los dos la necesitan
 * —uno para declarar las rutas, el otro para pintar los enlaces— y tenerla
 * duplicada garantiza que algun dia divergiran: D2, D3 y D4 van a anadir
 * pantallas, y bastara con que alguien toque un fichero y no el otro para que
 * exista una ruta sin enlace, o un enlace que lleva a ninguna parte.
 *
 * `titulo` y `descripcion` los usa el marcador de seccion mientras la pantalla
 * no esta construida; `etiqueta` es el texto corto de la barra lateral.
 */
export const SECCIONES = [
  {
    ruta: 'estado',
    etiqueta: 'Estado',
    titulo: 'Estado',
    descripcion: 'Cómo está la parcela ahora mismo: humedad y temperatura del suelo, tiempo actual y últimas lecturas.',
  },
  {
    ruta: 'analisis',
    etiqueta: 'Análisis',
    titulo: 'Análisis',
    descripcion: 'Cruzar variables en el tiempo: lo que miden tus sensores contra la lluvia, la ET₀ o la radiación, con los tratamientos marcados encima.',
  },
  {
    ruta: 'tratamientos',
    etiqueta: 'Tratamientos',
    titulo: 'Tratamientos',
    descripcion: 'El cuaderno: qué se aplicó, cuándo y con qué tiempo hacía.',
  },
  {
    ruta: 'foliar',
    etiqueta: 'Foliar',
    titulo: 'Foliar',
    descripcion: 'Lecturas del sensor foliar y subida de su Excel.',
  },
  {
    ruta: 'sensores',
    etiqueta: 'Sensores',
    titulo: 'Sensores',
    descripcion: 'Cuántos hay, dónde está cada uno y a qué profundidad.',
  },
  {
    ruta: 'miembros',
    etiqueta: 'Acceso',
    titulo: 'Acceso',
    descripcion: 'Quién puede ver y gestionar esta parcela.',
  },
  {
    ruta: 'configuracion',
    etiqueta: 'Configuración',
    titulo: 'Configuración',
    descripcion: 'Datos de la parcela y sus coordenadas.',
  },
];

/** La seccion a la que se entra al abrir una parcela. */
export const SECCION_POR_DEFECTO = 'estado';

/**
 * El icono de la pestana cambia de tinta segun como este la parcela.
 *
 * No es un adorno: quien vigila una parcela deja la pestana abierta al fondo
 * durante horas. Que el cuadradito pase de BROTE a AMBAR es la unica forma de
 * enterarse de que un sensor ha cruzado el umbral sin volver a mirar.
 */

const ICONOS = {
  ok: '/marca/favicon-brote.png',
  aviso: '/marca/favicon-ambar.png',
  neutro: '/marca/favicon-oso.png',
};

export function fijarFavicon(estado) {
  const href = ICONOS[estado] || ICONOS.neutro;
  let enlace = document.querySelector('link[rel="icon"]');
  if (!enlace) {
    enlace = document.createElement('link');
    enlace.rel = 'icon';
    enlace.type = 'image/png';
    document.head.appendChild(enlace);
  }
  if (enlace.getAttribute('href') !== href) enlace.setAttribute('href', href);
}

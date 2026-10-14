/**
 * Los cuatro pasos de "Como funciona", dibujados con la misma regla que la
 * marca: lineas rectas, esquinas vivas y un solo detalle en BROTE (lo que mide
 * o lo que envia). Decorativos: el texto del paso ya lo dice todo.
 */
const comun = {
  width: 48,
  height: 48,
  viewBox: '0 0 48 48',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  'aria-hidden': true,
};

export function PictoSonda() {
  return (
    <svg {...comun}>
      <path d="M4 16 H44" strokeOpacity="0.6" />
      <path d="M24 8 V42" />
      <rect x="20" y="24" width="8" height="5" fill="#8fc93a" stroke="none" />
      <rect x="20" y="34" width="8" height="5" fill="#8fc93a" stroke="none" />
    </svg>
  );
}

export function PictoNodo() {
  return (
    <svg {...comun}>
      <rect x="14" y="20" width="20" height="16" />
      <path d="M12 16 H36" />
      <path d="M24 36 V44" />
      <path d="M30 20 V10" />
      <path d="M24 9 A 8 8 0 0 1 36 9" stroke="#8fc93a" />
      <path d="M20 6 A 13 13 0 0 1 40 6" stroke="#8fc93a" strokeOpacity="0.6" />
    </svg>
  );
}

export function PictoMaestro() {
  return (
    <svg {...comun}>
      <rect x="10" y="22" width="28" height="18" />
      <path d="M16 40 V44 M32 40 V44" />
      <rect x="15" y="28" width="6" height="6" fill="#8fc93a" stroke="none" />
      <path d="M17 14 A 10 10 0 0 1 31 14" />
      <path d="M21 18 A 5 5 0 0 1 27 18" />
    </svg>
  );
}

export function PictoPlataforma() {
  return (
    <svg {...comun}>
      <rect x="6" y="8" width="36" height="26" />
      <path d="M18 42 H30 M24 34 V42" />
      <path d="M11 28 L18 22 L24 25 L31 16 L37 19" stroke="#8fc93a" />
    </svg>
  );
}


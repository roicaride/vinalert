import { useEffect, useState } from 'react';

/**
 * El gesto de la portada: lo que mide Viñalert, visto de lado. Una cepa, sus
 * raices, la sonda con tres sensores a la profundidad de las raices y el nodo
 * que envia las lecturas por LoRa.
 *
 * Es una vista de ejemplo (no son datos de nadie). Las lecturas se mueven un
 * poco cada pocos segundos y el nodo "emite": es la unica animacion de la
 * pagina, y no corre si el sistema pide reducir el movimiento.
 *
 * Escala: 4 px por centimetro bajo la linea del suelo.
 */
const SUELO = 150;
const CM = 4;
const SONDA_X = 318;
const PROFUNDIDADES = [
  { cm: 20, base: 31.4 },
  { cm: 40, base: 27.8 },
  { cm: 60, base: 24.1 },
];

const LOUSA = '#222a2e';
const ALZA = '#2a3337';
const LINEA = '#3b4144';
const VINA = '#4e7c4a';
const BROTE = '#8fc93a';
const OSO = '#efede6';
const OSO3 = '#999b99';

function useMenosMovimiento() {
  const [menos, setMenos] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return undefined;
    const cambiar = () => setMenos(mq.matches);
    mq.addEventListener?.('change', cambiar);
    return () => mq.removeEventListener?.('change', cambiar);
  }, []);
  return menos;
}

/** Humedades que derivan despacio alrededor de su valor base, sin salirse de +-1,5 puntos. */
function useLecturas(quieto) {
  const [valores, setValores] = useState(() => PROFUNDIDADES.map((p) => p.base));
  useEffect(() => {
    if (quieto) return undefined;
    const t = setInterval(() => {
      setValores((prev) =>
        prev.map((v, i) => {
          const base = PROFUNDIDADES[i].base;
          const siguiente = v + (Math.random() - 0.5) * 0.6;
          return Math.min(base + 1.5, Math.max(base - 1.5, siguiente));
        }),
      );
    }, 3200);
    return () => clearInterval(t);
  }, [quieto]);
  return valores;
}

/** Raices: unas lineas que bajan desde el pie de la cepa y se abren. */
const RAICES = [
  'M150 150 C148 190 132 222 112 262 S86 330 80 372',
  'M150 150 C152 196 166 236 184 280 S206 350 214 398',
  'M150 150 C150 200 146 262 150 330',
  'M140 205 C122 214 104 216 86 228',
  'M160 236 C182 246 202 250 226 268',
  'M147 290 C130 302 118 318 112 338',
];

export default function CorteSuelo({ textos, locale }) {
  const quieto = useMenosMovimiento();
  const valores = useLecturas(quieto);
  const fmt = (v) => v.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <svg viewBox="0 0 520 434" role="img" aria-label={textos.descripcion} className="block h-auto w-full">
      {/* Suelo: tres franjas, cada una un poco mas oscura con la profundidad. */}
      <rect x="0" y={SUELO} width="520" height={30 * CM} fill={ALZA} />
      <rect x="0" y={SUELO + 30 * CM} width="520" height={20 * CM} fill="#283135" />
      <rect x="0" y={SUELO + 50 * CM} width="520" height={20 * CM} fill="#262e32" />

      {/* Lineas de profundidad, con su medida a la izquierda. */}
      {PROFUNDIDADES.map((p) => {
        const y = SUELO + p.cm * CM;
        return (
          <g key={p.cm}>
            <line x1="24" x2="496" y1={y} y2={y} stroke={LINEA} strokeDasharray="2 6" />
            <text x="24" y={y - 7} fill={OSO3} fontFamily="'IBM Plex Mono', monospace" fontSize="11" letterSpacing="1">
              {p.cm} cm
            </text>
          </g>
        );
      })}

      {/* Raices */}
      {RAICES.map((d) => (
        <path key={d} d={d} fill="none" stroke={VINA} strokeWidth="1.5" opacity="0.75" />
      ))}

      {/* La cepa: tronco, cordon en espaldera y hojas cuadradas, como la marca. */}
      <line x1="0" x2="520" y1={SUELO} y2={SUELO} stroke={OSO} strokeOpacity="0.55" />
      <path d="M150 150 L150 92 M150 96 L92 84 M150 96 L208 84" fill="none" stroke={VINA} strokeWidth="5" strokeLinecap="square" />
      {[[86, 66], [104, 58], [196, 58], [214, 66], [136, 62], [162, 62]].map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="16" height="16" fill={VINA} />
      ))}
      {[[118, 92], [178, 92]].map(([x, y]) => (
        <g key={`r${x}`} fill={OSO} opacity="0.9">
          <rect x={x} y={y} width="6" height="6" />
          <rect x={x + 7} y={y} width="6" height="6" />
          <rect x={x + 3.5} y={y + 7} width="6" height="6" />
        </g>
      ))}

      {/* El nodo: poste, caja con placa solar y antena. */}
      <line x1="430" x2="430" y1={SUELO} y2="92" stroke={OSO3} strokeWidth="2" />
      <rect x="412" y="96" width="36" height="28" fill={LOUSA} stroke={OSO3} />
      <rect x="408" y="84" width="44" height="8" fill={VINA} />
      <line x1="440" x2="440" y1="84" y2="60" stroke={OSO3} strokeWidth="1.5" />
      <rect x="425" y="104" width="10" height="10" fill={BROTE} />
      {[14, 26, 38].map((r, i) => (
        <path
          key={r}
          d={`M${440 - r} ${60 - r * 0.2} A ${r} ${r} 0 0 1 ${440 + r} ${60 - r * 0.2}`}
          fill="none"
          stroke={BROTE}
          strokeWidth="1.5"
          className="motion-safe:animate-[lora_2.4s_ease-out_infinite]"
          style={{ animationDelay: `${i * 0.3}s`, opacity: quieto ? 0.7 : undefined }}
        />
      ))}
      <text x="402" y="110" textAnchor="end" fill={OSO3} fontFamily="'IBM Plex Mono', monospace" fontSize="10" letterSpacing="1">
        {textos.nodo}
      </text>

      {/* La sonda y el cable al nodo. */}
      <path d={`M${SONDA_X} ${SUELO - 2} C ${SONDA_X} 130 400 140 412 118`} fill="none" stroke={OSO3} strokeDasharray="3 3" />
      <rect x={SONDA_X - 4} y={SUELO} width="8" height={62 * CM} fill={OSO3} opacity="0.85" />

      {/* Cada sensor: su cuadro en la sonda, la lectura y una barra a escala. */}
      {PROFUNDIDADES.map((p, i) => {
        const y = SUELO + p.cm * CM;
        const v = valores[i];
        return (
          <g key={`s${p.cm}`}>
            <rect x={SONDA_X - 7} y={y - 7} width="14" height="14" fill={BROTE} />
            <text x={SONDA_X + 22} y={y - 6} fill={OSO3} fontFamily="'IBM Plex Mono', monospace" fontSize="10" letterSpacing="1">
              {textos.humedad.toUpperCase()}
            </text>
            <text
              x={SONDA_X + 22}
              y={y + 14}
              fill={OSO}
              fontFamily="'IBM Plex Mono', monospace"
              fontSize="18"
              fontWeight="500"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {fmt(v)} %
            </text>
            <rect x={SONDA_X + 98} y={y + 4} width="80" height="6" fill={LOUSA} />
            <rect x={SONDA_X + 98} y={y + 4} width={(v / 40) * 80} height="6" fill={BROTE} className="transition-[width] duration-1000" />
          </g>
        );
      })}

      <text x="24" y="424" fill={OSO3} fontFamily="'IBM Plex Mono', monospace" fontSize="10" letterSpacing="1">
        {textos.envio}
      </text>
    </svg>
  );
}

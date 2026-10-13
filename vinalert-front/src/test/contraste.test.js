import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

// Guarda de accesibilidad (WCAG 1.4.3): el texto informativo necesita 4,5:1
// sobre los dos fondos que lo llevan, LOUSA y ALZA. Se lee de index.css para
// que retocar un token sin mirar el contraste falle aqui.
const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');

function token(nombre) {
  const m = css.match(new RegExp(`--color-${nombre}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`no encuentro --color-${nombre}`);
  return m[1];
}

function luminancia(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function contraste(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const FONDOS = ['lousa', 'alza'];

describe('contraste de las tintas de texto', () => {
  test.each(['oso', 'oso-2', 'oso-3', 'brote', 'ambar', 'sangre'])('%s llega a 4,5:1 sobre LOUSA y ALZA', (tinta) => {
    for (const fondo of FONDOS) {
      expect(contraste(token(tinta), token(fondo))).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('oso-4, solo para lo deshabilitado y lo decorativo, llega a 3:1', () => {
    for (const fondo of FONDOS) {
      expect(contraste(token('oso-4'), token(fondo))).toBeGreaterThanOrEqual(3);
    }
  });

  test('la jerarquia se sigue viendo: cada nivel es mas tenue que el anterior', () => {
    const niveles = ['oso', 'oso-2', 'oso-3', 'oso-4'].map((t) => contraste(token(t), token('lousa')));
    for (let i = 1; i < niveles.length; i++) {
      expect(niveles[i - 1] - niveles[i]).toBeGreaterThan(0.8);
    }
  });
});

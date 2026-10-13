import { describe, expect, test } from 'vitest';

import { CAPAS } from './capasMapa';

// Solo proveedores cuya licencia permite este uso: el IGN publica el PNOA y
// su mapa base con CC BY 4.0. Esri, CARTO y los servidores de OpenStreetMap
// no lo permiten sin contrato o pueden cortar el acceso.
describe('capas del mapa', () => {
  test('todas salen de los servidores del IGN', () => {
    for (const capa of Object.values(CAPAS)) {
      expect(new URL(capa.url.replace(/\{[^}]+\}/g, '0')).hostname).toBe('www.ign.es');
    }
  });

  test('todas citan al IGN como exige la licencia', () => {
    for (const capa of Object.values(CAPAS)) {
      expect(capa.attribution).toMatch(/Instituto Geográfico Nacional/);
      expect(capa.attribution).toMatch(/CC BY 4\.0/);
    }
  });

  test('el satelite es la ortofoto PNOA hasta su resolucion nativa', () => {
    expect(CAPAS.satelite.url).toContain('pnoa-ma');
    expect(CAPAS.satelite.maxNativeZoom).toBe(19);
  });
});

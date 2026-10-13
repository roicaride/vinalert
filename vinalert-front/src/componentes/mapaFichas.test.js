import { describe, expect, test } from 'vitest';

import { escaparHtml, fichaNodo } from './mapaFichas';

// Leaflet pinta popups y tooltips con innerHTML. La etiqueta y el modelo de un
// sensor los escribe un gestor, y la ficha la abre cualquiera con acceso a la
// parcela (lectores y el superadmin incluidos): sin escapar, un gestor podia
// ejecutar codigo en el navegador de los demas y llevarse su sesion.

const SENSOR = {
  numero: 3,
  activo: true,
  profundidad_cm: 30,
  latitud: 42.5,
  longitud: -8.1,
};

describe('escaparHtml', () => {
  test('neutraliza los caracteres con significado en HTML', () => {
    expect(escaparHtml(`<img src=x onerror="a('b')">&`)).toBe(
      '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;',
    );
  });

  test('admite numeros y vacios', () => {
    expect(escaparHtml(7)).toBe('7');
    expect(escaparHtml(null)).toBe('');
    expect(escaparHtml(undefined)).toBe('');
  });
});

describe('fichaNodo', () => {
  test('no deja pasar HTML en la etiqueta ni en el modelo', () => {
    const html = fichaNodo({
      ...SENSOR,
      etiqueta: '<img src=x onerror=alert(1)>',
      modelo: '<script>robar()</script>',
    });

    const div = document.createElement('div');
    div.innerHTML = html;
    expect(div.querySelector('img')).toBeNull();
    expect(div.querySelector('script')).toBeNull();
    expect(div.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(div.textContent).toContain('<script>robar()</script>');
  });

  test('sin etiqueta usa el numero del sensor', () => {
    const div = document.createElement('div');
    div.innerHTML = fichaNodo({ ...SENSOR, etiqueta: null });
    expect(div.textContent).toContain('Sensor 3');
  });
});

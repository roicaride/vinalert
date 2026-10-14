import { beforeEach, describe, expect, test } from 'vitest';

import datos from './datos.json';
import { desplazarFechas, reiniciarDemo, responder } from './api';

const PID = datos.parcelaId;

function pedir(method, url, extra = {}) {
  return responder({ method, url, headers: {}, ...extra });
}

beforeEach(() => reiniciarDemo());

describe('desplazarFechas', () => {
  test('mueve fechas y fechas con hora los mismos dias, sin tocar el resto', () => {
    const r = desplazarFechas({ a: '2026-10-14', b: '2026-10-14T17:57:00', c: 'Mencía', d: 3, e: ['2026-10-01T00:30'] }, 3);
    expect(r).toEqual({ a: '2026-10-17', b: '2026-10-17T17:57:00', c: 'Mencía', d: 3, e: ['2026-10-04T00:30'] });
  });

  test('cruza meses y años', () => {
    expect(desplazarFechas('2026-12-30T08:00:00', 3)).toBe('2027-01-02T08:00:00');
  });
});

describe('la parcela de ejemplo', () => {
  test('la sesion es la de un gestor, no la de un superadmin', async () => {
    const { data } = await pedir('get', '/auth/me');
    expect(data.es_superadmin).toBe(false);
    const { data: parcela } = await pedir('get', `/parcelas/${PID}`);
    expect(parcela.mi_rol).toBe('gestor');
  });

  // Como el backend: las N mas recientes, en orden cronologico ascendente.
  test('el historico son las lecturas mas recientes, en orden, y ninguna en el futuro', async () => {
    const { data: todas } = await pedir('get', `/parcelas/${PID}/historico`, { params: { limite: 5000 } });
    const { data } = await pedir('get', `/parcelas/${PID}/historico`, { params: { limite: 100 } });
    expect(data).toHaveLength(100);
    expect(data.at(-1)).toEqual(todas.at(-1));
    const tiempos = data.map((l) => new Date(l.fecha_hora).getTime());
    expect([...tiempos].sort((a, b) => a - b)).toEqual(tiempos);
    for (const t of tiempos) expect(t).toBeLessThanOrEqual(Date.now());
    expect(Date.now() - tiempos.at(-1)).toBeLessThan(26 * 3600 * 1000);
  });

  test('el clima y el suelo diario no llegan mas alla de hoy', async () => {
    const hoy = new Date().toISOString().slice(0, 10);
    const { data: dash } = await pedir('get', `/parcelas/${PID}/dashboard`);
    expect(new Date(dash.clima_actual.fecha_hora).getTime()).toBeLessThanOrEqual(Date.now());
    const { data: suelo } = await pedir('get', `/parcelas/${PID}/suelo/diario`, { params: { dias: 365 } });
    for (const f of suelo) expect(f.fecha <= hoy).toBe(true);
  });

  test('el historico respeta la ventana de horas', async () => {
    const { data } = await pedir('get', `/parcelas/${PID}/historico`, { params: { limite: 2000, horas: 48 } });
    const limite = Date.now() - 48 * 3600 * 1000;
    expect(data.length).toBeGreaterThan(0);
    for (const l of data) expect(new Date(l.fecha_hora).getTime()).toBeGreaterThanOrEqual(limite);
  });

  test('el suelo diario respeta los dias pedidos', async () => {
    const { data: siete } = await pedir('get', `/parcelas/${PID}/suelo/diario`, { params: { dias: 7 } });
    const { data: todo } = await pedir('get', `/parcelas/${PID}/suelo/diario`, { params: { dias: 365 } });
    expect(siete.length).toBeGreaterThan(0);
    expect(siete.length).toBeLessThan(todo.length);
  });

  test('anotar un tratamiento lo deja en el cuaderno hasta reiniciar', async () => {
    const antes = (await pedir('get', `/parcelas/${PID}/tratamientos`)).data.length;
    const { status, data } = await pedir('post', '/tratamientos/', {
      data: JSON.stringify({ parcela_id: PID, fecha: '2026-10-14T09:00:00', tipo: 'Fungicida', producto: 'Prueba' }),
    });
    expect(status).toBe(201);
    expect(data.producto).toBe('Prueba');
    expect((await pedir('get', `/parcelas/${PID}/tratamientos`)).data).toHaveLength(antes + 1);

    await pedir('delete', `/tratamientos/${data.id}`);
    expect((await pedir('get', `/parcelas/${PID}/tratamientos`)).data).toHaveLength(antes);

    await pedir('post', '/tratamientos/', { data: JSON.stringify({ parcela_id: PID, fecha: '2026-10-14T09:00:00', tipo: 'Otro' }) });
    reiniciarDemo();
    expect((await pedir('get', `/parcelas/${PID}/tratamientos`)).data).toHaveLength(antes);
  });

  test('editar un sensor y la parcela se ve al volver a pedirlos', async () => {
    const sensor = (await pedir('get', `/parcelas/${PID}/sensores/`)).data[0];
    await pedir('patch', `/parcelas/${PID}/sensores/${sensor.id}`, { data: JSON.stringify({ etiqueta: 'Renombrado' }) });
    expect((await pedir('get', `/parcelas/${PID}/sensores/`)).data[0].etiqueta).toBe('Renombrado');

    await pedir('patch', `/parcelas/${PID}`, { data: JSON.stringify({ variedad: 'Godello' }) });
    expect((await pedir('get', `/parcelas/${PID}`)).data.variedad).toBe('Godello');
  });

  test('invitar a alguien lo anade como pendiente', async () => {
    const { data } = await pedir('post', `/parcelas/${PID}/usuarios`, { data: JSON.stringify({ email: 'Nueva@X.es', rol: 'lectura' }) });
    expect(data).toMatchObject({ email: 'nueva@x.es', pendiente: true, rol: 'lectura' });
  });

  test('lo que no tiene sentido en el ejemplo se rechaza con un motivo', async () => {
    await expect(pedir('delete', `/parcelas/${PID}`)).rejects.toMatchObject({
      response: { status: 409, data: { detail: expect.stringMatching(/ejemplo/i) } },
    });
    await expect(pedir('post', '/auth/cambiar-password', { data: '{}' })).rejects.toMatchObject({ response: { status: 409 } });
  });

  test('una ruta desconocida da 404, no un error de JavaScript', async () => {
    await expect(pedir('get', '/no/existe')).rejects.toMatchObject({ response: { status: 404 } });
  });
});

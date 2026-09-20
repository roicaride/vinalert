import { expect, test } from 'vitest';

import {
  cortarHuecos,
  diarioSuelo,
  horasSuelo,
  mediaJusta,
  mediaPeriodoDiaria,
  mediaPeriodoHoras,
  rellenarDias,
} from './series';

const fila = (fecha, sensor_id, humedad_media, temperatura_media, n_lecturas = 10) => ({
  fecha, sensor_id, humedad_media, temperatura_media, n_lecturas,
});
const lectura = (fecha_hora, sensor_id, humedad_suelo_pct, temperatura_suelo = 20) => ({
  fecha_hora, sensor_id, humedad_suelo_pct, temperatura_suelo,
});

test('mediaJusta hace la media de las medias de cada sensor', () => {
  expect(mediaJusta([[1, 30], [1, 30], [1, 30], [2, 10]])).toBe(20);
  expect(mediaJusta([[1, null], [2, 12]])).toBe(12);
  expect(mediaJusta([])).toBeNull();
  // El peso solo cuenta dentro de cada sensor.
  expect(mediaJusta([[1, 30, 100], [1, 32, 100], [2, 20, 10], [2, 22, 10]])).toBe(26);
});

test('diarioSuelo da por dia la media justa de los elegidos y la serie de cada uno', () => {
  const filas = [
    fila('2026-09-18', 1, 30, 18), fila('2026-09-18', 2, 20, 16), fila('2026-09-18', 3, 99, 99),
    fila('2026-09-19', 1, 32, 20),
  ];

  const serie = diarioSuelo(filas, [1, 2]);

  expect(serie).toEqual([
    { fecha: '2026-09-18', humedad_media: 25, temperatura_suelo: 17, hum_s1: 30, tem_s1: 18, hum_s2: 20, tem_s2: 16 },
    { fecha: '2026-09-19', humedad_media: 32, temperatura_suelo: 20, hum_s1: 32, tem_s1: 20 },
  ]);
});

test('las medias de las series salen con un decimal', () => {
  // diarioSuelo redondea media: (30 + 20.15) / 2 = 25.075 -> 25.1
  const filasD = [fila('2026-09-18', 1, 30, 18), fila('2026-09-18', 2, 20.15, 16.15)];
  const serieD = diarioSuelo(filasD, [1, 2]);
  expect(serieD[0].humedad_media).toBe(Number((25.075).toFixed(1)));
  expect(serieD[0].temperatura_suelo).toBe(Number((17.075).toFixed(1)));

  // horasSuelo redondea media: (30 + 20.15) / 2 = 25.075 -> 25.1
  const lecturasH = [
    lectura('2026-09-19T12:00:00', 1, 30), lectura('2026-09-19T12:00:00', 2, 20.15),
  ];
  const { media } = horasSuelo(lecturasH, [1, 2]);
  expect(media[0].humedad).toBe(Number(((30 + 20.15) / 2).toFixed(1)));
  expect(media[0].temperatura).toBe(Number(((20 + 20) / 2).toFixed(1)));
});

test('horasSuelo no da punto de media en un envio incompleto (caso de las 12:25)', () => {
  const lecturas = [
    lectura('2026-09-19T12:20:00', 1, 27), lectura('2026-09-19T12:20:00', 4, 27),
    lectura('2026-09-19T12:25:00', 4, 23), // falta el nodo del sensor 1
    lectura('2026-09-19T12:30:00', 1, 27), lectura('2026-09-19T12:30:00', 4, 27),
  ];

  const { media, porSensor } = horasSuelo(lecturas, [1, 4]);

  expect(media.map((p) => p.t)).toEqual([Date.parse('2026-09-19T12:20:00'), Date.parse('2026-09-19T12:30:00')]);
  expect(media[0].humedad).toBe(27);
  expect(porSensor[4].map((p) => p.humedad)).toEqual([27, 23, 27]);
  expect(porSensor[1]).toHaveLength(2);
});

test('horasSuelo: un sensor elegido que nunca manda no deja sin media', () => {
  const lecturas = [lectura('2026-09-19T12:20:00', 1, 27), lectura('2026-09-19T12:25:00', 1, 28)];

  const { media, porSensor } = horasSuelo(lecturas, [1, 6]);

  expect(media).toHaveLength(2);
  expect(porSensor[6]).toBeUndefined();
});

test('horasSuelo: el ultimo envio sin un nodo no dibuja una caida', () => {
  const lecturas = [
    lectura('2026-09-19T20:55:00', 1, 50), lectura('2026-09-19T20:55:00', 2, 52),
    lectura('2026-09-19T21:25:00', 1, 51), lectura('2026-09-19T21:25:00', 2, 53),
    lectura('2026-09-19T21:54:00', 1, 55), lectura('2026-09-19T21:54:00', 2, 54),
    lectura('2026-09-19T22:24:00', 1, 56), lectura('2026-09-19T22:24:00', 2, 55),
    lectura('2026-09-19T22:53:00', 2, 52), // falta sensor 1, pero esta dentro de 2h de su ultimo envio
  ];

  const { media } = horasSuelo(lecturas, [1, 2]);

  // 22:53 excluido porque se espera el sensor 1 (dentro de 2h de 22:24)
  expect(media).toHaveLength(4);
  expect(media.map((p) => p.t)).toEqual([
    Date.parse('2026-09-19T20:55:00'),
    Date.parse('2026-09-19T21:25:00'),
    Date.parse('2026-09-19T21:54:00'),
    Date.parse('2026-09-19T22:24:00'),
  ]);
});

test('horasSuelo: un sensor que deja de mandar a mitad no borra la media del resto', () => {
  const lecturas = [
    lectura('2026-09-19T08:00:00', 1, 30), lectura('2026-09-19T08:00:00', 2, 20),
    lectura('2026-09-19T08:30:00', 1, 30), lectura('2026-09-19T08:30:00', 2, 20),
    lectura('2026-09-19T09:00:00', 1, 30), // dentro de 2h del ultimo envio de sensor 2
    lectura('2026-09-19T09:30:00', 1, 30),
    lectura('2026-09-19T10:00:00', 1, 30),
    lectura('2026-09-19T10:30:00', 1, 30),
    lectura('2026-09-19T11:00:00', 1, 30), // fuera de 2h del ultimo envio de sensor 2
  ];

  const { media } = horasSuelo(lecturas, [1, 2]);

  // 09:00-10:30 excluidos (sensor 2 esperado dentro de 2h de 08:30)
  expect(media).toHaveLength(3);
  expect(media.map((p) => p.t)).toEqual([
    Date.parse('2026-09-19T08:00:00'),
    Date.parse('2026-09-19T08:30:00'),
    Date.parse('2026-09-19T11:00:00'),
  ]);
  expect(media[0].humedad).toBe(25);
  expect(media[1].humedad).toBe(25);
  expect(media[2].humedad).toBe(30);
});

test('horasSuelo: un sensor que empieza a mitad no borra la media de antes', () => {
  const lecturas = [
    lectura('2026-09-19T08:00:00', 2, 20), // sensor 1 todavia no manda
    lectura('2026-09-19T09:00:00', 2, 20), // dentro de 2h del primer envio de sensor 1
    lectura('2026-09-19T11:00:00', 1, 30), lectura('2026-09-19T11:00:00', 2, 20),
    lectura('2026-09-19T11:30:00', 1, 30), lectura('2026-09-19T11:30:00', 2, 20),
  ];

  const { media } = horasSuelo(lecturas, [1, 2]);

  // 09:00 excluido (sensor 1 esperado dentro de 2h de su primer envio a 11:00)
  expect(media).toHaveLength(3);
  expect(media.map((p) => p.t)).toEqual([
    Date.parse('2026-09-19T08:00:00'),
    Date.parse('2026-09-19T11:00:00'),
    Date.parse('2026-09-19T11:30:00'),
  ]);
});

test('cortarHuecos corta 14 horas sin datos y no toca los envios seguidos', () => {
  const t = (hhmm, dia = '18') => Date.parse(`2026-09-${dia}T${hhmm}:00`);
  const puntos = ['21:55', '22:00', '22:05', '22:10'].map((h) => ({ t: t(h), humedad: 26 }))
    .concat(['12:14', '12:19', '12:24'].map((h) => ({ t: t(h, '19'), humedad: 25 })));

  const cortado = cortarHuecos(puntos);

  expect(cortado).toHaveLength(puntos.length + 1);
  expect(cortado[4]).toEqual({ t: t('22:10') + 1, humedad: null, temperatura: null });
});

test('cortarHuecos con marcas repetidas sigue cortando los huecos largos', () => {
  const puntos = [
    { t: 0, humedad: 20 },
    { t: 0, humedad: 20 },
    { t: 300000, humedad: 25 },
    { t: 600000, humedad: 26 },
    { t: 900000, humedad: 27 },
    { t: 900000 + 14 * 3600000, humedad: 28 },
  ];

  const cortado = cortarHuecos(puntos);

  expect(cortado).toHaveLength(puntos.length + 1);
  expect(cortado[5]).toEqual({ t: 900001, humedad: null, temperatura: null });
});

test('cortarHuecos no corta los envios de 30 minutos aunque antes se mandara cada 5', () => {
  // 10 puntos cada 5 minutos (300000 ms)
  const t0 = 1000000;
  const cincoMin = 5 * 60 * 1000;
  const treintaMin = 30 * 60 * 1000;
  const puntos = [];
  for (let i = 0; i < 10; i++) {
    puntos.push({ t: t0 + i * cincoMin, humedad: 20 + i });
  }
  // Luego 8 puntos cada 30 minutos (después del último)
  const ultimoT = puntos[puntos.length - 1].t;
  for (let i = 1; i <= 8; i++) {
    puntos.push({ t: ultimoT + i * treintaMin, humedad: 30 + i });
  }

  const cortado = cortarHuecos(puntos);

  // No debe insertar ningun punto nulo (los 30 min NO son un hueco)
  expect(cortado).toHaveLength(puntos.length);
  expect(cortado).toEqual(puntos);
});

test('rellenarDias mete los dias que faltan para que la linea se corte', () => {
  const filas = [{ fecha: '2026-09-16', humedad_media: 20 }, { fecha: '2026-09-19', humedad_media: 22 }];

  expect(rellenarDias(filas).map((f) => f.fecha)).toEqual(['2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19']);
  expect(rellenarDias(filas)[1]).toEqual({ fecha: '2026-09-17' });
});

test('medias del periodo: justas y solo de los elegidos', () => {
  const filas = [fila('2026-09-18', 1, 30, 18, 100), fila('2026-09-19', 1, 32, 20, 100), fila('2026-09-18', 2, 20, 16, 10), fila('2026-09-19', 2, 22, 16, 10)];
  expect(mediaPeriodoDiaria(filas, [1, 2], 'humedad_media')).toBe(26);
  expect(mediaPeriodoDiaria(filas, [1], 'humedad_media')).toBe(31);

  const lecturas = [lectura('a', 1, 30), lectura('b', 1, 30), lectura('c', 1, 30), lectura('d', 2, 10)];
  expect(mediaPeriodoHoras(lecturas, [1, 2], 'humedad_suelo_pct')).toBe(20);
});

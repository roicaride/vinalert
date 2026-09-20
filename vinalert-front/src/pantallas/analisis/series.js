/**
 * Las series de suelo de Analisis, a partir de lo que devuelve la API y de los
 * sensores elegidos. Funciones puras: ni React ni peticiones.
 *
 * Todas usan la MEDIA JUSTA: primero la media de cada sensor y despues la de
 * esas medias. Un sensor que manda mas lecturas no pesa mas, y uno que falta
 * en un envio no mueve la media (docs/specs/2026-09-19-filtro-sensores-design.md).
 */

export const claveHumedad = (id) => `hum_s${id}`;
export const claveTemperatura = (id) => `tem_s${id}`;

const redondear = (v) => (v == null ? null : Number(v.toFixed(1)));

/** `entradas`: [sensorId, valor, peso?]. El peso (1 por defecto) solo pondera dentro de cada sensor. */
export function mediaJusta(entradas) {
  const porSensor = new Map();
  for (const [id, valor, peso = 1] of entradas) {
    if (valor == null || !peso) continue;
    const acc = porSensor.get(id) ?? { suma: 0, peso: 0 };
    acc.suma += valor * peso;
    acc.peso += peso;
    porSensor.set(id, acc);
  }
  if (!porSensor.size) return null;
  let total = 0;
  for (const { suma, peso } of porSensor.values()) total += suma / peso;
  return total / porSensor.size;
}

/** Filas de /suelo/diario -> una fila por fecha con la media justa y la serie de cada sensor elegido. */
export function diarioSuelo(filas, ids) {
  const elegidos = new Set(ids);
  const porFecha = new Map();
  for (const f of filas) {
    if (!elegidos.has(f.sensor_id)) continue;
    const delDia = porFecha.get(f.fecha) ?? [];
    delDia.push(f);
    porFecha.set(f.fecha, delDia);
  }
  return [...porFecha.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, delDia]) => {
      const fila = {
        fecha,
        humedad_media: redondear(mediaJusta(delDia.map((f) => [f.sensor_id, f.humedad_media]))),
        temperatura_suelo: redondear(mediaJusta(delDia.map((f) => [f.sensor_id, f.temperatura_media]))),
      };
      for (const f of delDia) {
        fila[claveHumedad(f.sensor_id)] = redondear(f.humedad_media);
        fila[claveTemperatura(f.sensor_id)] = redondear(f.temperatura_media);
      }
      return fila;
    });
}

// Tolerancia para cambios de cadencia (gap que corta linea) y sensores que se pierden/agregan
// (ventana dentro de la que se espera un sensor: uno ausente aqui es "no enviado", no "perdido").
const HUECO_MINIMO = 2 * 3_600_000;

/**
 * Lecturas de 48 h -> la media por envio y la serie de cada sensor, con `t`
 * en milisegundos para un eje de tiempo real. Un sensor esta "esperado" en un
 * envio dentro de [su primera lectura - 2h, su ultima lectura + 2h]: asi un
 * sensor que se para a mitad no borra la media del resto del periodo (ausente
 * en un envio es "no mandado", no "parado"), y uno que se anade a mitad no
 * borra la de antes. Un envio da punto de media solo si estan todos los
 * sensores esperados en ese instante.
 */
export function horasSuelo(lecturas, ids) {
  const elegidos = new Set(ids);
  const propias = lecturas.filter((l) => elegidos.has(l.sensor_id));

  const porEnvio = new Map();
  const porSensor = {};
  const rango = new Map(); // sensor_id -> [primerT, ultimoT]
  for (const l of propias) {
    const t = Date.parse(l.fecha_hora);
    const envio = porEnvio.get(t) ?? [];
    envio.push(l);
    porEnvio.set(t, envio);
    (porSensor[l.sensor_id] ??= []).push({ t, humedad: l.humedad_suelo_pct, temperatura: l.temperatura_suelo });
    const r = rango.get(l.sensor_id);
    if (!r) rango.set(l.sensor_id, [t, t]);
    else {
      if (t < r[0]) r[0] = t;
      if (t > r[1]) r[1] = t;
    }
  }

  const esperados = (t) => [...rango.entries()].filter(([, [ini, fin]]) => t >= ini - HUECO_MINIMO && t <= fin + HUECO_MINIMO).length;

  const media = [...porEnvio.entries()]
    .filter(([t, ls]) => new Set(ls.map((l) => l.sensor_id)).size === esperados(t))
    .sort(([a], [b]) => a - b)
    .map(([t, ls]) => ({
      t,
      humedad: redondear(mediaJusta(ls.map((l) => [l.sensor_id, l.humedad_suelo_pct]))),
      temperatura: redondear(mediaJusta(ls.map((l) => [l.sensor_id, l.temperatura_suelo]))),
    }));
  for (const serie of Object.values(porSensor)) serie.sort((a, b) => a.t - b.t);
  return { media, porSensor };
}

/**
 * Inserta un punto vacio donde dos puntos seguidos estan a mas de 3 veces la
 * separacion mediana Y a mas de 2 horas: la linea se corta en vez de dibujar
 * una bajada falsa entre dos envios separados por horas sin datos.
 */
export function cortarHuecos(puntos) {
  if (puntos.length < 3) return puntos;
  const saltos = puntos.slice(1).map((p, i) => p.t - puntos[i].t).sort((a, b) => a - b);
  const saltosPositivos = saltos.filter((s) => s > 0);
  if (!saltosPositivos.length) return puntos;
  const mediana = saltosPositivos[Math.floor(saltosPositivos.length / 2)];
  const resultado = [puntos[0]];
  for (let i = 1; i < puntos.length; i++) {
    if (puntos[i].t - puntos[i - 1].t > Math.max(3 * mediana, HUECO_MINIMO)) {
      resultado.push({ t: puntos[i - 1].t + 1, humedad: null, temperatura: null });
    }
    resultado.push(puntos[i]);
  }
  return resultado;
}

const UN_DIA = 86_400_000;

/** Mete una fila {fecha} por cada dia que falta entre dos filas: la linea se corta ahi. */
export function rellenarDias(filas) {
  if (filas.length < 2) return filas;
  const resultado = [];
  for (let i = 0; i < filas.length; i++) {
    resultado.push(filas[i]);
    if (i === filas.length - 1) break;
    // Mediodia UTC: ningun cambio de hora mueve el dia.
    let t = Date.parse(`${filas[i].fecha}T12:00:00Z`) + UN_DIA;
    const siguiente = Date.parse(`${filas[i + 1].fecha}T12:00:00Z`);
    while (t < siguiente) {
      resultado.push({ fecha: new Date(t).toISOString().slice(0, 10) });
      t += UN_DIA;
    }
  }
  return resultado;
}

/** Media justa del periodo desde las filas diarias: cada dia pesa sus lecturas dentro de su sensor. */
export function mediaPeriodoDiaria(filas, ids, campo) {
  const elegidos = new Set(ids);
  return mediaJusta(filas.filter((f) => elegidos.has(f.sensor_id)).map((f) => [f.sensor_id, f[campo], f.n_lecturas]));
}

/** Media justa del periodo desde las lecturas sueltas. */
export function mediaPeriodoHoras(lecturas, ids, campo) {
  const elegidos = new Set(ids);
  return mediaJusta(lecturas.filter((l) => elegidos.has(l.sensor_id)).map((l) => [l.sensor_id, l[campo]]));
}

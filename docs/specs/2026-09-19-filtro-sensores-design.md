# Análisis: filtro de sensores y medias diarias por sensor

Fecha: 2026-09-19

## Contexto

La parcela de prueba tiene 6 sensores en 2 nodos de 3 sondas, a 20, 40 y 60 cm:

| Sensor | Nodo | Profundidad |
|---|---|---|
| S1 | 1 | 20 cm |
| S2 | 1 | 40 cm |
| S3 | 1 | 60 cm |
| S4 | 2 | 20 cm |
| S5 | 2 | 40 cm |
| S6 | 2 | 60 cm |

Hoy las gráficas de suelo de Análisis enseñan una sola media y no permiten ver sensores sueltos. Además esa media está mal planteada en dos sitios:

- **48 horas:** se promedian los sensores que llegaron en cada envío. Si un nodo falla un envío, la media salta aunque el suelo no haya cambiado. Pasó el 19-09 a las 12:25:24: solo llegaron S4–S6, del nodo más seco, y la media bajó de 25.75 % a 25.23 %.
- **7 días en adelante:** sale de `suelo_diario`, que guarda **una fila por parcela y día**, sin sensor. Con esa tabla no se puede filtrar por sensor. Además se rellena en la consolidación, que llegó a pasar un mes sin ejecutarse (ver la corrección del 18-09).

Ambas medias se calculan **por lectura**, no por sensor: un sensor que manda más lecturas pesa más.

## Objetivo

- Por defecto, las gráficas de suelo enseñan **la media** de todos los sensores, como ahora pero bien calculada.
- Se puede ver **un sensor**, **la media de varios** o **varios comparados**, cada uno con su línea.
- Funciona igual en **48 horas** y en **7 días, 30 días, 90 días y 1 año**.
- Hay **una sola definición de media** en toda la aplicación: la *media justa*.

## Fuera de alcance

- El firmware de los nodos (reintentos, sincronización tras cambiar el intervalo). Va aparte.
- Filtro de sensores en la tabla «Últimas lecturas» de Estado.
- Las gráficas de clima: el clima es de la parcela, no de un sensor, y no cambian.
- Sensores dados de baja: no aparecen en el selector ni en las series, igual que hoy.

## Decisiones tomadas

**Media justa.** La media de un conjunto de sensores es la media de las medias de cada sensor. Un sensor que manda menos lecturas no pesa menos, y un sensor que falta en un envío no mueve la media. Se aplica en:

- el servidor, en las cifras de Estado (`/dashboard`);
- la web, al combinar los sensores elegidos en Análisis.

**Medias diarias calculadas al momento (enfoque A).** Se descartan dos alternativas:

- **Una tabla nueva de medias diarias por sensor:** añade tabla, migración y consolidación, que es la pieza que ya falló.
- **Calcular en el navegador:** un año son unas 630 000 lecturas.

El servidor agrupa `log_sensores` por día (hora de Madrid) y por sensor en cada petición, con un índice nuevo por `(parcela_id, fecha_hora)`. Consecuencias:

- `suelo_diario` se retira: tabla, modelo, esquema y consolidación de suelo.
- La consolidación queda **solo para el clima** (`clima_diario`), que sí hay que descargar de Open-Meteo.
- El día de hoy siempre está al día, hasta la última lectura.

**Riesgo asumido:** con muchos años de lecturas, calcular un año al momento podría ralentizarse. Con el índice, a la escala actual (varias parcelas, varios años) sobra. Si hiciera falta, se puede guardar el diario otra vez detrás del mismo endpoint sin tocar la web.

## Servidor

### Índice

`log_sensores (parcela_id, fecha_hora)`. Se declara en el modelo y se crea en la migración.

### `GET /parcelas/{id}/suelo/diario?dias=N`

Cambia de forma: pasa a devolver **una fila por día y sensor**.

- `dias`: entero, entre 1 y 366, por defecto 30. Cubre desde las 00:00 (hora de Madrid) de hace `dias` días hasta ahora, incluido el día de hoy.
- El parámetro `limite` desaparece: el tamaño ya lo acota `dias`.
- Solo cuenta sensores activos de la parcela.
- Permiso de lectura sobre la parcela: `parcela_con_lectura`. Parcela ajena → 404.
- Orden: por `fecha` ascendente y después por `numero` de sensor.

Cada fila:

| Campo | Tipo | Nota |
|---|---|---|
| `fecha` | date | día civil de Madrid; `fecha_hora` ya se guarda en esa hora |
| `sensor_id` | int | |
| `sensor_numero` | int | para la leyenda (S1…S6) |
| `profundidad_cm` | float o null | para el trazo y los atajos de profundidad |
| `humedad_media`, `humedad_max`, `humedad_min` | float o null | |
| `temperatura_media`, `temperatura_max`, `temperatura_min` | float o null | |
| `n_lecturas` | int | |

Los días sin lecturas de un sensor no generan fila.

La agregación se hace en SQL (`GROUP BY date(fecha_hora), sensor_id`), con funciones que existen en PostgreSQL y en SQLite (`func.date`, `func.avg`, `func.min`, `func.max`, `func.count`), para que los tests sobre SQLite prueben la misma consulta.

### `/dashboard`

`estado_suelo.humedad_media` y `estado_suelo.temperatura_media` pasan a la media justa de los sensores activos en las últimas 24 h. El resto de campos no cambia:

- `n_sensores` y `n_lecturas`;
- `humedad_sd` y `temperatura_sd`, calculadas sobre todas las lecturas. La web ya no las muestra.

### Servicios

`app/services/sensor_stats.py` gana `media_justa(pares_sensor_valor) -> Optional[float]`: agrupa por sensor, hace la media de cada uno y después la media de esas medias, ignorando los valores nulos. Es pura y se prueba sola.

### Retirada de `suelo_diario`

Se quitan:

- el modelo `SueloDiario` y su relación en `Parcela`;
- el esquema `SueloDiarioResp`, sustituido por el esquema nuevo por sensor;
- `_consolidar_suelo`;
- la parte de suelo de `consolidar_datos_diarios` y de `consolidar_parcela`.

Los tests que prueban esa tabla o su consolidación se quitan o se adaptan:

- `test_modelos_diarios` (parte de suelo);
- `test_consolidacion` (suelo);
- `test_consolidacion_scheduler` (suelo);
- `test_paridad_columnas` (parte de `SueloDiario`);
- `test_endpoints_diarios` (suelo).

### Migración `migracion_2026_09_19_suelo_por_sensor.sql`

- `CREATE INDEX IF NOT EXISTS ix_log_sensores_parcela_fecha ON log_sensores (parcela_id, fecha_hora);`
- `DROP TABLE IF EXISTS suelo_diario;`
- Idempotente. Destructiva solo para `suelo_diario`, que hoy está vacía y es derivable de `log_sensores`.
- Se aplica **después** de desplegar el código que ya no usa la tabla. Antes se hace una copia con `pg_dump`.
- Se añade a la lista del README.

## Web

### Selección de sensores

Estado de la selección:

- `sensores`: ids encendidos;
- `modo`: `media` o `comparar`.

**Lista de sensores:** sale de `GET /parcelas/{id}/sensores/` (ya existe), filtrada a los activos. Se usa su `numero` para la etiqueta (S1…S6) y su `profundidad_cm` para el trazo y los atajos. Así el selector es el mismo en 48 horas y en las vistas diarias, llegue o no cada sensor en el periodo; un sensor sin datos en el periodo simplemente no dibuja nada.

**Valor inicial:** todos los sensores activos encendidos y modo `media`. Es lo que se ve hoy, pero con la media justa.

**Reglas:**

- Siempre queda al menos un sensor encendido. Apagar el último no hace nada.
- Los **atajos de profundidad** («20 cm», «40 cm», «60 cm») dejan encendidos solo los sensores a esa profundidad. «Todos» enciende todos.
- Solo aparecen atajos para las profundidades que existan en la parcela. Los sensores sin profundidad solo se eligen sueltos.

**Recuerdo:** la selección se guarda en `localStorage` por parcela (`vinalert_sensores_<parcelaId>`), dentro de `try/catch`. Si no está, o si contiene sensores que ya no existen, se vuelve al valor inicial.

**Componentes:**

- `analisis/useSeleccionSensores.js`: el hook con el estado, las reglas y el recuerdo.
- `analisis/SelectorSensores.jsx`: la banda de la interfaz.

**Interfaz:** una banda debajo de «Período / Vista».

```
SENSORES  [Todos] [20 cm] [40 cm] [60 cm]      VER  [■ Media | Comparar]
          [■S1·20] [■S2·40] [■S3·60] [■S4·20] [■S5·40] [■S6·60]
```

Cada botón de sensor lleva una muestra de su color y su trazo. Son botones con `aria-pressed`, igual que los de Período y Vista.

### Cálculo de las series (funciones puras, `analisis/series.js`)

- **`diarioMedia(filas, seleccion)`:** para cada fecha, la media justa de los sensores elegidos que tengan fila ese día (humedad y temperatura por separado).
- **`diarioPorSensor(filas, seleccion)`:** para cada fecha, `humedad_<id>` y `temperatura_<id>` de cada sensor elegido.
- **`horasMedia(lecturas, seleccion)`:** agrupa las lecturas por `fecha_hora` (un envío). Da un punto **solo si están todos los sensores elegidos**; si falta alguno, no hay punto en ese envío. Esto evita el salto de las 12:25.
- **`horasPorSensor(lecturas, seleccion)`:** las lecturas de cada sensor elegido, tal cual.
- **`cortarHuecos(serie, clave)`:** inserta un punto vacío cuando dos puntos seguidos están demasiado lejos, y las líneas usan `connectNulls={false}`.
  - En 48 horas, «demasiado lejos» es más de 3 veces la separación mediana entre envíos del periodo.
  - En vistas diarias, cada día que falta entre el primero y el último es un punto vacío.

### Gráficas afectadas

| Gráfica | Media | Comparar |
|---|---|---|
| **Temperatura y humedad del suelo** (Resumen) | Como hoy: humedad y temperatura con la media justa de los elegidos | Se parte en dos gráficas de un solo eje, **Humedad del suelo** y **Temperatura del suelo**, con una línea por sensor |
| **Cifras del periodo**: humedad y temperatura del suelo media | Media justa de los elegidos | Igual |
| **Detalle · tus sondas y el modelo** | Media de los elegidos contra el modelo | Una línea por sensor contra el modelo |
| **Clima**: lluvia, ET₀, temperatura del aire, sol, viento, humedad del aire | Sin cambios | Sin cambios |

Las cifras de lluvia, ET₀ y balance no cambian.

### Colores y trazo

Cada sensor tiene un color fijo por su número (S1…S6), definido en `analisis/tema.js` como `SENSORES`, el mismo en todas las gráficas. El trazo codifica la profundidad:

- 20 cm, continuo;
- 40 cm, discontinuo (`6 3`);
- 60 cm, punteado (`2 3`);
- sin profundidad, continuo.

El trazo es la codificación secundaria, así que un par de colores cercanos para alguien con daltonismo se sigue distinguiendo.

La paleta sale de las tintas de serie de `tema.js`, en orden fijo:

| Sensor | Color | Hex |
|---|---|---|
| S1 | azul | `#4B98E3` |
| S2 | ámbar | `#C7832D` |
| S3 | granate | `#C1558A` |
| S4 | lima | `#69A81C` |
| S5 | violeta | `#A979DD` |
| S6 | turquesa | `#27A6A3` |

A partir del séptimo sensor se repite el ciclo; con el trazo, sensor y profundidad siguen identificándose en la leyenda. El par azul/turquesa es el más cercano. En esta parcela cae en S1 (20 cm, continuo) y S6 (60 cm, punteado), que se distinguen por el trazo.

### Exportación (Excel / CSV)

- **La pestaña «Análisis diario»** usa la media justa de **todos** los sensores activos, calculada desde las filas por sensor.
- **Pestaña nueva, «Suelo por sensor»:** una fila por día y sensor, con fecha, sensor, profundidad, humedad media, máxima y mínima, temperatura media, máxima y mínima, y número de lecturas.
- En CSV, la opción «Análisis» sigue descargando el resumen diario.

## Pruebas

Se escriben antes que el código, como en el resto del proyecto.

**Servidor**

- `media_justa`:
  - la media de las medias por sensor, con un sensor que tiene 3 lecturas y otro 1;
  - ignora los nulos;
  - devuelve `None` si no hay nada.
- `GET /suelo/diario`:
  - devuelve una fila por día y sensor, con máximos, mínimos y número de lecturas;
  - el día va de 00:00 a 23:59 en hora de Madrid;
  - incluye hoy;
  - `dias` filtra, también en el borde;
  - excluye sensores inactivos;
  - parcela ajena → 404;
  - `dias` fuera de rango → 422.
- `/dashboard`: la media justa con sensores que mandan distinto número de lecturas.
- Consolidación: sigue guardando `clima_diario` y ya no escribe suelo.
- Matriz de permisos: el endpoint cambiado sigue registrado.

**Web**

- `series.js`:
  - `horasMedia` no da punto cuando falta un sensor elegido (caso 12:25);
  - `diarioMedia` hace la media justa;
  - `cortarHuecos` corta 14 horas sin datos y los días que faltan.
- Selector:
  - por defecto todos y Media;
  - los atajos de profundidad;
  - no deja apagar el último sensor;
  - recuerda la selección;
  - ignora una selección guardada con sensores que ya no existen.
- Análisis:
  - Comparar parte la gráfica de suelo en dos, con una línea por sensor;
  - las cifras siguen la selección;
  - las gráficas de clima no cambian.
- Exportación: la pestaña «Suelo por sensor» y la media justa en «Análisis diario».

**Revisión final:** en el navegador, con los datos reales de la parcela 1, en 48 horas y en 7 días, en los modos Media y Comparar.

## Orden de trabajo

1. **Servidor:** índice, `media_justa`, endpoint nuevo, `/dashboard` con la media justa y retirada de `suelo_diario` de código y tests.
2. **Web:** `series.js`, el hook y el selector, y su integración en Análisis, Detalle y exportación.
3. **Migración:** copia de seguridad, permiso del usuario y aplicación.
4. **Revisión** con datos reales.

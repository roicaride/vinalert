# Cimientos de datos: histórico partido, clima ampliado, backfill y tratamientos

Fecha: 2026-08-17
Sub-proyecto ① de 3. Siguientes: ③ Aplicación web, ② Ingesta de campo (LoRa).

## Contexto

VinAlert es una API (FastAPI + PostgreSQL) para monitorización agrícola, con
frontend React. Acaba de completarse un proyecto que añadió soporte para
múltiples sensores de suelo por parcela, ingesta del sensor foliar por Excel,
y un scheduler automático de clima (Open-Meteo).

El destinatario real de estos datos es un **equipo de investigación**, no solo
un agricultor: el criterio al decidir qué guardar es "¿le sirve a alguien que
va a analizar esto?", no solo "¿se ve bonito en el panel?".

Al planificar el frontend salieron a la luz tres problemas de fondo en el
modelo de datos que conviene arreglar **antes** de construir interfaz encima:

1. `clima_diario_historico` mezcla dos fuentes independientes (la API
   meteorológica y el array de sensores) en una misma fila con la misma clave.
   Si una falla, la fila queda a medias. Además su estadística es incoherente
   (temperatura tiene media y desviación; humedad tiene inicial, final y
   desviación, pero **no media**), arrastra columnas muertas del motor de riego
   ya retirado (`humedad_inicial`, `humedad_final`), y tiene una columna
   `radiacion_total_joules` que ningún código rellena.
2. Del clima solo se capturan 11 variables, dejando fuera cosas de alto valor
   agronómico que la misma llamada a la API ya podría traer sin coste.
3. `cue_actividades` (cuaderno de explotación) quedó a medio hacer: 7 filas de
   prueba sin producto ni dosis, con campos que nadie rellena.

## Objetivo

Dejar el modelo de datos coherente y rico antes de construir la interfaz:

- Separar el histórico diario en dos tablas independientes, cada una con
  estadística completa y correcta.
- Ampliar la captura meteorológica con las variables de valor agronómico que
  Open-Meteo ya ofrece gratis.
- Poder rellenar el histórico climático hacia atrás desde el archivo, para que
  el equipo de investigación tenga contexto multianual sin esperar meses.
- Sustituir `cue_actividades` por una tabla `tratamientos` centrada y útil.

## Fuera de alcance

- Todo el frontend (sub-proyecto ③).
- Claves de dispositivo, endpoint de lote para la pasarela LoRa, y elegir el
  número de sensores al crear la parcela (sub-proyecto ②).
- Endpoints de exportación (van en ③, porque existen para servir a la interfaz).
- Modelos agronómicos derivados (índices de riesgo, grados-día, balance
  hídrico). Guardamos la materia prima; calcular sobre ella es otro proyecto.

## Verificación previa hecha

Todas las variables citadas en este spec se probaron contra la API real de
Open-Meteo antes de escribirlo (no se asumieron de la documentación):

- **Pronóstico** (`api.open-meteo.com/v1/forecast`): las 16 variables horarias
  solicitadas responden correctamente, incluidas `vapour_pressure_deficit`
  (1.62 kPa), `shortwave_radiation` (684 W/m²), `dew_point_2m`,
  `soil_temperature_0cm/6cm/18cm` y `soil_moisture_0_to_1cm/1_to_3cm/3_to_9cm/9_to_27cm`.
- **Archivo** (`archive-api.open-meteo.com/v1/archive`): las 19 variables
  diarias solicitadas responden, ninguna rechazada, incluidas
  `vapour_pressure_deficit_max`, `shortwave_radiation_sum`,
  `soil_moisture_0_to_7cm_mean` y `soil_temperature_0_to_7cm_mean`.
- **Bloque `current` del pronóstico**: acepta las **20** variables instantáneas
  de una sola llamada, incluidas las de suelo, VPD, punto de rocío, radiación
  y — importante — `et0_fao_evapotranspiration`. Esto permite eliminar el
  helper `_et0_hora_actual`, que hoy busca la hora actual dentro del bloque
  `hourly` y, si no la encuentra, cae a "el primer valor no nulo" — es decir,
  puede acabar guardando la ET₀ de una hora arbitraria del día.
- **Diarias del pronóstico con `past_days=7`**: las 18 variables diarias
  necesarias responden y devuelve hasta 7 días hacia atrás, que es lo que
  permite consolidar el día anterior con agregados correctos.
- **Humectación foliar** (`leaf_wetness_probability_mean`, solo diaria):
  responde correctamente en el pronóstico.

## Modelo de datos

### Tabla nueva: `clima_diario` (sustituye la mitad climática de `clima_diario_historico`)

Una fila por parcela y día. Restricción única `(parcela_id, fecha)`.

| Campo | Tipo | Notas |
|---|---|---|
| id | int, PK | |
| parcela_id | int, FK → parcelas, not null | |
| fecha | date, not null | |
| temp_max, temp_min, temp_media | float | °C |
| humedad_relativa_media, humedad_relativa_max, humedad_relativa_min | float | % |
| punto_rocio_medio | float | °C |
| vpd_medio, vpd_max | float | kPa — déficit de presión de vapor |
| precipitacion_total_mm | float | mm |
| et0_total_dia | float | mm |
| radiacion_total_mj_m2 | float | MJ/m² (el archivo ya da MJ/m²; del pronóstico se convierte desde W/m² horarios) |
| horas_sol | float | horas (se guarda en horas, no en segundos como da la API) |
| viento_vel_media, viento_racha_max | float | m/s |
| viento_dir_dominante | float | grados |
| humectacion_foliar_pct | float | % de probabilidad media diaria |
| suelo_modelo_humedad | float | m³/m³ — estimación del modelo, para contrastar con los sensores reales |
| suelo_modelo_temp | float | °C — ídem |
| fuente | string, not null | `"pronostico"` (agregados diarios de la API de pronóstico, con `past_days`) o `"archivo"` (API de archivo histórico) |
| suelo_modelo_capa | string | capa de la que salió el dato de suelo (p. ej. `"3_to_9cm"` o `"0_to_7cm"`) |

**Por qué `fuente` y `suelo_modelo_capa`:** el archivo (ERA5) y el pronóstico
usan capas de suelo distintas — el archivo da `0_to_7cm`, el pronóstico da
`0_to_1 / 1_to_3 / 3_to_9 / 9_to_27cm`. Sin marcarlo, un investigador podría
comparar sin darse cuenta filas medidas de forma distinta. Estas dos columnas
hacen esa diferencia explícita y auditable en cada fila.

### Tabla nueva: `suelo_diario` (sustituye la mitad de sensores de `clima_diario_historico`)

Una fila por parcela y día. Restricción única `(parcela_id, fecha)`.

| Campo | Tipo | Notas |
|---|---|---|
| id | int, PK | |
| parcela_id | int, FK → parcelas, not null | |
| fecha | date, not null | |
| humedad_media, humedad_sd, humedad_max, humedad_min | float | % — agregado de los sensores activos |
| temperatura_media, temperatura_sd, temperatura_max, temperatura_min | float | °C |
| n_sensores | int | cuántos sensores activos aportaron datos ese día |
| n_lecturas | int | cuántas lecturas se agregaron en total |

Estadística simétrica y completa para ambas magnitudes — que es justo lo que
faltaba en la tabla anterior.

### `log_clima` (ampliada)

Se **añaden** (todas verificadas contra la API):

| Campo | Origen Open-Meteo | Notas |
|---|---|---|
| vpd_kpa | `vapour_pressure_deficit` | Estrés hídrico de la planta |
| punto_rocio_c | `dew_point_2m` | Condensación / humectación |
| radiacion_wm2 | `shortwave_radiation` | Radiación solar instantánea |
| nubosidad_pct | `cloud_cover` | |
| viento_racha_ms | `wind_gusts_10m` | |
| viento_dir_deg | `wind_direction_10m` | |
| duracion_sol_s | `sunshine_duration` | Segundos de sol en esa hora |
| suelo_temp_0cm, suelo_temp_6cm, suelo_temp_18cm | `soil_temperature_*` | Modelo, para contrastar con sensores |
| suelo_hum_0_1cm, suelo_hum_1_3cm, suelo_hum_3_9cm, suelo_hum_9_27cm | `soil_moisture_*` | Modelo, ídem |

Se **mantienen** todas las columnas actuales sin cambios.

Se descartan deliberadamente las capas más profundas (`soil_temperature_54cm`,
`soil_moisture_27_to_81cm`): quedan por debajo de la zona donde estarán los
sensores, así que no aportan al contraste modelo-vs-real que justifica capturarlas.

### Tabla nueva: `tratamientos` (sustituye `cue_actividades`)

| Campo | Tipo | Notas |
|---|---|---|
| id | int, PK | |
| parcela_id | int, FK → parcelas, not null | |
| fecha | datetime, not null | |
| tipo | string, not null | `fitosanitario`, `abonado`, `poda`, `riego`, `otro` |
| producto | string | nombre comercial |
| materia_activa | string | principio activo |
| dosis | float | cantidad por hectárea |
| unidad_dosis | string | `L/ha`, `kg/ha` |
| cantidad_total | float | cantidad total empleada |
| unidad_cantidad | string | `L`, `kg` |
| operador | string | quién lo aplicó |
| maquinaria | string | equipo empleado |
| notas | text | |
| temp_c_aplicacion | float | rellenado automáticamente al registrar |
| viento_ms_aplicacion | float | ídem — dato legalmente exigido para fitosanitarios |

**Captura automática del clima:** al crear un tratamiento, el backend consulta
la última lectura de `log_clima` de esa parcela y copia temperatura y viento.
Si no hay ninguna disponible, los campos quedan a `None` y el registro se crea
igual (no se bloquea el alta por falta de clima). Se copia el dato ya
almacenado en vez de llamar a la API en ese momento, para que registrar un
tratamiento no dependa de tener conectividad ni de la latencia del proveedor.

Se descartan de la tabla anterior: `descripcion` (absorbido por `notas`),
`cantidad_real_mm` (unidad confusa, sustituida por `cantidad_total` +
`unidad_cantidad`), y los nombres `viento_api`/`temp_api` (renombrados a
`*_aplicacion`, que dice lo que son en vez de de dónde salieron).

### Tablas eliminadas

- `clima_diario_historico` — sustituida por `clima_diario` + `suelo_diario`.
  Se pierden sus 147 filas (datos de prueba). Decisión explícita del usuario.
- `cue_actividades` — sustituida por `tratamientos`. Se pierden sus 7 filas
  (datos de prueba sin producto ni dosis, verificado por consulta directa).

### Se mantienen sin cambios

`usuarios`, `parcelas`, `sensores`, `log_sensores`, `lecturas_foliares`.

## Servicio meteorológico

### Ampliación del proveedor

`OpenMeteoProvider.fetch()` en `app/services/weather.py` amplía su lista de
variables horarias para traer las nuevas columnas. La estructura del proveedor
(clase abstracta + registro) no cambia — sigue siendo intercambiable.

La conversión de unidades se hace en el proveedor, no en el modelo:
`sunshine_duration` llega en segundos y se guarda en segundos en `log_clima`
(dato horario), pero se acumula y convierte a horas al consolidar el día.

### Backfill desde el archivo histórico

Nuevo método en el proveedor: `fetch_archivo(lat, lon, desde, hasta) -> list[dict]`,
que consulta `archive-api.open-meteo.com/v1/archive` y devuelve una lista de
dicts diarios ya mapeados a los campos de `clima_diario`.

Nuevo endpoint: `POST /parcelas/{parcela_id}/clima/backfill`

- Cuerpo: `{"desde": "YYYY-MM-DD", "hasta": "YYYY-MM-DD"}` o `{"anios": N}`
  (que se traduce a un rango terminando ayer).
- Escribe en `clima_diario` con `fuente="archivo"`.
- **Idempotente por upsert**: si ya existe fila para `(parcela_id, fecha)`, se
  actualiza en vez de duplicar. Una fila con `fuente="consolidado"` (datos
  propios, más fiables porque son de nuestra ubicación exacta y nuestra
  cadencia) **no se sobrescribe** con datos de archivo.
- Devuelve un resumen: días solicitados, insertados, actualizados, omitidos.
- 422 si la parcela no tiene coordenadas; 503 si el proveedor falla.

**Límite de rango:** el archivo tiene un desfase de varios días respecto a hoy.
El endpoint recorta automáticamente `hasta` a `hoy - 7 días` si se pide algo
más reciente, y lo indica en el resumen devuelto, en vez de fallar o devolver
días vacíos.

## Corrección: de dónde salen los agregados diarios de clima

**Bug detectado en el `worker.py` actual** (verificado al escribir este spec):
la precipitación diaria se calcula como `SUM(log_clima.lluvia_mm)`. Pero
`lluvia_mm` es la lluvia caída *en la hora en curso*, y el scheduler muestrea
cada 3 horas — esa suma solo cubre 8 de las 24 horas del día e **infravalora
la precipitación en torno a 3×**. El mismo defecto afecta a la suma de ET₀, y
afectaría a radiación y horas de sol si se calcularan igual. No se había
detectado porque aún no hay datos reales acumulados.

Por eso `clima_diario` **no se agrega desde `log_clima`**, sino que se rellena
con los agregados diarios que la propia API calcula sobre las 24 horas
completas:

- **Días recientes**: API de pronóstico con `past_days=7` (verificado: acepta
  las 18 variables diarias necesarias y devuelve hasta 7 días hacia atrás).
  `fuente="pronostico"`.
- **Días antiguos**: API de archivo. `fuente="archivo"`.

Ventaja secundaria: el relleno histórico y la consolidación diaria pasan a ser
el mismo código, cambiando solo el endpoint y la etiqueta de `fuente`.

`log_clima` mantiene su papel: el registro de alta frecuencia (cada 3 h) con
las condiciones instantáneas, que es para lo que sirve y donde sí es correcto.

## `worker.py`

`consolidar_datos_diarios(parcela_id, fecha)` pasa a rellenar las dos tablas
nuevas, **cada una en su propio bloque `try`/`except`**, para que un fallo en
una fuente no impida consolidar la otra — que es precisamente el problema que
motivó partir la tabla.

- `clima_diario`: pide a la API los agregados diarios (ver sección anterior) y
  hace upsert sobre `(parcela_id, fecha)`.
- `suelo_diario`: agrega desde `log_sensores` de sensores activos, reutilizando
  `calcular_resumen()` de `app/services/sensor_stats.py` para media y
  desviación, y añadiendo máximo y mínimo. Aquí sí es correcto agregar nuestras
  propias lecturas: son medidas instantáneas de estado (humedad, temperatura),
  no acumulados, así que promediarlas sobre las muestras del día es
  estadísticamente válido.

`calcular_resumen()` se amplía para devolver también `humedad_max`,
`humedad_min`, `temperatura_max` y `temperatura_min`, además de lo que ya
devuelve. Es una ampliación aditiva: las claves actuales no cambian de nombre
ni de semántica, así que sus consumidores existentes (endpoint de resumen,
exportación, dashboard) siguen funcionando sin tocarlos.

## Migración

Cuatro operaciones, en un único archivo SQL:

1. `CREATE TABLE clima_diario` y `CREATE TABLE suelo_diario` (con sus índices
   únicos sobre `(parcela_id, fecha)`).
2. `ALTER TABLE log_clima ADD COLUMN` para las 14 columnas nuevas.
3. `CREATE TABLE tratamientos`.
4. `DROP TABLE clima_diario_historico` y `DROP TABLE cue_actividades`.

Los `CREATE TABLE` los cubre `Base.metadata.create_all` al arrancar la app
(son tablas nuevas), pero se incluyen igualmente en el SQL para que la
migración sea autocontenida y reproducible.

Como en el proyecto anterior: el SQL se escribe y valida, pero **no se ejecuta
contra la base real sin confirmación explícita** del usuario, por ser
destructivo (`DROP TABLE`).

## Endpoints afectados

- **Eliminado**: `POST /actividades/` y `GET /parcelas/{id}/actividades`
  (router `actividades.py` completo) → sustituidos por el router `tratamientos.py`
  con `POST /tratamientos/`, `GET /parcelas/{id}/tratamientos` y
  `DELETE /tratamientos/{id}`.
- **Modificado**: `GET /parcelas/{id}/historico-diario` devolvía
  `ClimaDiarioHistorico`. Pasa a `GET /parcelas/{id}/clima/diario` y
  `GET /parcelas/{id}/suelo/diario`, cada uno con su schema.
- **Nuevo**: `POST /parcelas/{id}/clima/backfill`.
- Sin cambios: todo lo de sensores, foliar, auth, parcelas.

## Testing

- **Proveedor meteorológico**: test del mapeo de la respuesta de Open-Meteo a
  los campos de `log_clima`, con una respuesta de ejemplo fija (sin llamar a la
  red), verificando que las 14 variables nuevas aterrizan en su columna.
- **Backfill**: test con proveedor simulado que devuelve 3 días; verifica que
  se crean 3 filas con `fuente="archivo"`; que reejecutarlo actualiza en vez de
  duplicar; y que **no pisa** una fila preexistente con `fuente="pronostico"`.
- **Recorte de rango**: pedir `hasta` = hoy devuelve un resumen indicando el
  recorte a `hoy - 7 días`, sin error.
- **`calcular_resumen` ampliado**: las claves nuevas (máx/mín) son correctas y
  las antiguas mantienen exactamente su valor previo (test de no-regresión
  sobre los casos ya existentes: 0 lecturas, 1 lectura, varias).
- **`worker.py`**: un fallo simulado al consolidar el clima no impide que
  `suelo_diario` se rellene ese mismo día, y viceversa — que es el motivo de
  partir la tabla, así que debe estar cubierto explícitamente.
- **No-regresión del bug de precipitación**: un test que confirme que
  `clima_diario.precipitacion_total_mm` proviene del agregado diario de la API
  y **no** de sumar las lecturas de `log_clima` — el escenario concreto es un
  día con varias lecturas de `lluvia_mm` en `log_clima` cuya suma difiere del
  valor diario de la API; debe ganar el de la API.
- **Tratamientos**: alta con clima disponible copia temperatura y viento; alta
  sin ninguna lectura de clima previa crea el registro igualmente con esos
  campos vacíos.

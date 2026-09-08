# Sensores de suelo (array), lectura foliar por Excel, y limpieza del modelo de datos

Fecha: 2026-08-17

## Contexto

VinAlert es una API (FastAPI + PostgreSQL) para gestión agrícola por parcela, con
frontend en React. Hasta ahora el modelo asumía **un sensor de suelo por parcela**
(`log_sensores` solo tiene `parcela_id`, sin identificar qué dispositivo mandó el
dato).

Nuevo encargo: instalar **18 sensores propios de humedad y temperatura de suelo**
(nodos ESP32) en una misma plantación, y además alojar datos de un **sensor foliar
de terceros** (medidor tipo Dualex Dx4.5 — clorofila, flavonoles, índice de
nitrógeno NBI) cuyos datos llegan como adjunto Excel que sube el propio usuario.

De paso, se aprovecha para retirar funcionalidad que ya no encaja en el alcance
actual (motor de riesgo de enfermedad, motor de recomendación de riego, tablas
huérfanas de iteraciones anteriores).

## Objetivo

- Poder tener múltiples sensores de suelo por parcela, identificados individualmente,
  y ver tanto el detalle por sensor como un agregado (media ± desviación) de toda
  la parcela.
- Poder subir el Excel del sensor foliar de terceros y visualizar sus datos por
  parcela.
- Dejar el modelo de datos limpio, sin tablas ni lógica sin usar.
- Mantener y reforzar ligeramente el módulo de clima existente (Open-Meteo), que
  ya cubre lo necesario para un equipo de investigación (dato actual + pronóstico
  de lluvia a 24h/48h + ET0).

## Fuera de alcance

- Protocolo exacto de comunicación del ESP32 (MQTT, retries, provisioning) — se
  asume que hablará HTTP contra un endpoint.
- Tratar el "grupo" del Excel foliar como punto de muestreo persistente entre
  visitas — no está confirmado que lo sea; se guarda como identificador simple
  de esa subida concreta.
- Motor de riesgo de enfermedad y motor de recomendación de riego — se eliminan,
  no se rediseñan. Se podrán reconstruir en el futuro si hace falta.
- Rediseño visual del frontend — el spec señala qué pantallas hay que tocar, pero
  el diseño de UI se resuelve en la fase de implementación.

## Modelo de datos

### Tabla nueva: `sensores`

Catálogo de dispositivos de suelo instalados. Pensada para que cualquier parcela
(no solo esta) pueda tener N sensores en el futuro.

| Campo | Tipo | Notas |
|---|---|---|
| id | int, PK | |
| parcela_id | int, FK → parcelas | |
| etiqueta | string | p. ej. "Nodo 3" |
| activo | bool, default true | permite dar de baja un nodo sin borrar su histórico |

### `log_sensores` (modificada)

- **Añadir** `sensor_id` (int, FK → sensores, obligatorio para lecturas nuevas).
- **Eliminar** `nitrogeno`, `fosforo`, `potasio`, `ph` (fuera de alcance: los
  nodos nuevos solo miden humedad y temperatura de suelo).
- **Mantener** `humedad_suelo_pct`, `temperatura_suelo`, `bateria`, `fecha_hora`.
- `parcela_id` se mantiene (aunque es derivable vía `sensor_id → sensores.parcela_id`)
  para no romper las consultas existentes que filtran directamente por parcela.

### Tabla nueva: `lecturas_foliares`

Una fila por cada "grupo" (bloque-resumen) que trae el Excel subido, **no** las
lecturas individuales crudas — el propio dispositivo Dualex ya calcula media y
desviación estándar por grupo, así que no tiene sentido recalcularlo.

| Campo | Tipo | Notas |
|---|---|---|
| id | int, PK | |
| parcela_id | int, FK → parcelas | sin relación con `sensores` (ver "Decisiones", más abajo) |
| fecha | date | tomada de la primera columna de datos del Excel |
| grupo | int | identificador del bloque dentro de esa subida (no se asume persistente entre subidas) |
| chl_medio, chl_sd | float | |
| flav_medio, flav_sd | float | |
| nbi_medio, nbi_sd | float | |
| n_mediciones | int | nº de lecturas que promedia ese grupo |
| archivo_origen | string | nombre del .xlsx subido, para trazabilidad |

### Tablas eliminadas

Huérfanas en la base de datos, sin modelo ORM ni referencias en el código:
- `logs_sensores_pro`
- `logs_clima_api`
- `riesgo_enfermedades` (duplicado sin usar de `riesgos_enfermedad`)

Sin uso en código (no importadas fuera de su propia definición):
- `etapas_cultivo` (modelo `EtapaCultivo`)

Funcionalidad real que se retira por decisión explícita (no son restos, hacían
algo — ver sección "Limpieza de funcionalidad"):
- `riesgos_enfermedad` (modelo `RiesgoEnfermedad`)
- `recomendaciones_riego` (modelo `RecomendacionRiego`)

### Se mantienen sin cambios

`usuarios`, `parcelas`, `log_clima`, `clima_diario_historico`, `cue_actividades`.

## Decisiones de diseño

**¿Por qué `lecturas_foliares` no referencia `sensores`?** El catálogo `sensores`
modela dispositivos fijos instalados con lecturas continuas (los 18 ESP32). El
medidor foliar es un aparato de mano usado en visitas puntuales; no hay
continuidad ni identidad de dispositivo instalada en la parcela. Forzar una
relación ahí sería tratar como "concreto" algo que no lo es. Si en el futuro se
confirma que el "grupo" es un punto fijo entre visitas, se puede añadir un
concepto de "punto de muestreo" sin tocar esta tabla.

**¿Por qué agregación al vuelo y no una tabla de snapshots?** Con 18 sensores
reportando cada varias horas, el volumen es bajo — un `AVG`/`STDDEV` con
`GROUP BY` sobre eso es instantáneo. Evita mantener un job programado y una
tabla adicional, y siempre refleja correcciones/borrados de lecturas erróneas.
La necesidad de "guardarlo para exportar fácil" se resuelve con un endpoint de
exportación que genera el CSV/Excel al vuelo — el archivo descargado es la copia
persistida, sin duplicar el dato en la base.

## Endpoints

### Sensores de suelo (`app/routers/logs.py` y nuevo `app/routers/sensores.py`)

- `POST /logs/sensor/` — igual que hoy, pero el body ahora exige `sensor_id`
  (además de `parcela_id`, `humedad_suelo_pct`, `temperatura_suelo`, `bateria`).
- `GET /parcelas/{id}/sensores` — catálogo de sensores de la parcela.
- `POST /parcelas/{id}/sensores` — alta de un sensor nuevo (etiqueta).
- `GET /parcelas/{id}/sensores/{sensor_id}/historico` — serie temporal de un
  sensor concreto (mismo patrón que el `historico` actual, filtrado por sensor).
- `GET /parcelas/{id}/sensores/resumen?desde=&hasta=` — media y desviación
  estándar de humedad y temperatura, agregando todos los sensores activos de la
  parcela en el rango pedido. Cálculo al vuelo vía SQL.
- `GET /parcelas/{id}/sensores/exportar?desde=&hasta=&formato=csv|xlsx` — mismo
  cálculo que el resumen, devuelto como archivo descargable.

### Lectura foliar (nuevo `app/routers/foliar.py`)

- `POST /parcelas/{id}/foliar/upload` — multipart, recibe el `.xlsx`. Parsea con
  `openpyxl`, localiza los bloques de resumen (fila que empieza por `"#Grupo"`
  seguida de una fila de datos con `Chl, Chl_sd, Flav, Flav_sd, NBI, NBI_sd`), y
  guarda una fila en `lecturas_foliares` por cada bloque encontrado.
- `GET /parcelas/{id}/foliar` — lista de lecturas guardadas para esa parcela
  (para tabla o gráfico en el front).

### Endpoints y router que desaparecen

- `app/routers/analisis.py` completo (`POST /analizar/{id}`) — al retirar riego
  y enfermedad, lo único que hacía era duplicar el fetch de clima que ya cubre
  `POST /parcelas/{id}/actualizar-clima` en `clima_fetch.py`.

### Endpoints que se ajustan

- `GET /parcelas/{id}/dashboard` — quita `ultima_recomendacion` y `ultimo_riesgo`
  del response; `estado_suelo` (antes "última lectura de un único sensor") pasa
  a ser el resumen agregado de los sensores activos de la parcela (mismo cálculo
  que `sensores/resumen`, más reciente ventana disponible).

## Parseo del Excel foliar

Formato observado en el archivo de ejemplo (`Libro1.xlsx`, dispositivo Dualex
Dx4.5): el `.xlsx` intercala, por cada grupo, un bloque de lecturas crudas
seguido de un bloque-resumen de 2 filas (`"#Grupo", "Chl", "Chl_sd", "Flav",
"Flav_sd", "NBI", "NBI_sd"` + una fila de valores). El parser debe:

1. Recorrer las filas de la hoja buscando la marca `"#Grupo"` en la primera
   columna.
2. Leer la fila inmediatamente siguiente como los valores agregados de ese
   grupo (`grupo, chl_medio, chl_sd, flav_medio, flav_sd, nbi_medio, nbi_sd`).
3. La fecha se toma de la primera fila de datos crudos del archivo (columna
   `dd/mm/aaaa`).
4. `n_mediciones` se calcula contando las filas crudas de ese grupo (mismo valor
   de columna `grupo`) entre el bloque de cabecera de datos previo y el
   bloque-resumen.
5. Columnas `longitud`, `latitud`, `altura`, `cal_sat`, `Calib` se ignoran (no
   traían valores útiles en el ejemplo).
6. Si el archivo no sigue este formato (cabeceras distintas, sin bloques de
   resumen), el endpoint responde 422 con un mensaje claro en vez de guardar
   datos a medias.

## Clima (mejora menor)

Se mantiene Open-Meteo tal cual (gratis, sin API key, ya trae dato actual +
pronóstico de lluvia 24h/48h + ET0 en `app/services/weather.py`). Único cambio:
hoy el fetch depende de que alguien pulse "actualizar clima" por parcela
(`POST /parcelas/{id}/actualizar-clima`). Se añade un scheduler simple
(APScheduler dentro de la propia app FastAPI) que llama esa misma lógica cada
3 horas para todas las parcelas con coordenadas, para que el equipo de
investigación tenga datos continuos sin depender de uso manual de la web. El
intervalo es configurable vía variable de entorno (`CLIMA_INTERVALO_HORAS`,
default 3) para poder ajustarlo sin tocar código.

## `worker.py`

- Se elimina el bloque `sensor_stats` (nitrógeno/fósforo/potasio/pH ya no
  existen en `log_sensores`).
- Se añade el cálculo diario de humedad y temperatura de suelo **agregadas**
  (media y desviación estándar entre todos los sensores activos de la parcela),
  usando el mismo criterio que `sensores/resumen`.
- `ClimaDiarioHistorico` pierde las columnas `nitrogeno_max/min`,
  `fosforo_max/min`, `potasio_max/min`, `ph_max/min`; gana
  `humedad_suelo_sd`, `temperatura_suelo_media`, `temperatura_suelo_sd` (ya
  tenía `humedad_inicial`/`humedad_final`, se mantienen).

## Limpieza de funcionalidad (decisión explícita, no accidental)

Se retiran por completo, con su tabla, modelo, lógica y endpoints:

- **Riesgo de enfermedad**: tabla `riesgos_enfermedad`, modelo `RiesgoEnfermedad`,
  `app/logic/enfermedades.py` (cálculo de mildiu/oídio/botritis), referencias en
  `app/routers/analisis.py`, `app/routers/parcelas.py` (dashboard) y
  `app/schemas.py` (`RiesgoEnfermedadResp`, campos `riesgo_enfermedad` /
  `ultimo_riesgo`). Frontend: `src/components/sections/MildiuSection.jsx` y las
  referencias correspondientes en `Dashboard.jsx` / `DashboardSection.jsx`.
- **Recomendación de riego**: tabla `recomendaciones_riego`, modelo
  `RecomendacionRiego`, `app/logic/riego.py` (cálculo de litros/minutos),
  mismas referencias cruzadas que arriba con `RecomendacionRiegoResp`, campos
  `recomendacion_riego` / `ultima_recomendacion`. Frontend:
  `src/components/sections/RiegoSection.jsx`.

`app/logic/__init__.py` queda vacío de estos dos exports (o se elimina el
paquete `logic/` entero si no queda nada más dentro).

## Migración de base de datos

Se pierde el histórico de `riesgos_enfermedad`, `recomendaciones_riego`,
`etapas_cultivo` y las columnas NPK/pH de `log_sensores` al aplicarse. No hay
necesidad de preservarlo (decisión explícita del usuario de limpiar). Se hace
con una migración SQL directa (`DROP TABLE`, `ALTER TABLE ... DROP COLUMN`), sin
Alembic todavía en el proyecto — coherente con cómo está el proyecto hoy
(`Base.metadata.create_all` en el `lifespan` de `main.py`).

## Testing

- Parser del Excel foliar: test con el propio `Libro1.xlsx` de ejemplo (y un
  archivo con formato inesperado, para comprobar el 422).
- Endpoint de resumen agregado: test con 0, 1 y varios sensores activos por
  parcela, incluyendo el caso de sensores dados de baja (`activo=false`) para
  confirmar que no contaminan la media.
- Endpoint de exportación: test de que el CSV/Excel generado coincide con lo
  que devuelve el resumen para el mismo rango.
- Regresión: confirmar que `/parcelas/{id}/dashboard` y `/parcelas/{id}/historico`
  siguen respondiendo 200 tras quitar riesgo/riego.

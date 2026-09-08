# Configuración de parcela y sensores desde la aplicación

Fecha: 2026-08-19
Sub-proyecto C de 4 de la fase actual. Anteriores: A (scheduler de consolidación), B (acceso multiusuario), ambos completados y mergeados.
Siguientes: D (aplicación web). Relacionado: **ingesta de campo**, que depende del contrato de numeración que fija este spec.

(Nota sobre nombres: la descomposición original hablaba de tres sub-proyectos numerados; la fase actual se organiza como A–D. Para evitar confusión, aquí la ingesta de campo se nombra por su nombre y no por su número.)

## Contexto

VinAlert es una API FastAPI + SQLAlchemy + PostgreSQL de monitorización agrícola.
El destinatario de los datos es tanto el agricultor como un equipo de
investigación. Lo normal es que cada persona tenga **una sola parcela**.

Hoy se puede crear una parcela con sus 16 campos de configuración —coordenadas
incluidas—, crear sensores, renombrarlos y desactivarlos, y gestionar quién
tiene acceso. Pero **no se puede editar una parcela después de crearla**: un
error en las coordenadas, un cambio de variedad o un ajuste del `kc_actual`
son permanentes desde la aplicación. Tampoco se puede consultar una parcela
suelta, solo el listado completo.

Además, los sensores solo tienen etiqueta y estado. No hay forma de decir a qué
profundidad está enterrado cada uno, dónde está, ni qué modelo es. Y no tienen
número: nada permite afirmar "este es el nodo 7 de la parcela".

### Cómo llegan los datos de campo

Aclaración recogida del usuario y que cambia el reparto de trabajo: **LoRa es
solo cómo hablan los nodos entre sí**. Lo que llega a la API es un **ESP
conectado por WiFi** que hace peticiones HTTP normales, enviando en un lote las
lecturas de los nodos que ha recogido, identificados por su número.

De ahí se sigue el reparto: el **contrato de numeración es de este
sub-proyecto**; el endpoint de lote y las credenciales del dispositivo son de
la **ingesta de campo**. Sin lo primero, lo segundo no se puede construir: si la pasarela
envía el valor del nodo 7 y no existe ninguna fila 7 en esa parcela, la lectura
no tiene dónde ir y se pierde en silencio.

## Objetivo

- Que toda la configuración de una parcela se pueda hacer y rehacer desde la
  aplicación, sin tocar la base de datos.
- Que cada sensor sea identificable por un número estable dentro de su parcela,
  y configurable individualmente.
- Que unas coordenadas mal puestas se detecten al configurarlas, y no horas
  después por un scheduler que falla en silencio.

## Fuera de alcance

- **Borrar parcelas.** Con una parcela por persona es una operación rara, y abre
  la pregunta de qué hacer con años de histórico, sensores, tratamientos y
  membresías. No merece frenar este trabajo.
- **El endpoint de lote del ESP y sus credenciales de dispositivo** (sub-proyecto de ingesta de campo).
  Este spec fija el contrato de numeración del que dependerán, nada más.
- **Borrar sensores.** Se desactivan con el campo `activo`, que ya existe y
  conserva su histórico. Borrar dejaría lecturas huérfanas.
- **Un catálogo cerrado de modelos de sensor.** El campo es texto libre hasta
  saber qué hardware se usa de verdad.
- Todo el frontend (sub-proyecto D).

## Decisiones tomadas

**El número lo asigna el backend, nunca el cliente.** Permitir que el cliente
elija el número parecía atractivo —el número podría venir grabado en el
hardware— pero abre la puerta a duplicados y huecos, y es justo el dato del que
la ingesta de campo va a depender para no perder lecturas. Si algún día el número
físico del nodo no coincide con el nuestro, eso es un campo distinto, no éste.

**Aprovisionar por cantidad, en vez de crear 18 sensores a mano.** El usuario
declara cuántos sensores tiene la parcela y el backend crea las filas que
falten. La operación es **idempotente**: repetirla con la misma cantidad no hace
nada, con una mayor crea las nuevas, y **nunca borra ni reduce**. Reducir
destruiría el histórico de los sensores eliminados; para quitar uno se desactiva.

**No se guarda un `num_sensores` en `Parcela`.** Habría dos respuestas a
"¿cuántos sensores tiene esta parcela?" —la columna y las filas reales— y
acabarían divergiendo. Las filas son la única verdad.

**La posición del sensor son dos floats, no una geometría PostGIS.** La base
real tiene una columna `ubicacion` de tipo `geometry` en `parcelas` que el ORM
no modela; introducir PostGIS en el modelo por esto añadiría una dependencia
para un caso que hoy nadie consume. Dos floats siguen el patrón que ya usa
`Parcela`.

**La sonda de clima es de gestión, no de lectura**, pese a no escribir nada en
la base. Dos motivos: es una herramienta de configuración, que es cosa del
gestor; y cada llamada gasta cuota de Open-Meteo, que es un recurso compartido
y limitado (10.000 llamadas al día en el nivel gratuito). Un miembro de solo
lectura no tiene motivo para consumirla.

**El rango de las coordenadas se valida siempre; la disponibilidad de datos
meteorológicos, en un endpoint aparte.** Meter la llamada a Open-Meteo dentro
del guardado haría que configurar la parcela dependiera de que un tercero esté
levantado: una caída del proveedor impediría corregir hasta un nombre mal
escrito. Guardar debe funcionar siempre.

## Modelo de datos

Cambios en `Sensor` (`app/models.py`):

| Columna | Tipo | Nulo | Notas |
|---|---|---|---|
| `numero` | Integer | NOT NULL | Único por `(parcela_id, numero)`. Asignado por el backend. |
| `profundidad_cm` | Float | sí | A cuántos centímetros está enterrado. |
| `latitud` | Float | sí | Posición dentro de la parcela. |
| `longitud` | Float | sí | |
| `modelo` | String | sí | Texto libre. |

Restricción `UniqueConstraint("parcela_id", "numero", name="uq_sensor_parcela_numero")`.

`etiqueta` y `activo` no cambian.

### Invariantes de la numeración

1. Dentro de una parcela, `numero` es único.
2. La numeración empieza en 1.
3. Ningún camino de creación permite al cliente fijar el número.
4. Desactivar un sensor **no** libera su número: la fila sigue existiendo, y su
   número no se reutiliza. Reutilizarlo haría que lecturas históricas del nodo 7
   antiguo y del nuevo se mezclaran bajo el mismo identificador.

Las dos vías de creación respetan las cuatro:

- `POST /parcelas/{id}/sensores/` (ya existe): asigna `max(numero) + 1` de esa
  parcela, o 1 si no hay ninguno.
- La acción de aprovisionamiento: crea las filas que falten hasta la cantidad
  pedida, numerándolas consecutivamente desde el máximo actual.

**Consecuencia de las cuatro invariantes, y hay que apoyarse en ella:** como
los números nunca se liberan y las filas nunca se borran, la numeración no
tiene huecos, y el número más alto de una parcela coincide siempre con su
total de sensores. Por eso `cantidad` puede leerse indistintamente como
"cuántos sensores tiene la parcela" o "hasta qué número llegar": son lo
mismo. Si alguna vez dejaran de serlo, esta acción se habría vuelto ambigua
y habría que replantearla, no parchearla.

## Endpoints

| Método | Ruta | Permiso | Comportamiento |
|---|---|---|---|
| `GET` | `/parcelas/{id}` | lectura | Devuelve una parcela. `ParcelaResp`, el mismo schema del listado. |
| `PATCH` | `/parcelas/{id}` | gestión | Edita la configuración. Todos los campos opcionales; solo se modifican los enviados. |
| `POST` | `/parcelas/{id}/sensores/provisionar` | gestión | Cuerpo: `{"cantidad": 18}`. Crea las filas que falten. Devuelve el listado completo de sensores de la parcela. |
| `GET` | `/parcelas/{id}/clima/comprobar` | **gestión** | Sonda contra el proveedor con las coordenadas guardadas. No escribe nada en la base. |

Y se amplía el `PATCH /parcelas/{id}/sensores/{sensor_id}` existente con
`profundidad_cm`, `latitud`, `longitud` y `modelo`. **`numero` no es editable**;
enviarlo se ignora, porque `SensorUpdate` no lo declara.

### Validación y códigos de error

- Latitud fuera de `[-90, 90]` o longitud fuera de `[-180, 180]` → **422**,
  tanto al crear como al editar, y tanto en la parcela como en el sensor. Se
  valida con `Field(ge=..., le=...)` de Pydantic, no a mano.
- `PATCH /parcelas/{id}` con el cuerpo vacío → **200** sin cambios. No es un
  error: un formulario que no modifica nada no debería fallar.
- `provisionar` con `cantidad` menor o igual que el número de sensores
  existentes → **200**, sin crear nada. Es el caso idempotente, no un error.
- `provisionar` con `cantidad` menor que 1 o mayor que 100 → **422**. El tope
  existe para que un error de tecleo no cree diez mil filas.
- `GET /parcelas/{id}/clima/comprobar` sin coordenadas en la parcela → **422**
  con un mensaje que lo diga.
- `GET /parcelas/{id}/clima/comprobar` con el proveedor caído → **200** con
  `disponible: false` y el motivo. No es un 503: la pregunta "¿sirven estas
  coordenadas?" se ha respondido correctamente, y la respuesta es "ahora mismo
  no se puede saber".

Los cuatro endpoints nuevos van a `tests/test_matriz_permisos.py`. La guarda
estructural que compara las rutas reales contra la lista fallará si se olvidan.

## Migración

Sin Alembic, como el resto del proyecto: SQL escrito a mano, revisado, y
aplicado por una persona tras confirmación explícita.

1. `ALTER TABLE sensores ADD COLUMN IF NOT EXISTS` para las cinco columnas, con
   `numero` inicialmente **nullable**.
2. Poblar `numero` en los sensores existentes, numerando por `id` ascendente
   dentro de cada parcela:
   ```sql
   WITH numerados AS (
     SELECT id, ROW_NUMBER() OVER (PARTITION BY parcela_id ORDER BY id) AS n
     FROM sensores
   )
   UPDATE sensores s SET numero = numerados.n
   FROM numerados WHERE s.id = numerados.id AND s.numero IS NULL;
   ```
3. `ALTER TABLE sensores ALTER COLUMN numero SET NOT NULL;`
4. `ALTER TABLE sensores ADD CONSTRAINT uq_sensor_parcela_numero UNIQUE (parcela_id, numero);`

El orden es obligatorio y debe ir escrito en la cabecera: el paso 3 falla si
queda algún `numero` nulo, y el paso 4 falla si el paso 2 produjo duplicados.
Ambos fallos son deseables — significan que algo no cuadra y hay que mirarlo
antes de seguir.

La base de desarrollo tiene **0 sensores**, así que los pasos 2 a 4 no moverán
nada ahí. El script se escribe correcto igualmente: puede haber otros entornos
con datos.

## Testing

- La numeración empieza en 1 y es consecutiva.
- Dos parcelas distintas pueden tener ambas un sensor número 1.
- La restricción de unicidad impide dos sensores con el mismo número en la
  misma parcela (test que espera `IntegrityError`).
- Desactivar un sensor no libera su número: el siguiente creado no lo reutiliza.
- `provisionar` es idempotente: llamarla dos veces con 18 deja 18 sensores.
- `provisionar` con una cantidad mayor añade solo los que faltan y conserva los
  existentes con su número y sus datos.
- `provisionar` con una cantidad menor no borra nada.
- El alta de uno en uno y el aprovisionamiento pueden alternarse sin romper la
  numeración.
- `PATCH /parcelas/{id}` modifica solo los campos enviados y deja el resto
  intactos — con una trampa: sembrar valores distintos en los campos no
  enviados y comprobar que siguen ahí.
- Coordenadas fuera de rango dan 422, en parcela y en sensor, al crear y al
  editar.
- `numero` enviado en el `PATCH` de un sensor se ignora.
- La sonda de clima con el proveedor caído devuelve 200 con `disponible: false`,
  y no escribe ninguna fila en `log_clima`.
- Los cuatro endpoints nuevos aparecen en la matriz de permisos con su
  clasificación correcta.

## Riesgos

**La numeración es un contrato del que dependerá la ingesta de campo sin poder cambiarlo.** Si la
regla resulta equivocada, corregirla después implica renumerar sensores que ya
tienen histórico y una pasarela desplegada que envía números concretos. Por eso
las invariantes están escritas explícitamente y cubiertas por tests, en vez de
quedar implícitas en el código.

**El tope de 100 en `provisionar` es arbitrario.** Se elige por prudencia frente
a un error de tecleo. Si alguna parcela real necesita más, es un cambio de una
línea, pero conviene saber que el límite existe.

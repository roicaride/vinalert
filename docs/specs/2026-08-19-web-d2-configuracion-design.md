# Aplicación web: pantallas de configuración

Fecha: 2026-08-19
Sub-proyecto **D2** de 4 dentro de la reestructuración de la web (D).
Siguientes: D3 (estado y registro), D4 (análisis).
Anterior, ya completado y mergeado: **D1** (cimientos de la web — sesión,
identidad de usuario, permisos declarativos, estructura de rutas).

## Contexto

D1 dejó la aplicación con sesión, navegación entre siete secciones y permisos
declarados (`<SoloGestor>`), pero todas las secciones vacías con un cartel de
"todavía no construido". El backend para tres de ellas —**configuración de la
parcela**, **sensores** y **acceso** (miembros)— ya existe completo desde los
sub-proyectos B y C: nada de lo que sigue añade endpoints nuevos.

D2 llena esas tres secciones. Las otras cuatro (`estado`, `análisis`,
`tratamientos`, `foliar`) quedan para D3 y D4.

## Objetivo

- Editar los datos de la parcela, incluidas sus coordenadas.
- Comprobar si el proveedor meteorológico tiene datos para esas coordenadas
  (la "sonda"), sin gastar cuota a ciegas.
- Dar de alta sensores por lote, verlos y editarlos.
- Ver quién tiene acceso a la parcela y, si eres gestor, invitar, cambiar de
  rol o retirar a alguien.

## Fuera de alcance

- **Mapa interactivo.** Las coordenadas (de la parcela y de cada sensor) se
  escriben en dos campos numéricos, latitud y longitud. Delimitar la parcela
  en un mapa y ver los sensores sobre él es una idea válida pero para más
  adelante — introduce una librería de mapas nueva que no se justifica solo
  para D2.
- **Alta de sensores uno a uno.** Solo aprovisionamiento por cantidad
  (`POST /provisionar`); el endpoint de alta individual (`POST /`) ya existe
  en el backend pero D2 no le pone interfaz.
- **`POST /parcelas/{id}/actualizar-clima` y `/backfill`.** Son operaciones de
  datos (traer el clima actual, rellenar histórico), no de configuración; caen
  del lado de D3/estado o de una tarea de mantenimiento aparte.
- **`estado`, `análisis`, `tratamientos`, `foliar`.** Para D3 y D4.

## Decisiones tomadas

**Cada pantalla gestiona su propia lista con `useEffect` + `useState`, sin un
hook genérico de fetching.** Un `useApiResource(url)` compartido ahorraría
poco con solo tres usos, cada uno con su propia forma de mutación (`PATCH`
único, `POST` por lote, alta/baja de fila), y escondería la lógica real
detrás de una abstracción que nadie más necesita todavía. Mismo patrón que ya
usa `ParcelaContext`.

**Las mutaciones actualizan el estado local a partir de la respuesta, sin
volver a pedir la lista aparte.** Aprovisionar reemplaza la lista entera (la
respuesta ya la trae completa), editar sensores o cambiar de rol reemplaza un
elemento, y añadir o retirar un miembro añade o quita uno. Excepción: editar
la parcela pasa por
`setParcela` del `ParcelaContext` (no por estado local de la pantalla),
porque el nombre de la parcela se ve también en la barra lateral.

**Sin componente de confirmación genérico.** De las tres pantallas, solo
retirar un miembro es realmente destructivo — desactivar un sensor no borra
nada (decisión ya tomada en el sub-proyecto C: conserva su histórico) y por
tanto no necesita confirmación. Construir un `ConfirmarAccion.jsx` reutilizable
para un único uso no se justifica; se usa `window.confirm()` nativo.

**Una única zona de error por pantalla, no error por fila.** Se limpia al
reintentar la acción. Es suficiente para el volumen de datos que maneja esto
(decenas de sensores o miembros, no miles) y evita siete `MensajeError`
independientes en una tabla.

**La sonda de coordenadas se deshabilita si hay cambios de lat/lon sin
guardar.** El endpoint `GET /parcelas/{id}/clima/comprobar` mira las
coordenadas que ya están en la base de datos, no lo que hay sin guardar en el
formulario. Comprobar con el botón mientras hay cambios pendientes
comprobaría las coordenadas viejas y confundiría al usuario, así que el botón
se apaga con un aviso ("guarda antes de comprobar") mientras el formulario
tenga cambios de lat/lon no guardados.

**La lista de miembros es visible para cualquiera con acceso a la parcela;
los controles de gestión, solo para gestores.** El backend ya lo permite así
(`listar_miembros` exige solo `parcela_con_lectura`) porque a un lector le
concierne saber con quién comparte la parcela. `<SoloGestor>` oculta
añadir/cambiar rol/retirar, igual que en cualquier otra pantalla.

## Las tres pantallas

### `Configuracion.jsx`

Formulario con los diecisiete campos de `ParcelaUpdate`, agrupados en tres
bloques visuales:

- **Identidad**: nombre, tipo de cultivo, variedad.
- **Agronomía**: superficie total, cobertura del cultivo, porcentaje de
  cobertura del suelo, profundidad de raíces, umbral de humedad crítico,
  capacidad de campo del suelo, Kc actual.
- **Riego y coordenadas**: distancia entre filas, distancia entre plantas,
  caudal de gotero, número de goteros por planta, eficiencia de riego,
  latitud, longitud.

El formulario se inicializa con la parcela del `ParcelaContext`. Al enviar,
`PATCH /parcelas/{id}` con el objeto completo (no solo lo tocado — es más
simple y el endpoint acepta el objeto entero como parcial), y el resultado se
pasa a `setParcela` del contexto.

Bajo el bloque de coordenadas, un botón "Comprobar estas coordenadas" llama a
`GET /parcelas/{id}/clima/comprobar` y muestra el resultado:

- `disponible: true` → mensaje de éxito ("El proveedor tiene datos para estas
  coordenadas").
- `disponible: false` → el `motivo` que devuelve la API.
- Deshabilitado mientras el formulario tenga cambios de lat/lon sin guardar
  (ver decisión arriba), con el aviso correspondiente en vez del resultado.

Solo visible/editable con `<SoloGestor>`; un lector ve el formulario
deshabilitado por completo (aquí sí tiene sentido mostrarlo apagado en vez de
ocultarlo — a diferencia de un botón de acción, ver los valores actuales de la
parcela es información útil para un lector).

### `Sensores.jsx`

Tabla con columnas: número, etiqueta, activo, profundidad (cm), latitud,
longitud, modelo, acciones. `GET /sensores/` al montar (con `parcela_id` de la
ruta).

Botón "Añadir sensores" (bajo `<SoloGestor>`): pide una cantidad, llama a
`POST /sensores/provisionar`, y **reemplaza** la lista local con la
respuesta — el endpoint devuelve la lista completa de sensores de la
parcela, no solo los nuevos, así que no hay que concatenar nada. Los
sensores nuevos llegan con etiqueta genérica y sin profundidad/posición/
modelo — se editan después.

Cada fila tiene un botón "Editar" (bajo `<SoloGestor>`) que abre un formulario
en línea con etiqueta, profundidad, latitud, longitud, modelo y un
interruptor de activo. Al guardar, `PATCH /sensores/{id}` con los campos
cambiados y se reemplaza la fila en el estado local con la respuesta. Sin
confirmación al desactivar (ver decisión arriba).

Un lector ve la tabla completa sin la columna de acciones.

### `Miembros.jsx`

Tabla con columnas: nombre, email, rol, acciones. `GET
/parcelas/{id}/usuarios` al montar, visible para cualquier miembro.

Bajo `<SoloGestor>`:

- Formulario "Añadir" (email + `<select>` de rol) → `POST
  /parcelas/{id}/usuarios`. Errores esperados: 404 ("No hay ninguna cuenta con
  ese email. Esa persona debe registrarse primero" — el `detail` de la API se
  muestra tal cual, ya está escrito para el usuario) y 409 ("ya tiene acceso",
  igual).
- `<select>` de rol por fila → `PATCH .../usuarios/{usuario_id}` al cambiar.
  Si el backend responde 409 (te quedas sin gestor), se muestra el mensaje y
  el `<select>` vuelve a su valor anterior.
- Botón "Retirar" por fila → `window.confirm('¿Retirar a <nombre> de esta
  parcela?')` y, si se confirma, `DELETE .../usuarios/{usuario_id}`. Mismo 409
  de "sin gestor" posible aquí.

## Estructura del frontend

```
src/
  api/
    sensores.js       listarSensores(), provisionarSensores(cantidad),
                       actualizarSensor(id, cambios)
    miembros.js        listarMiembros(), anadirMiembro(email, rol),
                       cambiarRol(usuarioId, rol), retirarMiembro(usuarioId)
    parcelas.js         + editarParcela(cambios), comprobarClima()
  pantallas/
    Configuracion.jsx   antes vacía (marcador de D1), ahora con el formulario
    Sensores.jsx        antes vacía, ahora con la tabla
    Miembros.jsx         antes vacía, ahora con la tabla
```

Ningún fichero de D1 cambia de sitio; `Seccion.jsx` (el marcador) se queda tal
cual para las secciones que aún no tiene D2.

## Testing

Cada pantalla lleva su fichero Vitest + Testing Library, mockeando su módulo
de `api/*` (mismo patrón que D1). Fixtures nuevos en `src/test/respuestas.js`:
`SENSOR`, `SENSOR_INACTIVO`, `MIEMBRO`.

Por pantalla:

- Se ve la lista con los datos simulados.
- `<SoloGestor>` oculta los controles de edición/alta/baja a un lector (no
  solo los deshabilita).
- Camino feliz de la mutación principal (guardar parcela, aprovisionar
  sensores, añadir miembro).
- Un error de la API se traduce con `MensajeError` (o, en 409, con el
  `detail` tal cual).

Test de mutación en `Miembros.jsx`: romper el guard del "sin gestor" en la
respuesta simulada de la API (forzar un 409 al cambiar de rol al único
gestor) y comprobar que el mensaje se muestra y el `<select>` no cambia de
valor. Es el único invariante de producto real que vive en esta pantalla —
merece protegerse con un test que falle de verdad si se rompe el manejo del
error.

## Riesgos

**El formulario de `Configuracion.jsx` tiene diecisiete campos.** Es mucho para
una sola pantalla, pero corresponde uno a uno con `ParcelaUpdate` — partirlo
en varias pantallas sería inventar una división que el backend no tiene y
complicaría guardar (¿un `PATCH` por bloque, o uno solo al final?). Se acepta
el formulario largo, agrupado visualmente en los tres bloques ya descritos.

**Aprovisionar sensores por lote y no uno a uno** significa que cada sensor
nuevo nace sin etiqueta útil ("Sensor 7" en vez de algo que el usuario
elegiría). Es la decisión tomada explícitamente por priorizar un único flujo
simple; el coste es un paso extra de edición tras aprovisionar, aceptado.

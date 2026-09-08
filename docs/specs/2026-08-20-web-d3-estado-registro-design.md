# Aplicación web: estado y registro

Fecha: 2026-08-20
Sub-proyecto **D3** de 4 dentro de la reestructuración de la web (D).
Siguiente: D4 (análisis).
Anteriores, ya completados y mergeados: cimientos de datos, A (scheduler), B
(acceso multiusuario), C (configuración desde la app), D1 (cimientos de la
web), D2 (pantallas de configuración).

## Contexto

D1 dejó siete secciones en la barra lateral; D2 llenó `configuracion`,
`sensores` y `miembros`. Quedan tres: `estado` (la sección por defecto al
entrar en una parcela), `tratamientos` y `foliar`. El backend para las tres
ya existe completo — nada de lo que sigue añade endpoints nuevos.

## Objetivo

- Ver de un vistazo cómo está la parcela ahora mismo: suelo, clima, últimas
  lecturas de los sensores.
- Llevar el cuaderno de tratamientos fitosanitarios: qué se aplicó, cuándo,
  con qué clima (dato exigido legalmente sobre el viento).
- Subir y consultar las lecturas del medidor foliar Dualex.

## Fuera de alcance

- **Gráficas y evolución en el tiempo.** `estado` es una foto del momento
  actual; cruzar variables a lo largo del tiempo es D4 (análisis). Ya se
  decidió así al diseñar D1: la pantalla principal muestra primero cómo está
  la parcela, y la evolución/comparación vive aparte.
- **Editar o borrar lecturas foliares.** El backend no ofrece esos
  endpoints — solo subir y listar.
- **Editar un tratamiento ya creado.** El backend solo permite crear,
  listar y borrar.
- **Deduplicar subidas de Excel repetidas.** El backend inserta lo que el
  archivo trae sin comprobar si ya existía (`subir_excel_foliar` hace
  `add_all` sin buscar duplicados). D3 no lo corrige — es un comportamiento
  ya existente, no algo que dependa del frontend.

## Decisiones tomadas

**El tipo de tratamiento combina una lista de valores habituales con lo que
la propia parcela ya ha usado, sin almacenamiento aparte.** El backend
acepta `tipo` como texto libre (`str`, sin `Literal`). En vez de guardar los
valores personalizados en `localStorage` —que no viaja entre dispositivos ni
entre personas que comparten la parcela—, el `<select>` del formulario se
construye combinando una lista fija (`Fungicida`, `Herbicida`, `Insecticida`,
`Abono foliar`) con los valores de `tipo` que ya aparecen en el listado de
tratamientos de esa parcela (que la pantalla ya tiene cargado), más una
opción `Otro` al final que revela un campo de texto libre. La próxima vez
que se abra el formulario, un tipo personalizado que ya se haya usado
aparece como opción porque forma parte del historial real, no de un estado
aparte que pueda desincronizarse.

**Cada pantalla es un módulo de API propio** (`api/estado.js`,
`api/tratamientos.js`, `api/foliar.js`), siguiendo el mismo patrón que D2:
funciones finas sobre `cliente`, sin hook de fetching compartido. `estado.js`
agrupa `obtenerDashboard` y `obtenerHistorico`, aunque ambos endpoints viven
bajo el prefijo `/parcelas/{id}/...` del backend, porque los dos los
consume solo la pantalla `Estado`.

**Las mutaciones actualizan el estado local, reordenando cuando hace falta.**
Crear un tratamiento no garantiza que su fecha sea la más reciente —puede
registrarse con fecha pasada—, así que tras insertarlo la lista se reordena
por fecha descendente en el cliente, en vez de asumir que va al principio.
Subir un Excel foliar añade las filas que devuelve la respuesta (solo las
nuevas, a diferencia de `provisionar_sensores` en D2) y se reordena igual
por fecha descendente y grupo ascendente, que es el orden del backend.

**Borrar un tratamiento pide confirmación; nada más en D3 la necesita.**
Es la única operación destructiva de las tres pantallas — subir un Excel
solo añade filas, y `estado` no tiene mutaciones. Mismo patrón que D2:
`window.confirm()` nativo, sin componente genérico.

**`MensajeError` aprende a mostrar un 422 con `detail` en texto plano, no
solo en array.** Su rama de 422 asume hoy que `detail` es una lista de
errores de Pydantic (`[{loc, msg}, ...]`); si no lo es, cae al genérico
"Hay datos que no son válidos." Pero `subir_excel_foliar` (foliar upload)
devuelve un 422 con `detail=str(exc)` —una frase, no una lista— cuando el
Excel no tiene el formato esperado, así que con el código actual esa frase
nunca llegaría a verse. Se amplía la rama de 422 para mostrar el `detail`
tal cual cuando es una cadena, y se sigue mostrando el desglose por campo
cuando es la lista habitual. Es la misma clase de fallo que ya se corrigió
en D2 para los 404 —un `detail` del backend que el componente no sabía
leer—, detectado esta vez al escribir el plan en vez de en una revisión
posterior.

**`TratamientoCreate` exige `parcela_id` en el cuerpo de la petición**, no
solo en la URL — a diferencia de sensores y miembros, el router de
tratamientos no tiene prefijo por parcela. `crearTratamiento` debe incluirlo
explícitamente.

## Las tres pantallas

### `Estado.jsx`

Pide `GET /parcelas/{id}/dashboard` al montar. Muestra dos bloques:

- **Suelo**: los campos de `ResumenSensoresResp` — humedad media y su
  desviación, temperatura media y su desviación, número de sensores activos
  que aportan datos, número de lecturas en la ventana.
- **Clima actual**: los campos más relevantes de `LogClimaResp` —
  temperatura, humedad relativa, lluvia, ET₀, viento. Si `clima_actual` es
  `null` (nunca se ha pedido clima para esta parcela), se muestra un aviso
  en vez de campos vacíos.

Debajo, una tabla con `GET /parcelas/{id}/historico?limite=15`: las últimas
lecturas crudas por sensor (fecha/hora, humedad, temperatura, batería),
ordenadas de más reciente a más antigua para la lectura (el backend las
devuelve en orden ascendente; se invierten en el cliente para mostrar la
más reciente arriba).

Sin acciones de gestión — visible igual para lector y gestor.

### `Tratamientos.jsx`

Tabla con `GET /parcelas/{id}/tratamientos`: fecha, tipo, producto, dosis
(+unidad), y el clima registrado al aplicar (temperatura y viento; si
`clima_fuente` es `"no_disponible"`, se muestra un guión en vez del dato).

Filtro por tipo (un `<select>` con las mismas opciones que el formulario de
alta, más "Todos"), aplicado **en el cliente** sobre la lista ya cargada, no
pidiendo de nuevo al backend con `?tipo=...`. Es deliberado: las opciones
del `<select>` de alta se derivan de los tipos que ya aparecen en
`tratamientos`, así que si el filtro hiciera una petición nueva con
`?tipo=X`, la lista en memoria se reduciría a ese tipo y el formulario de
alta perdería de vista todos los demás tipos ya usados. Con una sola
petición sin filtrar y el filtro resuelto en el cliente, la lista completa
siempre está disponible para derivar las opciones.

Formulario de alta (bajo `<SoloGestor>`): fecha (obligatoria), tipo (el
`<select>` combinado descrito arriba), producto, materia activa, dosis +
unidad de dosis, cantidad total + unidad, operador, maquinaria, notas — el
resto de campos de `TratamientoCreate`, todos opcionales salvo fecha y tipo.
Al guardar, `POST /tratamientos/` con `parcela_id` incluido; la respuesta
(que ya trae el clima calculado) se inserta en la lista local y se reordena
por fecha descendente.

Borrar (bajo `<SoloGestor>`, con `window.confirm`): `DELETE
/tratamientos/{id}`, quita el elemento de la lista local.

### `Foliar.jsx`

Zona de subida (bajo `<SoloGestor>`): un `<input type="file" accept=".xlsx">`
más un botón "Subir", que envía el archivo como `multipart/form-data` a
`POST /parcelas/{id}/foliar/upload`. La respuesta (solo las lecturas nuevas)
se añade a la lista local, reordenada por fecha descendente y grupo
ascendente. Un 422 (`FormatoExcelInvalido`) se traduce con `MensajeError`
mostrando el motivo que da el backend tal cual —requiere la ampliación de
`MensajeError` descrita arriba, porque este 422 en concreto manda una frase,
no una lista de errores por campo.

Tabla con `GET /parcelas/{id}/foliar/`: fecha, grupo, clorofila
(media/sd), flavonoides (media/sd), NBI (media/sd), número de mediciones,
archivo de origen. Agrupada visualmente por fecha (una cabecera de fecha
separando bloques de grupos), ya que el backend ordena por fecha y luego
por grupo.

## Estructura del frontend

```
src/
  api/
    estado.js         obtenerDashboard(parcelaId), obtenerHistorico(parcelaId, limite)
    tratamientos.js    listarTratamientos(parcelaId), crearTratamiento(datos),
                        borrarTratamiento(id)
    foliar.js          listarFoliar(parcelaId), subirFoliar(parcelaId, archivo)
  errores/
    MensajeError.jsx  amplía la rama de 422 para aceptar `detail` en texto plano
  pantallas/
    Estado.jsx         antes vacía (marcador de D1), ahora con el resumen
    Tratamientos.jsx    antes vacía, ahora con la tabla y el alta
    Foliar.jsx          antes vacía, ahora con la subida y la tabla
```

## Testing

Mismo patrón que D1/D2: Vitest + Testing Library, mockeando el módulo
`api/*` de cada pantalla. Fixtures nuevos en `src/test/respuestas.js`:
`DASHBOARD`, `LOG_SENSOR` (para el histórico), `TRATAMIENTO`,
`LECTURA_FOLIAR`.

Por pantalla:

- Se ven los datos con las respuestas simuladas.
- `<SoloGestor>` oculta el alta/borrado/subida a un lector (no solo los
  deshabilita).
- Camino feliz de la mutación principal (crear tratamiento, subir Excel).
- Un error de la API se traduce con `MensajeError`.

Test específico de `Tratamientos.jsx`: insertar un tratamiento con fecha
pasada y comprobar que aparece en su sitio dentro de la lista ordenada, no
al principio — protege el reordenado descrito en las decisiones, que es
fácil de olvidar si alguien simplifica el código a un `prepend`.

## Riesgos

**El listado de tratamientos no pagina.** `listar_tratamientos` acepta
`limite` (por defecto 100, máximo 500) pero D3 no construye ningún control
de paginación — con más de 100 tratamientos en una temporada, los más
antiguos simplemente no aparecerían. Aceptado por ahora: es poco probable
alcanzar esa cifra en una temporada, y añadir paginación sin que haga falta
sería adelantarse a un problema que no existe todavía.

**La lista de lecturas foliares crece sin límite y sin paginación en el
backend** (`listar_lecturas_foliares` no acepta `limite`). Con varias
temporadas de subidas, la tabla podría volverse larga. Mismo razonamiento
que el riesgo anterior: no se resuelve en D3.

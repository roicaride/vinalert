# Aplicación web: análisis y series temporales

Fecha: 2026-08-20
Sub-proyecto **D4** de 4 dentro de la reestructuración de la web (D).
Anteriores, ya completados y mergeados: **D1** (cimientos), **D2** (configuración), **D3** (estado y registro).

## Contexto

D1 dejó la barra lateral con siete secciones; D2 construyó las pantallas de `configuracion`, `sensores` y `miembros`; D3 construyó `estado`, `tratamientos` y `foliar`. La última sección pendiente es **`analisis`**.

Mientras que `estado` (D3) muestra una foto fija del momento actual, `analisis` (D4) permite al agricultor y al técnico cruzar las series temporales históricas de la parcela: cómo ha evolucionado la humedad y temperatura del suelo, cómo se correlaciona con la lluvia y la evapotranspiración (ET₀), qué tratamientos se aplicaron en qué fechas y cómo evolucionan los índices foliares del Dualex.

El backend para todas estas series temporales ya existe completo:
- `GET /parcelas/{id}/suelo/diario?dias=...`
- `GET /parcelas/{id}/clima/diario?dias=...`
- `GET /parcelas/{id}/tratamientos`
- `GET /parcelas/{id}/foliar/`

## Objetivo

- Visualizar la evolución temporal de las variables clave del viñedo en rangos seleccionables (7 días, 30 días, 90 días, 365 días).
- **Gráfica de Suelo y Tratamientos**: Evolución de la humedad media del suelo (%) y temperatura media (°C), mostrando los tratamientos fitosanitarios aplicados como referencias en el tiempo, junto con las líneas de referencia agronómicas de la parcela (umbral crítico y capacidad de campo si están configurados).
- **Gráfica de Clima y Balance Hídrico**: Precipitación diaria (mm), evapotranspiración de referencia ET₀ (mm) y temperaturas (máxima, mínima, media). Resumen acumulado de lluvia vs ET₀ en el período seleccionado.
- **Evolución Foliar**: Si hay mediciones de Dualex, gráfica de evolución de los índices de Clorofila, Flavonoides y NBI en las fechas muestreadas.
- Navegación clara por pestañas/bloques temáticos y controles interactivos de rango temporal.

## Fuera de alcance

- **Comparar múltiples parcelas entre sí en una misma gráfica.** Cada gráfica analiza una única parcela activa (la seleccionada en `ParcelaContext`).
- **Lanzar backfills o recalcular consolidaciones desde la pantalla.** El análisis consume los datos ya consolidados y guardados en base de datos.
- **Exportación avanzada en PDF de informes.** D4 se centra en la visualización interactiva y reactiva en el navegador.

## Decisiones tomadas

**Uso de Recharts para la renderización de gráficas.** `recharts` (versión ^3.7.0) ya está instalada como dependencia en `package.json`. Permite crear gráficas de líneas, áreas compuestas y barras con tooltips formateados, leyendas y ejes temporales formateados en castellano.

**Alineación temporal de datos por fecha en el cliente.** Las series de `suelo/diario`, `clima/diario`, `tratamientos` y `foliar` se indexan por fecha (`YYYY-MM-DD`). La pantalla fusiona las series en un array común ordenado cronológicamente para que Recharts pueda pintar en un único eje X las variables cruzadas (humedad de suelo, lluvia del día, tratamientos aplicados).

**Manejo de parcelas sin datos históricos consolidados.** Si una parcela es nueva o no tiene aún datos diarios en el rango seleccionado, la pantalla muestra un mensaje informativo invitando a esperar la consolidación diaria o revisar los sensores en lugar de pintar ejes vacíos o rotos.

**Sin acciones de mutación ni restricciones de rol.** Tanto lectores como gestores tienen acceso completo a la pantalla de análisis, ya que es puramente consultiva.

## Estructura del frontend

```
src/
  api/
    analisis.js       obtenerSueloDiario(parcelaId, dias), obtenerClimaDiario(parcelaId, dias)
  pantallas/
    Analisis.jsx      pantalla principal con selector de rango, métricas y gráficas
    Analisis.test.jsx suite de pruebas unitarias
```

## Testing

Vitest + Testing Library:
- Carga y renderizado con datos simulados (suelo, clima, tratamientos, foliar).
- Cambio de rango temporal (7d, 30d, 90d, 365d) y comprobación de parámetros en llamadas a la API.
- Renderizado correcto ante respuestas vacías o sin datos.
- Manejo de error de red con `MensajeError`.

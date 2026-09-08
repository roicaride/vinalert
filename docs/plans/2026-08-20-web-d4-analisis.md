# Análisis y series temporales (D4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la pantalla de análisis (D4) que cruza las series temporales de suelo, meteorología, balance hídrico, tratamientos fitosanitarios y mediciones foliares a lo largo del tiempo, completando la última sección de la aplicación web.

**Architecture:** Una pantalla completa bajo `vinalert-front/src/pantallas/Analisis.jsx` con su cliente API `vinalert-front/src/api/analisis.js`. Utiliza `recharts` para la representación gráfica (curvas de humedad y temperatura de suelo, barras de lluvia vs ET₀, curvas de índices foliares) y controles de rango temporal (7, 30, 90, 365 días).

**Tech Stack:** React 19, Vite 7, Tailwind 4, Recharts 3, Vitest, Testing Library.

**Spec:** `docs/specs/2026-08-20-web-d4-analisis-design.md`

## Global Constraints

- **Reutilizar los clientes existentes de tratamientos y foliar**: `listarTratamientos` de `api/tratamientos.js` y `listarFoliar` de `api/foliar.js`.
- **Sin mutaciones ni restricciones de rol**: visible por igual para `lector` y `gestor`.
- **Manejo elegante de parcelas sin datos consolidados**: si no hay registros diarios en el rango seleccionado, mostrar aviso en lugar de romper las gráficas.
- **Toda la suite de frontend debe quedar verde** (`npm test` en `vinalert-front/`).

---

## Task 1: Configuración de pruebas y fixtures para D4

**Files:**
- Modify: `vinalert-front/src/test/setup.js`
- Modify: `vinalert-front/src/test/respuestas.js`

- [x] **Step 1: Añadir ResizeObserver a setup.js**
- [x] **Step 2: Añadir fixtures `SUELO_DIARIO` y `CLIMA_DIARIO` a `respuestas.js`**

---

## Task 2: Cliente API de análisis

**Files:**
- Create: `vinalert-front/src/api/analisis.js`

- [x] **Step 1: Implementar `obtenerSueloDiario(parcelaId, dias)` y `obtenerClimaDiario(parcelaId, dias)`**

---

## Task 3: Pantalla de Análisis y tests

**Files:**
- Create: `vinalert-front/src/pantallas/Analisis.test.jsx`
- Create: `vinalert-front/src/pantallas/Analisis.jsx`
- Modify: `vinalert-front/src/App.jsx`

- [x] **Step 1: Escribir tests unitarios en `Analisis.test.jsx`**
- [x] **Step 2: Implementar el componente `Analisis.jsx` con Recharts, KPIs de período y selector de días**
- [x] **Step 3: Conectar `analisis: Analisis` en `PANTALLAS` de `App.jsx`**
- [x] **Step 4: Ejecutar la suite completa de tests de frontend y verificar 100% verde**
- [x] **Step 5: Commit de la funcionalidad de D4**

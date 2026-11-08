-- ============================================================================
-- Migracion: panel de administracion
-- Fecha: 2026-10-13
--
-- - usuarios.activo: cuentas desactivadas desde el panel (no entran, sus
--   sesiones no valen). Todas las existentes quedan activas.
-- - usuarios.eliminado_en: cuentas eliminadas (derecho de supresion). Sus
--   datos personales se borran; la fila queda para no romper referencias.
-- - estado_jobs: ultima ejecucion de cada trabajo periodico, para el panel.
-- - configuracion: datos del titular y del encargado que muestran las
--   paginas legales, editables desde el panel.
--
-- Ejecutar ANTES de arrancar la app con este codigo: sin usuarios.activo el
-- login falla.
--
-- Es idempotente y no destructiva: solo anade columnas y tablas.
-- ============================================================================

BEGIN;

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS eliminado_en TIMESTAMP;

CREATE TABLE IF NOT EXISTS estado_jobs (
    job_id        VARCHAR PRIMARY KEY,
    ultimo_inicio TIMESTAMP,
    ultimo_fin    TIMESTAMP,
    ultimo_exito  TIMESTAMP,
    procesadas    INTEGER,
    fallos        INTEGER,
    ultimo_error  TEXT
);

CREATE TABLE IF NOT EXISTS configuracion (
    clave VARCHAR PRIMARY KEY,
    valor TEXT
);

COMMIT;

-- ============================================================================
-- VERIFICACION:
--
--   SELECT id, email, activo, eliminado_en FROM usuarios ORDER BY id;
--   SELECT * FROM estado_jobs;
--   SELECT * FROM configuracion;
-- ============================================================================

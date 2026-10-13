-- ============================================================================
-- Migracion: el superadmin pasa a ser una marca en la BD
-- Fecha: 2026-10-13
--
-- Anade `es_superadmin` a usuarios. Hasta ahora el superadmin (listado de
-- cuentas, dispositivos ESP32) se deducia del email admin@vinalert.dev, y como
-- el registro es publico, cualquiera podia registrar ese email en una BD donde
-- la cuenta no existiese todavia y quedarse con el control.
--
-- La cuenta admin@vinalert.dev que ya exista conserva el acceso: se marca
-- aqui. En una BD de produccion con otra cuenta de administrador, cambiar el
-- email del UPDATE (o marcarla despues a mano) ANTES de arrancar con este
-- codigo, o nadie podra entrar en Administracion.
--
-- Ejecutar ANTES de arrancar la app con este codigo: create_all() no anade
-- columnas a tablas existentes, y el login lee esta columna.
--
-- NO ejecutar este script contra ninguna base de datos sin confirmacion
-- explicita del usuario.
--
-- Es idempotente (IF NOT EXISTS, y el UPDATE se puede repetir) y no
-- destructivo.
-- ============================================================================

BEGIN;

ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS es_superadmin BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE usuarios
   SET es_superadmin = TRUE
 WHERE lower(email) = 'admin@vinalert.dev';

COMMIT;

-- ============================================================================
-- VERIFICACION (ejecutar despues; debe salir exactamente la cuenta de admin):
--
--   SELECT id, email, rol, es_superadmin FROM usuarios WHERE es_superadmin;
-- ============================================================================

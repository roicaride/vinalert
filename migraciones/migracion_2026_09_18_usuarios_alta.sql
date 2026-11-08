-- ============================================================================
-- Migracion: fecha de alta de los usuarios
-- Fecha: 2026-09-18
--
-- Anade `creado_en` a usuarios: el momento en que se registro cada cuenta.
-- Lo usa el listado de cuentas del administrador (GET /admin/usuarios) y su
-- exportacion a Excel / CSV.
--
-- Las cuentas que ya existen se quedan con creado_en NULO a proposito: esa
-- fecha no se guardaba y no se puede reconstruir. Inventarles una (la de hoy)
-- haria que en el listado pareciesen recien registradas.
--
-- Ejecutar ANTES de arrancar la app con este codigo: create_all() solo crea
-- tablas que faltan, nunca anade columnas a una tabla existente. Sin esta
-- columna, el REGISTRO de cuentas nuevas falla, porque el modelo ya la
-- rellena al crear un usuario.
--
-- NO ejecutar este script contra ninguna base de datos sin confirmacion
-- explicita del usuario.
--
-- Es idempotente (IF NOT EXISTS) y no destructivo: solo anade una columna
-- que admite nulos, no toca ni borra ninguna fila existente.
-- ============================================================================

ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS creado_en TIMESTAMP;

-- ============================================================================
-- VERIFICACION (ejecutar despues; las cuentas antiguas deben salir con
-- creado_en vacio y las nuevas con la hora de registro):
--
--   SELECT id, email, rol, creado_en FROM usuarios ORDER BY id;
-- ============================================================================

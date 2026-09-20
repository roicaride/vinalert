-- ============================================================================
-- Migracion: medias diarias del suelo por sensor, calculadas al momento
-- Fecha: 2026-09-19
--
-- 1. Indice (parcela_id, fecha_hora) en log_sensores: GET
--    /parcelas/{id}/suelo/diario agrupa las lecturas por dia y sensor en cada
--    peticion, y sin indice recorreria la tabla entera.
-- 2. Se borra suelo_diario: guardaba una fila por parcela y dia, sin sensor,
--    y la rellenaba una consolidacion que llego a pasar un mes sin ejecutarse.
--    Sus datos son derivables de log_sensores.
--
-- Ejecutar justo despues de desplegar el codigo que ya no usa suelo_diario.
-- Entre el despliegue y la aplicacion de este script, DELETE /parcelas/{id}
-- falla para las parcelas que todavia tengan filas en suelo_diario: la
-- clave foranea de migracion_2026_08_18_cimientos.sql no lleva ON DELETE, asi
-- que no se debe borrar ninguna parcela en esa ventana. Orden recomendado:
-- copia de seguridad (pg_dump) -> desplegar el codigo -> aplicar este script.
--
-- NO ejecutar este script contra ninguna base de datos sin confirmacion
-- explicita del usuario. Hacer antes una copia (pg_dump).
--
-- Idempotente (IF NOT EXISTS / IF EXISTS). Destructivo solo para suelo_diario.
-- ============================================================================

CREATE INDEX IF NOT EXISTS ix_log_sensores_parcela_fecha ON log_sensores (parcela_id, fecha_hora);

DROP TABLE IF EXISTS suelo_diario;

-- ============================================================================
-- VERIFICACION (ejecutar despues):
--
--   SELECT indexname FROM pg_indexes WHERE tablename = 'log_sensores';
--   -- debe incluir ix_log_sensores_parcela_fecha
--   SELECT to_regclass('public.suelo_diario');
--   -- debe devolver NULL
-- ============================================================================

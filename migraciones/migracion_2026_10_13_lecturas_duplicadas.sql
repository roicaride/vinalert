-- ============================================================================
-- Migracion: lecturas de sensores duplicadas
-- Fecha: 2026-10-13
--
-- El ESP32 reenviaba una lectura cuando no recibia respuesta a tiempo, aunque
-- el servidor ya la hubiese guardado. Desde este cambio la API no guarda una
-- lectura EXACTAMENTE igual a otra (mismo sensor, misma hora y mismos
-- valores); esta migracion limpia las copias que ya habia.
--
-- Solo borra copias exactas: misma parcela, sensor, fecha_hora, humedad,
-- temperatura y bateria (un valor nulo solo es igual a otro nulo). De cada
-- grupo conserva la fila mas antigua (id menor). Dos lecturas del mismo sensor
-- a la misma hora con valores distintos NO se tocan.
--
-- Hacer copia de seguridad antes (scripts/backup_db.sh). Es idempotente: una
-- segunda ejecucion no encuentra nada que borrar.
-- ============================================================================

-- Antes de ejecutar, para ver que se va a borrar:
--
--   SELECT array_agg(id ORDER BY id), sensor_id, fecha_hora, humedad_suelo_pct,
--          temperatura_suelo, bateria
--   FROM log_sensores
--   GROUP BY parcela_id, sensor_id, fecha_hora, humedad_suelo_pct,
--            temperatura_suelo, bateria
--   HAVING count(*) > 1;

BEGIN;

DELETE FROM log_sensores copia
USING log_sensores original
WHERE copia.id > original.id
  AND copia.parcela_id        IS NOT DISTINCT FROM original.parcela_id
  AND copia.sensor_id         IS NOT DISTINCT FROM original.sensor_id
  AND copia.fecha_hora        IS NOT DISTINCT FROM original.fecha_hora
  AND copia.humedad_suelo_pct IS NOT DISTINCT FROM original.humedad_suelo_pct
  AND copia.temperatura_suelo IS NOT DISTINCT FROM original.temperatura_suelo
  AND copia.bateria           IS NOT DISTINCT FROM original.bateria;

CREATE INDEX IF NOT EXISTS ix_log_sensores_sensor_fecha ON log_sensores (sensor_id, fecha_hora);

COMMIT;

-- VERIFICACION (debe devolver 0):
--
--   SELECT count(*) - count(DISTINCT (parcela_id, sensor_id, fecha_hora,
--          humedad_suelo_pct, temperatura_suelo, bateria)) FROM log_sensores;

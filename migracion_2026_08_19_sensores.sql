-- ============================================================================
-- Migracion: numeracion y configuracion de sensores
-- Fecha: 2026-08-19
--
-- ORDEN DE EJECUCION OBLIGATORIO. Los cuatro bloques van en este orden:
--   1. Anade las columnas, con `numero` todavia NULLABLE.
--   2. Rellena `numero` en los sensores existentes, numerando por id
--      ascendente dentro de cada parcela.
--   3. Lo pone NOT NULL — falla si el bloque 2 dejo algun nulo.
--   4. Anade la restriccion de unicidad — falla si el bloque 2 dejo
--      duplicados (parcela_id, numero repetidos).
--
-- Que los bloques 3 y 4 fallen es DESEABLE: significa que algo no cuadra y
-- hay que mirarlo antes de seguir, no forzarlo con un valor inventado ni con
-- ON CONFLICT DO NOTHING. Si el bloque 3 falla, ejecuta la VERIFICACION de
-- mas abajo para localizar las filas con numero nulo. Si el bloque 4 falla,
-- localiza el duplicado con:
--   SELECT parcela_id, numero, COUNT(*) FROM sensores
--    GROUP BY parcela_id, numero HAVING COUNT(*) > 1;
--
-- Ejecutar ANTES de arrancar la app con este codigo: create_all() solo crea
-- tablas que faltan, nunca anade columnas a una tabla existente.
--
-- NO ejecutar este script contra ninguna base de datos sin confirmacion
-- explicita del usuario. El bloque 3 (ALTER COLUMN ... SET NOT NULL) actua
-- sobre una tabla con datos potenciales.
--
-- Todo el script va envuelto en BEGIN/COMMIT. Postgres tiene DDL
-- transaccional, asi que sin la transaccion, ejecutado con `psql -f` (sin
-- -1), cada sentencia corre en la suya: si el bloque 4 falla o se omite, la
-- base queda con `numero NOT NULL` pero SIN uq_sensor_parcela_numero. En ese
-- estado el `except IntegrityError` de app/routers/sensores.py no salta
-- nunca, y dos peticiones concurrentes de aprovisionamiento crean numeros
-- duplicados en silencio -- exactamente el escenario irreversible que este
-- cambio existe para evitar. Con BEGIN/COMMIT ese estado intermedio es
-- imposible: o se aplican los cuatro bloques, o ninguno. No rompe la
-- re-ejecucion: en una segunda pasada el bloque 4 aborta la transaccion
-- (la restriccion ya existe), pero los bloques 1-3 ya estaban persistidos
-- de la primera pasada. No quites esta transaccion "por comodidad" (p.ej.
-- para ver el progreso bloque a bloque): es la unica razon por la que un
-- fallo a medias no deja la base en el estado peligroso descrito arriba.
-- ============================================================================

BEGIN;

-- 1. Columnas nuevas
ALTER TABLE sensores ADD COLUMN IF NOT EXISTS numero INTEGER;
ALTER TABLE sensores ADD COLUMN IF NOT EXISTS profundidad_cm DOUBLE PRECISION;
ALTER TABLE sensores ADD COLUMN IF NOT EXISTS latitud DOUBLE PRECISION;
ALTER TABLE sensores ADD COLUMN IF NOT EXISTS longitud DOUBLE PRECISION;
ALTER TABLE sensores ADD COLUMN IF NOT EXISTS modelo VARCHAR;

-- 2. Numerar los sensores existentes: por id ascendente dentro de cada parcela.
WITH numerados AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY parcela_id ORDER BY id) AS n
  FROM sensores
)
UPDATE sensores s SET numero = numerados.n
FROM numerados
WHERE s.id = numerados.id AND s.numero IS NULL;

-- VERIFICACION antes del bloque 3. Debe devolver 0 filas:
--   SELECT id, parcela_id FROM sensores WHERE numero IS NULL;

-- 3. Ya no admite nulos
ALTER TABLE sensores ALTER COLUMN numero SET NOT NULL;

-- 4. Unicidad dentro de la parcela. Sin IF NOT EXISTS: en Postgres, ADD
--    CONSTRAINT no lo admite, asi que re-ejecutar este bloque da error de
--    "ya existe", que es informativo y no destructivo.
ALTER TABLE sensores ADD CONSTRAINT uq_sensor_parcela_numero UNIQUE (parcela_id, numero);

COMMIT;

-- VERIFICACION FINAL. Debe devolver exactamente 1 fila:
--   SELECT conname FROM pg_constraint WHERE conname = 'uq_sensor_parcela_numero';
-- Esa fila es la unica defensa real contra numeros duplicados: el codigo lee
-- el maximo sin bloquear y se apoya en esta restriccion.

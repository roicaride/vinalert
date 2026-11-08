-- ============================================================================
-- Migracion: quitar los campos de riego y agronomia de las parcelas
-- Fecha: 2026-09-18
--
-- Borra de `parcelas` los 11 campos que solo se guardaban y se editaban en
-- Configuracion, pero que ningun calculo de la aplicacion llegaba a leer:
-- quedaron de la antigua logica de riego y del modelo de riesgo, retirados
-- antes. La parcela se queda con nombre, tipo de cultivo, variedad,
-- superficie y coordenadas.
--
-- Borra tambien `ubicacion`, una columna de PostGIS que el modelo no usa
-- desde hace tiempo (si PostGIS ya se desinstalo, ya no existira: IF EXISTS).
--
-- Ejecutar DESPUES de desplegar el codigo que ya no usa estos campos: el
-- codigo nuevo funciona con o sin las columnas; el viejo falla sin ellas.
--
-- NO ejecutar este script contra ninguna base de datos sin confirmacion
-- explicita del usuario.
--
-- ES DESTRUCTIVO: los valores que hubiera en estas columnas se pierden. Haz
-- antes una copia (pg_dump). Es idempotente (IF EXISTS).
-- ============================================================================

ALTER TABLE parcelas
    DROP COLUMN IF EXISTS cobertura_cultivo_pct,
    DROP COLUMN IF EXISTS porcentaje_cobertura_suelo,
    DROP COLUMN IF EXISTS profundidad_raices_cm,
    DROP COLUMN IF EXISTS umbral_humedad_critico_pct,
    DROP COLUMN IF EXISTS capacidad_campo_suelo,
    DROP COLUMN IF EXISTS kc_actual,
    DROP COLUMN IF EXISTS distancia_filas_m,
    DROP COLUMN IF EXISTS distancia_plantas_m,
    DROP COLUMN IF EXISTS caudal_gotero_lph,
    DROP COLUMN IF EXISTS num_goteros_planta,
    DROP COLUMN IF EXISTS eficiencia_riego_pct,
    DROP COLUMN IF EXISTS ubicacion;

-- ============================================================================
-- VERIFICACION (ejecutar despues; debe listar solo id, nombre, tipo_cultivo,
-- variedad, superficie_total_m2, latitud y longitud):
--
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'parcelas' ORDER BY ordinal_position;
-- ============================================================================

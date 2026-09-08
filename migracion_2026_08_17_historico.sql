ALTER TABLE clima_diario_historico DROP COLUMN IF EXISTS nitrogeno_max;
ALTER TABLE clima_diario_historico DROP COLUMN IF EXISTS nitrogeno_min;
ALTER TABLE clima_diario_historico DROP COLUMN IF EXISTS fosforo_max;
ALTER TABLE clima_diario_historico DROP COLUMN IF EXISTS fosforo_min;
ALTER TABLE clima_diario_historico DROP COLUMN IF EXISTS potasio_max;
ALTER TABLE clima_diario_historico DROP COLUMN IF EXISTS potasio_min;
ALTER TABLE clima_diario_historico DROP COLUMN IF EXISTS ph_max;
ALTER TABLE clima_diario_historico DROP COLUMN IF EXISTS ph_min;

ALTER TABLE clima_diario_historico ADD COLUMN IF NOT EXISTS humedad_suelo_sd DOUBLE PRECISION;
ALTER TABLE clima_diario_historico ADD COLUMN IF NOT EXISTS temperatura_suelo_media DOUBLE PRECISION;
ALTER TABLE clima_diario_historico ADD COLUMN IF NOT EXISTS temperatura_suelo_sd DOUBLE PRECISION;

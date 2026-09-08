-- ═══════════════════════════════════════════════════════════════════════════
-- ORDEN DE EJECUCIÓN OBLIGATORIO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Este script se ejecuta CONTRA LA BASE DE DATOS ANTES DE ARRANCAR la app con
-- el código de esta rama. No al revés.
--
-- Motivo: al arrancar, la app llama a `Base.metadata.create_all()`, que SOLO
-- crea tablas que no existen — nunca altera una tabla ya existente. Si la app
-- arranca primero (con `log_clima` en su forma vieja de 11 columnas) y este
-- script se ejecuta después, los `ALTER TABLE log_clima ADD COLUMN` de abajo
-- sí añadirían las 14 columnas nuevas a la tabla — pero mientras tanto, cada
-- ciclo del scheduler de clima (cada 3 h) habrá estado intentando insertar
-- las 25 columnas del modelo `LogClima` contra una tabla de solo 11, y
-- `clima_scheduler.py:23-25` captura esa excepción y SOLO la loguea
-- (`logger.exception(...)`) — no hay alerta visible, el fallo es silencioso.
--
-- Orden correcto:
--   1. Ejecutar este script completo contra la base de datos.
--   2. Arrancar la app (o el siguiente `create_all()`, que entonces solo
--      necesita crear las tablas que este script ya dejó listas si se usa
--      `create_all()` en vez de este script para las tablas nuevas).
--
-- Nota sobre los DROP TABLE: van SIN CASCADE a propósito, para que el script
-- falle de forma ruidosa (en vez de borrar en silencio) si alguna tabla no
-- modelada en este proyecto tiene una FK apuntando a `clima_diario_historico`
-- o `cue_actividades`. Si falla por eso, hay que resolver esa FK a mano antes
-- de reintentar — no añadir CASCADE sin más.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Tablas nuevas ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clima_diario (
    id                      SERIAL PRIMARY KEY,
    parcela_id              INTEGER NOT NULL REFERENCES parcelas(id),
    fecha                   DATE NOT NULL,
    temp_max                DOUBLE PRECISION,
    temp_min                DOUBLE PRECISION,
    temp_media              DOUBLE PRECISION,
    humedad_relativa_media  DOUBLE PRECISION,
    humedad_relativa_max    DOUBLE PRECISION,
    humedad_relativa_min    DOUBLE PRECISION,
    punto_rocio_medio       DOUBLE PRECISION,
    vpd_max                 DOUBLE PRECISION,
    precipitacion_total_mm  DOUBLE PRECISION,
    et0_total_dia           DOUBLE PRECISION,
    radiacion_total_mj_m2   DOUBLE PRECISION,
    horas_sol               DOUBLE PRECISION,
    viento_vel_media        DOUBLE PRECISION,
    viento_racha_max        DOUBLE PRECISION,
    viento_dir_dominante    DOUBLE PRECISION,
    humectacion_foliar_pct  DOUBLE PRECISION,
    suelo_modelo_humedad    DOUBLE PRECISION,
    suelo_modelo_temp       DOUBLE PRECISION,
    fuente                  VARCHAR NOT NULL,
    suelo_modelo_capa       VARCHAR,
    CONSTRAINT uq_clima_diario_parcela_fecha UNIQUE (parcela_id, fecha)
);
CREATE INDEX IF NOT EXISTS ix_clima_diario_id ON clima_diario (id);

CREATE TABLE IF NOT EXISTS suelo_diario (
    id                 SERIAL PRIMARY KEY,
    parcela_id         INTEGER NOT NULL REFERENCES parcelas(id),
    fecha              DATE NOT NULL,
    humedad_media      DOUBLE PRECISION,
    humedad_sd         DOUBLE PRECISION,
    humedad_max        DOUBLE PRECISION,
    humedad_min        DOUBLE PRECISION,
    temperatura_media  DOUBLE PRECISION,
    temperatura_sd     DOUBLE PRECISION,
    temperatura_max    DOUBLE PRECISION,
    temperatura_min    DOUBLE PRECISION,
    n_sensores         INTEGER,
    n_lecturas         INTEGER,
    CONSTRAINT uq_suelo_diario_parcela_fecha UNIQUE (parcela_id, fecha)
);
CREATE INDEX IF NOT EXISTS ix_suelo_diario_id ON suelo_diario (id);

CREATE TABLE IF NOT EXISTS tratamientos (
    id                    SERIAL PRIMARY KEY,
    parcela_id            INTEGER NOT NULL REFERENCES parcelas(id),
    fecha                 TIMESTAMP NOT NULL,
    tipo                  VARCHAR NOT NULL,
    producto              VARCHAR,
    materia_activa        VARCHAR,
    dosis                 DOUBLE PRECISION,
    unidad_dosis          VARCHAR,
    cantidad_total        DOUBLE PRECISION,
    unidad_cantidad       VARCHAR,
    operador              VARCHAR,
    maquinaria            VARCHAR,
    notas                 TEXT,
    temp_c_aplicacion     DOUBLE PRECISION,
    viento_ms_aplicacion  DOUBLE PRECISION,
    -- Auditabilidad: de qué lectura exacta se copió el clima (log_clima /
    -- pronostico / archivo / no_disponible) y en qué fecha_hora, para poder
    -- detectar a posteriori cualquier discrepancia con el momento de aplicación.
    clima_fecha_hora      TIMESTAMP,
    clima_fuente          VARCHAR
);
CREATE INDEX IF NOT EXISTS ix_tratamientos_id ON tratamientos (id);

-- ── Ampliación de log_clima ──────────────────────────────────────────────────
ALTER TABLE log_clima ADD COLUMN IF NOT EXISTS vpd_kpa DOUBLE PRECISION;
ALTER TABLE log_clima ADD COLUMN IF NOT EXISTS punto_rocio_c DOUBLE PRECISION;
ALTER TABLE log_clima ADD COLUMN IF NOT EXISTS radiacion_wm2 DOUBLE PRECISION;
ALTER TABLE log_clima ADD COLUMN IF NOT EXISTS nubosidad_pct DOUBLE PRECISION;
ALTER TABLE log_clima ADD COLUMN IF NOT EXISTS viento_racha_ms DOUBLE PRECISION;
ALTER TABLE log_clima ADD COLUMN IF NOT EXISTS viento_dir_deg DOUBLE PRECISION;
ALTER TABLE log_clima ADD COLUMN IF NOT EXISTS duracion_sol_s DOUBLE PRECISION;
ALTER TABLE log_clima ADD COLUMN IF NOT EXISTS suelo_temp_0cm DOUBLE PRECISION;
ALTER TABLE log_clima ADD COLUMN IF NOT EXISTS suelo_temp_6cm DOUBLE PRECISION;
ALTER TABLE log_clima ADD COLUMN IF NOT EXISTS suelo_temp_18cm DOUBLE PRECISION;
ALTER TABLE log_clima ADD COLUMN IF NOT EXISTS suelo_hum_0_1cm DOUBLE PRECISION;
ALTER TABLE log_clima ADD COLUMN IF NOT EXISTS suelo_hum_1_3cm DOUBLE PRECISION;
ALTER TABLE log_clima ADD COLUMN IF NOT EXISTS suelo_hum_3_9cm DOUBLE PRECISION;
ALTER TABLE log_clima ADD COLUMN IF NOT EXISTS suelo_hum_9_27cm DOUBLE PRECISION;

-- ── Tablas retiradas (DESTRUCTIVO) ───────────────────────────────────────────
DROP TABLE IF EXISTS clima_diario_historico;
DROP TABLE IF EXISTS cue_actividades;

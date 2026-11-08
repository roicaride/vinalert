-- ============================================================================
-- Migracion: cuentas por invitacion, recuperar contrasena y limite de intentos
-- Fecha: 2026-10-13
-- Spec: docs/specs/2026-10-13-cuentas-invitacion-design.md
--
-- 1. usuarios.hashed_password admite NULL: una cuenta invitada y aun sin
--    aceptar no tiene contrasena (y no puede entrar).
-- 2. usuarios.token_version: va dentro de cada sesion; subirla cierra todas
--    las sesiones abiertas de la cuenta.
-- 3. tokens_cuenta: enlaces de invitacion y de recuperacion (solo su hash).
-- 4. intentos_acceso: intentos de login y de recuperacion, para los limites
--    y como registro de accesos.
--
-- Las dos tablas nuevas guardan UTC sin zona (el resto de la BD, hora de
-- Madrid): ver app/services/reloj.py.
--
-- Requiere migracion_2026_10_13_superadmin.sql aplicada antes.
-- Ejecutar ANTES de arrancar la app con este codigo.
--
-- NO ejecutar este script contra ninguna base de datos sin confirmacion
-- explicita del usuario.
--
-- Es idempotente y no destructivo: no borra ni modifica ninguna fila.
-- ============================================================================

BEGIN;

ALTER TABLE usuarios
    ALTER COLUMN hashed_password DROP NOT NULL;

ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS tokens_cuenta (
    id            SERIAL PRIMARY KEY,
    usuario_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    tipo          VARCHAR NOT NULL,
    hash_token    VARCHAR(64) NOT NULL UNIQUE,
    creado_en     TIMESTAMP NOT NULL,
    caduca_en     TIMESTAMP NOT NULL,
    usado_en      TIMESTAMP,
    creado_por_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    parcela_id    INTEGER REFERENCES parcelas(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_tokens_cuenta_usuario_tipo
    ON tokens_cuenta (usuario_id, tipo);

CREATE TABLE IF NOT EXISTS intentos_acceso (
    id        SERIAL PRIMARY KEY,
    momento   TIMESTAMP NOT NULL,
    tipo      VARCHAR NOT NULL,
    email     VARCHAR NOT NULL,
    ip        VARCHAR NOT NULL,
    resultado VARCHAR NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_intentos_acceso_email
    ON intentos_acceso (email, tipo, momento);
CREATE INDEX IF NOT EXISTS ix_intentos_acceso_ip
    ON intentos_acceso (ip, tipo, momento);

COMMIT;

-- ============================================================================
-- VERIFICACION (ejecutar despues):
--
--   \d usuarios          -- hashed_password sin "not null"; token_version
--   \d tokens_cuenta
--   \d intentos_acceso
-- ============================================================================

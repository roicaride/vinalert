-- ============================================================================
-- Migracion: acceso multiusuario por parcela
-- Fecha: 2026-08-19
--
-- ORDEN DE EJECUCION OBLIGATORIO: los bloques van en este orden y no en
-- otro. El bloque 3 destruye la columna que el bloque 2 necesita leer; al
-- reves, se pierde para siempre quien era el dueno de cada parcela.
--
-- La VERIFICACION entre el bloque 2 y el bloque 3 NO es opcional. usuario_id
-- era nullable: una parcela con dueno nulo no inserta ninguna fila en el
-- bloque 2 (su filtro es "WHERE usuario_id IS NOT NULL") y por tanto
-- sobrevive al DROP COLUMN con CERO filas en parcela_usuarios. Esa parcela
-- queda invisible en GET /parcelas/ para todo el mundo y da 404 en cualquier
-- endpoint, y una vez ejecutado el bloque 3 el dato de quien era su dueno ya
-- no existe en ningun sitio para arreglarlo por SQL: solo queda repararlo a
-- mano o via una cuenta admin. Ejecuta la consulta del bloque 2.5 y actua
-- segun lo que devuelva ANTES de seguir al bloque 3.
--
-- Ejecutar ANTES de arrancar la app con este codigo: create_all() solo crea
-- tablas que faltan, nunca elimina columnas, asi que no hara el bloque 3 por
-- su cuenta.
-- ============================================================================

-- 1. Tabla de asociacion
CREATE TABLE IF NOT EXISTS parcela_usuarios (
    parcela_id INTEGER NOT NULL REFERENCES parcelas(id),
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    rol VARCHAR NOT NULL,
    PRIMARY KEY (parcela_id, usuario_id)
);

-- El indice de la PK compuesta va encabezado por parcela_id y no sirve para
-- el filtro por usuario_id que hace GET /parcelas/ (cada usuario lista las
-- parcelas donde es miembro). Sin este indice, ese filtro es un escaneo
-- completo de parcela_usuarios en cuanto la tabla crece.
--
-- El nombre ix_parcela_usuarios_usuario_id NO es arbitrario: es el que
-- SQLAlchemy genera solo para Column(..., index=True) en usuario_id de
-- ParcelaUsuario (app/models.py). Si una base se crea via create_all() y
-- otra via este script, ambas deben terminar con el mismo indice y el
-- mismo nombre -- una base creada por create_all() y esta migracion no
-- deben divergir. Si cambia la convencion de nombres de SQLAlchemy o el
-- modelo, reconfirma el nombre real inspeccionando
-- ParcelaUsuario.__table__.indexes en vez de asumir la convencion.
CREATE INDEX IF NOT EXISTS ix_parcela_usuarios_usuario_id ON parcela_usuarios (usuario_id);

-- 2. Cada dueno actual pasa a ser gestor de su parcela.
--    ON CONFLICT: hace el bloque re-ejecutable sin duplicar ni fallar.
INSERT INTO parcela_usuarios (parcela_id, usuario_id, rol)
SELECT id, usuario_id, 'gestor' FROM parcelas WHERE usuario_id IS NOT NULL
ON CONFLICT (parcela_id, usuario_id) DO NOTHING;

-- 2.5. VERIFICACION OBLIGATORIA antes del bloque 3, no una sugerencia.
-- Debe devolver 0 filas. Si devuelve alguna, esa parcela quedara invisible
-- para todos los usuarios en cuanto se ejecute el DROP COLUMN, y el dato de
-- quien era su dueno ya no existira para arreglarlo.
SELECT p.id, p.nombre FROM parcelas p
 WHERE NOT EXISTS (SELECT 1 FROM parcela_usuarios pu WHERE pu.parcela_id = p.id);

-- Si la consulta anterior devuelve filas, antes de continuar:
--   a) asigna un gestor a mano para cada una de esas parcelas
--      (INSERT INTO parcela_usuarios (parcela_id, usuario_id, rol)
--       VALUES (<id_parcela>, <id_usuario>, 'gestor');), o
--   b) designa (o confirma que ya existe) una cuenta de administracion, que
--      puede entrar en cualquier parcela sin necesidad de una fila en
--      parcela_usuarios:
--        UPDATE usuarios SET rol = 'admin' WHERE email = '<tu email>';

-- 3. DESTRUCTIVO. Solo despues de comprobar que el bloque 2.5 ha devuelto
--    0 filas (o de haber resuelto a mano las que devolvio).
ALTER TABLE parcelas DROP COLUMN IF EXISTS usuario_id;

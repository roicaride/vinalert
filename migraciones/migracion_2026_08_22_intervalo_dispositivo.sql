-- ============================================================================
-- Migracion: intervalo de ciclo configurable por dispositivo IoT
-- Fecha: 2026-08-22
--
-- Anade `intervalo_ciclo_seg` a dispositivos_iot: los segundos que el maestro
-- LoRa espera entre ciclos de medicion. El firmware lo consulta cada ciclo con
-- su propio token (GET /dispositivos/configuracion) y lo difunde a sus
-- esclavos en el beacon, asi que cambiarlo desde la web ya no obliga a
-- reflashear ningun nodo.
--
-- Ejecutar ANTES de arrancar la app con este codigo: create_all() solo crea
-- tablas que faltan, nunca anade columnas a una tabla existente.
--
-- NO ejecutar este script contra ninguna base de datos sin confirmacion
-- explicita del usuario.
--
-- Es idempotente (IF NOT EXISTS) y no destructivo: solo anade una columna con
-- valor por defecto, no toca ni borra ninguna fila existente.
-- ============================================================================

-- 14400 s = 4 h, el valor por defecto acordado dentro del rango 2-6 h. Los
-- dispositivos ya dados de alta lo heredan; se ajusta despues desde la web,
-- dispositivo a dispositivo, entre 30 s y 86400 s (24 h).
ALTER TABLE dispositivos_iot
    ADD COLUMN IF NOT EXISTS intervalo_ciclo_seg INTEGER NOT NULL DEFAULT 14400;

-- ============================================================================
-- VERIFICACION (ejecutar despues; debe listar todos los dispositivos con un
-- intervalo dentro del rango permitido):
--
--   SELECT id, nombre, parcela_id, intervalo_ciclo_seg
--     FROM dispositivos_iot
--    ORDER BY id;
-- ============================================================================

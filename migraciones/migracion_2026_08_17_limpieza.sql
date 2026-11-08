-- Limpieza de tablas huérfanas (sin modelo ORM ni referencias en código)
DROP TABLE IF EXISTS logs_sensores_pro;
DROP TABLE IF EXISTS logs_clima_api;
DROP TABLE IF EXISTS riesgo_enfermedades;

-- Funcionalidad retirada por decisión explícita (motor de riesgo y de riego)
DROP TABLE IF EXISTS riesgos_enfermedad;
DROP TABLE IF EXISTS recomendaciones_riego;

-- Sin uso en código
DROP TABLE IF EXISTS etapas_cultivo;

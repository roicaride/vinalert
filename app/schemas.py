from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


# ─── Inputs ──────────────────────────────────────────────────────────────────

class LogSensorCreate(BaseModel):
    parcela_id: int
    sensor_id: int
    fecha_hora: datetime
    humedad_suelo_pct: Optional[float] = Field(None, ge=0, le=100)
    temperatura_suelo: Optional[float] = None
    bateria: Optional[float] = Field(None, ge=0, le=100)




class ParcelaCreate(BaseModel):
    nombre: str
    tipo_cultivo: Optional[str] = None
    variedad: Optional[str] = None
    superficie_total_m2: Optional[float] = None
    latitud: Optional[float] = Field(default=None, ge=-90, le=90)
    longitud: Optional[float] = Field(default=None, ge=-180, le=180)


class ParcelaUpdate(BaseModel):
    """Todos los campos opcionales: solo se modifica lo que se envia."""
    nombre: Optional[str] = None
    tipo_cultivo: Optional[str] = None
    variedad: Optional[str] = None
    superficie_total_m2: Optional[float] = None
    latitud: Optional[float] = Field(default=None, ge=-90, le=90)
    longitud: Optional[float] = Field(default=None, ge=-180, le=180)


class UsuarioCreate(BaseModel):
    """
    Lo que manda el formulario de registro. Sin `rol` a proposito: el registro
    publico no puede elegir sus permisos (ver test_autorizacion).
    """
    nombre: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

    @field_validator("nombre", mode="before")
    @classmethod
    def _nombre_sin_espacios(cls, v):
        return v.strip() if isinstance(v, str) else v

    @field_validator("email", mode="before")
    @classmethod
    def _email_normalizado(cls, v):
        # Un email es el mismo con o sin mayusculas: normalizarlo aqui evita que
        # «Ana@x.com» y «ana@x.com» acaben siendo dos cuentas distintas.
        return v.strip().lower() if isinstance(v, str) else v




class SensorUpdate(BaseModel):
    etiqueta: Optional[str] = None
    activo: Optional[bool] = None
    profundidad_cm: Optional[float] = None
    latitud: Optional[float] = Field(default=None, ge=-90, le=90)
    longitud: Optional[float] = Field(default=None, ge=-180, le=180)
    modelo: Optional[str] = None


class ProvisionarSensores(BaseModel):
    cantidad: int = Field(ge=1, le=100)


# ─── Responses ───────────────────────────────────────────────────────────────

class UsuarioResp(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    nombre: str
    email: str


class UsuarioMeResp(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    nombre: str
    email: str
    rol: str
    # Lo decide el backend (deps.es_superadmin) para que la web no tenga que
    # repetir por su cuenta cual es el email del administrador.
    es_superadmin: bool = False


class UsuarioAdminResp(BaseModel):
    """Una fila del listado de cuentas del admin. Nunca incluye la contrasena."""
    id: int
    nombre: str
    email: str
    telefono: Optional[str] = None
    rol: str
    creado_en: Optional[datetime] = None
    n_parcelas: int


class Token(BaseModel):
    access_token: str
    token_type: str


class ParcelaResp(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    mi_rol: Literal["gestor", "lectura"]
    nombre: str
    tipo_cultivo: Optional[str] = None
    variedad: Optional[str] = None
    superficie_total_m2: Optional[float] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None


class SensorResp(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    parcela_id: int
    numero: int
    etiqueta: str
    activo: bool
    profundidad_cm: Optional[float] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    modelo: Optional[str] = None


class LogSensorResp(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    parcela_id: int
    sensor_id: Optional[int] = None
    fecha_hora: datetime
    humedad_suelo_pct: Optional[float] = None
    temperatura_suelo: Optional[float] = None
    bateria: Optional[float] = None
    sensor_etiqueta: Optional[str] = None
    sensor_profundidad_cm: Optional[float] = None
    temp_ambiente_c: Optional[float] = None
    humedad_aire_pct: Optional[float] = None
    lluvia_mm: Optional[float] = None
    et0: Optional[float] = None
    viento_ms: Optional[float] = None
    viento_racha_ms: Optional[float] = None
    viento_dir_deg: Optional[float] = None
    radiacion_wm2: Optional[float] = None
    presion_hpa: Optional[float] = None
    vpd_kpa: Optional[float] = None
    punto_rocio_c: Optional[float] = None
    nubosidad_pct: Optional[float] = None
    uv_index: Optional[float] = None
    duracion_sol_s: Optional[float] = None
    suelo_temp_0cm: Optional[float] = None
    suelo_temp_6cm: Optional[float] = None
    suelo_temp_18cm: Optional[float] = None
    suelo_hum_0_1cm: Optional[float] = None
    suelo_hum_1_3cm: Optional[float] = None
    suelo_hum_3_9cm: Optional[float] = None
    suelo_hum_9_27cm: Optional[float] = None


class LogClimaResp(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    parcela_id: int
    fecha_hora: datetime
    temp_c: Optional[float] = None
    humedad_relativa_pct: Optional[float] = None
    lluvia_mm: Optional[float] = None
    et0: Optional[float] = None
    presion_hpa: Optional[float] = None
    viento_vel_ms: Optional[float] = None
    uv_index: Optional[float] = None
    # Prevision de Open-Meteo en el momento de la consulta: 24h = manana,
    # 48h = pasado manana.
    lluvia_prev_24h_mm: Optional[float] = None
    prob_lluvia_24h_pct: Optional[float] = None
    lluvia_prev_48h_mm: Optional[float] = None
    prob_lluvia_48h_pct: Optional[float] = None
    vpd_kpa: Optional[float] = None
    punto_rocio_c: Optional[float] = None
    radiacion_wm2: Optional[float] = None
    nubosidad_pct: Optional[float] = None
    viento_racha_ms: Optional[float] = None
    viento_dir_deg: Optional[float] = None
    duracion_sol_s: Optional[float] = None
    suelo_temp_0cm: Optional[float] = None
    suelo_temp_6cm: Optional[float] = None
    suelo_temp_18cm: Optional[float] = None
    suelo_hum_0_1cm: Optional[float] = None
    suelo_hum_1_3cm: Optional[float] = None
    suelo_hum_3_9cm: Optional[float] = None
    suelo_hum_9_27cm: Optional[float] = None


class TratamientoCreate(BaseModel):
    parcela_id: int
    fecha: datetime
    tipo: str
    producto: Optional[str] = None
    materia_activa: Optional[str] = None
    dosis: Optional[float] = None
    unidad_dosis: Optional[str] = None
    cantidad_total: Optional[float] = None
    unidad_cantidad: Optional[str] = None
    operador: Optional[str] = None
    maquinaria: Optional[str] = None
    notas: Optional[str] = None


class TratamientoResp(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    parcela_id: int
    fecha: datetime
    tipo: str
    producto: Optional[str] = None
    materia_activa: Optional[str] = None
    dosis: Optional[float] = None
    unidad_dosis: Optional[str] = None
    cantidad_total: Optional[float] = None
    unidad_cantidad: Optional[str] = None
    operador: Optional[str] = None
    maquinaria: Optional[str] = None
    notas: Optional[str] = None
    temp_c_aplicacion: Optional[float] = None
    viento_ms_aplicacion: Optional[float] = None
    humedad_relativa_aplicacion: Optional[float] = None
    lluvia_mm_aplicacion: Optional[float] = None
    et0_aplicacion: Optional[float] = None
    viento_racha_ms_aplicacion: Optional[float] = None
    viento_dir_deg_aplicacion: Optional[float] = None
    radiacion_wm2_aplicacion: Optional[float] = None
    presion_hpa_aplicacion: Optional[float] = None
    vpd_kpa_aplicacion: Optional[float] = None
    punto_rocio_c_aplicacion: Optional[float] = None
    nubosidad_pct_aplicacion: Optional[float] = None
    clima_fecha_hora: Optional[datetime] = None
    clima_fuente: Optional[str] = None



class ResumenSensoresResp(BaseModel):
    parcela_id: int
    desde: datetime
    hasta: datetime
    n_sensores: int
    n_lecturas: int
    humedad_media: Optional[float] = None
    humedad_sd: Optional[float] = None
    temperatura_media: Optional[float] = None
    temperatura_sd: Optional[float] = None


class DashboardCompleto(BaseModel):
    parcela: ParcelaResp
    estado_suelo: ResumenSensoresResp
    clima_actual: Optional[LogClimaResp] = None


class LecturaFoliarResp(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    parcela_id: int
    fecha: date
    grupo: int
    chl_medio: Optional[float] = None
    chl_sd: Optional[float] = None
    flav_medio: Optional[float] = None
    flav_sd: Optional[float] = None
    nbi_medio: Optional[float] = None
    nbi_sd: Optional[float] = None
    n_mediciones: Optional[int] = None
    archivo_origen: Optional[str] = None


class ClimaHorarioResp(BaseModel):
    """Una hora de GET /parcelas/{id}/clima/horario."""
    fecha_hora: datetime
    lluvia_mm: Optional[float] = None
    prob_lluvia_pct: Optional[float] = None
    et0_mm: Optional[float] = None
    temp_c: Optional[float] = None
    prevision: bool


class ClimaDiarioResp(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    parcela_id: int
    fecha: date
    temp_max: Optional[float] = None
    temp_min: Optional[float] = None
    temp_media: Optional[float] = None
    humedad_relativa_media: Optional[float] = None
    humedad_relativa_max: Optional[float] = None
    humedad_relativa_min: Optional[float] = None
    punto_rocio_medio: Optional[float] = None
    vpd_max: Optional[float] = None
    precipitacion_total_mm: Optional[float] = None
    et0_total_dia: Optional[float] = None
    radiacion_total_mj_m2: Optional[float] = None
    horas_sol: Optional[float] = None
    viento_vel_media: Optional[float] = None
    viento_racha_max: Optional[float] = None
    viento_dir_dominante: Optional[float] = None
    humectacion_foliar_pct: Optional[float] = None
    suelo_modelo_humedad: Optional[float] = None
    suelo_modelo_temp: Optional[float] = None
    fuente: str
    suelo_modelo_capa: Optional[str] = None






class ComprobacionClimaResp(BaseModel):
    disponible: bool
    latitud: float
    longitud: float
    motivo: Optional[str] = None


class MiembroCreate(BaseModel):
    email: str
    rol: Literal["gestor", "lectura"]


class MiembroUpdate(BaseModel):
    rol: Literal["gestor", "lectura"]


class MiembroResp(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    usuario_id: int
    nombre: str
    email: str
    rol: str


class SueloDiarioSensorResp(BaseModel):
    """Un dia de un sensor en GET /parcelas/{id}/suelo/diario."""
    fecha: date
    sensor_id: int
    sensor_numero: int
    profundidad_cm: Optional[float] = None
    humedad_media: Optional[float] = None
    humedad_max: Optional[float] = None
    humedad_min: Optional[float] = None
    temperatura_media: Optional[float] = None
    temperatura_max: Optional[float] = None
    temperatura_min: Optional[float] = None
    n_lecturas: int


# Limites del intervalo de ciclo del maestro LoRa. El minimo permite seguir
# iterando en el banco de pruebas; el maximo evita que un dispositivo quede
# mudo mas de un dia por un valor mal tecleado.
INTERVALO_CICLO_MIN_SEG = 30
INTERVALO_CICLO_MAX_SEG = 86400


class DispositivoIoTCreate(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=100)


class DispositivoIoTUpdate(BaseModel):
    intervalo_ciclo_seg: int = Field(
        ..., ge=INTERVALO_CICLO_MIN_SEG, le=INTERVALO_CICLO_MAX_SEG
    )


class DispositivoConfigResp(BaseModel):
    """Configuracion que el propio dispositivo consulta con su token."""
    dispositivo_id: int
    parcela_id: int
    intervalo_ciclo_seg: int


class DispositivoIoTResp(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    parcela_id: int
    nombre: str
    token: str
    activo: bool
    creado_en: datetime
    ultimo_uso: Optional[datetime] = None
    intervalo_ciclo_seg: int


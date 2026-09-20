from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import Column, Integer, String, Float, DateTime, Date, ForeignKey, Text, Boolean, Index, UniqueConstraint
from sqlalchemy.orm import relationship
from .database import Base


def _ahora_madrid() -> datetime:
    # Hora local sin zona, igual que el resto de marcas de tiempo de la BD.
    return datetime.now(ZoneInfo("Europe/Madrid")).replace(tzinfo=None)


class Usuario(Base):
    __tablename__ = "usuarios"
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    telefono = Column(String)
    hashed_password = Column(String, nullable=False)
    rol = Column(String, default="agricultor")
    # Cuando se dio de alta. Nula en las cuentas anteriores a la migracion
    # 2026-09-18: esa fecha no se guardaba y no se puede reconstruir.
    creado_en = Column(DateTime, default=_ahora_madrid)

    parcelas_asociadas = relationship("ParcelaUsuario", back_populates="usuario", cascade="all, delete-orphan")


class Parcela(Base):
    __tablename__ = "parcelas"
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, nullable=False)
    tipo_cultivo = Column(String)
    variedad = Column(String)
    superficie_total_m2 = Column(Float)
    latitud = Column(Float)
    longitud = Column(Float)

    logs_sensores = relationship("LogSensor", back_populates="parcela")
    sensores = relationship("Sensor", back_populates="parcela")
    logs_clima = relationship("LogClima", back_populates="parcela")
    clima_diario = relationship("ClimaDiario", back_populates="parcela")
    tratamientos = relationship("Tratamiento", back_populates="parcela")
    lecturas_foliares = relationship("LecturaFoliar", back_populates="parcela")
    dispositivos = relationship("DispositivoIoT", back_populates="parcela", cascade="all, delete-orphan")
    miembros = relationship("ParcelaUsuario", back_populates="parcela", cascade="all, delete-orphan")



class ParcelaUsuario(Base):
    """
    Asociacion entre una parcela y un usuario, con su nivel de acceso.

    La clave primaria es compuesta (parcela_id, usuario_id) a proposito: sin
    ella el mismo usuario podria aparecer dos veces en la misma parcela con
    roles distintos, y que gane uno u otro dependeria del orden de lectura.
    """
    __tablename__ = "parcela_usuarios"

    parcela_id = Column(Integer, ForeignKey("parcelas.id"), primary_key=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), primary_key=True, index=True)
    rol = Column(String, nullable=False)

    parcela = relationship("Parcela", back_populates="miembros")
    usuario = relationship("Usuario", back_populates="parcelas_asociadas")


class Sensor(Base):
    __tablename__ = "sensores"
    __table_args__ = (
        UniqueConstraint("parcela_id", "numero", name="uq_sensor_parcela_numero"),
    )

    id = Column(Integer, primary_key=True, index=True)
    parcela_id = Column(Integer, ForeignKey("parcelas.id"), nullable=False)
    # Numero del nodo DENTRO de su parcela. Lo asigna siempre el backend, nunca
    # el cliente: la ingesta de campo identificara cada lectura por este numero,
    # asi que un duplicado o un hueco haria que se perdieran datos en silencio.
    numero = Column(Integer, nullable=False)
    etiqueta = Column(String, nullable=False)
    activo = Column(Boolean, default=True, nullable=False)
    profundidad_cm = Column(Float)
    latitud = Column(Float)
    longitud = Column(Float)
    modelo = Column(String)

    parcela = relationship("Parcela", back_populates="sensores")
    lecturas = relationship("LogSensor", back_populates="sensor")


class LogSensor(Base):
    __tablename__ = "log_sensores"
    # Todas las consultas de lecturas van por parcela y rango de fechas: sin
    # este indice, agrupar un ano de lecturas recorreria la tabla entera.
    __table_args__ = (Index("ix_log_sensores_parcela_fecha", "parcela_id", "fecha_hora"),)
    id = Column(Integer, primary_key=True, index=True)
    parcela_id = Column(Integer, ForeignKey("parcelas.id"))
    sensor_id = Column(Integer, ForeignKey("sensores.id"))
    fecha_hora = Column(DateTime)
    humedad_suelo_pct = Column(Float)
    temperatura_suelo = Column(Float)
    bateria = Column(Float)

    parcela = relationship("Parcela", back_populates="logs_sensores")
    sensor = relationship("Sensor", back_populates="lecturas")


class LogClima(Base):
    __tablename__ = "log_clima"
    id = Column(Integer, primary_key=True, index=True)
    parcela_id = Column(Integer, ForeignKey("parcelas.id"))
    fecha_hora = Column(DateTime)
    temp_c = Column(Float)
    humedad_relativa_pct = Column(Float)
    presion_hpa = Column(Float)
    viento_vel_ms = Column(Float)
    lluvia_mm = Column(Float)
    et0 = Column(Float)
    uv_index = Column(Float)
    lluvia_prev_24h_mm = Column(Float)
    prob_lluvia_24h_pct = Column(Float)
    lluvia_prev_48h_mm = Column(Float)
    prob_lluvia_48h_pct = Column(Float)
    # Ampliación: variables de valor agronómico (todas verificadas en el bloque
    # `current` de Open-Meteo, una sola llamada).
    vpd_kpa = Column(Float)            # déficit de presión de vapor — estrés hídrico
    punto_rocio_c = Column(Float)
    radiacion_wm2 = Column(Float)
    nubosidad_pct = Column(Float)
    viento_racha_ms = Column(Float)
    viento_dir_deg = Column(Float)
    duracion_sol_s = Column(Float)     # segundos de sol en la hora en curso
    # Suelo estimado por el modelo, para contrastar contra los sensores reales
    suelo_temp_0cm = Column(Float)
    suelo_temp_6cm = Column(Float)
    suelo_temp_18cm = Column(Float)
    suelo_hum_0_1cm = Column(Float)
    suelo_hum_1_3cm = Column(Float)
    suelo_hum_3_9cm = Column(Float)
    suelo_hum_9_27cm = Column(Float)

    parcela = relationship("Parcela", back_populates="logs_clima")


class Tratamiento(Base):
    __tablename__ = "tratamientos"
    id = Column(Integer, primary_key=True, index=True)
    parcela_id = Column(Integer, ForeignKey("parcelas.id"), nullable=False)
    fecha = Column(DateTime, nullable=False)
    tipo = Column(String, nullable=False)   # fitosanitario | abonado | poda | riego | otro
    producto = Column(String)
    materia_activa = Column(String)
    dosis = Column(Float)
    unidad_dosis = Column(String)           # "L/ha" | "kg/ha"
    cantidad_total = Column(Float)
    unidad_cantidad = Column(String)        # "L" | "kg"
    operador = Column(String)
    maquinaria = Column(String)
    notas = Column(Text)
    # Clima reconstruido para el momento real de aplicación (`fecha`), no el
    # más reciente al registrar. El viento y condiciones al aplicar son datos
    # exigidos para fitosanitarios. Ver app/services/clima_puntual.py.
    temp_c_aplicacion = Column(Float)
    viento_ms_aplicacion = Column(Float)
    humedad_relativa_aplicacion = Column(Float)
    lluvia_mm_aplicacion = Column(Float)
    et0_aplicacion = Column(Float)
    viento_racha_ms_aplicacion = Column(Float)
    viento_dir_deg_aplicacion = Column(Float)
    radiacion_wm2_aplicacion = Column(Float)
    presion_hpa_aplicacion = Column(Float)
    vpd_kpa_aplicacion = Column(Float)
    punto_rocio_c_aplicacion = Column(Float)
    nubosidad_pct_aplicacion = Column(Float)
    # Auditabilidad: de qué lectura exacta se copió el clima y de dónde salió,
    # para poder detectar a posteriori cualquier discrepancia.
    clima_fecha_hora = Column(DateTime)
    clima_fuente = Column(String)  # "log_clima" | "pronostico" | "archivo" | "no_disponible"


    parcela = relationship("Parcela", back_populates="tratamientos")


class ClimaDiario(Base):
    __tablename__ = "clima_diario"
    __table_args__ = (UniqueConstraint("parcela_id", "fecha", name="uq_clima_diario_parcela_fecha"),)

    id = Column(Integer, primary_key=True, index=True)
    parcela_id = Column(Integer, ForeignKey("parcelas.id"), nullable=False)
    fecha = Column(Date, nullable=False)

    temp_max = Column(Float)
    temp_min = Column(Float)
    temp_media = Column(Float)
    humedad_relativa_media = Column(Float)
    humedad_relativa_max = Column(Float)
    humedad_relativa_min = Column(Float)
    punto_rocio_medio = Column(Float)
    # Solo el máximo: Open-Meteo no ofrece una variable diaria de VPD medio
    # en ninguno de los dos endpoints (verificado contra la API real).
    vpd_max = Column(Float)
    precipitacion_total_mm = Column(Float)
    et0_total_dia = Column(Float)
    radiacion_total_mj_m2 = Column(Float)
    horas_sol = Column(Float)
    viento_vel_media = Column(Float)
    viento_racha_max = Column(Float)
    viento_dir_dominante = Column(Float)
    humectacion_foliar_pct = Column(Float)
    suelo_modelo_humedad = Column(Float)
    suelo_modelo_temp = Column(Float)
    # Trazabilidad: de qué endpoint salió la fila y de qué capa de suelo,
    # porque archivo (ERA5, 0-7cm) y pronóstico (3-9cm) no son comparables sin más.
    fuente = Column(String, nullable=False)
    suelo_modelo_capa = Column(String)

    parcela = relationship("Parcela", back_populates="clima_diario")


class LecturaFoliar(Base):
    __tablename__ = "lecturas_foliares"
    id = Column(Integer, primary_key=True, index=True)
    parcela_id = Column(Integer, ForeignKey("parcelas.id"), nullable=False)
    fecha = Column(Date, nullable=False)
    grupo = Column(Integer, nullable=False)
    chl_medio = Column(Float)
    chl_sd = Column(Float)
    flav_medio = Column(Float)
    flav_sd = Column(Float)
    nbi_medio = Column(Float)
    nbi_sd = Column(Float)
    n_mediciones = Column(Integer)
    archivo_origen = Column(String)

    parcela = relationship("Parcela", back_populates="lecturas_foliares")


class DispositivoIoT(Base):
    __tablename__ = "dispositivos_iot"
    id = Column(Integer, primary_key=True, index=True)
    parcela_id = Column(Integer, ForeignKey("parcelas.id"), nullable=False)
    nombre = Column(String, nullable=False)
    token = Column(Text, nullable=False)
    activo = Column(Boolean, default=True, nullable=False)
    creado_en = Column(DateTime, nullable=False)
    ultimo_uso = Column(DateTime, nullable=True)
    # Segundos entre ciclos de medicion del maestro LoRa. El firmware lo
    # consulta cada ciclo (GET /dispositivos/configuracion) y lo difunde a
    # sus esclavos en el beacon, asi que se cambia desde la web sin reflashear.
    intervalo_ciclo_seg = Column(Integer, nullable=False, default=14400, server_default="14400")

    parcela = relationship("Parcela", back_populates="dispositivos")


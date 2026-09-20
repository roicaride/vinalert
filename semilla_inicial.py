"""
Script para inicializar la base de datos con datos de ejemplo y crear el usuario administrador.

Uso:
    python semilla_inicial.py

Las contrasenas de los usuarios semilla se leen del entorno. Los valores por
defecto son de desarrollo y estan publicados en el repositorio: NO uses este
script contra una base de datos accesible desde fuera sin definir antes
SEMILLA_ADMIN_PASSWORD y SEMILLA_AGRICULTOR_PASSWORD.

    SEMILLA_ADMIN_EMAIL          (por defecto: admin@vinalert.dev)
    SEMILLA_ADMIN_PASSWORD       (por defecto: admin123)
    SEMILLA_AGRICULTOR_EMAIL     (por defecto: agricultor@vinalert.dev)
    SEMILLA_AGRICULTOR_PASSWORD  (por defecto: vinalert123)
"""
import os
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv

load_dotenv()

ADMIN_EMAIL = os.getenv("SEMILLA_ADMIN_EMAIL", "admin@vinalert.dev")
ADMIN_PASSWORD = os.getenv("SEMILLA_ADMIN_PASSWORD", "admin123")
AGRICULTOR_EMAIL = os.getenv("SEMILLA_AGRICULTOR_EMAIL", "agricultor@vinalert.dev")
AGRICULTOR_PASSWORD = os.getenv("SEMILLA_AGRICULTOR_PASSWORD", "vinalert123")

from app.auth import obtener_password_hash
from app.database import Base, SessionLocal, engine
from app.models import (
    LogClima,
    LogSensor,
    Parcela,
    ParcelaUsuario,
    Sensor,
    Tratamiento,
    Usuario,
)
from app.services.consolidacion import consolidar_todas_parcelas


def sembrar():
    print("1. Creando tablas en la base de datos si no existen...")
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        print("2. Creando usuarios...")
        # Usuario Administrador
        admin = db.query(Usuario).filter(Usuario.email == ADMIN_EMAIL).first()
        if not admin:
            admin = Usuario(
                nombre="Administrador",
                email=ADMIN_EMAIL,
                hashed_password=obtener_password_hash(ADMIN_PASSWORD),
                rol="admin",
            )
            db.add(admin)
            print(f"   -> Creado admin: {ADMIN_EMAIL}")
        else:
            print(f"   -> Admin ya existía: {ADMIN_EMAIL}")

        # Usuario Agricultor
        agricultor = db.query(Usuario).filter(Usuario.email == AGRICULTOR_EMAIL).first()
        if not agricultor:
            agricultor = Usuario(
                nombre="Roi Viticultor",
                email=AGRICULTOR_EMAIL,
                hashed_password=obtener_password_hash(AGRICULTOR_PASSWORD),
                rol="agricultor",
            )
            db.add(agricultor)
            print(f"   -> Creado usuario: {AGRICULTOR_EMAIL}")
        else:
            print(f"   -> Usuario ya existía: {AGRICULTOR_EMAIL}")

        db.commit()
        db.refresh(admin)
        db.refresh(agricultor)

        print("3. Creando parcela de demostración...")
        parcela = db.query(Parcela).filter(Parcela.nombre == "Finca O Pazo (Albariño)").first()
        if not parcela:
            parcela = Parcela(
                nombre="Finca O Pazo (Albariño)",
                tipo_cultivo="Viñedo",
                variedad="Albariño",
                superficie_total_m2=15000,
                latitud=42.3150,
                longitud=-8.6120,
            )
            db.add(parcela)
            db.commit()
            db.refresh(parcela)
            print(f"   -> Creada parcela: {parcela.nombre} (ID: {parcela.id})")

            # Asignar membresía
            db.add(ParcelaUsuario(parcela_id=parcela.id, usuario_id=agricultor.id, rol="gestor"))
            db.commit()
        else:
            print(f"   -> Parcela ya existía: {parcela.nombre} (ID: {parcela.id})")

        print("4. Configurando sensores en la parcela...")
        sensores = db.query(Sensor).filter(Sensor.parcela_id == parcela.id).all()
        if not sensores:
            s1 = Sensor(parcela_id=parcela.id, numero=1, etiqueta="Sonda Superficie (20cm)", activo=True, profundidad_cm=20, modelo="TEROS 12", latitud=42.3151, longitud=-8.6121)
            s2 = Sensor(parcela_id=parcela.id, numero=2, etiqueta="Sonda Raíz Media (40cm)", activo=True, profundidad_cm=40, modelo="TEROS 12", latitud=42.3152, longitud=-8.6122)
            s3 = Sensor(parcela_id=parcela.id, numero=3, etiqueta="Sonda Profunda (60cm)", activo=True, profundidad_cm=60, modelo="TEROS 12", latitud=42.3153, longitud=-8.6123)
            db.add_all([s1, s2, s3])
            db.commit()
            print("   -> Creados 3 sensores con diferentes profundidades.")
            sensores = [s1, s2, s3]
        else:
            print(f"   -> Ya existen {len(sensores)} sensores.")

        print("5. Generando lecturas recientes de sensores y clima...")
        conteo_logs = db.query(LogSensor).filter(LogSensor.parcela_id == parcela.id).count()
        ahora = datetime.now(timezone.utc).replace(tzinfo=None)

        if conteo_logs < 10:
            # Generar datos horarios de los últimos 7 días
            nuevos_logs_sensor = []
            nuevos_logs_clima = []

            for h in range(24 * 7, 0, -1):
                fecha_hora = ahora - timedelta(hours=h)
                base_humedad = 28.0 + (h % 5) * 0.8
                base_temp = 18.0 + (h % 24 - 12) * 0.4

                for sensor in sensores:
                    prof_factor = (sensor.profundidad_cm or 20) / 60.0
                    nuevos_logs_sensor.append(
                        LogSensor(
                            parcela_id=parcela.id,
                            sensor_id=sensor.id,
                            fecha_hora=fecha_hora,
                            humedad_suelo_pct=round(base_humedad - prof_factor * 2, 1),
                            temperatura_suelo=round(base_temp - prof_factor * 1.5, 1),
                            bateria=3.95,
                        )
                    )

                # Clima horario
                nuevos_logs_clima.append(
                    LogClima(
                        parcela_id=parcela.id,
                        fecha_hora=fecha_hora,
                        temp_c=round(base_temp + 2.0, 1),
                        humedad_relativa_pct=round(65.0 + (h % 10), 1),
                        lluvia_mm=2.5 if h in (48, 49) else 0.0,
                        et0=round(0.15 + (1 if 8 <= (fecha_hora.hour) <= 18 else 0) * 0.25, 2),
                        viento_racha_ms=round(3.0 + (h % 4) * 0.8, 1),
                    )
                )

            db.add_all(nuevos_logs_sensor)
            db.add_all(nuevos_logs_clima)
            db.commit()
            print(f"   -> Insertadas {len(nuevos_logs_sensor)} lecturas de sensores y {len(nuevos_logs_clima)} de clima.")

        print("6. Registrando tratamientos de ejemplo...")
        conteo_trat = db.query(Tratamiento).filter(Tratamiento.parcela_id == parcela.id).count()
        if conteo_trat == 0:
            t1 = Tratamiento(
                parcela_id=parcela.id,
                fecha=ahora - timedelta(days=5),
                tipo="Fungicida",
                producto="Oxicloruro de Cobre 50%",
                materia_activa="Oxicloruro de Cobre",
                dosis=2.5,
                unidad_dosis="kg/ha",
                cantidad_total=3.75,
                unidad_cantidad="kg",
                operador="Roi",
                maquinaria="Atomizador 1000L",
                notas="Tratamiento preventivo contra Mildiu tras aviso de lluvias.",
                temp_c_aplicacion=19.4,
                viento_ms_aplicacion=2.1,
                clima_fuente="open-meteo",
            )
            t2 = Tratamiento(
                parcela_id=parcela.id,
                fecha=ahora - timedelta(days=2),
                tipo="Abono foliar",
                producto="Aminoácidos + Boro",
                materia_activa="Extracto vegetal",
                dosis=1.5,
                unidad_dosis="l/ha",
                operador="Roi",
                notas="Estimulación vegetativa pre-envero.",
                temp_c_aplicacion=21.0,
                viento_ms_aplicacion=1.5,
                clima_fuente="open-meteo",
            )
            db.add_all([t1, t2])
            db.commit()
            print("   -> Insertados 2 tratamientos fitosanitarios de ejemplo.")

        print("7. Consolidando series diarias...")
        consolidar_todas_parcelas(dias=30)
        print("   -> Series diarias de suelo y clima consolidadas con éxito.")

        print("\n" + "=" * 60)
        print("¡INICIALIZACIÓN COMPLETADA CON ÉXITO!")
        print("=" * 60)
        print("Usuarios disponibles para iniciar sesión:")
        print("  1. Administrador:")
        print(f"     Email:    {ADMIN_EMAIL}")
        print("     Password: el valor de SEMILLA_ADMIN_PASSWORD")
        print("  2. Agricultor / Gestor:")
        print(f"     Email:    {AGRICULTOR_EMAIL}")
        print("     Password: el valor de SEMILLA_AGRICULTOR_PASSWORD")
        print("=" * 60)

    finally:
        db.close()


if __name__ == "__main__":
    sembrar()

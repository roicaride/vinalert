import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from apscheduler.schedulers.background import BackgroundScheduler

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, engine
from .routers import auth, clima_fetch, dispositivos, foliar, logs, miembros, parcelas, sensores, tratamientos
from .services.clima_scheduler import refrescar_clima_todas_parcelas
from .services.consolidacion import TZ_LOCAL, consolidar_todas_parcelas

load_dotenv()

scheduler = BackgroundScheduler()


def _programar_jobs(scheduler_: BackgroundScheduler) -> None:
    """
    Registra los trabajos periodicos. Extraido del lifespan para poder
    comprobar en un test que quedan programados: si el de consolidacion no se
    registra, clima_diario y suelo_diario no se llenan nunca y el fallo es
    silencioso.
    """
    intervalo_horas = int(os.getenv("CLIMA_INTERVALO_HORAS", "3"))
    scheduler_.add_job(
        refrescar_clima_todas_parcelas,
        "interval",
        hours=intervalo_horas,
        next_run_time=datetime.now(timezone.utc),
        misfire_grace_time=3600 * 6,
        coalesce=True,
        id="refrescar_clima",
        replace_existing=True,
    )

    # De madrugada en hora espanola: el dia anterior ya esta cerrado, tanto
    # para los agregados de la API como para las lecturas de los sensores.
    scheduler_.add_job(
        consolidar_todas_parcelas,
        "cron",
        hour=2,
        minute=0,
        timezone=TZ_LOCAL,
        misfire_grace_time=3600 * 12,
        coalesce=True,
        id="consolidar_diario",
        replace_existing=True,
    )



@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    _programar_jobs(scheduler)
    scheduler.start()
    yield
    scheduler.shutdown()


app = FastAPI(title="Vinalert API", lifespan=lifespan)

_raw_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173")
origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(parcelas.router)
app.include_router(logs.router)
app.include_router(clima_fetch.router)
app.include_router(sensores.router)
app.include_router(foliar.router)
app.include_router(tratamientos.router)
app.include_router(miembros.router)
app.include_router(dispositivos.router)


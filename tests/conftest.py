import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from app.database import Base, get_db
from app.main import app


class SesionSinCierre:
    """Envuelve una sesión de test para que `close()` no la invalide entre llamadas."""
    def __init__(self, sesion):
        self._sesion = sesion

    def __getattr__(self, nombre):
        return getattr(self._sesion, nombre)

    def close(self):
        pass


@pytest.fixture()
def db_session():
    """Motor SQLite en memoria, aislado por test (schema fresco cada vez)."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    testing_session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = testing_session_local()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client(db_session):
    """
    TestClient SIN usar `with` (a propósito): así no dispara el lifespan de
    main.py, que llamaría a Base.metadata.create_all contra el Postgres real
    y arrancaría el scheduler de clima. El esquema ya lo monta db_session
    sobre SQLite en memoria.
    """
    def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    test_client = TestClient(app)
    yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def auth_headers(client):
    client.post(
        "/auth/register",
        json={"nombre": "Test User", "email": "test@vinalert.dev", "password": "clave12345"},
    )
    resp = client.post(
        "/auth/token",
        data={"username": "test@vinalert.dev", "password": "clave12345"},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def parcela_id(client, auth_headers):
    resp = client.post(
        "/parcelas/",
        json={"nombre": "Parcela Test", "latitud": 41.0, "longitud": -3.0},
        headers=auth_headers,
    )
    return resp.json()["id"]

# Backend Viñalert (FastAPI + APScheduler)
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 TZ=Europe/Madrid
WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY migraciones ./migraciones
COPY semilla_inicial.py worker.py ./
EXPOSE 8000
# - Un solo worker: el scheduler vive dentro del proceso y no debe duplicarse.
# - --root-path /api porque nginx publica el backend bajo /api.
# - --proxy-headers: los limites de login van por IP. nginx resuelve la IP real
#   y la pasa en X-Forwarded-For; el backend no publica puertos, solo le llega
#   trafico de nginx, por eso se confia en cualquier origen.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--root-path", "/api", "--proxy-headers", "--forwarded-allow-ips", "*"]

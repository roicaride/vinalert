#!/bin/bash
# Inicia backend (FastAPI) y frontend (Vite) en paralelo.
# Uso: bash start.sh
# Ctrl+C detiene ambos procesos.

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "=== Vinalert — Iniciando servicios ==="

# Backend
uvicorn app.main:app --reload --port 8000 &
BACK_PID=$!
echo "[Backend]  PID $BACK_PID — http://127.0.0.1:8000"

# Frontend
cd "$ROOT/vinalert-front" && npm run dev &
FRONT_PID=$!
echo "[Frontend] PID $FRONT_PID — http://localhost:5173"

echo ""
echo "Ctrl+C para detener ambos servicios."

# Al recibir Ctrl+C, mata ambos procesos
trap "echo ''; echo 'Deteniendo...'; kill $BACK_PID $FRONT_PID 2>/dev/null; exit 0" INT

wait

@echo off
echo === Vinalert - Iniciando servicios ===

start "Vinalert Backend" cmd /k "cd /d %~dp0 && uvicorn app.main:app --reload --port 8000"
start "Vinalert Frontend" cmd /k "cd /d %~dp0vinalert-front && npm run dev"

echo [Backend]  http://127.0.0.1:8000
echo [Frontend] http://localhost:5173
echo.
echo Cierra las ventanas de cada servicio para detenerlos.

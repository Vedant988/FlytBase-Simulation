@echo off
echo Starting FlytBase ATC Simulation V2.0...

echo Starting Backend API Server...
start "FlytBase Backend API" cmd /k "call backend\venv\Scripts\activate && set PYTHONPATH=. && python -m uvicorn backend.api.main:app --host 0.0.0.0 --port 8000 --reload"

echo Starting Frontend React Vite Server...
start "FlytBase Frontend UI" cmd /k "cd frontend && npm install && npm run dev"

echo.
echo ========================================================
echo [SUCCESS] Backend and Frontend are starting up.
echo Backend API available at: http://localhost:8000/docs
echo Frontend UI available at: http://localhost:5173
echo ========================================================
echo.
pause

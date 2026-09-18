@echo off
chcp 65001 >nul
title SkyGuard AI - Unified Operational Launcher

echo ======================================================================
echo             SKYGUARD AI - FULL OPERATIONAL STACK LAUNCHER             
echo       FastAPI Backend + React Vite Dashboard + Telemetry Stream       
echo ======================================================================
echo.

:: 1. Launch FastAPI Backend
echo [1/3] Starting FastAPI Backend on http://127.0.0.1:8000 ...
start "SkyGuard AI - Backend (Port 8000)" cmd /k "python -m uvicorn skyguard_backend.main:app --host 127.0.0.1 --port 8000"

:: Wait 3 seconds for backend to initialize
timeout /t 3 /nobreak >nul

:: 2. Launch Vite Frontend Dashboard
echo [2/3] Starting React Vite Dashboard on http://localhost:5186 ...
start "SkyGuard AI - Dashboard (Port 5186)" cmd /k "npm --prefix Dashboard/sih run dev"

:: Wait 2 seconds for Vite
timeout /t 2 /nobreak >nul

:: 3. Launch Telemetry Simulator
echo [3/3] Starting Real-time Telemetry Simulator (2 Hz loop) ...
start "SkyGuard AI - Telemetry Simulator" cmd /k "python simulator/stream_simulator.py --rate-hz 2.0 --loop"

:: Open browser
timeout /t 2 /nobreak >nul
echo.
echo Opening SkyGuard Operations Console in default browser...
start http://localhost:5186

echo.
echo ======================================================================
echo All SkyGuard AI operational services are running!
echo • Dashboard: http://localhost:5186
echo • Backend API: http://127.0.0.1:8000/docs
echo • Active Telemetry Stream: Ingesting live records across 46 stations
echo ======================================================================
echo.
pause

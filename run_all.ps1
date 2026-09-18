# SkyGuard AI - Unified Operational Stack Launcher (PowerShell)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "            SKYGUARD AI - FULL OPERATIONAL STACK LAUNCHER             " -ForegroundColor Cyan
Write-Host "       FastAPI Backend + React Vite Dashboard + Telemetry Stream       " -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

$RootPath = $PSScriptRoot
if (-not $RootPath) {
    $RootPath = Get-Location
}

# 1. Start FastAPI Backend
Write-Host "[1/3] Starting FastAPI Backend on http://127.0.0.1:8000 ..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd `"$RootPath`"; python -m uvicorn skyguard_backend.main:app --host 127.0.0.1 --port 8000"

Start-Sleep -Seconds 3

# 2. Start React Dashboard
Write-Host "[2/3] Starting React Vite Dashboard on http://localhost:5186 ..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd `"$RootPath`"; npm --prefix Dashboard/sih run dev"

Start-Sleep -Seconds 2

# 3. Start Telemetry Stream Simulator
Write-Host "[3/3] Starting Real-time Telemetry Simulator (2 Hz loop) ..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd `"$RootPath`"; python simulator/stream_simulator.py --rate-hz 2.0 --loop"

Start-Sleep -Seconds 2

Write-Host ""
Write-Host "Opening SkyGuard Operations Console in browser..." -ForegroundColor Yellow
Start-Process "http://localhost:5186"

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "All SkyGuard AI operational services are now running!" -ForegroundColor Cyan
Write-Host "• Dashboard:   http://localhost:5186" -ForegroundColor White
Write-Host "• Backend API: http://127.0.0.1:8000/docs" -ForegroundColor White
Write-Host "• Telemetry:   Active stream across 46 AWS stations" -ForegroundColor White
Write-Host "======================================================================" -ForegroundColor Cyan

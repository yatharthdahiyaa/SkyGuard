@echo off
chcp 65001 >nul
echo ======================================================================
echo        SKYGUARD AI - OPERATIONAL BENCHMARK EVALUATION SUITE
echo   India Meteorological Department (IMD) / MoES Compliance Check
echo ======================================================================
echo.

python evaluate_harness.py %*

echo.
pause

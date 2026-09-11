# SkyGuard AI - Operational Benchmark Evaluation Suite (PowerShell)
param (
    [switch]$ForceRun,
    [string]$Benchmark = "DATA/skyguard_groundtruth_benchmark.parquet",
    [string]$OutputJson = "EVAL/skyguard_evaluation_report.json"
)

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "        SKYGUARD AI - OPERATIONAL BENCHMARK EVALUATION SUITE          " -ForegroundColor Cyan
Write-Host "   India Meteorological Department (IMD) / MoES Compliance Check      " -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

$cmdArgs = @("evaluate_harness.py", "--benchmark", $Benchmark, "--output-json", $OutputJson)

if ($ForceRun) {
    $cmdArgs += "--force-run"
}

python @cmdArgs

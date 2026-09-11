"""
SkyGuard AI - Evaluation Benchmark Router
File: routers/evaluation.py
Provides live access to MoES / IMD evaluation benchmark metrics and execution.
"""

import os
import sys
import json
import asyncio
import logging
from pathlib import Path
from fastapi import APIRouter, HTTPException, status

router = APIRouter(prefix="/evaluation", tags=["Evaluation"])
logger = logging.getLogger("SkyGuard.EvaluationRouter")

REPORT_PATH = Path("EVAL/skyguard_evaluation_report.json")


def _read_report() -> dict:
    if not REPORT_PATH.exists():
        # Fallback path if running from subfolder
        alt_path = Path("../EVAL/skyguard_evaluation_report.json")
        if alt_path.exists():
            with open(alt_path, "r", encoding="utf-8") as f:
                return json.load(f)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evaluation report not found. Run benchmark harness first."
        )
    with open(REPORT_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


@router.get(
    "/report",
    summary="Fetch latest ground-truth evaluation benchmark report"
)
async def get_evaluation_report():
    """Returns the latest MoES/IMD benchmark evaluation report with 100% live fidelity."""
    try:
        return _read_report()
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to read evaluation report: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/run",
    summary="Trigger on-demand execution of the official evaluation benchmark harness"
)
async def run_evaluation_benchmark():
    """Executes evaluate_harness.py in a non-blocking subprocess and returns the new report."""
    logger.info("Triggering live evaluation benchmark harness run...")
    try:
        proc = await asyncio.create_subprocess_exec(
            sys.executable,
            "evaluate_harness.py",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()

        if proc.returncode != 0:
            logger.error("Harness failed with code %d: %s", proc.returncode, stderr.decode())
            raise HTTPException(
                status_code=500,
                detail=f"Benchmark execution failed: {stderr.decode()}"
            )

        logger.info("Evaluation benchmark harness completed successfully.")
        return _read_report()
    except Exception as e:
        logger.error("Failed to execute benchmark: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

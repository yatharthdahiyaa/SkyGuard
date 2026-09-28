"""
SkyGuard AI - Operational Meteorological Network & Sensor Health Engine
Hugging Face Spaces Entrypoint (Gradio SDK 100% Free Tier - 16 GB RAM)
File: app.py
"""

import os
import logging
from skyguard_backend.main import app

logger = logging.getLogger("SkyGuard.HFEntrypoint")

try:
    import gradio as gr

    with gr.Blocks(title="SkyGuard AI — Mission Operations Console", theme=gr.themes.Soft(primary_hue="blue")) as demo:
        gr.Markdown(
            """
            # 🛰️ SkyGuard AI — Automated AWS Network & Sensor Health Console
            **Real-Time Layer 2 Anomaly Detection · August-Roche-Magnus Thermodynamic Invariants · IDW Spatial Consensus**
            
            [🚀 **Open Fullscreen Live Operations Console**](/) &nbsp;|&nbsp; [📘 **Swagger REST API Documentation**](/docs) &nbsp;|&nbsp; [🔍 **Diagnostic Healthcheck**](/api/v1/health)
            """
        )
        gr.HTML(
            """
            <div style="border-radius: 12px; overflow: hidden; border: 1px solid #334155; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3); margin-top: 12px;">
                <iframe src="/" style="width: 100%; height: 860px; border: none;"></iframe>
            </div>
            """
        )

    # Mount Gradio at /gradio so FastAPI serves our React UI at / and API at /api/v1
    app = gr.mount_gradio_app(app, demo, path="/gradio")

except Exception as e:
    logger.warning("Gradio mount skipped (%s); running direct ASGI FastAPI.", e)


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 7860))
    logger.info("Starting SkyGuard AI server on port %d...", port)
    uvicorn.run(app, host="0.0.0.0", port=port)

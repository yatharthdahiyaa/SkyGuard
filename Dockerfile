# =============================================================================
# SkyGuard AI - Production Cloud Container (Free Cloud Hosting Ready)
# Builds React Vite Frontend & runs FastAPI Layer 2 Analytics + ML Pipeline
# Zero-cost deployment ready for Render, Koyeb, Railway, Hugging Face Spaces
# =============================================================================

# --- Stage 1: Build React Vite Frontend ---
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY Dashboard/sih/package*.json ./
RUN npm ci

COPY Dashboard/sih/ ./
RUN npm run build

# --- Stage 2: Install Python Dependencies ---
FROM python:3.11-slim AS python-builder
WORKDIR /install

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY skyguard_backend/requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# --- Stage 3: Final Production Image ---
FROM python:3.11-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy pre-compiled Python packages
COPY --from=python-builder /install /usr/local

# Copy compiled frontend assets
COPY --from=frontend-builder /app/frontend/dist /app/Dashboard/sih/dist

# Copy core engine, backend, and benchmark datasets
COPY skyguard_core /app/skyguard_core
COPY skyguard_backend /app/skyguard_backend
COPY DATA /app/DATA

# Setup non-root user UID 1000 required by Hugging Face Spaces
RUN useradd -m -u 1000 user && \
    mkdir -p /app/skyguard_backend && \
    chown -R user:user /app && \
    chmod -R 777 /app /tmp

USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PYTHONPATH="/app" \
    PYTHONUNBUFFERED=1 \
    HOST=0.0.0.0 \
    PORT=7860 \
    DATABASE_URL="sqlite+aiosqlite:////tmp/skyguard.db" \
    ENABLE_EMBEDDED_SIMULATOR=true \
    SERVE_STATIC_FRONTEND=true

EXPOSE 7860

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT:-7860}/api/v1/health || exit 1

CMD ["sh", "-c", "uvicorn skyguard_backend.main:app --host 0.0.0.0 --port ${PORT:-7860}"]

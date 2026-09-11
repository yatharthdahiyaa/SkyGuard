FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONUNBUFFERED=1 \
    BACKEND_URL="http://backend:8000" \
    MQTT_HOST="mosquitto" \
    MQTT_PORT=1883 \
    RATE_HZ=5.0 \
    LOOP="true" \
    DATASET_PATH="/app/DATA/skyguard_groundtruth_benchmark.parquet"

CMD ["python", "stream_simulator.py"]

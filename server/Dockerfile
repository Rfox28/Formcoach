FROM python:3.11-slim

# libgl1/libglib2.0-0: runtime libs opencv-python-headless still needs even
# though it has no GUI deps. ffmpeg: gives OpenCV's video backend broader
# phone-codec support than the slim base image ships by default. curl: used
# once below to fetch the pose model at build time.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the pose model at build time (same model/URL the client used
# to fetch at runtime from a CDN) so a cold container start never depends on
# an extra network round-trip to Google's storage before it can serve a
# request.
RUN curl -L -o pose_landmarker_full.task \
    https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task

COPY main.py .

# Render sets $PORT at runtime; shell-form CMD is required for the variable
# to actually expand (exec-form JSON array CMD does not do shell expansion).
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}

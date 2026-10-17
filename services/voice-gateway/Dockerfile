FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .
COPY auth ./auth
COPY live ./live

ENV PORT=8080
EXPOSE 8080

# Native threads keep Firestore gRPC and Gemini's asyncio thread unpatched.
# Each active WebSocket occupies one thread (Cloud Run's default concurrency is 80).
CMD exec gunicorn --bind :$PORT --workers 1 --worker-class gthread --threads 100 --timeout 0 app:app

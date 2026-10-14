FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .
COPY auth ./auth

ENV PORT=8080
EXPOSE 8080

CMD exec gunicorn --bind :$PORT --workers 1 --worker-class gevent --timeout 0 app:app

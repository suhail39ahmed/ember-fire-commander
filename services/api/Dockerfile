FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py identity.py dashboard.py config_route.py audit_routes.py sites_routes.py ./
COPY auth ./auth

COPY observations ./observations
COPY photos ./photos
COPY incidents ./incidents
COPY notifications ./notifications

ENV PORT=8080
EXPOSE 8080

CMD exec gunicorn --bind :$PORT --workers 1 --threads 8 --timeout 0 app:app

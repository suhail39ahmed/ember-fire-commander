FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY ingest ./ingest
COPY fixtures ./fixtures

# Cloud Run job: runs once to completion per execution.
CMD ["python", "-m", "ingest.run"]

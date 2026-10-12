# jobs/ingest

**Hourly FIRMS, weather, and PSI data ingest** (Cloud Run job + Cloud Scheduler)

## Role

The ingest job runs **hourly** (via Cloud Scheduler) to:

- Fetch NASA FIRMS hotspots (24 h active fire data for Sumatra and Kalimantan)
- Fetch Open-Meteo weather data (wind, temperature, humidity, rain) for each hotspot
- Fetch data.gov.sg PSI (Pollutant Standards Index) for cross-border smoke context
- Compute an explainable 0–100 *spread-risk* score for each hotspot
- Write leads to Firestore for volunteers to verify

These are **leads to verify**, never "fires". The risk score is hand-weighted and is not a probability.

## Architecture

- **Cloud Run job:** runs to completion on schedule, scale to zero when idle
- **Cloud Scheduler:** triggers the job every hour (cron: `0 * * * *`)
- **Firestore database:** `FIRESTORE_DATABASE=ember-db` (set via Cloud Run env var)
- **Service account:** `sa-ingest@ember-fire-commander.iam.gserviceaccount.com` with Secret Manager access to FIRMS and data.gov.sg API keys
- **BigQuery (planned):** archive raw FIRMS and weather data for back-testing the risk score

## Phase 1

This directory is **planned** and not yet built. Phase 1 ships the three services and the web app to unblock deploy pipelines.

Phase 2 will add the ingest job, risk scoring logic, and lead ingestion.

## Deployment

A deploy workflow (`deploy-ingest.yml`) will build this directory and deploy to Cloud Run as a job. The Cloud Scheduler trigger will be created by Terraform.

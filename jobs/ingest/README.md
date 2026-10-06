# ember-ingest

Cloud Run job for hourly ingestion of external data sources.

## Data Sources

### NASA FIRMS
- VIIRS and MODIS thermal anomaly detections
- 7-day rolling window (keyless) or historical with MAP_KEY
- Attribution required: "NASA FIRMS"
- Disclaimer: Not for tactical decision-making (per NASA)

### data.gov.sg PSI
- Singapore's official Pollutant Standards Index
- Real-time air quality readings by region
- 24-hour PSI bands: Unhealthy (101-200), Very Unhealthy (201-300)

### Open-Meteo
- Archive-grade weather for back-tests
- Hourly: temperature, humidity, wind speed/direction, precipitation
- Used for Risk Ranker historical scoring
- Non-commercial use terms apply

## Processing Pipeline

1. **Fetch**: Pull latest data from each source (HTTPS REST APIs)
2. **Transform**: Normalize timestamps, coordinates, field names
3. **Load BigQuery**: Append to archive tables (`firms`, `psi`, `weather`)
4. **Compute Risk Scores**: Run Risk Ranker on new FIRMS detections
   - Dryness (days since rain)
   - Atmosphere (temperature, RH, precipitation forecast)
   - Wind (speed, direction)
   - Local fire load (nearby detections in last 7 days)
   - Peat (overlap with peat-soil mask)
5. **Sync to Firestore**: Write top-N ranked leads to `ops/{opId}/leads/{leadId}`

## Tech Stack

- **Language:** Python 3.11+
- **Deployment:** Cloud Run job (scheduled via Cloud Scheduler)
- **Schedule:** Hourly cron
- **Storage:** BigQuery (archive) + Firestore (active leads)
- **Secrets:** API keys from Secret Manager

## Risk Ranker

Explainable 0–100 spread-risk score with five components:
- Dryness (days since rain, dry-spell length)
- Atmosphere (temperature, RH, precipitation probability)
- Wind (speed, direction relative to population centers)
- Local fire load (nearby detections count, total FRP)
- Peat (percentage overlap with peat-soil mask)

Hand-weighted formula, published with back-test results.

## Development

*Coming soon: Virtual environment setup, local testing, BigQuery schema, deployment*

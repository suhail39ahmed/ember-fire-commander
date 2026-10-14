# jobs/ingest

**Hourly FIRMS, weather and PSI ingest** (Cloud Run job `ember-ingest` + Cloud Scheduler). Issue #26.

FIRMS hotspots are **leads to verify, never fires**. NASA FIRMS is not for tactical use. Nothing here
writes `incidents`, sets a severity, or dispatches anyone. Wind reaches WITHDRAW only through the
agents rule.

## What one run does

| Source | Writes (Firestore `ember-db`) | Notes |
|---|---|---|
| NASA FIRMS area API (`VIIRS_SNPP_NRT`, last 24 h, bbox `95,-6,119,6`) | `leads/{id}` | Needs `FIRMS_MAP_KEY` (Secret Manager) |
| Open-Meteo current weather at the demo point | `weather/current` | No key. `windKmh` is in **km/h** |
| data.gov.sg PSI (v2 real-time) | `psi/current` | Key optional (`DATA_GOV_SG_API_KEY` raises rate limits) |
| — | `ingestRuns/{runId}` | Per-source `ok` / `error` for every run |

Each source runs on its own. If one fails, the run report says so, the job exits non-zero (shows as a
failed execution), and whatever was stored before is left untouched. Ingest never deletes anything.

## Shapes

### `leads/{id}` (FIRMS hotspot). Read by the re-ignition watch (#25)

```jsonc
{
  "id": "firms-3f0c9a1e2b7d4c55",   // sha1(source|lat|lng|acqAt): same detection -> same doc
  "kind": "firms_hotspot",
  "source": "firms",                 // "seed" for hand-seeded demo leads
  "firmsSource": "VIIRS_SNPP_NRT",   // "hand-seeded" for seeds
  "seeded": true,                    // only on hand-seeded leads
  "satellite": "N", "instrument": "VIIRS",
  "lat": -1.85012, "lng": 110.05387,
  "acqAt": "2026-10-14T05:40:00Z",   // satellite pass time, UTC
  "confidence": "low|nominal|high|unknown",
  "frpMw": 7.84,                     // fire radiative power, MW (may be null)
  "brightnessK": 338.91,             // bright_ti4 (VIIRS) or brightness (MODIS)
  "daynight": "D",
  "label": "unverified_lead",        // always
  "needsHumanVerification": true,    // always
  "confirmedFire": false,            // always; ingest never sets true
  "disclaimer": "Satellite hotspot. A lead for a person to verify, not a confirmed fire. ...",
  "status": "to_verify",             // set on first sight only; people/services own it after that
  "firstSeenAt": "2026-10-14T06:00:00Z",
  "lastSeenAt": "2026-10-14T07:00:00Z",
  "ingestRunId": "20261014T070000Z-ab12cd"
}
```

On re-ingest, `status`, `firstSeenAt`, `verifiedBy`, `verifiedAt` and `incidentId` are kept as they are.

### `weather/current`

`{ source: "open-meteo", lat, lng, observedAt, windKmh, windDirDeg, gustKmh, tempC, humidityPct, precipMm, fetchedAt, ingestRunId }`
The agents rule (`services/agents/fusion/store.py`) reads `windKmh` against `EMBER_WIND_WITHDRAW_KMH`.

### `psi/current`

`{ source: "data.gov.sg", observedAt, updatedAt, psi24h: {north, south, east, west, central}, psi24hMax, pm25_24h: {...}, fetchedAt, ingestRunId }`
Singapore PSI is cross-border haze context only, not a forecast.

## Run it

```bash
cd jobs/ingest
pip install -r requirements-dev.txt
python -m pytest -q                                          # unit tests, no network
python -m ingest.run --fixtures tests/fixtures --dry-run     # one run on recorded fixtures, prints stored docs
python -m ingest.run --seed-demo                             # hand-seeded demo leads into Firestore (fallback)
```

`--seed-demo` writes `fixtures/demo_leads.json` (two leads next to the demo scenario) with the same labels.
It needs Firestore credentials (`gcloud auth application-default login`, `GOOGLE_CLOUD_PROJECT=ember-fire-commander`).

## Environment

`GOOGLE_CLOUD_PROJECT`, `FIRESTORE_DATABASE` (`ember-db`), `EMBER_FIRMS_BBOX`, `EMBER_FIRMS_SOURCE`,
`EMBER_FIRMS_DAYS` (1), `EMBER_WEATHER_LAT` / `EMBER_WEATHER_LNG` (demo point), `EMBER_HTTP_TIMEOUT_S` (20).
`FIRMS_MAP_KEY` / `DATA_GOV_SG_API_KEY` are read from the env if set, else from Secret Manager at run time.

## Deploy

Terraform (`infra/terraform/ingest.tf`) owns the job, env vars and the hourly scheduler (`0 * * * *` UTC).
`.github/workflows/deploy-ingest.yml` builds this folder, updates the job image, and can run it once.
BigQuery archive and the spread-risk score are not built yet.

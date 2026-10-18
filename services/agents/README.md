# ember-agents

**Agent service for incident fusion and planning** (Cloud Run, private, asia-southeast1)

## Role

The agents service is the **private** Python (Flask) service on Cloud Run that runs the fusion pipeline in deterministic code and calls Gemini through the `google-genai` SDK. It:

- Ingests observations from volunteers (via `voice-gateway` and `ember-api` notifications)
- Deduplicates and clusters nearby observations into shared incidents
- Fuses reports, photos, GPS positions, and satellite leads into one incident with a transparent evidence score
- Detects and surfaces conflicts (e.g. "small flame" vs "no flame") without averaging them
- Computes an explainable 0–100 spread-risk score for each incident
- Proposes tasks for volunteers (verify, investigate, monitor)
- Pauses for human-in-the-loop approval by the supervisor before dispatch

## Architecture

- **Private service:** only `ember-api` and `voice-gateway` can invoke `ember-agents`. It has no public ingress.
- **Firestore database:** `FIRESTORE_DATABASE=ember-db` (set via Cloud Run env var).
- **Service account:** `sa-ember-agents@ember-fire-commander.iam.gserviceaccount.com` with least-privilege IAM bindings.
- **Gemini via Agent Platform:** uses service-account auth, so no Gemini API key is needed.

## Current state

All private routes described in `docs/api/api-map.md` are implemented:

- `POST /internal/observations/{id}/intake` — fusion, conflict detection, WITHDRAW rules
- `POST /internal/observations/{id}/triage` — Gemini Flash photo triage (Spotter)
- `POST /internal/incidents/{id}/suggestions` — Gemini Flash supervisor advisory (Assist)
- `POST /internal/incidents/{id}/ask` — Gemini Flash ad-hoc supervisor question (Assist)
- `POST /internal/observations/{id}/translate` — Gemini Flash report translation (Assist)
- `POST /internal/incidents/{id}/summary` — Gemini Flash incident summary (Spotter)
- `POST /internal/sites/scan` — re-ignition watch (Sites)
- `POST /internal/practice` — grounded Gemini Flash practice coach (Guide)

Sub-packages: `fusion/` (rules, store), `spotter/` (photo triage, summary), `assist/` (suggestions, ask, translate), `practice/`, `sites/`.

## Fusion rules (`fusion/`)

`POST /internal/observations/{observationId}/intake` (shared contract §8) reads the
observation from `ember-db`, runs the deterministic rules in `fusion/rules.py`, and
writes incidents, conflicts, tasks, and audit rows in one batch. It returns `202`.

- **Cluster:** an observation joins the nearest open, held, or verified incident
  with a member within `EMBER_CLUSTER_RADIUS_M` (default 300 m). Otherwise it starts
  a new incident. The incident stores `observationIds`.
- **Evidence score:** 0-100, the sum of the points in `evidenceFactors`
  (severity, corroboration, photo, GPS precision, conflict penalty). Two more
  factors, `wind` (the weather station's speed) and `satellite` (the nearest unverified
  lead within `EMBER_SATELLITE_RADIUS_M` and `EMBER_SATELLITE_WINDOW_H`), are worth 0
  points: they explain the picture and change no score or rule.
- **Join record:** after placing a report, agents write `observation_joins/{id}` with
  the radius used, how many other reports were within it and the nearest distance.
  The first placement is kept.
- **Conflict:** flame versus no-flame in one cluster opens a conflict. Both
  observations stay as they are, the higher severity is kept, the incident is
  `held`, each volunteer gets a proposed `verify` task, and a `conflict.open` audit
  row (`actorId: code`) records when it began.
- **WITHDRAW:** a `large_flame` report, or wind at or above
  `EMBER_WIND_WITHDRAW_KMH` (default 40, read from `weather/current.windKmh`),
  sets `incident.withdraw`, creates approved `withdraw` tasks, and appends a
  `task.withdraw` audit with `actorId: code`. No approval step.
- Code only raises severity. It never verifies, extinguishes, or lowers it, and a
  `live` report's severity is not copied onto the incident.

Tests: `pip install -r requirements-dev.txt && pytest`.

## Local development

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
export EMBER_AGENTS_PORT=8082
export FIRESTORE_DATABASE=ember-db
python app.py
```

Local ports: web `5173`, ember-api `8080`, ember-agents `8082`.
The agents app reads `PORT` first (for Cloud Run), then `EMBER_AGENTS_PORT`, and defaults to `8082`.
The API reads `PORT`, then `EMBER_API_PORT`, and defaults to `8080`.
Set `EMBER_AGENTS_URL=http://localhost:8082` in the API process so it can invoke the local agents.
Use separate terminals for the Python services; a `PORT` value set in one terminal does not configure the other.
Neither Python app loads `.env.local` automatically, so export those values before starting it.

Test the health check:

```bash
curl http://localhost:8082/healthz
```

## Docker build (local verification)

```bash
docker build -t ember-agents-test .
docker run -p 8080:8080 -e FIRESTORE_DATABASE=ember-db ember-agents-test
curl http://localhost:8080/healthz
```

## Deployment

The `.github/workflows/deploy-agents.yml` workflow builds from `services/agents` and deploys to Cloud Run. It is **manual dispatch only** and runs only from the `main` branch.

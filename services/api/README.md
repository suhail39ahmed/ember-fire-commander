# ember-api

**REST API for EMBER fire commander** (Cloud Run, public, asia-southeast1)

## Role

The REST API is the main backend for both the volunteer PWA and the supervisor console. It:

- Manages sessions and roles (volunteer, supervisor) via Firebase ID token verification
- Issues short-lived signed upload URLs for photo uploads to Cloud Storage
- Proxies Maps and Weather API calls (so the browser never directly calls them)
- Handles approvals: supervisor can approve, edit, or reject proposed tasks
- Provides incident and digest reads for the UI
- Sends FCM push notifications (task dispatch, WITHDRAW alerts)
- Writes to an append-only audit log in Firestore

All client access to Firestore and Storage goes through `ember-api`. The browser has no direct Firestore listeners and never calls the Maps or Weather APIs directly.

## Architecture

- **Backend-mediated:** the browser talks only to `ember-api` (REST) and `voice-gateway` (WSS).
- **Firestore database:** `FIRESTORE_DATABASE=ember-db` (set via Cloud Run env var).
- **Service account:** `sa-ember-api@ember-fire-commander.iam.gserviceaccount.com` with least-privilege IAM bindings.

## Phase 1 (current)

This is a **walking skeleton** with:
- `GET /healthz` returning `200` for Cloud Run health checks
- `GET /me` stub endpoint for the web app to call

No secrets, no Gemini API keys, no service-account JSON. The deploy pipeline builds this directory and deploys to Cloud Run `ember-api`.

## Local development

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
export PORT=8080
export FIRESTORE_DATABASE=ember-db
python app.py
```

Test the health check:

```bash
curl http://localhost:8080/healthz
```

## Docker build (local verification)

```bash
docker build -t ember-api-test .
docker run -p 8080:8080 -e FIRESTORE_DATABASE=ember-db ember-api-test
curl http://localhost:8080/healthz
```

## Deployment

The `.github/workflows/deploy-api.yml` workflow builds from `services/api` and deploys to Cloud Run. It is **manual dispatch only** and runs only from the `main` branch.

After this PR merges, a maintainer can trigger the workflow from the Actions tab.

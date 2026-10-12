# voice-gateway

**WebSocket relay to Gemini Live** (Cloud Run, public, asia-southeast1)

## Role

The voice gateway is a WebSocket server that relays push-to-talk audio and ~1 fps camera frames from the volunteer's PWA to Gemini Live. It:

- Verifies Firebase ID token and App Check token on the WebSocket upgrade request
- Opens a Gemini Live session with the shared incident digest as context
- Relays audio and video to Gemini Live
- Streams Bahasa audio replies back to the volunteer
- Writes immutable observations (from Gemini tool calls like `submit_observation`) to Firestore
- Enforces per-user Live-minute caps
- Notifies `ember-agents` when new observations arrive

## Architecture

- **Backend-mediated:** the browser opens a WSS connection to `voice-gateway` only after Firebase Auth and App Check succeed.
- **Firestore database:** `FIRESTORE_DATABASE=ember-db` (set via Cloud Run env var).
- **Service account:** `sa-voice-gateway@ember-fire-commander.iam.gserviceaccount.com` with least-privilege IAM bindings.
- **Cloud Run timeout:** 3600 seconds (1 hour) to support long WebSocket sessions. Session affinity is enabled.

## Phase 1 (current)

This is a **walking skeleton** with:
- `GET /healthz` returning `200` for Cloud Run health checks

No secrets, no Gemini API keys, no WebSocket server yet. The deploy pipeline builds this directory and deploys to Cloud Run `voice-gateway`.

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
docker build -t voice-gateway-test .
docker run -p 8080:8080 -e FIRESTORE_DATABASE=ember-db voice-gateway-test
curl http://localhost:8080/healthz
```

## Deployment

The `.github/workflows/deploy-voice-gateway.yml` workflow builds from `services/voice-gateway` and deploys to Cloud Run. It is **manual dispatch only** and runs only from the `main` branch.

After this PR merges, a maintainer can trigger the workflow from the Actions tab.

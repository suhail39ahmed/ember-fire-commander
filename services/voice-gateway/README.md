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

## Upgrade authentication

The WebSocket is served at `/`, the URL in `VITE_VOICE_GATEWAY_WSS_URL` with no extra path. `GET /healthz` stays public.

The upgrade reads the same two headers as the shared contract:

- `Authorization: Bearer <Firebase ID token>`
- `X-Firebase-AppCheck: <App Check token>`

A missing, invalid, expired, or revoked ID token closes the socket before a Gemini session is created. A token with no `role` claim, or a role other than `volunteer` or `supervisor`, closes it the same way. The close message is `{"type":"session.closed","reason":"unauthorized"}`.

`APP_CHECK_ENFORCE` defaults to `false`, matching ember-api and the Cloud Run setting. The App Check token is still verified. When the flag is false, a missing or invalid App Check token is logged and a valid ID token is enough. Set `APP_CHECK_ENFORCE=true` to close the socket on that failure.

An accepted upgrade stays open. This service does not start Gemini Live, relay audio, or write observations yet.

The browser `WebSocket` API cannot set these headers. The PWA keeps voice unavailable until the contract defines a browser handshake. This service does not accept the tokens on the query string.

## Local development

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
export PORT=8080
export FIRESTORE_DATABASE=ember-db
export APP_CHECK_ENFORCE=false
python app.py
```

Upgrade tests cover accepted and rejected credentials and assert that no Gemini session is created:

```bash
pip install -r requirements-dev.txt
pytest
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

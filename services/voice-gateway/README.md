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

Two authentication paths are supported (§7):

**Native clients** send the two identity headers:
- `Authorization: Bearer <Firebase ID token>`
- `X-Firebase-AppCheck: <App Check token>`

A missing, invalid, expired, or revoked ID token closes the socket before a Gemini session is created. A token with no `role` claim, or a role other than `volunteer` or `supervisor`, closes it the same way. The close message is `{"type":"session.closed","reason":"unauthorized"}`.

`APP_CHECK_ENFORCE` defaults to `false`, matching ember-api and the Cloud Run setting. The App Check token is still verified. When the flag is false, a missing or invalid App Check token is logged and a valid ID token is enough. Set `APP_CHECK_ENFORCE=true` to close the socket on that failure.

**Browser clients (PWA)** send a short-lived voice ticket in `Sec-WebSocket-Protocol`:
1. The PWA calls `POST /voice/ticket` on ember-api to get a 60-second single-use ticket.
2. The PWA opens `new WebSocket(url, [ticket])` — the browser sends the ticket in `Sec-WebSocket-Protocol`.
3. The gateway reads the ticket from `Sec-WebSocket-Protocol`, verifies and atomically consumes it from `voiceTickets/{ticket}` in `ember-db`, and echoes the subprotocol in the 101 response (browsers require this). App Check is not re-checked here: ember-api already enforced it when it issued the ticket.

The service does not accept tokens on the query string.

An accepted upgrade waits for `session.start`, then relays audio and about one camera frame per second to Gemini Live. The caller's digest is injected into that session. `submit_observation` stores one immutable `live` observation from the phone's latest location, then notifies `ember-agents`. The socket closes about 30 seconds after the reply, on `session.stop`, or with `cap_reached` when `LIVE_MINUTE_CAP_USER` (default 10) or `LIVE_MINUTE_CAP_OP` (default 60) is used up. Minute usage is counted per instance, so a reconnect does not reset it. Wind and engine noise do not open a turn: activity detection is manual.

## Local development

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
export PORT=8080
export FIRESTORE_DATABASE=ember-db
export APP_CHECK_ENFORCE=false
# Optional: run services/agents on port 8082 so live observations reach intake.
export EMBER_AGENTS_URL=http://localhost:8082
python app.py
```

Tests cover rejected upgrades, a scripted push-to-talk session, and the Live-minute cap. The scripted session does not call Gemini:

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

## Live gate (14 Oct 2026)

Not passed. The gate is a push-to-talk report on a real phone through the deployed `voice-gateway` in asia-southeast1 that stores the step 2 observation. Singapore-region latency was not measured. Gemini Live has no Asia endpoint (`LIVE_LOCATION` defaults to `us-central1`), so the measurement needs that deployed gateway and a client in Singapore. This workspace has no Agent Platform credential for `sa-voice-gateway`. The scripted session against the test double does pass.

## Deployment

The `.github/workflows/deploy-voice-gateway.yml` workflow builds from `services/voice-gateway` and deploys to Cloud Run. It is **manual dispatch only** and runs only from the `main` branch.

After this PR merges, a maintainer can trigger the workflow from the Actions tab.

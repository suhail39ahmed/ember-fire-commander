# EMBER architecture

![EMBER architecture](ember_infra_v2.png)

| File | What it is |
|---|---|
| `ember_infra_v2.png` | Main architecture diagram |
| `ember_infra_v2.drawio` | Editable source (diagrams.net / draw.io) |
| `ember_infra_simple_data_paths.png` | Earlier simplified data-paths view |

Project `ember-fire-commander`, primary Google Cloud region **asia-southeast1** (Singapore). Gemini Live is configured in `us-central1`. Human call media traverses LiveKit Cloud; its routing is separate from the Google Cloud region.

**Status (19 Oct 2026):** the infrastructure is live, defined in Terraform (`infra/terraform`, state in `gs://ember-fire-commander-tfstate`) and changed only through the pipeline. Application code is deployed across all services. The architecture diagram above predates the LiveKit call path. Interfaces are defined in [`docs/contracts/shared-contract.md`](../contracts/shared-contract.md). The route lookup is in [`docs/api/api-map.md`](../api/api-map.md). The LiveKit call runbook is in [`docs/demo/livekit-test.md`](../demo/livekit-test.md).

## 1. The backend-mediated rule

Application state and Gemini access go through our backend. Media uses three paths:

1. **Photo and video upload:** `ember-api` issues a short-lived V4 **signed URL**, and the PWA uploads the file with an HTTPS `PUT` straight to the private bucket.
2. **Live voice and transcription:** the PWA opens a ticket-authenticated **WSS** connection to `voice-gateway`, which holds the Gemini Live session and the per-speaker transcription sessions.
3. **Human calls:** participant browsers exchange media through **LiveKit Cloud** using short-lived, room-scoped tokens issued by `ember-api`. The supervisor publishes microphone audio only; the volunteer can publish camera and microphone.

There is no browser-to-Firestore access: no client listeners and no client SDK reads. Firestore and Storage rules are deny-all. The PWA and console get updates through `ember-api` REST polling, the shared digest on the Live WebSocket, and **FCM** push for tasks and WITHDRAW. Map tile calls go from the browser using the referrer-restricted Maps JavaScript key. No other Maps or Weather calls go from the browser.

**Offline:** Report and Task share photo/video attachments and optional notes. Up to four photos and one video are submitted through an IndexedDB outbox with stable retry IDs, `capturedAt`, position, and task context. A note can be sent on its own. Selected files remain in memory until submission; live calls require connectivity.

### Supervisor call and transcript path

```text
Supervisor popup → ember-api: create incident call → FCM / foreground invitation
Volunteer accepts → ember-api: scoped participant tokens
Volunteer camera + mic ↔ LiveKit Cloud ↔ Supervisor (mic only)
Each local mic → voice-gateway /calls/transcription → Gemini transcription
              → Firestore calls/{callId}/events → same ordered history on both screens
Supervisor question → ember-api → ember-agents: incident facts + recent call context
Supervisor taps Send → existing instruction / notification flow → Volunteer
```

The API owns invitation, acceptance, membership, heartbeat, expiry, and room cleanup. Invitations expire after 45 seconds; calls have a 30-minute limit. Each participant transcribes only their own unmuted microphone through a separate voice-gateway session; this path does not write observations or send instructions. Supervisors can explicitly save JPEG snapshots to incident media. Automatic translation, private AI voice dictation, and call-media recording are not implemented.

Integration: `apps/web/src/livekit/`, `supervisor/detail/IncidentCallPopup.tsx`, `pwa/screens/ProfileConnectivity.tsx`, `services/api/calls/`, and `services/voice-gateway/live/transcription.py`.

## 2. Live voice and video path

- **Gemini assistance relay.** PWA → `voice-gateway` (Cloud Run, WSS, 3600 s timeout, session affinity) → `gemini-live-2.5-flash-native-audio` (Vertex AI, `us-central1`), with audio plus about 1 fps camera frames, and replies both ways. The gateway verifies the voice ticket (via `Sec-WebSocket-Protocol`), enforces per-user and per-operation Live-minute caps, injects the shared digest, and writes observations from the model's `submit_observation` tool calls.
- **Call transcription.** Each participant in a LiveKit call also opens a separate voice-gateway WSS session at `/calls/transcription`. This session transcribes only that participant's own microphone through Gemini, writing to a shared ordered event log in Firestore. It does not relay video frames or produce Bahasa replies.
- **Browser WebSocket auth (voice ticket):** browsers cannot send custom headers on WebSocket upgrades. The PWA calls `POST /voice/ticket` on `ember-api` to get a 60-second single-use ticket, then opens `new WebSocket(url, [ticket])`. The browser sends the ticket in `Sec-WebSocket-Protocol`. The gateway reads, verifies, and atomically consumes the ticket from Firestore, then echoes the same subprotocol value in the 101 response (browsers require this).
- **Push-to-talk bursts:** a Gemini assistance session opens on button press, uses manual activity detection so wind and engine noise do not open a turn, and closes about 30 s after the reply.

## 3. Components

| Component | Role | Status |
|---|---|---|
| Volunteer PWA + supervisor console (React/Vite/TS, one codebase, role-based routes) | Push-to-talk, camera preview, video recording, chips, offline outbox, WITHDRAW flow, SMS fallback, Guide screen, profile. Console: incident queue, expanded volunteer view with live panel, decision panel, map, approvals, audit log, re-ignition alerts | live |
| Firebase Hosting | Serves the web app over a global CDN | live |
| Firebase Auth | Google sign-in. The role is the `role` custom claim (`volunteer` or `supervisor`) on the ID token; `ember-api` reads it and never takes a role from the request. `POST /volunteers/register` and `POST /supervisors/register` assign the claim on self-registration | live |
| Firebase App Check | reCAPTCHA Enterprise (Fraud Defense), TTL 6 h, sent as `X-Firebase-AppCheck` and checked by the backend. Log-only until production (`APP_CHECK_ENFORCE=false`) | live |
| FCM | Task, WITHDRAW, and supervisor-alert pushes, sent by `ember-api` | live |
| Cloud Run `ember-api` (public) | Auth and roles, signed URLs for photos and video, approvals, incidents, digest, dashboard, training, practice relay, voice tickets, FCM, audit log, call lifecycle, scoped LiveKit tokens | live |
| Cloud Run `voice-gateway` (public, WSS) | Voice ticket verification, Gemini Live relay, caps, observation writes, shared call transcription. `LIVE_MODEL=gemini-live-2.5-flash-native-audio`, `LIVE_LOCATION=us-central1` | live |
| Cloud Run `ember-agents` (private) | Intake → fusion → conflict → score → WITHDRAW rules; Spotter (photo triage); Assist (suggestions/ask/translate/call-frame-describe); Summary; Practice coach; Sites scan. Only `sa-ember-api` and `sa-voice-gateway` can invoke it | live |
| Cloud Run job `ember-ingest` + Cloud Scheduler | Hourly FIRMS hotspots, Open-Meteo weather, and data.gov.sg PSI. Writes `leads/`, `weather/current`, `psi/current` in Firestore | live |
| LiveKit Cloud | Volunteer video and two-way call audio; supervisor publishes microphone audio only. Room-scoped tokens issued by `ember-api` | live; requires `livekit_url` and secret values |
| Firestore Native `ember-db` | Shared incident state with point-in-time recovery and daily backups. Client access is deny-all | live |
| Cloud Storage photo/video bucket | Private (uniform access, public access prevention). Photos deleted after 14 days, videos after 7 days. Signed-URL PUT uploads; signed-URL GET for supervisor playback | live |
| Secret Manager | `FIRMS_MAP_KEY`, `DATA_GOV_SG_API_KEY`, `MAPS_SERVER_API_KEY`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (last two scoped to `sa-ember-api`) | live |
| Artifact Registry `ember` | Images, with a cleanup policy | live |
| Maps JS + Map ID / Weather API | Map display (browser key) and weather lookups (server key, through `ember-api`) | live |
| Vertex AI (Agent Platform) | Gemini Live (`us-central1`) and Gemini Flash (`asia-southeast1`), service-account auth | live |
| Workload Identity Federation | GitHub Actions auth for Terraform and deploys — no JSON keys | live |
| Budgets, Logging | Cost alerts (alert-only); application logs | budget alerts live |

## 4. Shared incident state (Firestore `ember-db`)

Collections: `ops`, `volunteers`, `voiceTickets` (60-second TTL), `pings` (24-hour TTL), `observations` (immutable), `photoUploads`, `videoUploads`, `leads`, `incidents`, `conflicts`, `tasks`, `crews`, `digest`, `audit`, `sites` (re-ignition watch), `sites_meta`, `photo_triage`, `incident_summaries`, `incident_suggestions`, `observation_translations`, `trainingProgress`, `ingestRuns`, `weather`, `psi`. Call state adds `calls` (with `members` and ordered `events` subcollections), `callLocks`, `callCodes`, `callSnapshots`, and incident `liveSeats`; standalone tests use `testCalls`.

Only backend service accounts write. Every supervisor action appends an `audit` record. Code must open the named database through the `FIRESTORE_DATABASE=ember-db` setting.

## 5. Fusion and decision rules

- **Code decides, Gemini talks and looks.** Geometry, evidence scores, conflict detection, and safety rules are deterministic Python. Flash reads photos and writes prose. Live converses and calls tools.
- **Conflicts are surfaced, never averaged.** If one volunteer reports a small flame and another reports none at the same spot, the incident keeps the higher severity, a conflict is opened, dispatch is held, and both volunteers get a VERIFY task.
- **Safety:** a `large_flame` observation, or wind at or above `EMBER_WIND_WITHDRAW_KMH` (default 40 km/h, read from `weather/current.windKmh`), immediately sets `incident.withdraw`, creates approved `withdraw` tasks, and appends a `task.withdraw` audit with `actorId: code`. No approval step. Dispatch always needs supervisor approval.
- **Human-only actions:** only a supervisor can verify or extinguish an incident or lower its severity. Code may raise severity. Nothing in the client, and nothing returned by the model, can do those three.

## 6. Identities (least privilege)

| Service account | Used by | Key permissions |
|---|---|---|
| `sa-ember-api` | ember-api | datastore.user, Firebase Auth admin, Token Creator (signed URLs for photo/video bucket), Maps server key secret, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` secrets, invokes ember-agents |
| `sa-voice-gateway` | voice-gateway | datastore.user, aiplatform.user, invokes ember-agents |
| `sa-ember-agents` | ember-agents | datastore.user, aiplatform.user, storage.objectViewer on photo bucket |
| `sa-ember-ingest` | ember-ingest | FIRMS and data.gov.sg secrets, datastore.user, logWriter |
| `sa-ember-terraform` | GitHub Actions (terraform.yml) | Owner-lite roles for managing infra |
| `sa-ember-deployer` | GitHub Actions (deploy-*.yml) | run.developer, firebasehosting.admin, Artifact Registry writer, actAs the 4 runtime service accounts |

## 7. Honesty rules

1. FIRMS hotspots are **leads to verify**, never "fires". NASA states FIRMS is not for tactical use.
2. There is no haze, plume, or spread forecast. Rankings and corridors are labelled *indicative*.
3. Every number spoken or shown comes from a tool return value or a database field.
4. Personas and field sessions are simulated; no NGO or agency endorsement is claimed.
5. Privacy: no faces, 14-day photo deletion, 7-day video deletion, crew-only location sharing with opt-out, and TTL on pings.

# EMBER architecture

![EMBER architecture](ember_infra_v2.png)

| File | What it is |
|---|---|
| `ember_infra_v2.png` | Main diagram |
| `ember_infra_v2.drawio` | Editable source (diagrams.net / draw.io) |
| `ember_infra_simple_data_paths.png` | Simplified data paths view (an earlier design that only shows the request paths. The live path is the same as in v2) |

Project `ember-fire-commander`, primary Google Cloud region **asia-southeast1** (Singapore). Gemini Live is configured in `us-central1`. Human call media also traverses LiveKit Cloud; its routing is separate from the Google Cloud region.

**Status (18 Oct 2026):** the application implements reporting, task responses, incident workflows, Gemini assistance, and supervisor-initiated LiveKit calls with shared transcripts. The latest call/media changes require current service deployments and two-device verification. Terraform defines Google Cloud infrastructure; LiveKit credentials are configured separately. The image above predates the LiveKit path described below. Interfaces are documented in the [shared contract](../contracts/shared-contract.md), the [API map](../api/api-map.md), and the [call runbook](../demo/livekit-test.md).

## 1. The backend-mediated rule

Application state and Gemini access go through our backend. Media uses these paths:

1. **Photos and recorded videos:** `ember-api` issues short-lived V4 signed upload/read URLs for the private bucket.
2. **Gemini voice and transcription:** the browser opens a ticket-authenticated **WSS** connection to `voice-gateway`, which owns the Gemini session.
3. **Human calls:** participant browsers exchange media through **LiveKit Cloud** using short-lived, room-scoped tokens issued by `ember-api`. The supervisor publishes microphone audio only; the volunteer can publish camera and microphone.

There is no browser-to-Firestore access: no client listeners and no client SDK reads. Firestore and Storage rules are deny-all. The PWA and console get updates through `ember-api` REST (polling), the shared digest on the Live WebSocket, and **FCM** push for tasks and WITHDRAW. Maps and Weather **data** calls go through `ember-api`. Only map tiles load in the browser, using a referrer-restricted Maps JavaScript key.

**Offline:** Report and Task share photo/video attachments and optional notes. Up to four photos and one video are submitted through an IndexedDB outbox with stable retry IDs, `capturedAt`, position and task context. A note can be sent on its own. Selected files remain in memory until submission; live calls require connectivity.

### Supervisor call and transcript path

```text
Supervisor popup -> ember-api: create incident call -> FCM / foreground invitation
Volunteer accepts -> ember-api: scoped participant tokens
Volunteer camera + mic <-> LiveKit Cloud <-> Supervisor (mic only)
Each local mic -> voice-gateway /calls/transcription -> Gemini input transcription
               -> Firestore calls/{callId}/events -> same history on both screens
Supervisor question -> ember-api -> ember-agents: incident facts + recent call context
Supervisor taps Send -> existing instruction / notification flow -> Volunteer
```

The API owns invitation, acceptance, membership, heartbeat, expiry and room cleanup. Invitations expire after 45 seconds; calls have a 30-minute limit and end after a participant is absent for 60 seconds. Reads and heartbeats enforce expiry; a background expiry sweeper is deferred. Closing the popup requires confirmation to end the call. A pending manual join code may be claimed by any signed-in volunteer for hackathon testing; the first join uses that volunteer's real identity and does not reassign written tasks.

Each participant sends only their own unmuted microphone to Gemini. Separate per-speaker Gemini sessions produce one shared ordered event log with call ID, speaker ID, event/segment IDs, sequence, timestamp, text and completion state. Partial updates replace the same segment; reconnects replay after a sequence cursor. Membership checks and publisher leases prevent unauthorized access and duplicate publishers. Transcription does not itself create observations or send instructions.

The supervisor can explicitly save JPEG snapshots to incident media. Optional sampled frames provide separate visual descriptions about once per minute; raw interpretation frames are not stored. Ember AI questions/suggestions receive bounded recent transcript and visual context. Automatic translation, private AI voice dictation, transcript retention cleanup and call-media recording are not implemented.

Integration: `apps/web/src/livekit/`, `supervisor/detail/IncidentCallPopup.tsx`, `pwa/screens/ProfileConnectivity.tsx`, `services/api/calls/`, and `services/voice-gateway/live/{transcription,shared_transcripts}.py`. Report/Task attachments share `apps/web/src/pwa/report/` components.

## 2. Live path decision

- **Default Gemini assistance: relay.** PWA → `voice-gateway` (Cloud Run, WSS, 3600 s timeout, session affinity) → the configured `LIVE_MODEL`. The gateway verifies identity/App Check through its upgrade flow, enforces usage caps, injects the shared digest, and writes observations from reporting tool calls. This assistance flow is separate from LiveKit human calls and their transcription-only sessions.
- **Fallback (Preview): direct.** The phone connects to Gemini Live directly with a single-use **ephemeral token** minted by `voice-gateway`. This needs the Gemini Developer API. It's used **only** if the latency test from Singapore shows the relay misses its targets. If we switch, it becomes a documented third exception to the backend rule, and the caps move into the token constraints.
- **Push-to-talk bursts:** a Live session opens on button press, uses manual activity detection so wind and engine noise don't trigger it, and closes about 30 s after the reply.

## 3. Components

| Component | Role | Status |
|---|---|---|
| Volunteer PWA + supervisor console (React/Vite/TS, one codebase, role-based routes) | Push-to-talk, camera, chips, tasks, WITHDRAW screen, outbox. Console has the shared map, verification queue, conflicts and approvals | in progress |
| Firebase Hosting | Serves the web app over a global CDN | live |
| Firebase Auth | Google sign-in. The role is the `role` custom claim (`volunteer` or `supervisor`) on the ID token; `ember-api` reads it and never takes a role from the request. No SMS | live (Google provider); sign-in and role routes in the web app |
| Firebase App Check | reCAPTCHA Enterprise (Fraud Defense), TTL 6 h, sent as `X-Firebase-AppCheck` and checked by the backend. Enforced before the demo | live; `ember-api` checks it in log-only mode |
| FCM | Task, WITHDRAW and supervisor-alert pushes, sent by `ember-api` | live (VAPID key) |
| Cloud Run `ember-api` (public) | Auth, incidents/tasks, signed media URLs, FCM, audit, call lifecycle and scoped LiveKit tokens | implemented; latest changes require deployment |
| Cloud Run `voice-gateway` (public, WSS) | Gemini assistance, usage caps, observation writes and shared call transcription | implemented; latest changes require deployment |
| Cloud Run `ember-agents` (private) | ADK graph: intake → dedupe/cluster → fusion → conflict → score → consolidate → plan, with a human-in-the-loop pause. Only the api and gateway service accounts can invoke it | live service, code in progress |
| Gemini Live (`LIVE_MODEL`) | Voice assistance and separate per-speaker call transcription sessions | implemented |
| Gemini Flash (`agents_flash_model`) | Photo triage, summaries, advisory answers and call-frame descriptions | implemented |
| Agent Platform Evals / Memory Bank | Scenario evals, consented memory | planned / optional |
| Firestore Native `ember-db` | Shared incident state, with point-in-time recovery and daily backups. Client access is deny-all | live |
| Cloud Storage photo bucket | Private (uniform access, public access prevention), 14-day lifecycle, soft delete | live |
| LiveKit Cloud | Human call video/audio with API-issued room-scoped tokens | implemented; two-device verification required |
| Secret Manager | FIRMS, data.gov.sg and Maps keys; new LiveKit key/secret scoped to ember-api | LiveKit wiring requires Terraform apply and secret values |
| Artifact Registry `ember` | Images, with a cleanup policy | live |
| Maps JS + Map ID / Weather API | Map display (browser key) and weather lookups (server key, through `ember-api`) | live (keys) |
| Cloud Scheduler + Cloud Run job `ember-ingest`, BigQuery | Hourly FIRMS, PSI and weather pulls, plus archive and back-test tables | planned |
| Budgets, Logging, Monitoring | Cost alerts, traces, latency, cost counters | budget alerts live (console); traces and counters planned |

## 4. Shared incident state (Firestore `ember-db`)

Collections: `ops`, `volunteers`, `pings` (24 h TTL), `observations` (immutable), `leads`, `incidents`, `conflicts`, `tasks`, `crews`, `digest`, `audit`, `sites` (re-ignition watch). Only the backend service accounts write. Every supervisor action appends an `audit` record. Code must open the named database through the `FIRESTORE_DATABASE=ember-db` setting.

Call state adds `calls` with `members` and ordered `events` subcollections, `callLocks`, `callCodes`, `callSnapshots`, and incident `liveSeats`. Standalone connectivity tests use separate `testCalls` membership/events. Clients receive authorized backend delivery and never read these collections directly.

## 5. Fusion and decision rules

- **Code decides, Gemini talks and looks.** Geometry, evidence scores, conflict detection and safety rules are deterministic Python. Flash only reads photos and writes prose, and Live only converses and calls tools.
- **Conflicts are surfaced, never averaged.** If one volunteer reports a small flame and another reports none at the same spot, the incident keeps the higher severity, a conflict is opened, dispatch is held, and both volunteers get a VERIFY task.
- **Safety:** large flames or high wind → **WITHDRAW upwind** to nearby crews immediately, with no approval needed, and it's logged. Dispatch always needs supervisor approval. Only a human can verify or extinguish an incident or lower its severity.
- **Evidence so far:** deterministic fusion and conflict code and tests live in `services/agents/`. Synthetic tests do not establish field accuracy; thresholds still need practitioner tuning.

## 6. Identities (least privilege)

| Service account | Used by | Key permissions |
|---|---|---|
| `sa-ember-api` | ember-api | Firestore user, Firebase Auth admin, media URL signing, Maps and LiveKit secrets, invokes ember-agents |
| `sa-voice-gateway` | voice-gateway | Firestore user, Agent Platform user, invokes ember-agents |
| `sa-ember-agents` | ember-agents | Firestore user, Agent Platform user |
| `sa-ember-ingest` | ember-ingest *(planned)* | FIRMS and data.gov.sg secrets, logging |
| `sa-ember-terraform` / `sa-ember-deployer` | GitHub Actions through Workload Identity Federation | Terraform apply / Cloud Run deploy (actAs the runtime service accounts only) |

## 7. Honesty rules

**LiveKit deployment:** Terraform creates empty key/secret containers first. Add enabled versions outside Terraform, then configure `livekit_url` to mount both secrets on ember-api. Key values never enter Terraform state or the browser bundle. Local `.env` settings do not configure Cloud Run. See the [runbook](../demo/livekit-test.md#cloud-run-configuration-with-terraform).

1. FIRMS hotspots are **leads to verify**, never "fires". NASA states FIRMS is not for tactical use.
2. There is no haze, plume or spread forecast. Rankings and corridors are labelled *indicative*.
3. Every number spoken or shown comes from a tool or database value.
4. Personas and field sessions are simulated, no NGO or agency endorsement is claimed, and EMBER never sends agency reports itself.
5. Privacy: no faces, 14-day photo deletion, crew-only location sharing with opt-out, and TTL on pings.

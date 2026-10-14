# EMBER architecture

![EMBER architecture](ember_infra_v2.png)

| File | What it is |
|---|---|
| `ember_infra_v2.png` | Main diagram |
| `ember_infra_v2.drawio` | Editable source (diagrams.net / draw.io) |
| `ember_infra_simple_data_paths.png` | Simplified data paths view (an earlier design that only shows the request paths. The live path is the same as in v2) |

Project `ember-fire-commander`, region **asia-southeast1** (Singapore). Gemini Live runs in a US region because it has no Asia endpoint, so it is the only cross-region hop.

**Status (14 Oct 2026):** the infrastructure is live, defined in Terraform (`infra/terraform`, state in `gs://ember-fire-commander-tfstate`) and changed only through the pipeline. The application code is in progress; `ember-api` serves `GET /me` behind Firebase ID-token checks (App Check log-only), the web app has Google sign-in with role-based routes, and the other two services are skeletons. Interfaces between components are defined in [`docs/contracts/shared-contract.md`](../contracts/shared-contract.md). Items marked *planned* are not built yet.

## 1. The backend-mediated rule

The UI talks **only to our backend**, and the backend talks to Google Cloud, third parties and the database. There are two exceptions:

1. **Photo upload:** `ember-api` issues a short-lived V4 **signed URL**, and the PWA uploads the still with an HTTPS `PUT` straight to the private bucket.
2. **Live voice and video:** the PWA opens a **WSS** connection to `voice-gateway`, which holds the Gemini Live session.

There is no browser-to-Firestore access: no client listeners and no client SDK reads. Firestore and Storage rules are deny-all. The PWA and console get updates through `ember-api` REST (polling), the shared digest on the Live WebSocket, and **FCM** push for tasks and WITHDRAW. Maps and Weather **data** calls go through `ember-api`. Only map tiles load in the browser, using a referrer-restricted Maps JavaScript key.

**Offline:** the PWA keeps an IndexedDB outbox (chips, text reports, photos) and replays it to `ember-api` when it's back online. Observations carry `capturedAt` so late reports merge correctly.

## 2. Live path decision

- **Default: relay.** PWA → `voice-gateway` (Cloud Run, WSS, 3600 s timeout, session affinity) → Gemini 3.8 Live, with audio plus about 1 fps camera frames, and replies both ways. The gateway verifies the Firebase ID token and App Check, enforces per-user and per-operation Live-minute caps, injects the shared digest, and writes observations from the model's `submit_observation` tool calls.
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
| Cloud Run `ember-api` (public) | Auth and roles, signed URLs, approvals, incident and digest reads, Maps/Weather proxy, FCM, audit | live service; `GET /me` and identity middleware done, other routes in progress |
| Cloud Run `voice-gateway` (public, WSS) | Live relay, caps, observation writes. Runs as `sa-voice-gateway` | live service, code in progress |
| Cloud Run `ember-agents` (private) | ADK graph: intake → dedupe/cluster → fusion → conflict → score → consolidate → plan, with a human-in-the-loop pause. Only the api and gateway service accounts can invoke it | live service, code in progress |
| Gemini 3.8 Live | Bahasa voice and video conversation through tools | in progress |
| Gemini 3.8 Flash | Photo triage and Bahasa/English summaries | planned |
| Agent Platform Evals / Memory Bank | Scenario evals, consented memory | planned / optional |
| Firestore Native `ember-db` | Shared incident state, with point-in-time recovery and daily backups. Client access is deny-all | live |
| Cloud Storage photo bucket | Private (uniform access, public access prevention), 14-day lifecycle, soft delete | live |
| Secret Manager | `FIRMS_MAP_KEY`, `DATA_GOV_SG_API_KEY`, `MAPS_SERVER_API_KEY`, each with its own accessor | live |
| Artifact Registry `ember` | Images, with a cleanup policy | live |
| Maps JS + Map ID / Weather API | Map display (browser key) and weather lookups (server key, through `ember-api`) | live (keys) |
| Cloud Scheduler + Cloud Run job `ember-ingest`, BigQuery | Hourly FIRMS, PSI and weather pulls, plus archive and back-test tables | planned |
| Budgets, Logging, Monitoring | Cost alerts, traces, latency, cost counters | budget alerts live (console); traces and counters planned |

## 4. Shared incident state (Firestore `ember-db`)

Collections: `ops`, `volunteers`, `pings` (24 h TTL), `observations` (immutable), `leads`, `incidents`, `conflicts`, `tasks`, `crews`, `digest`, `audit`, `sites` (re-ignition watch). Only the backend service accounts write. Every supervisor action appends an `audit` record. Code must open the named database through the `FIRESTORE_DATABASE=ember-db` setting.

## 5. Fusion and decision rules

- **Code decides, Gemini talks and looks.** Geometry, evidence scores, conflict detection and safety rules are deterministic Python. Flash only reads photos and writes prose, and Live only converses and calls tools.
- **Conflicts are surfaced, never averaged.** If one volunteer reports a small flame and another reports none at the same spot, the incident keeps the higher severity, a conflict is opened, dispatch is held, and both volunteers get a VERIFY task.
- **Safety:** large flames or high wind → **WITHDRAW upwind** to nearby crews immediately, with no approval needed, and it's logged. Dispatch always needs supervisor approval. Only a human can verify or extinguish an incident or lower its severity.
- **Evidence so far:** the fusion and conflict prototype was tested on a **synthetic** GPS-noise simulation (300 scenarios). The prototype is **not yet in this repository**. Thresholds are placeholders that need field tuning.

## 6. Identities (least privilege)

| Service account | Used by | Key permissions |
|---|---|---|
| `sa-ember-api` | ember-api | Firestore user, Firebase Auth admin, signs URLs for the photo bucket, Maps server key secret, invokes ember-agents |
| `sa-voice-gateway` | voice-gateway | Firestore user, Agent Platform user, invokes ember-agents |
| `sa-ember-agents` | ember-agents | Firestore user, Agent Platform user |
| `sa-ember-ingest` | ember-ingest *(planned)* | FIRMS and data.gov.sg secrets, logging |
| `sa-ember-terraform` / `sa-ember-deployer` | GitHub Actions through Workload Identity Federation | Terraform apply / Cloud Run deploy (actAs the runtime service accounts only) |

## 7. Honesty rules

1. FIRMS hotspots are **leads to verify**, never "fires". NASA states FIRMS is not for tactical use.
2. There is no haze, plume or spread forecast. Rankings and corridors are labelled *indicative*.
3. Every number spoken or shown comes from a tool or database value.
4. Personas and field sessions are simulated, no NGO or agency endorsement is claimed, and EMBER never sends agency reports itself.
5. Privacy: no faces, 14-day photo deletion, crew-only location sharing with opt-out, and TTL on pings.

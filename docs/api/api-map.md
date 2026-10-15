# EMBER API map

Lookup of the HTTP and WebSocket surface as the code serves it, and which client calls each route. Field rules, enums, and error codes are defined in [`docs/contracts/shared-contract.md`](../contracts/shared-contract.md). When this file and the contract disagree, the contract wins; the last section lists the places the code already differs.

The browser talks only to `ember-api` (REST) and `voice-gateway` (WebSocket). It does not read Firestore. A photo `PUT` goes to a signed Cloud Storage URL that `ember-api` issued. Map tiles load in the browser with the referrer-restricted Maps key.

| Service | Code | Default local port |
|---|---|---|
| `ember-api` | `services/api/` | `8080` (`VITE_EMBER_API_URL`, `VITE_API_BASE_URL`) |
| `voice-gateway` | `services/voice-gateway/` | `8080` (`VITE_VOICE_GATEWAY_WSS_URL`) |
| `ember-agents` | `services/agents/` | `8082` (`EMBER_AGENTS_URL`, server-side only) |

Clients:

| Caller | File |
|---|---|
| Sign-in identity | `apps/web/src/auth/api.ts` — `GET /me` |
| Volunteer PWA | `apps/web/src/pwa/api/client.ts`, `apps/web/src/pwa/push/pushClient.ts` |
| Supervisor console | `apps/web/src/supervisor/api/client.ts` |
| Supervisor chrome | `apps/web/src/supervisor/chromeClient.ts` — `GET /dashboard` |
| Shared types | `apps/web/src/pwa/contracts/types.ts`, `apps/web/src/supervisor/contracts.ts` |

## Auth

Protected REST routes and the WebSocket upgrade require:

| Header | Value |
|---|---|
| `Authorization` | `Bearer <Firebase ID token>` |
| `X-Firebase-AppCheck` | `<App Check token>` |

`GET /healthz` on each service is public. `POST /internal/notifications/withdraw` skips the Firebase user check and accepts a Google ID token for the `ember-agents` service account.

The role is the Firebase custom claim `role`: `volunteer` or `supervisor`. A missing or invalid ID token is `401` `unauthorized`. A valid token with no role is `403` `role_missing`. The wrong role is `403` `forbidden`. App Check is verified and, while `APP_CHECK_ENFORCE` is false, a bad App Check token is logged and does not reject the call.

Error body:

```json
{ "error": { "code": "validation_error", "message": "...", "fields": { "chip": "..." } } }
```

`fields` is present on `validation_error` only. `409` uses `code: "conflict"`.

## Enums

| Name | Values |
|---|---|
| Role | `volunteer`, `supervisor` |
| Observation source | `live`, `chip`, `text`, `photo` |
| Chip | `asap`, `api`, `aman`, `butuh_bantuan` |
| Severity | `none`, `smoke`, `small_flame`, `large_flame`, `unknown` |
| Severity order (low to high) | `none`, `smoke`, `small_flame`, `large_flame`. `unknown` does not raise or lower a known severity |
| Incident status | `open`, `held`, `verified`, `extinguished` |
| Task type | `verify`, `withdraw`, `investigate` |
| Task status | `proposed`, `approved`, `rejected` |
| Conflict status | `open`, `resolved` |
| Chip → stored severity | `asap` → `smoke`, `api` → `small_flame`, `aman` → `none`, `butuh_bantuan` → `unknown`. `text` and `photo` store `unknown` |

Defined in `services/api/incidents/rules.py` and `services/api/observations/validate.py`.

## ember-api

Handlers: `services/api/app.py`, `observations/routes.py`, `photos/routes.py`, `incidents/routes.py`, `notifications/routes.py`, `dashboard.py`.

Incident list and detail responses use `INCIDENT_FIELDS`: `id`, `name`, `area`, `status`, `severity`, `evidenceScore`, `conflictId`, `withdraw`, `lat`, `lng`. Digest summaries drop `evidenceScore` and `conflictId`. `observationIds` and `evidenceFactors` stay in Firestore and are not returned. A task is `id`, `incidentId`, `volunteerId`, `type`, `status`, `instruction`. A conflict is `id`, `incidentId`, `observationIds`, `higherSeverity`, `status`, `dispatchHeld`.

| Method | Path | Who may call | Called by | Body | Success |
|---|---|---|---|---|---|
| GET | `/healthz` | public | probes | — | `200` `{ status, service, firestore_database }` |
| GET | `/me` | any role | both apps, after sign-in | — | `200` `{ id, displayName, role }` |
| GET | `/dashboard` | supervisor | console chrome, every 15 s | — | `200` `{ agency, serverTime, approvalsCount }`. `agency` is a string or `null` (`volunteers/{uid}.agency`). `serverTime` is ISO-8601 UTC. `approvalsCount` is how many tasks are `proposed`. A volunteer is `403` |
| POST | `/observations` | any role | PWA | chip, text, or photo observation. Optional `clientId` (1–128 of `[A-Za-z0-9._-]`) | `201` stored observation, or `200` the first observation when `clientId` repeats |
| PUT, PATCH, DELETE | `/observations` and `/observations/{id}` | any role | nobody | — | `409` `conflict`, observations are immutable |
| POST | `/photos/upload-url` | volunteer | PWA | `{ "contentType": "image/jpeg" \| "image/webp" }` | `201` `{ uploadUrl, method: "PUT", headers, photoPath, expiresAt }` |
| GET | `/incidents` | any role, scoped | console | — | `200` incident array. Supervisor: status `open`, `held`, or `verified`. Volunteer: incidents linked to their observations, tasks, or withdraw |
| GET | `/incidents/{id}` | any role, scoped | console | — | `200` `{ incident, observations, conflict, tasks }`. A volunteer not on the incident gets `404`, and only their own tasks |
| GET | `/digest` | any role, scoped | PWA (polls every 5 s) | — | `200` `{ updatedAt, incidents, myTasks }`. `myTasks` is empty for a supervisor |
| POST | `/tasks/{id}/approve` | supervisor | console | none | `200` `{ task, auditId }`. `proposed` → `approved`. `investigate` is `409` while a conflict is open. `withdraw` is `409` |
| POST | `/tasks/{id}/reject` | supervisor | console | none | `200` `{ task, auditId }`. `proposed` → `rejected`. `withdraw` is `409` |
| POST | `/tasks/{id}/edit` | supervisor | console | `{ "instruction": string }` max 500 characters | `200` `{ task, auditId }`. Replaces `instruction` only. A withdraw instruction is `409` |
| POST | `/incidents/{id}/verify` | supervisor | console | none | `200` `{ incident, auditId }`. Status must be `open` or `held` |
| POST | `/incidents/{id}/extinguish` | supervisor | **not called by the console** | none | `200` `{ incident, auditId }`. `409` if already extinguished |
| POST | `/incidents/{id}/severity` | supervisor | **not called by the console** | `{ "severity": "none" \| "smoke" \| "small_flame" \| "large_flame" }` | `200` `{ incident, auditId }` only when the new value is strictly lower. `unknown` is rejected |
| POST | `/incidents/{id}/withdraw` | supervisor | **not called by the console** | `{ volunteerIds, instruction, reasons? }` | `200` `{ incident, auditId }`. Sets `withdraw`, creates one approved `withdraw` task per id, pushes after commit. Each id must already have an observation or a task on the incident |
| POST | `/notifications/token` | volunteer | PWA | `{ "token": string, "volunteerId"?: own uid }` | `200` `{ stored: boolean }` |
| DELETE | `/notifications/token` | volunteer | PWA | same body | `200` `{ removed: boolean }` |
| POST | `/internal/notifications/withdraw` | `ember-agents` service account | agents, after a code WITHDRAW | `{ incidentId, tasks: [{ id, volunteerId }] }` | `202` `{ results }`. Reads the stored task text. Does not undo the incident write |

`POST /observations` rejects `source: "live"`. The gateway writes live observations. `source: "photo"` is accepted here after `POST /photos/upload-url` and a successful `PUT` of the bytes. The contract text in §6.2 still says photo is rejected on this route; the code accepts it. See the differences section.

There is no route that reads `audit`, clears `withdraw`, raises severity, sets incident status to `open` or `held`, or sets a conflict to `resolved`.

### Photo bytes

`POST /photos/upload-url` returns a short-lived V4 signed URL. The PWA `PUT`s the still to that URL with the returned `Content-Type`, then `POST /observations` with `source: "photo"` and the returned `photoPath`. The path is private. Upload records live in `photoUploads`. Client: `apps/web/src/pwa/photo/`.

### Polling

The PWA polls `GET /digest` and the console polls `GET /incidents` (and reloads the open incident) every 5 seconds (`POLL_MS` in `VolunteerApp.tsx` and `SupervisorConsole.tsx`). The console chrome polls `GET /dashboard` every 15 seconds (`CHROME_POLL_MS` in `ConsoleProvider.tsx`). During a Live session the gateway also sends `digest` messages. FCM is the channel when the app is backgrounded: new tasks and withdraw instructions. Payload fields are outside the shared contract.

## voice-gateway

`GET /healthz` is public. The WebSocket is `GET /` upgraded to a socket (`services/voice-gateway/app.py`). The browser `WebSocket` API cannot set the auth headers, so the PWA keeps voice unavailable until a browser handshake exists. The service does not accept tokens on the query string.

Client → gateway: `session.start`, `location` (`lat`, `lng`, `capturedAt`, optional `accuracyM`), `audio` (base64), `frame` (base64, optional `capturedAt`), `session.stop`.

Gateway → client: `session.ready`, `audio`, `digest`, `observation.created`, `session.closed` (`reply_complete`, `idle_timeout`, `cap_reached`, `unauthorized`).

Tools the model may call: `submit_observation` (`severity`, `text`), `get_common_picture` (the caller's digest), `get_my_task` (newest approved task, withdraw preferred). Coordinates spoken by the model are discarded. A session with no `location` yet does not write an observation.

Caps: `LIVE_MINUTE_CAP_USER` (default 10) and `LIVE_MINUTE_CAP_OP` (default 60), counted per instance. Message shapes: contract §7 and `services/voice-gateway/README.md`.

## ember-agents

Private. Only the `ember-api` and `voice-gateway` service accounts can invoke it. No Firebase user auth on these handlers.

| Method | Path | Body | Success |
|---|---|---|---|
| GET | `/healthz` | — | `200` `{ status, service, firestore_database }` |
| POST | `/internal/observations/{id}/intake` | none | `202` `{ observationId }`. Idempotent once the observation is already in an incident |
| POST | `/internal/observations/{id}/triage` | optional `{ callerId }` | `200` `photo_triage` record |
| POST | `/internal/incidents/{id}/summary` | none | `200` `incident_summaries` record |
| POST | `/internal/sites/scan` | none | `200` `{ sitesWatched, sitesRemembered, sitesExpired, alertsCreated }` |

`ember-api` calls intake with a 3 second timeout after storing an observation. A failed call stays in `intakePending` and is retried later, up to 20 attempts. The observation is not refused because agents is down.

`photo_triage`, `incident_summaries`, `sites`, `leads`, `weather`, `psi`, and `ingestRuns` have no public REST route. Shapes are contract §5.7.

## Where the code and the contract already differ

| Topic | Contract | Code |
|---|---|---|
| Photo on `POST /observations` | §6.2 says `source: "photo"` is rejected on this route; the signed URL is outside the contract | The route accepts `source: "photo"` with a `photoPath` from `POST /photos/upload-url` |
| Observation fields on incident detail | §5.1 includes optional `volunteerName` and `clientId` | `GET /incidents/{id}` omits both. `POST /observations` returns them when they were stored |
| Supervisor client | §6.5 includes extinguish, lower severity, and supervisor withdraw | Those three routes exist on `ember-api`. `apps/web/src/supervisor/api/client.ts` does not call them |
| `investigate` tasks | §6.5 approves them when no conflict is open | Approve/reject handle them. Fusion creates `verify` and `withdraw` tasks only |
| Conflict `resolved` | Clients have no route that sets it | No production writer sets `resolved` |
| Audit read | §5.5 is append-only; no read route | Matches. Writes happen. Nothing lists them |
| Maps and weather proxy | Architecture notes say browser weather goes through `ember-api` | No maps or weather route in `services/api/` |

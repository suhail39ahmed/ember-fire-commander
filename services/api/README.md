# ember-api

**REST API for EMBER fire commander** (Cloud Run, public, asia-southeast1)

## Role

The REST API is the main backend for both the volunteer PWA and the supervisor console. It:

- Manages sessions and roles (volunteer, supervisor) via Firebase ID token verification
- Issues short-lived signed upload URLs for photo uploads to Cloud Storage
- Handles approvals: supervisor can approve, edit, or reject proposed tasks
- Provides incident and digest reads for the UI
- Sends FCM push notifications (task dispatch, WITHDRAW alerts)
- Writes to an append-only audit log in Firestore

All client access to Firestore and Storage goes through `ember-api`. The browser has no direct Firestore listeners. Map tiles use the referrer-restricted Maps key; this service has no Maps or weather proxy route.

## Architecture

- **Backend-mediated:** the browser talks only to `ember-api` (REST) and `voice-gateway` (WSS).
- **Firestore database:** `FIRESTORE_DATABASE=ember-db` (set via Cloud Run env var).
- **Service account:** `sa-ember-api@ember-fire-commander.iam.gserviceaccount.com` with least-privilege IAM bindings.

## Identity

`GET /me` verifies the Firebase ID token in `Authorization: Bearer <token>` and returns `id`, `displayName`, and `role`.

The role is the Firebase custom claim `role` already present on that Google sign-in token: `volunteer` or `supervisor`. Normal API routes read the claim and do not accept a role from query parameters or JSON. A verified token with no `role` claim returns `403` with `error.code` `role_missing`. Any other claim value returns `403` `forbidden`. A missing, invalid, or expired token returns `401` `unauthorized`.

`POST /volunteers/register` is the explicit PWA registration entry. It accepts no request body and requires a verified Google identity, revocation checks, and the normal App Check policy. A Google account with no role can opt into the `volunteer` custom claim. Other custom claims are preserved, and existing non-volunteer roles are rejected using both the token and the current Firebase user record. Registration is idempotent for volunteers and returns the volunteer `/me` shape. The client then refreshes its ID token and opens the existing account and permissions setup when `onboardingComplete` is false. The API identity needs permission to update Firebase Auth users. This endpoint never grants a supervisor role.

Supervisor claims are still assigned administratively in Google Cloud. The PWA registers roleless Google users as volunteers on sign-in or from the Create Account page, then refreshes the ID token. `GET /healthz` stays unauthenticated.

Protected routes also read `X-Firebase-AppCheck`. `APP_CHECK_ENFORCE` defaults to `false`: a missing or invalid App Check token is logged and the request continues. Set `APP_CHECK_ENFORCE=true` to reject it with `401` before the handler runs. That production switch is separate from this service code.

Token verification uses the Firebase Admin SDK and `GOOGLE_CLOUD_PROJECT` (default `ember-fire-commander`). No service-account JSON is stored in this repo.

## Voice ticket

`POST /voice/ticket` issues a short-lived (60-second), single-use voice ticket that the PWA uses to open the voice gateway WebSocket from a browser (§7 browser handshake).

- Requires a valid Firebase ID token with an allowed role (`volunteer` or `supervisor`).
- Verifies App Check following the same `APP_CHECK_ENFORCE` policy as all other protected routes.
- Returns `201 { "ticket": "<random>", "expiresAt": "<ISO>" }`.
- Writes `voiceTickets/{ticket}` in `ember-db` with `uid`, `displayName`, `role`, `expiresAt`, and `consumed: false`.
- The voice gateway reads and atomically consumes the ticket at upgrade time (`auth/ticket.py`).

Implemented in `voice_ticket.py`.

## Photo uploads

`POST /photos/upload-url` gives a signed-in volunteer a V4 signed `PUT` URL for one still in the private bucket `PHOTO_BUCKET` (default `ember-fire-commander-ember-photos`).

Request:

```json
{ "contentType": "image/jpeg" }
```

`contentType` is `image/jpeg` or `image/webp`. Response `201`:

```json
{
  "uploadUrl": "https://storage.googleapis.com/...",
  "method": "PUT",
  "headers": { "Content-Type": "image/jpeg" },
  "photoPath": "photos/uid_sari/20261017/3f2a....jpg",
  "expiresAt": "2026-10-17T03:05:00Z"
}
```

- The PWA sends the file with exactly that method and `Content-Type`. The URL expires after `PHOTO_UPLOAD_TTL_SECONDS` (default 300, max 900).
- Every object lives under `photos/<uid>/`. `photos.is_owned_photo_path(path, uid)` rejects another volunteer's path, so a later photo observation can only reference the caller's own upload.
- ember-api stores an upload record in the `photoUploads` collection of `ember-db` with the object path, owner and expiry. It never stores the URL or a public link.
- A supervisor receives `403 forbidden`; a bad `contentType` returns `400 validation_error`.
- Signing uses the IAM signBlob API with the Cloud Run service account. No key file is used and nothing is made public.

## Incidents, digest and approvals

Routes follow `docs/contracts/shared-contract.md` §6.3 to §6.5, and `GET /dashboard` is §6.9 (`dashboard.py`). Code for incidents lives in `incidents/`.

| Route | Who | Result |
|---|---|---|
| `GET /incidents` | both roles | Supervisor: incidents that are `open`, `held` or `verified`. Volunteer: incidents linked to their observations, tasks or a withdraw instruction |
| `GET /incidents/{id}` | both roles | `incident`, `observations`, `conflict`, `tasks`. A volunteer not on the incident gets `404` and sees only their own tasks; their membership is included when present. Volunteer detail also includes safe presentation metadata, stored reporter names, and structured conflictSummary (#195). Digest summaries carry code/place, report and participant counts, and nullable stored update/closing times; tasks add creation time and reasonCode. Metadata is read in scoped batches by incidents/volunteer_view.py; it does not expose phones or device data. A supervisor also gets `header`, `conditions`, `photoReads`, volunteer cards (with crew, team role and device) and `conflictContext` (`incidents/detail.py`, §6.3) |
| `GET /digest` | both roles | `updatedAt`, `incidents` (summaries), `myTasks` (empty for a supervisor). Volunteers may send `?lat=&lng=` for `nearby` and `myJoinRequests`, and `?sentSince=<ISO time with zone>` for `sentToday`; the phone position is not stored. `seasonStats` is optional |
| `GET /dashboard` | supervisor | `agency` (or `null`), `serverTime`, `approvalsCount` of `proposed` tasks, `joinRequestsCount` of pending requests, the live banner (`updatedAt`, `nextSatellitePass`, `liveFires`), `seasonImpact`, `charts`, and `reignitionAlert`. Figures are computed on read from stored incidents, observations, tasks, audit rows, leads, device records, and `weather/current`. Cameras, photo cadence, distance to risk, injuries, and the median target are `null` |
| `POST /incidents/{id}/join-requests` | volunteer | Asks to join a live fire. Idempotent per volunteer and incident (`join_routes.py`) |
| `GET /join-requests?status=pending`, `POST /join-requests/{id}/approve`, `/decline` | supervisor | Approval creates an approved `instruct` task (so the volunteer is linked and pushed the normal way). Audits `join.request`, `join.approve`, `join.decline` |
| `POST /sites/{id}/alerts/{id}/dismiss` | supervisor | Body `{ reason }`. Marks the alert dismissed and writes `site.dismiss`. Incident stays extinguished |
| `POST /sites/{id}/alerts/{id}/recheck` | supervisor | Creates a proposed `verify` task, writes `site.recheck`. Incident stays extinguished |
| `POST /tasks/{id}/approve`, `/reject`, `/edit` | supervisor | Proposed task decided. `investigate` approval is `409` while the incident has an open conflict. Withdraw tasks are never approved, rejected or edited |
| `POST /incidents/{id}/verify`, `/extinguish`, `/severity` | supervisor | Human-only actions. `/severity` stores the value only when it is strictly lower and never touches `withdraw`. `/extinguish` is `409` while `withdraw.active` is `true` |
| `POST /incidents/{id}/withdraw` | supervisor | Sets `withdraw`, creates approved `withdraw` tasks, no approval step |
| `POST /incidents/{id}/withdraw/safe` | supervisor | Marks one volunteer found safe. Never changes `active` |
| `POST /incidents/{id}/withdraw/clear` | supervisor | Clears the withdraw once every volunteer is confirmed safe: sets `active: false`, closes `withdraw` tasks, appends `withdraw.clear` |
| `POST /incidents/{id}/withdraw/help` | supervisor | Assigns a confirmed-safe volunteer to assist a stuck one. Creates an `instruct` task and appends `withdraw.help` |
| `GET /withdraw/events` | any role | SSE stream (`withdraw_events.py`): `data: changed` when any incident the caller is named in changes. No Firestore document content |

A volunteer gets `403 forbidden` on every write route. Each decision writes the record and its audit entry (`actorId`, `action`, `targetId`, `at`) in one Firestore transaction. No route raises severity or sets `open` or `held`.

## Phase 1 (current)

- `GET /healthz` returning `200` for Cloud Run health checks
- `GET /me` returning the signed-in user from a verified Firebase ID token
- `POST /photos/upload-url` returning a signed upload URL for the private photo bucket

No secrets, no Gemini API keys, no service-account JSON. The deploy pipeline builds this directory and deploys to Cloud Run `ember-api`.

## Local development

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements-dev.txt
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

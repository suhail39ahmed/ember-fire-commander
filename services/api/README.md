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

## Identity

`GET /me` verifies the Firebase ID token in `Authorization: Bearer <token>` and returns `id`, `displayName`, and `role`.

The role is the Firebase custom claim `role` already present on that Google sign-in token: `volunteer` or `supervisor`. ember-api reads the claim. It does not call `set_custom_user_claims`, and it does not accept a role from query parameters or JSON. A verified token with no `role` claim returns `403` with `error.code` `role_missing`. Any other claim value returns `403` `forbidden`. A missing, invalid, or expired token returns `401` `unauthorized`.

Set the claim on each Firebase Auth user in Google Cloud, then sign out and sign in again so the ID token includes it. `GET /healthz` stays unauthenticated.

Protected routes also read `X-Firebase-AppCheck`. `APP_CHECK_ENFORCE` defaults to `false`: a missing or invalid App Check token is logged and the request continues. Set `APP_CHECK_ENFORCE=true` to reject it with `401` before the handler runs. That production switch is separate from this service code.

Token verification uses the Firebase Admin SDK and `GOOGLE_CLOUD_PROJECT` (default `ember-fire-commander`). No service-account JSON is stored in this repo.

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
| `GET /incidents/{id}` | both roles | `incident`, `observations`, `conflict`, `tasks`. A volunteer not on the incident gets `404` and sees only their own tasks |
| `GET /digest` | both roles | `updatedAt`, `incidents` (summaries), `myTasks` (empty for a supervisor) |
| `GET /dashboard` | supervisor | `agency` (or `null`), `serverTime`, `approvalsCount` of `proposed` tasks. The rest of the dashboard is not on this response yet |
| `POST /tasks/{id}/approve`, `/reject`, `/edit` | supervisor | Proposed task decided. `investigate` approval is `409` while the incident has an open conflict. Withdraw tasks are never approved, rejected or edited |
| `POST /incidents/{id}/verify`, `/extinguish`, `/severity` | supervisor | Human-only actions. `/severity` stores the value only when it is strictly lower and never touches `withdraw` |
| `POST /incidents/{id}/withdraw` | supervisor | Sets `withdraw`, creates approved `withdraw` tasks, no approval step |

A volunteer gets `403 forbidden` on every write route. Each decision writes the record and its audit entry (`actorId`, `action`, `targetId`, `at`) in one Firestore transaction. No route clears `withdraw`, raises severity, or sets `open` or `held`.

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

# EMBER shared contract

This is the contract for the volunteer PWA, the supervisor console, `ember-api`, `voice-gateway`, and `ember-agents`. A workstream can be implemented from this document alone.

The browser talks only to `ember-api` (REST) and `voice-gateway` (WebSocket). Clients do not read or write Firestore or Cloud Storage. Services open Firestore with `FIRESTORE_DATABASE=ember-db`. Only backend service accounts write. Firestore and Storage rules are deny-all.

Examples below are synthetic.

## 1. Rules

1. Observations are immutable after they are stored.
2. Geometry, evidence scores, conflict detection, and safety rules are deterministic code. Gemini Live may converse and call the tools in §7. It must not set incident severity.
3. A conflict keeps the two observations side by side. Code keeps the higher severity, sets the incident to `held`, and holds dispatch. Code creates a `verify` task for each volunteer in the conflict.
4. **WITHDRAW needs no approval.** It is an instruction to specific volunteers. Code sends it immediately when an observation severity is `large_flame` or the wind rule fires. A supervisor may also send it to chosen volunteers. Both paths write the instruction, the tasks, and an audit record.
5. **Dispatch always needs supervisor approval.** Dispatch means approving a proposed task of type `investigate`. Approval is rejected while that incident has an open conflict.
6. Only a supervisor can verify an incident, extinguish it, or lower its severity. Code may raise severity. Nothing in the client, and nothing returned by the model, can do those three human actions.
7. FIRMS hotspots are leads to verify. No REST or WebSocket payload in this contract has a lead, forecast, haze, or plume field. The collections that services keep for those are internal and listed in §5.7. Every number a client shows comes from one of these payloads.
8. The direct phone-to-Gemini fallback is outside this contract. The Live path is the relay through `voice-gateway`.

Severity order, low to high: `none`, `smoke`, `small_flame`, `large_flame`. `unknown` does not raise or lower a known severity.

## 2. Identity

Protected REST routes and the WebSocket upgrade require both headers:

| Header | Value |
|---|---|
| `Authorization` | `Bearer <Firebase ID token>` |
| `X-Firebase-AppCheck` | `<App Check token>` |

A missing or invalid Firebase ID token is `401`. A valid token with no role, or the wrong role, is `403`. `/healthz` on each service stays public.

The role is the Firebase custom claim `role`: `volunteer` or `supervisor`. `ember-api` sets that claim. Clients cannot send a role in a body, and a missing claim does not default to `volunteer`.

`GET /me` returns the signed-in user.

```json
{
  "id": "uid_sari",
  "displayName": "Sari",
  "role": "volunteer"
}
```

| Field | Type | Source |
|---|---|---|
| `id` | string | Token `uid` |
| `displayName` | string | Token display name |
| `role` | `volunteer` \| `supervisor` | Custom claim `role` |

## 3. Errors

REST bodies are JSON. `Content-Type` is `application/json`.

```json
{
  "error": {
    "code": "validation_error",
    "message": "chip is not a known value",
    "fields": { "chip": "use asap, api, aman, or butuh_bantuan" }
  }
}
```

`fields` is present on `validation_error` only.

| HTTP | `code` | When |
|---|---|---|
| 400 | `validation_error` | A required field is missing or a value is outside its enum or range |
| 401 | `unauthorized` | The Firebase ID token is missing or invalid |
| 403 | `forbidden` | The caller is signed in and is not allowed to do this |
| 403 | `role_missing` | The token has no `role` claim |
| 404 | `not_found` | The id is unknown |
| 409 | `conflict` | The write breaks immutability, dispatch hold, or a severity rule |

## 4. Shared enums

| Name | Values |
|---|---|
| Role | `volunteer`, `supervisor` |
| Observation source | `live`, `chip`, `text`, `photo` |
| Chip | `asap`, `api`, `aman`, `butuh_bantuan` |
| Severity | `none`, `smoke`, `small_flame`, `large_flame`, `unknown` |
| Incident status | `open`, `held`, `verified`, `extinguished` |
| Task type | `verify`, `withdraw`, `investigate` |
| Task status | `proposed`, `approved`, `rejected` |
| Conflict status | `open`, `resolved` |

Wire value for the “butuh bantuan” chip is `butuh_bantuan`. A text-only report omits the chip.

Timestamps are ISO-8601 UTC strings. Ids are server-generated strings.

## 5. Entities

Collections used by this contract: `observations`, `incidents`, `conflicts`, `tasks`, `digest`, `audit`.

Services also keep collections that no REST route returns. They are listed in §5.7 with the field types and the service that writes them: `photo_triage`, `incident_summaries`, `sites`, `sites_meta`, `notificationAttempts`, `leads`, `weather`, `psi`, and `ingestRuns`.

### 5.1 Observation

Immutable. The stored record always has `"immutable": true`. There is no update or delete route.

| Field | Type | Set by |
|---|---|---|
| `id` | string | Server |
| `volunteerId` | string | Server, from the token |
| `capturedAt` | string | Client. The phone time of the report. Must be within [now − 7 days, now + 5 minutes] when received, otherwise `400` |
| `receivedAt` | string | Server |
| `volunteerName` | string, optional | Server, from the token display name, one line of at most 80 characters. Absent when the token has no display name. Agents use it to name the incident |
| `clientId` | string, optional | Client. The outbox item id, 1 to 128 letters, digits, `.`, `-` or `_`. Present only when the client sent it |
| `source` | source enum | Client for `chip`, `text`, and `photo`. Gateway sets `live` |
| `lat` | number, −90 to 90 | Phone |
| `lng` | number, −180 to 180 | Phone |
| `accuracyM` | number or null | Phone |
| `chip` | chip enum or null | Client when `source` is `chip` |
| `text` | string or null | Client, or the Live tool |
| `severity` | severity enum | Server. See the mapping below |
| `photoPath` | string or null | Server. A private object path, never a public URL |
| `immutable` | `true` | Server |

Chip to severity, applied by `ember-api` even if the client sends a severity:

| Chip | Severity |
|---|---|
| `asap` | `smoke` |
| `api` | `small_flame` |
| `aman` | `none` |
| `butuh_bantuan` | `unknown` |

A `text` observation is stored as `unknown`. A `live` observation stores the tool’s `severity` when it is a valid enum, and `unknown` when the tool omits it. That value stays on the observation. Agents compute incident severity separately.

`lat`, `lng`, and `capturedAt` are required. `capturedAt` may be earlier than `receivedAt` so a delayed report still sorts correctly.

### 5.2 Incident

| Field | Type | Who may change it |
|---|---|---|
| `id` | string | Nobody after create |
| `name` | string or null | Agents (fusion), once, when the incident is created. A readable label: the nearest known town or a coordinate label, the first reporter's display name when there is one, and the incident number, such as `Bengkalis, Riau · Pak Dedi · #3`. `null` on incidents created before names existed, or when naming failed. Clients show a short form of `id` then |
| `area` | string or null | Agents (fusion), once, when the incident is created. The place part of `name`: the nearest known town, such as `Bengkalis, Riau`, or a coordinate label such as `10.00°N 102.11°E`. Written even when `name` could not be. `null` on incidents created before areas existed. The console groups the queue by it |
| `status` | status enum | Agents may set `open` or `held`. A supervisor may set `verified` or `extinguished` |
| `severity` | severity enum | Agents may raise it. A supervisor may lower it. The model must not set it |
| `evidenceScore` | number | Agents. Code-computed, not a probability and not a forecast |
| `conflictId` | string or null | Agents |
| `withdraw` | object or null | Code, or a supervisor through the withdraw route in §6.5 |
| `lat` | number | Agents |
| `lng` | number | Agents |
| `observationIds` | string[] | Agents (fusion). Every observation clustered into the incident, oldest first. Stored only: no REST response returns it. Services use it to find an incident's observations and to link a volunteer to it |
| `evidenceFactors` | evidence factor[] | Agents (fusion). The factors that add up to `evidenceScore`. Stored only: no REST response returns it |

An evidence factor explains one part of `evidenceScore`. The score is the sum of the `points`, kept between 0 and 100.

| Field | Type | Notes |
|---|---|---|
| `factor` | string | `severity`, `corroboration`, `photo`, `gps`, or `conflict` |
| `points` | number | Negative for `conflict` |
| `detail` | string | A plain sentence, such as `highest reported severity is small_flame` |

`withdraw` when active:

| Field | Type | Meaning |
|---|---|---|
| `active` | `true` | The instruction is in effect |
| `instruction` | string | The sentence shown and spoken to the volunteer |
| `reasons` | string[] | Why the instruction was sent |
| `volunteerIds` | string[] | The volunteers who must follow it |

```json
{
  "active": true,
  "instruction": "Withdraw upwind. Do not engage.",
  "reasons": ["large flame reported"],
  "volunteerIds": ["uid_sari", "uid_rizal"]
}
```

Clearing `withdraw`, or lowering severity in order to dismiss it, is not a client action.

### 5.3 Task

| Field | Type | Notes |
|---|---|---|
| `id` | string | Server |
| `incidentId` | string | |
| `volunteerId` | string | One volunteer per task |
| `type` | task type | `verify`, `withdraw`, or `investigate` |
| `status` | task status | `withdraw` is stored as `approved` |
| `instruction` | string or null | Shown to the volunteer. The edit route may replace this text |

A proposed `investigate` task is a dispatch waiting for a supervisor. A `verify` task may be approved while a conflict is open. A `withdraw` task is never proposed and never waits.

### 5.4 Conflict

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `incidentId` | string | |
| `observationIds` | string[] | The original observations, unchanged |
| `higherSeverity` | severity enum | The higher of the two known severities |
| `status` | `open` \| `resolved` | Clients have no route that sets `resolved` |
| `dispatchHeld` | `true` | While `status` is `open`, investigate approval is rejected |

### 5.5 Audit

Append-only. Clients do not write audit records. Every supervisor action and every automatic WITHDRAW appends one.

| Field | Type | Notes |
|---|---|---|
| `id` | string | Server |
| `actorId` | string | The supervisor uid, or `code` when code decided |
| `action` | string | One of the names below |
| `targetId` | string | The task or incident id |
| `at` | string | Server time |

| `action` | When |
|---|---|
| `observation.create` | An observation was stored |
| `task.approve` | A supervisor approved a proposed task |
| `task.reject` | A supervisor rejected a proposed task |
| `task.edit` | A supervisor replaced a task instruction |
| `task.withdraw` | Code or a supervisor issued a withdraw instruction |
| `incident.verify` | A supervisor verified the incident |
| `incident.extinguish` | A supervisor extinguished the incident |
| `incident.severity.lower` | A supervisor lowered severity |
| `incident.severity.raise` | Code raised severity |
| `site.reinspect` | Code found new activity near an extinguished site (§5.7). `actorId` is `code` and `targetId` is the incident id |

### 5.6 Digest

One current picture for Live context, REST polling, and WebSocket pushes.

| Field | Type | Notes |
|---|---|---|
| `updatedAt` | string | |
| `incidents` | incident summary[] | `id`, `name`, `area`, `status`, `severity`, `withdraw`, `lat`, `lng` |
| `myTasks` | task[] | Tasks whose `volunteerId` is the caller. Empty for a supervisor |

A volunteer receives incidents linked to their observations or tasks. A supervisor receives incidents whose status is `open`, `held`, or `verified`.

### 5.7 Service-written collections

These are written and read by the backend services only. No REST route in §6 returns them, and no client reads Firestore. All timestamps are ISO-8601 UTC strings. Advisory records never change an incident, an observation, or a severity.

#### `photo_triage`

Written by `ember-agents` (spotter). One document per observation, with the observation id as the document id. The model describes the photo. Code keeps only these fields.

| Field | Type | Notes |
|---|---|---|
| `id` | string | The observation id |
| `observationId` | string | |
| `volunteerId` | string or null | The reporting volunteer |
| `photoPath` | string or null | The private object path |
| `status` | string | `ok`, `rejected`, or `error` |
| `advisory` | `true` | Always true |
| `model` | string or null | Null unless the model ran |
| `result` | object or null | Null unless `status` is `ok` |
| `reason` | string | Only when `status` is `rejected`. Why the photo was refused |
| `error` | string | Only when `status` is `error`. A short failure reason |
| `at` | string | |

`result`:

| Field | Type | Notes |
|---|---|---|
| `smokeVisible` | boolean | |
| `flameVisible` | string | `none`, `small`, `large`, or `unclear` |
| `burnScarVisible` | boolean | |
| `notes` | string | A short factual description, at most 200 characters |
| `confidence` | string | `low`, `medium`, or `high` |

#### `incident_summaries`

Written by `ember-agents` (spotter). One document per incident, with the incident id as the document id. Code builds the facts. The model only rewords them, and code falls back to a plain template when the text is not neutral.

| Field | Type | Notes |
|---|---|---|
| `id` | string | The incident id |
| `incidentId` | string | |
| `english` | string | At most 400 characters |
| `bahasa` | string | Bahasa Indonesia, at most 400 characters |
| `source` | string | `model` or `template` |
| `advisory` | `true` | Always true |
| `model` | string or null | Null when `source` is `template` |
| `facts` | object | `incidentId`, `reportCount`, `volunteerCount`, `reportsDisagree`, `reports[]` (`source`, `chip`, `text`, `capturedAt`, `hasPhoto`), and `photoDescriptions[]` (`smokeVisible`, `flameVisible`, `burnScarVisible`, `notes`). It has no severity on purpose |
| `at` | string | |

#### `sites` and `sites_meta`

Written by `ember-agents` (sites, the re-ignition watch). A `sites` document is made for each extinguished incident, with the incident id as the document id. An alert asks a supervisor to look again. It never reopens, verifies, or re-rates the incident.

| Field | Type | Notes |
|---|---|---|
| `id` | string | The incident id |
| `incidentId` | string | |
| `lat` | number | The incident position |
| `lng` | number | |
| `radiusM` | number | Alert radius in metres. Default 500 |
| `extinguishedAt` | string | From the `incident.extinguish` audit record |
| `expiresAt` | string | End of the watch window, `EMBER_SITE_WATCH_DAYS` (default 14) after `extinguishedAt`. Records made before the window existed do not have it |
| `observationIds` | string[] | The incident observations. These never raise an alert |
| `status` | string | `watching`, `reinspect` after an alert, or `expired` once the window has passed. Expired sites are not scanned |
| `alerts` | alert[] | The newest 50 alerts |
| `lastAlertAt` | string | Set with the first alert |

Each alert:

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `kind` | string | `observation` or `lead` |
| `sourceId` | string | The observation id or the lead id |
| `distanceM` | number | From the site, rounded |
| `itemAt` | string | When the observation arrived or the lead was first seen |
| `at` | string | When the alert was raised |
| `message` | string | |

Each new alert also appends a `site.reinspect` audit record. `sites_meta/scan` holds `lastScannedAt` (string), the start time of the last completed scan, so the next scan reads only newer observations and leads.

#### `notificationAttempts`

Written by `ember-api` after a task or WITHDRAW push. The task is already committed. A failed or skipped push never undoes it.

| Field | Type | Notes |
|---|---|---|
| `kind` | string | `withdraw` or `task` |
| `targetId` | string | The task id |
| `volunteerId` | string | The volunteer who was pushed |
| `result` | string | `sent`, `failed`, or `skipped` (the volunteer has no device token) |
| `attempts` | number | Send attempts, up to 3 per token. 0 when skipped |
| `at` | string | |

#### `counters`

Written by `ember-agents` (fusion). `counters/incidents` has one field, `value`, the number of the last incident named. A transaction takes the next number each time fusion creates an incident, so two incidents never share a number. A gap is possible when naming succeeds and the incident write then fails.

#### `leads`, `weather`, `psi`, `ingestRuns`

Written by the hourly ingest job and nowhere else. It never writes incidents, observations, tasks, or audit records, and it never deletes. A FIRMS hotspot is a lead for a person to verify. It is never a confirmed fire.

`leads`, one document per hotspot:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable for the same satellite source, position, and acquisition time |
| `kind` | string | `firms_hotspot` |
| `source` | string | `firms`, or `seed` for hand-seeded demo leads |
| `firmsSource` | string | The FIRMS product, or `hand-seeded` |
| `satellite`, `instrument` | string or null | |
| `lat`, `lng` | number | |
| `acqAt` | string | When the satellite saw it |
| `confidence` | string | `low`, `nominal`, `high`, or `unknown` |
| `frpMw`, `brightnessK` | number or null | |
| `daynight` | string or null | |
| `label` | string | `unverified_lead` |
| `needsHumanVerification` | `true` | |
| `confirmedFire` | `false` | |
| `disclaimer` | string | |
| `status` | string | `to_verify` on first sight. A person or a later service may change it, and ingest never overwrites it |
| `firstSeenAt` | string | Kept from the first run |
| `lastSeenAt` | string | The latest run that saw it |
| `ingestRunId` | string | |
| `verifiedBy`, `verifiedAt`, `incidentId` | string | Optional. Set by a person or a later service, and ingest never overwrites them |

`weather/current`: `id`, `source` (`open-meteo`), `lat`, `lng`, `observedAt`, `windKmh`, `windDirDeg`, `gustKmh`, `tempC`, `humidityPct`, `precipMm` (numbers may be null), `fetchedAt`, `ingestRunId`. Wind reaches a WITHDRAW only through the agents rule in §8.

`psi/current`: `id`, `source` (`data.gov.sg`), `observedAt`, `updatedAt`, `psi24h` (a map of region to number), `psi24hMax` (number), `pm25_24h` (a map of region to number), `fetchedAt`, `ingestRunId`.

`ingestRuns/{runId}`: `id`, `startedAt`, `finishedAt`, `ok` (boolean), and `sources`, a map with `firms`, `weather`, and `psi`. Each entry has `ok` and either its count or value (`leads`, `windKmh`, or `psi24hMax`) or an `error` string.

## 6. REST

Base URL is the `ember-api` origin. Unless a route says otherwise, the caller is any signed-in role and the success body is the stored record.

### 6.1 `GET /me`

Returns §2. `401` or `403` as in §3.

### 6.2 `POST /observations`

Creates one immutable `chip` or `text` observation. `ember-api` then calls the agents intake in §8.

Request, chip:

```json
{
  "source": "chip",
  "capturedAt": "2026-10-13T08:12:00Z",
  "lat": 1.482,
  "lng": 102.115,
  "accuracyM": 18,
  "chip": "api",
  "text": null
}
```

Request, text only:

```json
{
  "source": "text",
  "capturedAt": "2026-10-13T08:14:00Z",
  "lat": 1.482,
  "lng": 102.115,
  "accuracyM": 18,
  "chip": null,
  "text": "Asap tipis di tepi kanal"
}
```

The server fills `id`, `volunteerId`, `receivedAt`, `severity`, `photoPath`, and `immutable`. Response `201` with the stored observation:

```json
{
  "id": "obs_01",
  "volunteerId": "uid_sari",
  "capturedAt": "2026-10-13T08:12:00Z",
  "receivedAt": "2026-10-13T08:12:04Z",
  "source": "chip",
  "lat": 1.482,
  "lng": 102.115,
  "accuracyM": 18,
  "chip": "api",
  "text": null,
  "severity": "small_flame",
  "photoPath": null,
  "immutable": true
}
```

`source: live` and `source: photo` are rejected on this route. Live observations are created by the gateway in §7. The signed photo upload URL is outside this contract; a later photo observation still uses this observation shape and a private `photoPath`.

A second request that tries to change `obs_01` has no route. A request that carries no `clientId` and is sent again creates a new observation. A request with a `clientId` is idempotent per volunteer: sending the same `clientId` again changes nothing and returns `200` with the observation stored the first time, even if the body differs.

### 6.3 `GET /incidents` and `GET /incidents/{id}`

`GET /incidents` returns a JSON array of incident records, scoped as in §5.6.

`GET /incidents/{id}` returns the picture the supervisor screen needs:

```json
{
  "incident": {
    "id": "inc_01",
    "name": "Bengkalis, Riau · Sari · #1",
    "area": "Bengkalis, Riau",
    "status": "held",
    "severity": "small_flame",
    "evidenceScore": 64,
    "conflictId": "con_01",
    "withdraw": null,
    "lat": 1.482,
    "lng": 102.115
  },
  "observations": [],
  "conflict": {
    "id": "con_01",
    "incidentId": "inc_01",
    "observationIds": ["obs_01", "obs_02"],
    "higherSeverity": "small_flame",
    "status": "open",
    "dispatchHeld": true
  },
  "tasks": []
}
```

`observations` are the full immutable records for `conflict.observationIds` when a conflict exists, otherwise the observations clustered into this incident. A volunteer who is not on the incident receives `404`.

### 6.4 `GET /digest`

Returns the §5.6 digest for the caller.

### 6.5 Approval and human incident actions

All of these are supervisor-only. A volunteer receives `403`. Each success returns the updated record and the new audit id:

```json
{
  "task": {},
  "auditId": "aud_01"
}
```

Incident actions return `incident` instead of `task`.

| Route | Body | Result |
|---|---|---|
| `POST /tasks/{id}/approve` | none | `proposed` becomes `approved`. Allowed for `verify`. Allowed for `investigate` only when that incident has no open conflict. Rejected for `withdraw` |
| `POST /tasks/{id}/reject` | none | `proposed` becomes `rejected`. Rejected for `withdraw` |
| `POST /tasks/{id}/edit` | `{ "instruction": "Check the east bank again" }` | Replaces `instruction` only. Type, status, volunteer, and incident stay the same |
| `POST /incidents/{id}/verify` | none | `status` becomes `verified` |
| `POST /incidents/{id}/extinguish` | none | `status` becomes `extinguished` |
| `POST /incidents/{id}/severity` | `{ "severity": "smoke" }` | Stores the new severity only when it is strictly lower on the scale in §1 |
| `POST /incidents/{id}/withdraw` | see below | Issues a withdraw instruction. This is not an approval |

Withdraw request:

```json
{
  "volunteerIds": ["uid_sari"],
  "instruction": "Withdraw upwind. Do not engage.",
  "reasons": ["supervisor instruction"]
}
```

The route sets `incident.withdraw`, creates one `withdraw` task with `status: approved` and that `instruction` for each id, and appends a `task.withdraw` audit with the supervisor’s uid. `volunteerIds` must already have an observation or a task on this incident.

Code uses the same writes when it fires WITHDRAW. Its `actorId` is `code`, and its `volunteerIds` are every volunteer who already has an observation or a task on the incident. Code does not call the supervisor route and does not wait.

### 6.6 Update channels

Clients refresh by polling `GET /incidents` and `GET /digest`. During a Live session the gateway also sends `digest` messages on the socket (§7).

FCM is the third channel, used when the app is not in a Live session. `ember-api` sends it for a new task, a withdraw instruction, and a supervisor alert. The push payload itself belongs to the push workstream, not this document.

## 7. WebSocket

`voice-gateway` exposes a WebSocket. The upgrade carries the same two headers as §2. Invalid credentials close the socket before a Gemini session starts.

The session opens when the client sends `session.start` (push to talk) and closes about 30 seconds after the reply, on `session.stop`, or when a cap is reached. The gateway uses manual activity detection so wind and engine noise do not open a turn. Caps are configurable per user and per operation. Hitting a cap closes with `cap_reached` and does not open a further Gemini session.

Messages are JSON text. Audio and frames use base64 in those messages.

Client to gateway:

```json
{ "type": "session.start" }
{ "type": "location", "lat": 1.482, "lng": 102.115, "accuracyM": 18, "capturedAt": "2026-10-13T08:12:00Z" }
{ "type": "audio", "data": "<base64>" }
{ "type": "frame", "data": "<base64>", "capturedAt": "2026-10-13T08:12:01Z" }
{ "type": "session.stop" }
```

Frames are about one per second while the session is open.

Gateway to client:

```json
{ "type": "session.ready" }
{ "type": "audio", "data": "<base64>" }
{ "type": "digest", "digest": { "updatedAt": "2026-10-13T08:12:05Z", "incidents": [], "myTasks": [] } }
{ "type": "observation.created", "observationId": "obs_03" }
{ "type": "session.closed", "reason": "reply_complete" }
```

`session.closed` `reason` is `reply_complete`, `idle_timeout`, `cap_reached`, or `unauthorized`.

On session start the gateway injects the caller’s current digest into the Gemini Live context.

### 7.1 Tools

The model may call these tools. It has no other way to read or write incident state.

`submit_observation`

```json
{ "severity": "small_flame", "text": "Api kecil di tepi kanal" }
```

The gateway writes one immutable observation with `source: live`. `lat`, `lng`, `accuracyM`, and `capturedAt` come from the latest `location` message in the session. Coordinates spoken by the model are discarded. If the session has no location yet, the gateway does not write an observation. After a successful write it calls §8 and sends `observation.created`.

`get_common_picture` takes no arguments and returns the caller’s digest from §5.6.

`get_my_task` takes no arguments and returns the caller’s current task, or `null` when they have none. Current means the newest task for that volunteer whose status is `approved`, with a `withdraw` task preferred over any other type.

## 8. Agents intake

`ember-agents` is private. Only the `ember-api` and `voice-gateway` service accounts can invoke it.

`POST /internal/observations/{observationId}/intake`

No body. The agents service reads the observation from `ember-db`. Response `202`:

```json
{ "observationId": "obs_01" }
```

Calling it again for an observation that is already in an incident changes nothing and still answers `202`, so the caller may retry. `ember-api` calls it with a 3 second timeout after storing an observation. If the call fails, the observation stays in the `intakePending` collection (`id`, `createdAt`, `attemptedAt`, `attempts`) and `ember-api` sends it again after later reports, up to 20 failed attempts. A report is never refused or delayed because agents is down.

Agents may create and update incidents, conflicts, tasks, and the digest, within the field rules in §5. They cluster nearby observations, set `evidenceScore`, open conflicts, raise severity, and issue code WITHDRAW. They do not verify, extinguish, lower severity, or copy the model’s severity onto the incident.

The high-wind threshold is a setting in the agents workstream. This contract only requires that crossing it produces the same WITHDRAW writes as a `large_flame` observation.

## 9. Worked path

Two synthetic volunteers, one disagreement, then a code WITHDRAW.

1. Sari `POST /observations` with chip `api`. Stored severity is `small_flame`.
2. Rizal `POST /observations` with chip `aman` at the same spot. Stored severity is `none`.
3. Agents cluster them into `inc_01`, set severity to `small_flame`, open `con_01`, set status to `held`, and create two proposed `verify` tasks.
4. A supervisor `POST /tasks/{id}/approve` on each verify task. `POST /tasks/{id}/approve` on an `investigate` task for `inc_01` returns `409` with code `conflict` while `con_01` is open.
5. A later observation with severity `large_flame` makes code set `incident.withdraw`, create approved `withdraw` tasks for Sari and Rizal, and append `task.withdraw` with `actorId: code`.
6. Their next `GET /digest` or socket `digest` message carries `withdraw.active: true` and the instruction. The PWA shows that instruction full screen.

## 10. Outside this contract

| Item | Where it belongs |
|---|---|
| Signed photo `PUT` URL | Photo-upload work. Later observations still use `photoPath` |
| FCM payload fields | Push work |
| `ops`, `volunteers`, `pings`, `crews` | Not required to implement this contract |
| Hourly FIRMS, weather, and PSI ingest | Ingest work. The collections it writes are in §5.7. Wind enters WITHDRAW only through the agents rule |
| Flash photo triage, summaries, evals, Memory Bank | Later agent work. The `photo_triage` and `incident_summaries` records are in §5.7 |
| Ephemeral-token Live fallback | Only if a later decision replaces the relay |
| Map tiles | Loaded by the browser with the referrer-restricted Maps key |
| Agency report delivery | EMBER does not send agency reports |

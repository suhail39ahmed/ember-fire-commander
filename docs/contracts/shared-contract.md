# EMBER shared contract

This is the contract for the volunteer PWA, the supervisor console, `ember-api`, `voice-gateway`, and `ember-agents`. A workstream can be implemented from this document alone.

The browser talks only to `ember-api` (REST) and `voice-gateway` (WebSocket). Clients do not read or write Firestore or Cloud Storage. Services open Firestore with `FIRESTORE_DATABASE=ember-db`. Only backend service accounts write. Firestore and Storage rules are deny-all.

Examples below are synthetic.

This revision matches `main` at `0e0b32c` (15 Oct 2026). Section 11 lists the settings, §12 is for the UI rework, and §13 is the changelog since v1.

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

The ID token is checked first, then the role, then App Check. A token with no role is `403` before App Check is looked at.

**App Check is log-only today.** `ember-api` and `voice-gateway` verify `X-Firebase-AppCheck` on every protected call. Unless `APP_CHECK_ENFORCE` is `true`, a missing or invalid App Check token is logged and the request continues, so a valid ID token is enough. The default is `false`, and `infra/terraform/terraform.tfvars` sets `app_check_enforce = false`. With `APP_CHECK_ENFORCE=true`, a missing, invalid, or expired App Check token is `401 unauthorized`.

**Revoked tokens.** For every method except `GET`, `HEAD`, and `OPTIONS`, `ember-api` also looks the user up in Firebase Auth after the signature check. It returns `401 unauthorized` when the user was deleted, is disabled, or the token was issued before the user's tokens were revoked. The lookup has a 3 second deadline. If it fails or times out, the token is accepted on the signature check alone and the lookup is skipped for 30 seconds. `GET` routes and the WebSocket upgrade check the signature and expiry only.

**Internal route.** `POST /internal/notifications/withdraw` skips the Firebase check. It needs a Google ID token for the `ember-api` origin whose email is `EMBER_AGENTS_CALLER`: a missing or invalid token is `401`, any other caller is `403` (§8).

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
| `displayName` | string | Token `name` claim. `""` when the token has none |
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

`fields` is present on `validation_error` only. On `validation_error`, `message` is the message of the first failing field and `fields` lists every failing field.

Only errors raised by the routes in §6 use this body. `app.py` registers no handler for unknown paths, wrong methods, or unhandled server errors, so those come back as Flask's default response, which is not this JSON. A client must not assume every non-2xx body has `error.code`. The web clients fall back to `http_error` or `unavailable` in that case.

| HTTP | `code` | When |
|---|---|---|
| 400 | `validation_error` | A required field is missing, a value is outside its enum or range, or the body is not a JSON object |
| 401 | `unauthorized` | The Firebase ID token is missing, invalid, expired, or (on a write) revoked. Also a missing or invalid App Check token when `APP_CHECK_ENFORCE` is `true` |
| 403 | `forbidden` | The caller is signed in and is not allowed to do this. Also a `photoPath` that is not the caller's own issued upload |
| 403 | `role_missing` | The token has no `role` claim |
| 404 | `not_found` | The id is unknown, or a volunteer asked for an incident they are not on |
| 409 | `conflict` | The write breaks immutability, dispatch hold, a task or incident state rule, or a severity rule |

## 4. Shared enums

| Name | Values |
|---|---|
| Role | `volunteer`, `supervisor` |
| Observation source | `live`, `chip`, `text`, `photo` |
| Chip | `asap`, `api`, `aman`, `butuh_bantuan` |
| Severity | `none`, `smoke`, `small_flame`, `large_flame`, `unknown` |
| Incident status | `open`, `held`, `verified`, `extinguished` |
| Task type | `verify`, `withdraw`, `investigate`, `instruct` |
| Task status | `proposed`, `approved`, `rejected` |
| Conflict status | `open`, `resolved` |
| Photo content type | `image/jpeg`, `image/webp` |

Wire value for the “butuh bantuan” chip is `butuh_bantuan`. A text-only report omits the chip.

Timestamps are ISO-8601 UTC strings. Ids are server-generated strings.

## 5. Entities

Collections used by this contract: `observations`, `incidents`, `conflicts`, `tasks`, `audit`. The digest (§5.6) is not a collection. `ember-api` and `voice-gateway` each build it from `incidents` and `tasks` when asked, and nothing stores it.

Services also keep collections that no REST route returns. They are listed in §5.7 with the field types and the service that writes them: `photo_triage`, `incident_summaries`, `sites`, `sites_meta`, `notificationAttempts`, `photoUploads`, `intakePending`, `volunteers`, `counters`, `leads`, `weather`, `psi`, and `ingestRuns`.

### 5.1 Observation

Immutable. The stored record always has `"immutable": true`. There is no update or delete route.

| Field | Type | Set by |
|---|---|---|
| `id` | string | Server. Random, except that when `clientId` is present it is the SHA-256 hex of `<volunteerId>:<clientId>` |
| `volunteerId` | string | Server, from the token |
| `capturedAt` | string | Client. The phone time of the report, in UTC (`Z` or `+00:00`; any other offset is `400`). Must be within [now − 7 days, now + 5 minutes] when received, otherwise `400`. Stored as `YYYY-MM-DDTHH:MM:SS[.mmm]Z`. A `live` observation takes it from the phone's `location` message, and the gateway does not apply this window (§7) |
| `receivedAt` | string | Server |
| `volunteerName` | string, optional | `ember-api` and `voice-gateway`, from the token display name, one line of at most 80 characters. Absent when the token has no display name. Agents use it to name the incident. Only the create response (§6.2) returns it; the observations in §6.3 do not |
| `clientId` | string, optional | Client. The outbox item id, 1 to 128 letters, digits, `.`, `-` or `_`. Present only when the client sent it. Only the create response (§6.2) returns it; the observations in §6.3 do not. The gateway never sets it |
| `source` | source enum | Client for `chip`, `text`, and `photo`. Gateway sets `live`. `live` is refused on `POST /observations` |
| `lat` | number, −90 to 90 | Phone |
| `lng` | number, −180 to 180 | Phone |
| `accuracyM` | number or null | Phone. Zero or more |
| `chip` | chip enum or null | Client when `source` is `chip`. Always `null` for `text`, `photo`, and `live` |
| `text` | string or null | Client, or the Live tool. REST text is trimmed, at most 280 characters, and a blank string is stored as `null`. The Live tool's text is stored as the model sent it, with no trim and no length cap |
| `severity` | severity enum | Server. See the mapping below |
| `photoPath` | string or null | Client, for `source: photo` only: the path from `POST /photos/upload-url` (§6.7). `null` for every other source. A private object path, never a public URL |
| `immutable` | `true` | Server |

Chip to severity, applied by `ember-api` even if the client sends a severity:

| Chip | Severity |
|---|---|
| `asap` | `smoke` |
| `api` | `small_flame` |
| `aman` | `none` |
| `butuh_bantuan` | `unknown` |

A `text` or `photo` observation is stored as `unknown`. A `live` observation stores the tool’s `severity` when it is a valid enum, and `unknown` when the tool omits it. That value stays on the observation. Agents compute incident severity separately.

`lat`, `lng`, and `capturedAt` are required. `capturedAt` may be earlier than `receivedAt` so a delayed report still sorts correctly.

Which fields a response carries:

- `POST /observations` returns the full stored record, including `volunteerName` and `clientId` when they exist.
- The `observations` in `GET /incidents/{id}` carry only `id`, `volunteerId`, `capturedAt`, `receivedAt`, `source`, `lat`, `lng`, `accuracyM`, `chip`, `text`, `severity`, `photoPath`, and `immutable`.

### 5.2 Incident

| Field | Type | Who may change it |
|---|---|---|
| `id` | string | Nobody after create |
| `name` | string or null | Agents (fusion), once, when the incident is created. A readable label: the nearest known town or a coordinate label, the first reporter's display name when there is one, and the incident number, such as `Bengkalis, Riau · Pak Dedi · #3`. `null` on incidents created before names existed, or when naming failed. Clients show a short form of `id` then |
| `area` | string or null | Agents (fusion), once, when the incident is created. The place part of `name`: the nearest known town, such as `Bengkalis, Riau`, or a coordinate label such as `10.00°N 102.11°E`. Written even when `name` could not be. `null` on incidents created before areas existed. The console groups the queue by it. See the naming rules below |
| `status` | status enum | Agents may set `open` or `held`. A supervisor may set `verified` (only from `open` or `held`) or `extinguished` (from any status except `extinguished`). Agents never touch an `extinguished` incident: a new report nearby starts a new incident |
| `severity` | severity enum | Agents may raise it. A supervisor may lower it. The model must not set it |
| `evidenceScore` | number | Agents. Code-computed, not a probability and not a forecast |
| `conflictId` | string or null | Agents |
| `withdraw` | object or null | Code, or a supervisor through the withdraw route in §6.5 |
| `lat` | number | Agents. The centroid of every clustered observation, recomputed at each intake, so it can move after the incident is created. `name` and `area` do not follow it |
| `lng` | number | Agents. As `lat` |
| `observationIds` | string[] | Agents (fusion). Every observation clustered into the incident, oldest first. Stored only: no REST response returns it. Services use it to find an incident's observations and to link a volunteer to it |
| `evidenceFactors` | evidence factor[] | Agents (fusion). The factors that add up to `evidenceScore`. Only a supervisor's `GET /incidents/{id}` returns them (§6.3) |
| `agency` | string, optional | Nobody in this repository writes it. The name of the agency recorded as in charge of the incident. Only a supervisor's `GET /incidents/{id}` returns it, as `agencyInCharge` (§6.3). No route sets it, and handing an incident to an agency is outside this contract (§10) |

**Naming rules** (`services/agents/fusion/places.py`). Fusion sets `area` and `name` once, from the first observation's position, when it creates the incident.

- `area` is the nearest entry of a built-in list of 28 places (26 towns in Riau, Jambi, Sumatera Selatan, and Kalimantan, plus Bengaluru and Pune where the team tests) when that place is within 25 km. Otherwise it is a coordinate label with two decimals, such as `1.48°N 102.12°E`. The town coordinates are approximate and are meant to be extended.
- `name` is `area`, then the reporter, then `#<number>`, joined by ` · `. The reporter is the first observation's `volunteerName`, else `volunteers/{uid}.displayName`, cut to 40 characters on one line. The reporter part is left out when there is no name.
- `<number>` comes from `counters/incidents` (§5.7), so it is the order in which incidents were created. Numbering starts at 1 unless `counters/incidents.value` is set by hand.
- Naming never fails intake. If the counter or name step fails, `area` is still written and `name` is not.
- `scripts/backfill-incident-names.py` gives older incidents the same `area` and `name` with the same code. It is a dry run unless `--apply` is passed, never changes a `name` or `area` that exists, and takes numbers from `counters/incidents` in the order of each incident's earliest report.

**Queue grouping** (`apps/web/src/supervisor/queueGroups.ts`). This is a display rule in the console, not stored data. The group key is `area`, else the part of `name` before the first ` · `, else `Unnamed area`. Groups are ordered by: any active `withdraw` first, then the highest severity, then the highest `#<number>`, then the area name. The severity rank used for this ordering puts `unknown` between `none` and `smoke`. Incidents keep the order the API returned them in within a group.

**Clustering and score** (`services/agents/fusion/rules.py`). An observation joins the nearest incident with status `open`, `held`, or `verified` that has a member observation within `EMBER_CLUSTER_RADIUS_M` (default 300 m). If there is none, it starts a new incident.

An evidence factor explains one part of `evidenceScore`. The score is the sum of the `points`, kept between 0 and 100.

| Field | Type | Notes |
|---|---|---|
| `factor` | string | `severity`, `corroboration`, `photo`, `gps`, or `conflict` |
| `points` | number | Negative for `conflict` |
| `detail` | string | A plain sentence, such as `highest reported severity is small_flame` |

Points:

| Factor | Points |
|---|---|
| `severity` | The highest severity among the incident's observations: `none` 0, `unknown` 5, `smoke` 20, `small_flame` 35, `large_flame` 50. A `live` observation counts as `unknown` here |
| `corroboration` | 15 for each volunteer beyond the first who reported `smoke` or worse, at most 30 |
| `photo` | 10 when any observation has a photo |
| `gps` | 10 when any observation has `accuracyM` of 50 m or better |
| `conflict` | −20 while a conflict is open |

`withdraw` when active:

| Field | Type | Meaning |
|---|---|---|
| `active` | `true` | The instruction is in effect |
| `instruction` | string | The sentence shown and spoken to the volunteer |
| `reasons` | string[] | Why the instruction was sent |
| `volunteerIds` | string[] | The volunteers who must follow it |
| `source` | `code` or `supervisor` | Who first sent it. Optional: absent on a withdraw written before #101 |
| `sentAt` | string | When it was first sent (server time). Optional, same rule |
| `safeVolunteerIds` | string[] | Volunteers a supervisor marked found safe (§6.5). A subset of `volunteerIds`. Optional, same rule: absent means nobody is marked |

```json
{
  "active": true,
  "instruction": "Withdraw upwind. Do not engage.",
  "reasons": ["large flame reported"],
  "volunteerIds": ["uid_sari", "uid_rizal"],
  "source": "code",
  "sentAt": "2026-10-13T08:20:00.000Z",
  "safeVolunteerIds": ["uid_sari"]
}
```

Clearing `withdraw`, or lowering severity in order to dismiss it, is not a client action.

How `withdraw` is written. Code sets `instruction` to `Withdraw upwind. Do not engage.` (setting is in §8) and adds the reasons `large flame reported` and `wind <n> km/h at or above <t> km/h`. Once active, it stays active. Later code intakes only add volunteers and reasons and keep the instruction. The supervisor route (§6.5) replaces `instruction` and `reasons`, and keeps the volunteers already listed. `source` and `sentAt` are written once, when the withdraw first becomes active (`code` from agents, `supervisor` from the route), and later writes keep them. Both writers keep `safeVolunteerIds`. **Open decision:** nothing clears `withdraw`, including when every volunteer is marked safe. The console shows the plain banner then. Whether all-safe should end the withdraw is for the team to decide; until the contract says so, no code does it.

### 5.3 Task

| Field | Type | Notes |
|---|---|---|
| `id` | string | Server |
| `incidentId` | string | |
| `volunteerId` | string | One volunteer per task |
| `type` | task type | `verify`, `withdraw`, `investigate`, or `instruct` |
| `status` | task status | `withdraw` and `instruct` are stored as `approved` |
| `instruction` | string or null | Shown to the volunteer. The edit route may replace this text |
| `sentAt` | string or null | When the task was last sent: set by approve (the approval is the send), by the instruct route, by the withdraw route and by code for a `withdraw` task, and again by resend. `null` until sent, and on a task sent before #94 |
| `heardAt` | string or null | When the volunteer's app said it showed or spoke the instruction (`POST /tasks/{id}/heard`). Set once |
| `sendCount` | number or null | 1 at the first send, plus one for each resend |
| `resendAt` | string or null | Computed on read, not stored: `sentAt` plus 60 seconds while the task is `approved`, not heard, and has a `sentAt`. `null` otherwise |

An `instruct` task is one free-text instruction a supervisor sent to one volunteer (§6.5). It is never proposed: the supervisor's send is the decision, so it is stored `approved` with `sentAt` and `sendCount` 1, and it is not held by an open conflict. It is not a WITHDRAW and cannot hold one. A proposed `investigate` task is a dispatch waiting for a supervisor. A `verify` task may be approved while a conflict is open. A `withdraw` task is never proposed and never waits.

Who creates tasks: agents create `verify` tasks (when a conflict opens, one per volunteer on either side, and not again for a volunteer who already has a `verify` task on the incident) with the instruction `Reports disagree here. Check the spot again and report what you see.` Code and the supervisor withdraw route create `withdraw` tasks. The supervisor `instruct` route creates `instruct` tasks. **No service in this repository creates an `investigate` task.** The approval route handles one, but nothing proposes one today.

A task has no timestamp field. Lists of tasks are sorted by `id`, and an `id` is not in creation order.

### 5.4 Conflict

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `incidentId` | string | |
| `observationIds` | string[] | The original observations from both sides of the disagreement, unchanged. Only observations that disagree are listed (see below) |
| `higherSeverity` | severity enum | The higher of the known severities on the two sides |
| `status` | `open` \| `resolved` | Clients have no route that sets `resolved`, and no code in this repository sets it either |
| `dispatchHeld` | `true` | While `status` is `open`, investigate approval is rejected |

A conflict opens only for a `none` observation against a `small_flame` or `large_flame` observation in the same incident. A `smoke` or `unknown` observation is not on either side and is not listed in `observationIds`. A `live` observation counts as `unknown` and never takes a side. Agents reuse the incident's open conflict and add ids to it as more observations arrive.

Because nothing sets a conflict to `resolved`, an incident that has a conflict keeps its dispatch hold. §12.5 lists this as undecided.

### 5.5 Audit

Append-only. Clients do not write audit records. Every supervisor action and every automatic WITHDRAW appends one.

| Field | Type | Notes |
|---|---|---|
| `id` | string | Server |
| `actorId` | string | The supervisor uid, `code` when code decided, or the reporting volunteer's uid for `observation.create` |
| `action` | string | One of the names below |
| `targetId` | string | The task or incident id |
| `at` | string | Server time |
| `actorName` | string, optional | The actor's display name from their token when the row was written, at most 80 characters. Written by `ember-api` on supervisor actions when the token has a name. Absent on rows written before this field existed, on `observation.create` and `task.heard` rows, and when the token has no name |
| `subjectId` | string, optional | The volunteer the action is about. Written only on `withdraw.safe`. Absent on every other row and on `withdraw.safe` rows written before #92. `GET /audit` does not return it; a supervisor's `GET /incidents/{id}` uses it for who was marked safe and when (§6.3) |

`GET /audit` (supervisor) returns these rows newest first, with `actorName`, display `target`, server-built `detail`, and `incidentId` for navigation. Optional `targetId` and `cursor` page the list. Clients do not write audit records.

The display fields never carry a raw id. `actorName` is the stored `actorName`, else `volunteers/{uid}.displayName`, else the `volunteerName` on one of that volunteer's reports, else `Volunteer` for `observation.create` and `task.heard` rows and `Supervisor` for every other row (`AI` when code decided). An incident in `target` is its stored `name`, else `Incident · <area>`, else `Incident · <coordinates>`, else `Incident`. A volunteer inside `target` and `detail` follows the same name order and falls back to `Volunteer`.

| `action` | When |
|---|---|
| `observation.create` | An observation was stored |
| `task.approve` | A supervisor approved a proposed task |
| `task.reject` | A supervisor rejected a proposed task |
| `task.edit` | A supervisor replaced a task instruction |
| `withdraw.safe` | A supervisor marked one withdrawn volunteer found safe. `targetId` is the incident id. The volunteer is in `incident.withdraw.safeVolunteerIds` and, on rows written since #92, in the row's `subjectId` |
| `task.resend` | A supervisor sent a sent, unheard task again. `targetId` is the task id |
| `task.instruct` | A supervisor sent a free-text instruction to one volunteer. `targetId` is the new `instruct` task id |
| `task.heard` | A volunteer's app confirmed it showed or spoke a task. `actorId` is the volunteer, `targetId` the task id |
| `task.withdraw` | Code or a supervisor issued a withdraw instruction. `targetId` is the incident id. Code writes one per intake that adds a volunteer or a reason |
| `incident.verify` | A supervisor verified the incident |
| `incident.extinguish` | A supervisor extinguished the incident |
| `incident.severity.lower` | A supervisor lowered severity |
| `incident.severity.raise` | Code raised severity on an existing incident. A new incident's first severity writes none |
| `site.reinspect` | Code found new activity near an extinguished site (§5.7). `actorId` is `code` and `targetId` is the incident id |
| `site.dismiss` | A supervisor dismissed a re-ignition alert with a reason. `targetId` is the incident id. The reason is stored on the alert |
| `site.recheck` | A supervisor sent a re-check: a proposed `verify` task on the extinguished incident. The incident status stays `extinguished` |

### 5.6 Digest

One current picture for Live context, REST polling, and the `digest` WebSocket message.

| Field | Type | Notes |
|---|---|---|
| `updatedAt` | string | |
| `incidents` | incident summary[] | `id`, `name`, `area`, `status`, `severity`, `withdraw`, `lat`, `lng`. No `evidenceScore` and no `conflictId` |
| `myTasks` | task[] | Every task whose `volunteerId` is the caller, in any status (`proposed`, `approved`, `rejected`). Empty for a supervisor |

The digest is built on request. A volunteer receives every incident, in any status including `extinguished`, that has one of their tasks, lists them in `withdraw.volunteerIds`, has one of their observations in its `observationIds`, or has one of their observations in one of its conflicts. A supervisor receives incidents whose status is `open`, `held`, or `verified`. Both lists are sorted by `id`, which is not chronological.

`ember-api` (`GET /digest`) and `voice-gateway` (the `digest` message and the Live tools) build the digest with separate code (`services/api/incidents/routes.py`, `services/voice-gateway/live/digest.py`) that follows the same rules.

### 5.7 Service-written collections

These are written and read by the backend services only, except the re-ignition alert fields that `GET /dashboard` returns (§6.9). No client reads Firestore. All timestamps are ISO-8601 UTC strings. Advisory records never change an incident, an observation, or a severity.

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

A supervisor's `GET /incidents/{id}` returns `english`, `bahasa`, `source` and `at` of this document as `summary` (§6.3). The `facts` object is not returned.

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

#### `photoUploads`

Written by `ember-api` when it issues a signed upload URL (§6.7). A photo observation is accepted only for a `photoPath` that has a record here for the same volunteer.

| Field | Type | Notes |
|---|---|---|
| `volunteerId` | string | The volunteer the URL was issued to |
| `photoPath` | string | The private object path. The URL itself is never stored |
| `contentType` | string | `image/jpeg` or `image/webp` |
| `createdAt` | string | |
| `expiresAt` | string | When the signed URL stops working |

#### `intakePending`

Written by `ember-api` and `voice-gateway` in the same batch as every new observation, with the observation id as the document id. It is deleted when agents accepts the intake call (§8).

| Field | Type | Notes |
|---|---|---|
| `id` | string | The observation id |
| `createdAt` | string | The observation's `receivedAt` |
| `attemptedAt` | string | The last attempt, or `createdAt` before the first |
| `attempts` | number | Failed intake calls, counting the first one at report time. `ember-api` drops the entry when the 20th fails, and the observation stays stored |

#### `volunteers`

`volunteers/{uid}.fcmTokens` is a string array of FCM device tokens, written only by `ember-api` through `POST` and `DELETE /notifications/token` (§6.8). It keeps the newest 10. `ember-api` removes a token that FCM reports as unregistered or invalid. Agents also read `volunteers/{uid}.displayName` as a fallback reporter name, but nothing in this repository writes that field.

`volunteers/{uid}.agency` is an optional string, the caller's agency name. `GET /dashboard` (§6.9) reads it for the signed-in supervisor and returns `null` when it is missing or blank. Nothing in this repository writes it.

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

Written by `ember-agents` (fusion). `counters/incidents` has one field, `value`, the number of the last incident named (no document means 0). A transaction takes the next number each time fusion creates an incident, so two incidents never share a number. A gap is possible when naming succeeds and the incident write then fails.

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
| `status` | string | `to_verify` on first sight. A person or a later service may change it, and ingest never overwrites it. `checked_no_fire` is the value `GET /dashboard` counts as a cleared false alarm (§6.9). Nothing in this repository writes it |
| `firstSeenAt` | string | Kept from the first run |
| `lastSeenAt` | string | The latest run that saw it |
| `ingestRunId` | string | |
| `verifiedBy`, `verifiedAt`, `incidentId` | string | Optional. Set by a person or a later service, and ingest never overwrites them |
| `seeded` | `true` | Only on hand-seeded demo leads (`source` is `seed`) |

`weather/current`: `id`, `source` (`open-meteo`), `lat`, `lng`, `observedAt`, `windKmh`, `windDirDeg`, `gustKmh`, `tempC`, `humidityPct`, `precipMm` (numbers may be null), `fetchedAt`, `ingestRunId`. Wind reaches a WITHDRAW only through the agents rule in §8.

`psi/current`: `id`, `source` (`data.gov.sg`), `observedAt`, `updatedAt`, `psi24h` (a map of region to number), `psi24hMax` (number), `pm25_24h` (a map of region to number), `fetchedAt`, `ingestRunId`.

`ingestRuns/{runId}`: `id`, `startedAt`, `finishedAt`, `ok` (boolean), and `sources`, a map with `firms`, `weather`, and `psi`. Each entry has `ok` and either its count or value (`leads`, `windKmh`, or `psi24hMax`) or an `error` string.

## 6. REST

Base URL is the `ember-api` origin. Unless a route says otherwise, the caller is any signed-in role and the success body is the stored record.

### 6.1 `GET /me`

Returns §2. `401` or `403` as in §3.

### 6.2 `POST /observations`

Creates one immutable `chip`, `text`, or `photo` observation. `ember-api` then hands it to the agents intake in §8. Any signed-in role may call it. The route does not check for `volunteer`.

What each `source` needs:

| `source` | `chip` | `text` | `photoPath` |
|---|---|---|---|
| `chip` | Required, one of the four chips | Optional | Not used |
| `text` | `null` or omitted | Required, not blank | Not used |
| `photo` | `null` or omitted | Optional | Required, see below |

`source: live` is `400`. `clientId` is optional on every source. `accuracyM` may be omitted or `null`. Fields the server owns (`id`, `volunteerId`, `severity`, and the rest) are ignored when sent.

Request, chip:

```json
{
  "source": "chip",
  "capturedAt": "2026-10-13T08:12:00Z",
  "lat": 1.482,
  "lng": 102.115,
  "accuracyM": 18,
  "chip": "api",
  "text": null,
  "clientId": "ob-7f3a"
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

Request, photo, after the upload in §6.7:

```json
{
  "source": "photo",
  "capturedAt": "2026-10-13T08:15:00Z",
  "lat": 1.482,
  "lng": 102.115,
  "accuracyM": 18,
  "chip": null,
  "text": null,
  "photoPath": "photos/uid_sari/20261013/3f2a9c4e5b7d4a1e8c6f0b2d9a7e5c31.jpg"
}
```

The server fills `id`, `volunteerId`, `receivedAt`, `severity`, `volunteerName` (when the token has a display name), and `immutable`. For `chip` and `text` it also sets `photoPath` to `null`. Response `201` with the stored observation:

```json
{
  "id": "obs_01",
  "volunteerId": "uid_sari",
  "capturedAt": "2026-10-13T08:12:00Z",
  "receivedAt": "2026-10-13T08:12:04Z",
  "volunteerName": "Sari",
  "clientId": "ob-7f3a",
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

`source: live` is rejected on this route (`400`, `fields.source`). Live observations are created by the gateway in §7.

A `photo` observation uses the `photoPath` that `POST /photos/upload-url` returned (§6.7). The path must be well formed and under the caller's own uid, and `ember-api` must have issued it to that caller. A missing or malformed path is `400`. Another volunteer's path, or one that was never issued to the caller, is `403 forbidden`. The photo is not read at this point. A `photo` observation is stored with severity `unknown`.

Status codes: `201` created, `200` replay (below), `400` validation, `401`, `403` photo path, `409` for `PUT`, `PATCH`, and `DELETE` (below).

`PUT`, `PATCH`, and `DELETE` on `/observations` and on `/observations/{id}` return `409` with code `conflict` and the message `Observations are immutable`. Nothing is changed.

A request that carries no `clientId` and is sent again creates a new observation. A request with a `clientId` is idempotent per volunteer: sending the same `clientId` again changes nothing, writes no second audit record, and returns `200` with the observation stored the first time, even if the body differs. Validation runs before the replay lookup, so a replay whose `capturedAt` has since fallen outside the 7 day window is `400`, not `200`.

The hand-off to agents happens after the write. If it fails, the response is still `201` and the observation waits in `intakePending` (§8).

### 6.3 `GET /incidents` and `GET /incidents/{id}`

`GET /incidents` returns a JSON array of incident records, scoped as in §5.6.

A supervisor's `GET /incidents` adds five fields to each record, read from the stored reports so the list needs no call per incident. A volunteer's list has none of them.

| Field | Type | Notes |
|---|---|---|
| `reportCount` | number | The observations the incident holds that can be read. `0` when there are none |
| `volunteerCount` | number | Distinct volunteers who reported on the incident. `0` when there are none |
| `needsHelp` | boolean | `true` when any of those reports is the `butuh_bantuan` chip. Nothing clears it: the report stays on the incident |
| `verified` | boolean | `true` when an `incident.verify` audit row exists for the incident |
| `verifiedBy` | string or null | `actorName` of the newest `incident.verify` row, else that supervisor's `volunteers/{uid}.displayName`. `null` when neither is stored, including on rows written before `actorName` existed |

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

`observations` are the full immutable records for `conflict.observationIds` when a conflict exists, otherwise the observations clustered into this incident. Because a conflict lists only the two sides of the disagreement (§5.4), an incident with a conflict does not list its other observations here. Records that cannot be found are left out. Each record has the fields listed under §5.1 (no `clientId`). For a supervisor each record also has `volunteerName` when one was stored with the observation (the key is absent otherwise). A volunteer's read never has it.

For a supervisor the body has one more key, `evidenceFactors`: the stored factors of §5.2 as `[{ "factor", "points", "detail" }]`, or `[]` when none are stored. A volunteer's read does not have the key. `detail` is an English sentence, as in §12.3.

`conflict` is `null` when the incident has no `conflictId`. `tasks` are all the incident's tasks for a supervisor, and only the caller's own for a volunteer.

**Supervisor extras (#92, #101).** For a supervisor the body has three more keys. All are read from stored records and none is computed by a model. A volunteer's read has none of them. They are always present for a supervisor: `volunteers` and `timeline` are `[]` and `summary` is `null` when nothing is stored.

`volunteers` has one card for every volunteer the incident knows: anyone with a report in `incident.observationIds` or in the conflict, anyone with a task on it, and the volunteers of an active withdraw. Unlike `observations`, it covers every report, so a conflict does not hide a third volunteer. Sorted by `lastReportAt` newest first (no report last), then `volunteerId`.

| Field | Type | Source |
|---|---|---|
| `volunteerId` | string | |
| `name` | string or null | The newest non-blank `volunteerName` on their observations, else `volunteers/{uid}.displayName`, else `null` |
| `reportCount` | number | Their observations on this incident. `0` for a volunteer who only has a task or a withdraw entry |
| `firstReportAt`, `lastReportAt` | string or null | `capturedAt` of their oldest and newest report |
| `lastSeverity` | severity enum or null | The newest report's severity |
| `lastLat`, `lastLng`, `lastAccuracyM` | number or null | The newest report's position and accuracy. `lastAccuracyM` is `null` when the report has none. This is where the volunteer last reported, not a live position |
| `distanceM` | number or null | Straight-line metres from the incident's centre (`incident.lat`, `incident.lng`) to their newest report, rounded. It is not the distance to the flame edge, which no service stores |
| `lastHeardAt` | string or null | The latest of their newest report's `receivedAt` and the `heardAt` of any of their tasks on this incident. `null` when neither exists |
| `pushReady` | boolean | `volunteers/{uid}.fcmTokens` holds at least one token. Only this yes or no is returned, never a token or a phone number |
| `withdraw` | object or null | `null` unless a withdraw is active and lists this volunteer |

`withdraw` on a card:

| Field | Type | Source |
|---|---|---|
| `sentAt`, `heardAt`, `sendCount` | string, string, number, each or null | The volunteer's newest `withdraw` task (§5.3). `heardAt` is when their app said it showed the instruction (`POST /tasks/{id}/heard`). The volunteer app calls that route once when the withdraw is on screen, so it stays `null` until the app has shown it. `null` when the volunteer has no withdraw task |
| `delivery` | `sent`, `failed`, `skipped` or null | The newest `notificationAttempts` record for that task (§5.7). `null` when none was written |
| `safe` | boolean | The volunteer is in `withdraw.safeVolunteerIds` |
| `safeAt` | string or null | The `at` of the `withdraw.safe` audit row for them. `null` when not safe, and for a mark whose audit row has no `subjectId` |
| `safeBy` | `{ "id", "name" }` or null | The row's `actorId`, and that supervisor's `volunteers/{uid}.displayName` or `null`. `null` under the same rules as `safeAt` |

`timeline` is the incident's history, oldest first, at most the newest 100 entries. It merges every report the incident knows with the audit rows whose `targetId` is the incident or one of its tasks. `observation.create` rows are left out because the report is listed itself.

| Field | Type | Notes |
|---|---|---|
| `kind` | `report` or `audit` | |
| `id` | string | The observation id, or the audit id |
| `at` | string | A report's `capturedAt`, or the audit row's `at` |
| `action` | string or null | The audit `action` (§5.5). `null` for a report |
| `actorId` | string or null | The reporter, or the audit actor (`code` when code decided) |
| `actorName` | string or null | The reporter's `volunteerName`, else the actor's `volunteers/{uid}.displayName`. Always `null` for `code` |
| `volunteerId` | string or null | The reporter. On an audit row, the `subjectId` or else the volunteer of the task the row is about |
| `taskId` | string or null | The task an audit row is about |
| `severity`, `source`, `chip`, `text` | each or null | A report's own values, as in §5.1. `null` on an audit row |

`summary` is `null` unless `incident_summaries/{incident id}` exists with a non-blank `english` or `bahasa`. Then it is `{ "english", "bahasa", "source", "at" }` (§5.7). It is advisory text and states no severity. Nothing calls the summary route today (§8.1), so it is `null` until something does.

Not returned, because no service stores a source: conditions at the site (wind, humidity, air quality, next satellite pass), a volunteer's crew role, battery, network, spoken language or place name, the crew lead, an English translation of a report, and free-form advice. What EMBER proposes is the incident's `tasks` with `status: proposed` (agents write only `verify` proposals, when a conflict opens, §5.3) and the reasons behind the score are `evidenceFactors` (§6.3), so those are the suggestions a screen can show. `weather` and `psi` stay internal (§1 rule 7, §12.4).

Who can read what:

| Route | Supervisor | Volunteer |
|---|---|---|
| `GET /incidents` | Incidents with status `open`, `held`, or `verified` | Incidents linked to the caller by the rule in §5.6, in any status |
| `GET /incidents/{id}` | Any incident, including `extinguished` | `404` unless the caller has a task, a withdraw entry, or an observation on it. The caller then sees every observation listed, including other volunteers' `volunteerId` |

A supervisor's `GET /incidents/{id}` also carries `volunteerPhones`, an object of `volunteerId` to phone number, while a withdraw is active. It has an entry only for a volunteer on that withdraw whose `volunteers/{uid}.phone` is a non-blank string, and is `{}` when there is none. No service writes `phone` yet. A volunteer's read never has it.

**Supervisor extras (#95, #105).** For a supervisor the body has two more keys, both read from stored records. A volunteer's read has neither.

`conflictContext` is `null` when the incident has no conflict. Otherwise it is an object with two lists, `[]` when nothing is stored:

| Field | Type | Source |
|---|---|---|
| `otherObservations` | observation[] | The reports in `incident.observationIds` that are not in `conflict.observationIds` (a `smoke` or `unknown` report is on neither side, §5.4), oldest first. Each is the §5.1 record that `observations` carries, with `volunteerName` when one was stored. `observations` itself is unchanged and still lists only the two sides |
| `audit` | timeline entry[] | The audit rows that decide the disagreement, oldest first, the newest 100, in the shape of a `timeline` audit entry: `task.approve`, `task.reject`, `task.edit`, `task.resend` and `task.heard` rows whose `targetId` is a `verify` or `investigate` task of the incident, and `incident.verify`, `incident.extinguish` and `incident.severity.lower` or `.raise` rows whose `targetId` is the incident. Withdraw, instruct, re-ignition and `observation.create` rows are left out |

The same data supports what the screen shows. The reasons behind `evidenceScore` are `evidenceFactors`. **No wind or satellite factor is stored:** fusion writes only `severity`, `corroboration`, `photo`, `gps` and `conflict` (§5.2), and wind enters only the withdraw reasons (§5.2). **No audit row records the moment a conflict opened**, and **no service creates an `investigate` task** (§5.3), so a proposed dispatch appears in `tasks` only if one is written some other way. None of the three is invented here.

`agencyInCharge` is the trimmed `incidents/{id}.agency` (§5.2), or `null` when the field is missing, not a string or blank. Nothing writes it today, so it is `null` until a later change records an agency. It is never taken from the signed-in supervisor's profile: `GET /dashboard` returns that agency as `agency` (§6.9), and it names the supervisor's own agency, not the one in charge of an incident.

`GET /incidents` returns the full incident record of §5.2 without `observationIds` and `evidenceFactors`, sorted by `id`.

### 6.4 `GET /digest`

Returns the §5.6 digest for the caller. The two web apps poll `GET /digest` (volunteer) and `GET /incidents` (console) every 5 seconds.

### 6.5 Approval and human incident actions

`GET /tasks?status=proposed` (supervisor only) lists the tasks waiting for a decision, sorted by `incidentId` and then `id`. `status=proposed` is the only filter: another value, or none, is `400` with `fields.status`. A volunteer is `403`. Each item is:

```json
{
  "task": { "id": "task_01", "incidentId": "inc_01", "volunteerId": "uid_sari", "type": "verify", "status": "proposed", "instruction": "Check the east bank", "sentAt": null, "heardAt": null, "sendCount": null, "resendAt": null },
  "incident": { "id": "inc_01", "name": null, "area": null, "label": "Incident · 1.48°N 102.11°E", "status": "held", "severity": "small_flame", "conflictId": "con_01" },
  "volunteerName": "Sari"
}
```

`incident.label` is the stored `name`, else `Incident · <area>`, else `Incident · <coordinates>`, else `Incident`. `incident` is `null` when the incident record cannot be read. `volunteerName` is the name on one of the volunteer's reports on that incident, else `volunteers/{uid}.displayName`, else `null`. The list has the same members as the `approvalsCount` in §6.9, and approve, reject and edit below work on these task ids.

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
| `POST /tasks/{id}/approve` | none | `proposed` becomes `approved`. Allowed for `verify`. Allowed for `investigate` only when that incident has no open conflict. Rejected for `withdraw`. A task that is not `proposed` is `409` |
| `POST /tasks/{id}/reject` | none | `proposed` becomes `rejected`. Rejected for `withdraw`. A task that is not `proposed` is `409` |
| `POST /tasks/{id}/resend` | none | Supervisor. Sends a sent, unheard task again: `sentAt` becomes now, `sendCount` goes up by one, a `task.resend` audit is appended, and the task is pushed again (§6.6). `409` unless the task is `approved` and not heard. Allowed for `withdraw` tasks. The answer is the task and the `auditId` |
| `POST /tasks/{id}/heard` | none | **Volunteer, and only for their own task** (a supervisor is `403`, another volunteer's task is `404`). Sets `heardAt` once and appends a `task.heard` audit with the volunteer as `actorId`. A repeat returns the task with `auditId: null` and writes nothing. `409` unless the task is `approved`. The volunteer app calls it once when a sent task or WITHDRAW is on screen |
| `POST /tasks/{id}/edit` | `{ "instruction": "Check the east bank again" }` | Replaces `instruction` only. Type, status, volunteer, and incident stay the same. `instruction` is required, not blank, at most 500 characters. A `withdraw` task is `409`. The route does not check the task's status, so a task that is already `approved` or `rejected` can be edited |
| `POST /incidents/{id}/verify` | none | `status` becomes `verified`. `409` unless the status is `open` or `held` |
| `POST /incidents/{id}/extinguish` | none | `status` becomes `extinguished`. `409` when it already is |
| `POST /incidents/{id}/severity` | `{ "severity": "smoke" }` | Stores the new severity only when it is strictly lower on the scale in §1, otherwise `409`. `severity` must be `none`, `smoke`, `small_flame`, or `large_flame`; `unknown` and anything else is `400`. A stored `unknown` severity is never lowered (`409`) |
| `POST /incidents/{id}/volunteers/{volunteerId}/instruct` | `{ "instruction": "Move to the east road and report" }` | Sends one free-text instruction to one volunteer. Creates an `instruct` task with `status: approved`, `sentAt` now and `sendCount` 1, pushes it (§6.6) and appends a `task.instruct` audit row. `201` with the task and `auditId`. `instruction` is required, not blank, at most 500 characters (`400`). The volunteer needs a report, a task or a withdraw entry on the incident (`400` on `fields.volunteerId`). `409` when the incident is `extinguished`, or when the volunteer is on an active withdraw and not in `safeVolunteerIds`: an instruction can never hold or replace a WITHDRAW. An open conflict does not block it. It changes nothing on the incident |
| `POST /incidents/{id}/withdraw` | see below | Issues a withdraw instruction. This is not an approval |
| `POST /incidents/{id}/withdraw/safe` | `{ "volunteerId": "uid_sari" }` | Adds the volunteer to `incident.withdraw.safeVolunteerIds` and appends a `withdraw.safe` audit. It never changes `active`. `400` when `volunteerId` is missing or not in `withdraw.volunteerIds`. `409` when there is no active withdraw or the volunteer is already marked. Returns the incident and `auditId` |

Withdraw request:

```json
{
  "volunteerIds": ["uid_sari"],
  "instruction": "Withdraw upwind. Do not engage.",
  "reasons": ["supervisor instruction"]
}
```

The route sets `incident.withdraw`, creates one `withdraw` task with `status: approved` and that `instruction` for each id, and appends a `task.withdraw` audit with the supervisor’s uid and the incident id as `targetId`. `volunteerIds` must be a non-empty list of strings (duplicates are dropped), and each must already have an observation or a task on this incident, otherwise `400`. `instruction` is required, not blank, at most 500 characters. `reasons` is optional, a list of strings, and defaults to `[]`.

A new withdraw also stores `source: supervisor`, `sentAt` (now), and `safeVolunteerIds: []`. If a withdraw is already active, the new `volunteerIds` are added to the existing list and `instruction` and `reasons` are replaced by this request's, and `source`, `sentAt` and `safeVolunteerIds` are kept. A task is still created for every id in the request, including ones already listed.

Pushes. After the commit, `approve` pushes the task to its volunteer, `instruct` pushes the task it created, and `withdraw` pushes each task it created (§6.6). `reject`, `edit`, `verify`, `extinguish`, and `severity` send no push. An unknown task or incident is `404`. A volunteer is `403` on every route here except `POST /tasks/{id}/heard`.

Code uses the same writes when it fires WITHDRAW. Its `actorId` is `code`, and its `volunteerIds` are every volunteer who already has an observation or a task on the incident. Code does not call the supervisor route and does not wait.

### 6.6 Update channels

Clients refresh by polling `GET /incidents` and `GET /digest`. The gateway sends one `digest` message on the socket when a Live session starts (§7). It sends no later ones.

FCM is the third channel, used when the app is not in a Live session. `ember-api` sends a push in four cases: a supervisor approves a task, the supervisor `instruct` route creates a task, the supervisor withdraw route creates withdraw tasks, and agents report a code WITHDRAW (`POST /internal/notifications/withdraw`, §8). **No code sends a supervisor alert.** Earlier versions of this contract listed one.

The payload has a `notification` with `title` `EMBER` and `body` set to the task's stored `instruction` (`New task` when it is blank), and a `data` map with `taskId`, `incidentId`, and `type`. It has no volunteer name and no coordinates. The push goes to every token in `volunteers/{uid}.fcmTokens` for the task's volunteer. Each token gets up to 3 attempts for transient errors. A token that FCM reports as dead is removed. Each task push appends one `notificationAttempts` record (§5.7). The push is sent after the task is committed, and a failed push never undoes it. The service worker opens `/pwa` when a push is tapped, and `/pwa?push=withdraw` for a withdraw.

A device registers its token with `POST /notifications/token` (§6.8).

### 6.7 `POST /photos/upload-url`

Volunteers only. A supervisor receives `403`. It gives a short-lived signed URL for one still image in the private photo bucket. The browser then sends a `photo` observation (§6.2) with the returned `photoPath`.

Request:

```json
{ "contentType": "image/jpeg" }
```

`contentType` is `image/jpeg` or `image/webp`. Anything else, or a body that is not a JSON object, is `400` with `fields.contentType`. Response `201`:

```json
{
  "uploadUrl": "https://storage.googleapis.com/...",
  "method": "PUT",
  "headers": { "Content-Type": "image/jpeg" },
  "photoPath": "photos/uid_sari/20261013/3f2a9c4e5b7d4a1e8c6f0b2d9a7e5c31.jpg",
  "expiresAt": "2026-10-13T08:17:00Z"
}
```

The client sends the file with exactly that `method` and `Content-Type` header. The URL works for 300 seconds by default (`PHOTO_UPLOAD_TTL_SECONDS`, at least 60 and at most 900). `photoPath` is `photos/<uid>/<yyyymmdd>/<32 hex>.jpg` or `.webp`. `ember-api` records the upload in `photoUploads` (§5.7). It sets no size limit on the upload. The agents triage refuses a photo over 8 MB (§8.1).

#### `GET /incidents/{id}/photos/{observationId}`

Supervisor only (a volunteer is `403`). Returns a short-lived signed URL to read one photo report of the incident, so the console can show the snapshot. The object stays private and the bucket is unchanged. Response `200` with `Cache-Control: no-store`:

```json
{ "url": "https://storage.googleapis.com/...", "expiresAt": "2026-10-13T08:17:00Z" }
```

The URL is a V4 signed `GET` that works for 300 seconds by default (`PHOTO_READ_TTL_SECONDS`, at least 60 and at most 900). `404` when the incident is unknown, the observation is not one of the incident's (`observationIds` or its conflict), it has no `photoPath`, or the path is not `photos/<the reporter's uid>/...`. `503 unavailable` when the URL cannot be signed. `ember-api` signs through the same IAM `signBlob` path as uploads and reads with its existing object access on the bucket.

### 6.8 `POST` and `DELETE /notifications/token`

Volunteers only. A supervisor receives `403`. The body is `{ "token": "<FCM device token>" }`. `token` is required, a string of at most 4096 characters with no whitespace, otherwise `400`. A body may also carry `volunteerId`, but it must equal the caller's uid or the route is `403`. The uid always comes from the ID token.

- `POST` stores the token in `volunteers/{uid}.fcmTokens` once, keeps the newest 10, and removes the same token from any other volunteer's list. Response `200` `{ "stored": true }`, or `false` when it was already stored.
- `DELETE` removes it. Response `200` `{ "removed": true }`, or `false` when it was not stored.

### 6.9 `GET /dashboard`

Supervisor only. A volunteer receives `403 forbidden`. This is the summary the console reads, every 15 seconds. The chrome uses `agency`, `serverTime`, and `approvalsCount`. The live banner uses `updatedAt`, `nextSatellitePass`, and `liveFires`. Season impact uses `seasonImpact`. The chart cards use `charts`. A re-ignition alert uses `reignitionAlert`. The crews, wind, satellite-lead, and peat map layers are not in this response. The route does not return tasks, volunteer ids, volunteer names, or device tokens: only counts and figures. `ember-api` computes every figure on each read from records the other services already store, and writes nothing.

```json
{
  "agency": "BPBD Kepulauan Meranti",
  "serverTime": "2026-10-16T07:46:00Z",
  "approvalsCount": 2,
  "updatedAt": "2026-10-16T07:46:00Z",
  "nextSatellitePass": null,
  "liveFires": [
    {
      "id": "inc_01",
      "peopleOnSite": 2,
      "withdrawActive": false,
      "code": "#3",
      "placeName": "Bengkalis, Riau",
      "liveCameras": null,
      "photoCadence": null,
      "distanceToRisk": null,
      "since": "2026-10-16T07:10:30.000Z"
    }
  ],
  "seasonImpact": {
    "since": "2026-10-14T01:00:00.000Z",
    "region": "Riau",
    "crewCount": 4,
    "firesContained": 2,
    "firesContainedNote": "Extinguished by a supervisor, of 4 incidents",
    "falseAlarmsCleared": 0,
    "falseAlarmsNote": "Satellite leads a person checked and found no fire",
    "injuries": null,
    "injuriesNote": "No injury reports are recorded in EMBER",
    "medianTimeToHumanCheck": "20 min",
    "medianTimeNote": "First report to supervisor verification, 3 incidents",
    "reignitionsCaught": 1,
    "reignitionsNote": "2 alerts near 1 extinguished site. A person still has to look"
  },
  "charts": {
    "satelliteNote": "3 satellite leads in the last 7 days. Real = linked to an incident",
    "realFires": 1,
    "dismissed": 1,
    "medianNote": "Last 24 hours, 2 incidents",
    "medianToday": "15 min",
    "medianTarget": null,
    "crewNote": "On site = reported from a live fire. En route = sent a task, no report yet. Offline = no device registered",
    "onSite": 1,
    "enRoute": 1,
    "ready": 2,
    "offline": 3,
    "weatherNote": "Open-Meteo, fixed monitoring point, read 07:00 UTC",
    "airTempC": 31.2,
    "humidity": "62%",
    "wind": "12 km/h SW",
    "windKmh": 12.4,
    "windDirDeg": 225,
    "rain": "0.0 mm"
  },
  "reignitionAlert": null
}
```

| Field | Type | Source |
|---|---|---|
| `agency` | string or null | `volunteers/{uid}.agency` for the caller, trimmed. `null` when the document is missing, the field is not a string, or the value is blank |
| `serverTime` | string | Server time when the response is built. ISO-8601 UTC, the same format as stored timestamps |
| `approvalsCount` | number | How many `tasks` have `status: proposed`. A task has no supervisor id, so this counts every proposed task, not one person's queue. `0` when none are waiting. The tasks themselves are not returned |
| `updatedAt` | string | Same instant as `serverTime`. The live banner shows it as the time this picture was built |
| `nextSatellitePass` | null | No stored source. The banner shows the empty treatment. A pass time is not invented here |
| `liveFires` | array | Incidents whose `status` is `open`, `held`, or `verified`, sorted by `id`. Extinguished incidents are omitted. `[]` when none are live |

Each `liveFires` item:

| Field | Type | Source |
|---|---|---|
| `id` | string | Incident id |
| `peopleOnSite` | number | Distinct `volunteerId` values on that incident's tasks, its `observationIds`, and the observations of its conflict. `0` when none |
| `withdrawActive` | boolean | `incident.withdraw.active` is true |
| `code` | string | The `#<number>` at the end of the incident's `name` (§5.2), such as `#3`. For an incident with no named number, `INC-` and the last 4 characters of the id in capitals, the same short form the console uses |
| `placeName` | string or null | The incident's `area`. When `area` is `null`, the place part of `name`. When both are `null`, a coordinate label such as `15.05°N 77.63°E` from the stored `lat` and `lng`. `null` only when none of these exists |
| `since` | string or null | The earliest `receivedAt` (else `capturedAt`) among the incident's own `observationIds`. `null` when none of those observations can be read |
| `liveCameras`, `photoCadence`, `distanceToRisk` | null | No stored source. The banner shows the empty treatment |

`seasonImpact` is always present. Each figure is computed on read from stored records. A figure with no stored source stays `null`. A count over zero records is `0`, not `null`.

| Field | Type | Source |
|---|---|---|
| `since` | string or null | The earliest first-report time (as `since` above) over all incidents. `null` when no incident has a readable observation |
| `region` | string or null | The provinces in the stored `area` values, the part after the last `, ` (`Riau` in `Bengkalis, Riau`), most incidents first, at most 3, joined by `, `. Coordinate-label areas have no province. `null` when no area has one |
| `crewCount` | number | Distinct volunteer ids across incident observations, tasks, and `volunteers` documents that hold at least one device token |
| `firesContained` | number | Incidents with `status` `extinguished` |
| `falseAlarmsCleared` | number | `leads` with `status` `checked_no_fire` (§5.7). Satellite leads only: there is no incident status for a false alarm |
| `injuries` | null | No stored source. Withdraw `safeVolunteerIds` mean found safe and are not injuries |
| `medianTimeToHumanCheck` | string or null | The median, over incidents, of the time from the first report to the first `incident.verify` audit row (§5.5), as `45 s`, `12 min`, or `1 h 05 min`. An incident with no verify row or no readable report is left out. `null` when none qualify |
| `reignitionsCaught` | number | Distinct incidents with at least one `site.reinspect` audit row (§5.5). An alert asks a person to look again. It is not a confirmed re-ignition |
| `firesContainedNote`, `falseAlarmsNote`, `medianTimeNote`, `reignitionsNote` | string or null | The line under each figure: what was counted and how many records it covers. `medianTimeNote` is `null` when the median is |
| `injuriesNote` | string | `No injury reports are recorded in EMBER`, so the empty card says why |

`charts` is always present. Each field is computed on read, or `null` when its source has no data.

| Field | Type | Source |
|---|---|---|
| `satelliteNote`, `realFires`, `dismissed` | string, number | `leads` whose `firstSeenAt` is within the last 7 days. `dismissed` counts `status` `checked_no_fire`. `realFires` counts leads a person linked to an incident (`incidentId` is set). `to_verify` leads count in neither |
| `medianToday`, `medianNote` | string or null | The same median as `medianTimeToHumanCheck`, over incidents whose verify row is within the last 24 hours. This is a rolling 24 hours, not a calendar day. `medianToday` is `null` when none qualify and `medianNote` says so |
| `medianTarget` | null | No target is stored anywhere |
| `onSite` | number | Distinct volunteers with an observation on a live incident (`open`, `held`, `verified`), including its conflict observations |
| `enRoute` | number | Distinct volunteers with an `approved` task that is not a `withdraw`, on a live incident, who are not already on site. Nothing stores a volunteer's movement, so this means "was sent a task and has not reported from the fire" |
| `ready` | number | Volunteers with at least one device token (§5.7 `volunteers`) who are not on site or en route |
| `offline` | number | Volunteers seen on an observation or task with no device token, who are not on site or en route |
| `crewNote` | string | What the four counts mean |
| `windKmh`, `windDirDeg` | number or null | `weather/current.windKmh` to one decimal, and `windDirDeg` (the direction the wind blows **from**, 0 to 359.9) to one decimal. The console draws one arrow from them. `null` when not stored. Same fixed monitoring point as `wind` |
| `airTempC`, `humidity`, `wind`, `rain`, `weatherNote` | number or string, or null | `weather/current` (§5.7), from the hourly ingest at one fixed monitoring point, not at the incident. `airTempC` is `tempC` to one decimal. `humidity` is `62%`. `wind` is `12 km/h SW`, with the compass point the wind blows from when `windDirDeg` is stored. `rain` is `0.0 mm`. A missing value is `null`. All are `null` when no weather document exists. `weatherNote` carries the read time in UTC |

A source that cannot be read (a Firestore error) leaves its own cards `null` and is logged. The rest of the body is still returned with `200`.

`reignitionAlert` is the newest undismissed re-ignition alert from `sites` (§5.7), or `null` when none. It never includes a lead id, lead kind, or coordinates (rule 7). `code` is always `null` until a stored site code exists.

| Field | Type | Source |
|---|---|---|
| `id` | string | The alert id on the `sites` document |
| `incidentId` | string | The extinguished incident id (also the site document id) |
| `code` | null | No stored site code. The banner shows the empty treatment |
| `distanceM` | number | `alert.distanceM` |
| `extinguishedAt` | string | `site.extinguishedAt` |
| `message` | string | `alert.message` |
| `taskId` | string or null | Set after Send creates a proposed `verify` task. `null` while Send and Dismiss are still offered |

### 6.10 Re-ignition alert actions

Supervisor only. A volunteer receives `403`. Neither route changes the incident status or severity. The extinguished incident stays extinguished.

| Method | Path | Body | Success |
|---|---|---|---|
| `POST` | `/sites/{incidentId}/alerts/{alertId}/dismiss` | `{ "reason": string }` non-blank, at most 500 characters | `200` `{ dismissed: true, auditId }`. Marks the alert dismissed on the site and writes `site.dismiss` |
| `POST` | `/sites/{incidentId}/alerts/{alertId}/recheck` | none | `200` `{ task, auditId, alert }`. Creates a proposed `verify` task for one volunteer already on the site, sets `alert.taskId`, writes `site.recheck`. `409` when no volunteer is on the site, the alert was dismissed, or a re-check was already sent |

`displayName` and `role` stay on `GET /me` (§6.1). There is no `onDuty` field, because no stored on-duty flag exists. `401` and `403` are as in §3. A profile with no agency is still `200` with `agency: null`. The crews, wind, satellite-lead, and peat map layers are not on this response.

## 7. WebSocket

`voice-gateway` serves the WebSocket at `/`, with no other path. `/healthz` stays public. The upgrade is meant to carry the same two headers as §2. The gateway checks the ID token's signature, expiry, and role (not revocation), and App Check follows `APP_CHECK_ENFORCE` as in §2. For invalid credentials it sends `{ "type": "session.closed", "reason": "unauthorized" }` and closes the socket before a Gemini session starts. It does not read tokens from the query string.

**Browser handshake: undecided.** A browser `WebSocket` cannot set request headers, so a browser cannot meet this handshake. The web app (`apps/web/src/pwa/gateway/pttSession.ts`) reports voice as unavailable and the volunteer uses the quick report. The WebSocket cannot be used from the PWA until this contract defines a handshake a browser can do.

The session opens when the client sends `session.start` (push to talk) and closes about 30 seconds after the reply, on `session.stop`, or when a cap is reached. The gateway uses manual activity detection so wind and engine noise do not open a turn. Caps are configurable per user and per operation. Hitting a cap closes with `cap_reached` and does not open a further Gemini session.

Caps: `LIVE_MINUTE_CAP_USER` (default 10 minutes for one user) and `LIVE_MINUTE_CAP_OP` (default 60 minutes across all users). The smaller remainder applies. Usage is counted in memory in each Cloud Run instance, so it is not shared between instances and starts again when an instance restarts. A `session.start` with no minutes left gets `session.closed` with `cap_reached` and no `session.ready`. A running session is closed with `cap_reached` when its remaining minutes are used.

Before `session.start`, the gateway reads only `location` messages. It ignores, without any reply, every other message, malformed JSON, unknown types, invalid base64, and a `location` that is not valid.

Messages are JSON text. Audio and frames use base64 in those messages.

Client to gateway:

```json
{ "type": "session.start" }
{ "type": "location", "lat": 1.482, "lng": 102.115, "accuracyM": 18, "capturedAt": "2026-10-13T08:12:00Z" }
{ "type": "audio", "data": "<base64>" }
{ "type": "frame", "data": "<base64>", "capturedAt": "2026-10-13T08:12:01Z" }
{ "type": "session.stop" }
```

Message details:

- `location` needs `lat` (−90 to 90), `lng` (−180 to 180), and a non-empty `capturedAt` string. `accuracyM` is optional and kept only when it is a number from 0 to 1,000,000, otherwise it is `null`. The latest valid `location` is kept, and it may arrive before or after `session.start`. The gateway does not check that `capturedAt` is an ISO timestamp.
- `audio` is base64 of raw 16-bit PCM at 16 kHz. The gateway forwards it as `audio/pcm;rate=16000`. When no `audio` has arrived for 1 second, the gateway tells Gemini the turn has ended. It does this once per session.
- `frame` is base64 of a JPEG, forwarded as `image/jpeg`. `capturedAt` is optional. A frame less than 1 second after the previous kept frame is dropped. The gateway compares `capturedAt`, or its own clock when `capturedAt` is missing or unreadable.
- `session.stop` closes the session and the gateway answers `session.closed` with `idle_timeout`.

Frames are about one per second while the session is open.

Gateway to client:

```json
{ "type": "session.ready" }
{ "type": "audio", "data": "<base64>" }
{ "type": "digest", "digest": { "updatedAt": "2026-10-13T08:12:05Z", "incidents": [], "myTasks": [] } }
{ "type": "observation.created", "observationId": "obs_03" }
{ "type": "session.closed", "reason": "reply_complete" }
```

`session.closed` `reason` is one of:

| `reason` | When |
|---|---|
| `reply_complete` | 30 seconds after the last reply audio or turn end, with nothing else closing the session first |
| `idle_timeout` | The client sent `session.stop`. The code has no idle timer |
| `cap_reached` | A minute cap in the paragraph above |
| `unauthorized` | The upgrade credentials were rejected |

If the client just disconnects, the gateway sends nothing and counts the minutes used.

On session start the gateway injects the caller’s current digest into the Gemini Live context. It then sends `session.ready` and one `digest` message, in that order. The digest is not sent again during the session. `audio` messages carry Gemini's reply as base64. The code does not set or convert the audio format, so the format is whatever Gemini Live returns.

Gemini Live runs through Vertex with the gateway's own service account, with no API key. The model is `LIVE_MODEL` and the region is `LIVE_LOCATION` (default `us-central1`; Gemini Live has no Asia endpoint). Replies are audio. The README records that the latency gate, a push-to-talk report on a real phone through the deployed gateway in Singapore, has not passed.

### 7.1 Tools

The model may call these tools. It has no other way to read or write incident state.

`submit_observation`

```json
{ "severity": "small_flame", "text": "Api kecil di tepi kanal" }
```

The gateway writes one immutable observation with `source: live`. `lat`, `lng`, `accuracyM`, and `capturedAt` come from the latest `location` message in the session. Coordinates spoken by the model are discarded. If the session has no location yet, the gateway does not write an observation. After a successful write it calls §8 and sends `observation.created`.

`severity` is one of the five enum values, otherwise `unknown`. `text` is a string, otherwise `null`.

Fields the gateway sets: `volunteerId` (the token uid), `capturedAt` (from `location`), `receivedAt` (the gateway clock), `source` (`live`), `lat`, `lng`, `accuracyM`, `chip` (`null`), `text`, `severity`, `photoPath` (`null`), `immutable`, and `volunteerName` when the token has a display name. It never sets `clientId`. It does not apply the §5.1 rules for the `capturedAt` window, the 280 character text limit, or trimming.

The gateway writes the observation, an `observation.create` audit record, and an `intakePending` entry in one batch. It then calls §8 once, with a 3 second timeout and no retry. A success deletes the `intakePending` entry. A failure leaves it there, and `ember-api` sends it later, but only when a later `POST /observations` to `ember-api` reaches agents, because the resend runs only inside that route. `observation.created` is sent whether or not the agents call worked. The model is told `{ "ok": true, "observationId": "..." }`, or `{ "ok": false }` when the session had no location. The gateway does not check the caller's role for a tool call.

`get_common_picture` takes no arguments and returns the caller’s digest from §5.6.

`get_my_task` takes no arguments and returns the caller’s current task, or `null` when they have none. Current means the newest task for that volunteer whose status is `approved`, with a `withdraw` task preferred over any other type.

A task has no timestamp. The gateway compares the task `id` strings to pick the newest, and the web app (`apps/web/src/pwa/digest.ts`) takes the last match in the digest, which is sorted by `id`. Both give the same task, but an `id` is not in creation order, so "newest" is not guaranteed to be the latest task created. This is undecided (§12.5).

`get_common_picture` and `get_my_task` read the digest again each time they are called.

## 8. Agents intake

`ember-agents` is private. Only the `ember-api` and `voice-gateway` service accounts can invoke the intake route. The Cloud Scheduler account can invoke the scan route (§8.1).

`POST /internal/observations/{observationId}/intake`

No body. The agents service reads the observation from `ember-db`. Response `202`:

```json
{ "observationId": "obs_01" }
```

An observation id that does not exist is `404` with `{ "error": { "code": "not_found", "message": "observation not found" } }`. Calling it again for an observation that is already in an `open`, `held`, or `verified` incident changes nothing and still answers `202`, so the caller may retry. (An `extinguished` incident is not searched, so a repeat call for an observation whose incident has since been extinguished would start a new incident.) `ember-api` calls it with a 3 second timeout after storing an observation. If the call fails, the observation stays in the `intakePending` collection (§5.7) and `ember-api` sends it again after later reports, up to 20 failed attempts. A report is never refused or delayed because agents is down.

The resend runs only inside `POST /observations`, and only after a call to agents has just succeeded. It runs at most every 15 seconds, sends at most 3 observations whose last attempt was at least 30 seconds ago, and stops at the first failure. After a failure `ember-api` skips the agents call for 20 seconds. The `ember-api` and `voice-gateway` calls use the service's own Cloud Run ID token.

Agents may create and update incidents, conflicts, tasks, and audit records, within the field rules in §5. They do not write a digest (§5.6). They cluster nearby observations, set `evidenceScore`, open conflicts, raise severity, and issue code WITHDRAW. They do not verify, extinguish, lower severity, or copy the model’s severity onto the incident.

The high-wind threshold is `EMBER_WIND_WITHDRAW_KMH` (default 40 km/h), compared with `weather/current.windKmh`. If there is no value or the read fails, the wind rule is skipped for that intake. Crossing it produces the same WITHDRAW writes as a `large_flame` observation. The `large_flame` trigger uses the observation's own severity, so a `live` `large_flame` observation fires WITHDRAW even though it does not raise the incident's severity.

After it commits a code WITHDRAW, agents call `POST /internal/notifications/withdraw` on `ember-api` with `{ "incidentId": "inc_01", "tasks": [ { "id": "tsk_01", "volunteerId": "uid_sari" } ] }`, using its Cloud Run ID token, 10 second timeout, and up to 3 attempts. A failure is logged and never undoes the write. `ember-api` answers `202` with `{ "results": [ { "result": "sent", "attempts": 1 } ] }`. It sends the instruction stored on each task, and never text from the caller. It answers `400` when the incident's withdraw is not active or a task is not an approved `withdraw` task of that incident for a listed volunteer, and `404` for an unknown incident or task.

### 8.1 Other agents routes

All are private like the intake route. None is a route for a browser.

| Route | Body | Result |
|---|---|---|
| `POST /internal/sites/scan` | none | Runs the re-ignition watch (§5.7). Cloud Scheduler job `ember-sites-scan` calls it every 15 minutes by default. `200` `{ "sitesWatched", "sitesRemembered", "sitesExpired", "alertsCreated" }`, all numbers |
| `POST /internal/observations/{id}/triage` | Optional `{ "callerId": "<uid>" }` | Advisory photo triage. `200` with the `photo_triage` record (§5.7). `404 not_found` for an unknown observation. `403 forbidden` when the observation has no photo or the photo is not the reporter's (a `rejected` record is stored). `413 photo_too_large` over 8 MB (a `rejected` record is stored). `502 triage_failed` for a model or storage error (an `error` record is stored) |
| `POST /internal/incidents/{id}/summary` | none | Advisory summary. `200` with the `incident_summaries` record (§5.7). `404 not_found` for an unknown incident |

These errors use the §3 body without `fields`. No service in this repository calls the triage or summary routes today, so `photo_triage` and `incident_summaries` stay empty until something does.

## 9. Worked path

Two synthetic volunteers, one disagreement, then a code WITHDRAW.

1. Sari `POST /observations` with chip `api`. Stored severity is `small_flame`.
2. Rizal `POST /observations` with chip `aman` at the same spot. Stored severity is `none`.
3. Agents cluster them into `inc_01`, set severity to `small_flame`, open `con_01`, set status to `held`, and create two proposed `verify` tasks.
4. A supervisor `POST /tasks/{id}/approve` on each verify task. `POST /tasks/{id}/approve` on an `investigate` task for `inc_01` returns `409` with code `conflict` while `con_01` is open.
5. A later observation with severity `large_flame` makes code set `incident.withdraw`, create approved `withdraw` tasks for Sari and Rizal, and append `task.withdraw` with `actorId: code`.
6. Their next `GET /digest` carries `withdraw.active: true` and the instruction, and a push is sent to their devices. A socket `digest` message carries it only if a Live session starts after the withdraw. The PWA shows that instruction full screen.

Step 4's `409` on an `investigate` task can be tried only on a hand-written task, because no service creates one (§5.3). Steps 1 and 2 must be within 300 m of each other for agents to cluster them (§5.2).

## 10. Outside this contract

| Item | Where it belongs |
|---|---|
| Signed photo `PUT` URL | In this contract now: §6.7. Later observations use `photoPath` |
| FCM payload fields | In this contract now: §6.6. Token registration is §6.8 |
| `ops`, `pings`, `crews` | Not required to implement this contract. `volunteers` holds only `fcmTokens` (§5.7) |
| Browser handshake for the WebSocket | Undecided. See §7 |
| Hourly FIRMS, weather, and PSI ingest | Ingest work. The collections it writes are in §5.7. Wind enters WITHDRAW only through the agents rule |
| Flash photo triage, summaries, evals, Memory Bank | The triage and summary routes exist (§8.1) and their records are in §5.7. Nothing calls them yet. Evals and Memory Bank are later agent work |
| Ephemeral-token Live fallback | Only if a later decision replaces the relay |
| Map tiles | Loaded by the browser with the referrer-restricted Maps key |
| Agency report delivery | EMBER does not send agency reports |

## 11. Settings

Names and defaults are the ones the code reads. Terraform in `infra/terraform/cloud_run.tf` sets the Cloud Run values. A name that Terraform sets and no code reads is listed at the end of each table.

### 11.1 `ember-api`

| Variable | Default | Meaning |
|---|---|---|
| `GOOGLE_CLOUD_PROJECT` | `ember-fire-commander` | Project for Firebase Admin and Firestore |
| `FIRESTORE_DATABASE` | `ember-db` | Firestore database. The observation store requires it to be set |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | Comma list of CORS origins |
| `APP_CHECK_ENFORCE` | `false` | `true` rejects a missing or invalid App Check token with `401` (§2) |
| `EMBER_AGENTS_URL` | empty | Agents origin for the intake call. The call is skipped when it is empty |
| `EMBER_AGENTS_CALLER` | empty | Service account email allowed on `/internal/notifications/withdraw`. When empty the route is `401` |
| `PHOTO_BUCKET` | `ember-fire-commander-ember-photos` | Private photo bucket |
| `PHOTO_UPLOAD_TTL_SECONDS` | `300` | Signed URL lifetime, clamped to 60 to 900 |

Terraform also sets `REGION`, `EMBER_FIRESTORE_DB`, and `SIGNED_URL_TTL_SECONDS` (`600`) on `ember-api`. No `ember-api` code reads them, so the signed URL lifetime is the 300 second default.

### 11.2 `voice-gateway`

| Variable | Default | Meaning |
|---|---|---|
| `GOOGLE_CLOUD_PROJECT` | `ember-fire-commander` | Project for Firebase Admin, Firestore, and Vertex |
| `FIRESTORE_DATABASE` | empty | When empty, the gateway keeps observations in memory instead of Firestore |
| `APP_CHECK_ENFORCE` | `false` | As §2 |
| `EMBER_AGENTS_URL` | empty | Agents origin for the intake call. Skipped when empty |
| `LIVE_MODEL` | set in code | Gemini Live model |
| `LIVE_LOCATION` | `us-central1` | Vertex region for Gemini Live |
| `LIVE_MINUTE_CAP_USER` | `10` | Minutes per user (§7) |
| `LIVE_MINUTE_CAP_OP` | `60` | Minutes for the whole operation (§7) |

Terraform also sets `LIVE_BACKEND`, `EMBER_FIRESTORE_DB`, and `ALLOWED_ORIGINS` on the gateway. No gateway code reads them.

### 11.3 `ember-agents`

| Variable | Default | Meaning |
|---|---|---|
| `GOOGLE_CLOUD_PROJECT` | none | Project for Firestore and Vertex |
| `FIRESTORE_DATABASE` | none, required | Firestore database |
| `EMBER_CLUSTER_RADIUS_M` | `300` | Clustering radius (§5.2) |
| `EMBER_WIND_WITHDRAW_KMH` | `40` | Wind speed that fires WITHDRAW (§8) |
| `EMBER_API_URL` | empty | `ember-api` origin for the WITHDRAW push call. Skipped when empty |
| `EMBER_SITE_RADIUS_M` | `500` | Re-ignition alert radius |
| `EMBER_SITE_WATCH_DAYS` | `14` | Length of the watch window |
| `PHOTO_BUCKET` | built-in default | Bucket agents read photos from |
| `EMBER_FLASH_MODEL` | set in code | Model for triage and summaries |
| `EMBER_FLASH_TIMEOUT_SECONDS` | `30` | Model call timeout |
| `EMBER_VERTEX_LOCATION` | `asia-southeast1` | Vertex region for triage and summaries |

Terraform also sets `REGION` and `EMBER_FIRESTORE_DB` on agents. No agents code reads them.

### 11.4 Hourly ingest job

| Variable | Default | Meaning |
|---|---|---|
| `FIRESTORE_DATABASE` or `EMBER_FIRESTORE_DB` | `ember-db` | Firestore database |
| `EMBER_FIRMS_BBOX` | `95,-6,119,6` | FIRMS area: west, south, east, north |
| `EMBER_FIRMS_SOURCE` | `VIIRS_SNPP_NRT` | FIRMS product |
| `EMBER_FIRMS_DAYS` | `1` | Days of FIRMS data per run |
| `EMBER_WEATHER_LAT`, `EMBER_WEATHER_LNG` | `-1.849`, `110.051` | The point for `weather/current` |
| `EMBER_HTTP_TIMEOUT_S` | `20` | HTTP timeout |

The job also reads the secrets `FIRMS_MAP_KEY` (required) and `DATA_GOV_SG_API_KEY` (optional).

### 11.5 Web app (build time, `VITE_*`)

All are public values. The template is `.env.example` at the repository root. It moved there from `apps/web/` in #86.

| Variable | Meaning |
|---|---|
| `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase web config |
| `VITE_FIREBASE_VAPID_KEY` | FCM public key. Without it the app does not register for push |
| `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY` | App Check site key |
| `VITE_MAPS_BROWSER_KEY`, `VITE_MAPS_MAP_ID` | Maps key and Map ID for the console |
| `VITE_API_BASE_URL` | `ember-api` origin for the volunteer and supervisor clients. It wins over `VITE_EMBER_API_URL`. Default `http://localhost:8080` |
| `VITE_EMBER_API_URL` | `ember-api` origin. The sign-in check (`GET /me`, `src/auth/api.ts`) reads only this one, so set both |
| `VITE_VOICE_GATEWAY_WSS_URL` | Gateway URL, with no extra path. Empty means voice is unavailable |
| `VITE_USE_MOCK_API` | Only the exact value `true` turns on the in-browser mock |

The root `.env.example` and the `apps/web` Vite config do not agree. `apps/web/README.md` and the root `README.md` still tell developers to copy `.env.example` from `apps/web`, and `vite.config.ts` sets no `envDir`, so Vite reads env files from `apps/web`. Which location is the right one is undecided.

## 12. UI rework notes for the frontend

Everything here is taken from the code and tests on `main`. Where the code leaves a point open, the text says so.

### 12.1 Endpoints the UI may rely on

| Route | Role | In the current web client |
|---|---|---|
| `GET /me` | any | Yes |
| `GET /dashboard` | supervisor | Yes (console chrome, every 15 s) |
| `GET /digest` | any | Yes (volunteer, every 5 s) |
| `POST /observations` | any signed in (the app uses volunteers) | Yes |
| `POST /photos/upload-url` | volunteer | Yes |
| `POST /notifications/token`, `DELETE /notifications/token` | volunteer | Yes |
| `GET /incidents`, `GET /incidents/{id}` | any, scoped (§6.3) | Yes (console, every 5 s) |
| `GET /tasks?status=proposed` | supervisor | Yes (Approvals page, §6.5) |
| `POST /tasks/{id}/approve`, `/reject`, `/edit` | supervisor | Yes |
| `POST /tasks/{id}/resend` | supervisor | Yes |
| `POST /tasks/{id}/heard` | volunteer | Yes. The volunteer app calls it once when a sent task or WITHDRAW is on screen |
| `POST /incidents/{id}/verify` | supervisor | Yes |
| `POST /incidents/{id}/extinguish`, `/severity`, `/withdraw`, `/withdraw/safe` | supervisor | Yes |
| `POST /incidents/{id}/volunteers/{volunteerId}/instruct` | supervisor | Yes (volunteer pop-up) |
| `GET /incidents/{id}/photos/{observationId}` | supervisor | Yes (volunteer pop-up) |
| WebSocket at the gateway (§7) | any | No. Voice is unavailable in the browser (§7) |

Every route except `/healthz` needs the two headers in §2.

### 12.2 Optional and nullable fields

| Field | Where | When it is missing or null |
|---|---|---|
| `incident.name` | `GET /incidents`, `GET /incidents/{id}`, digest | The key is always there. The value is `null` for incidents created before names existed, or when naming failed. The web app then shows `INC-` and the last 4 characters of `id`, in capitals |
| `incident.area` | Same | The key is always there. The value is `null` for incidents created before areas existed. The console then uses the part of `name` before the first ` · `, then `Unnamed area` |
| `volunteerName`, `clientId` | Observation in the `POST /observations` response | The key is absent, not `null`, when the token has no display name or the client sent no `clientId`. `clientId` is never in an observation from `GET /incidents/{id}`. A supervisor's `GET /incidents/{id}` carries `volunteerName` under the same rule (§6.3) |
| `accuracyM`, `chip`, `text`, `photoPath` | Observation | `null` when not applicable (§5.1) |
| `incident.withdraw` | Incident, digest | `null` until a WITHDRAW is issued. When set, `active` is `true` |
| `withdraw.source`, `withdraw.sentAt`, `withdraw.safeVolunteerIds` | Incident, digest | Absent on a withdraw written before #101. Treat absent `safeVolunteerIds` as empty |
| `volunteerPhones` | `GET /incidents/{id}`, supervisor only | Absent unless a withdraw is active. May be `{}` |
| `volunteers`, `timeline`, `summary` | `GET /incidents/{id}`, supervisor only | Always present for a supervisor: `[]`, `[]` and `null` when nothing is stored. Absent from a volunteer's read and from an older API (§6.3) |
| `conflictContext` | `GET /incidents/{id}`, supervisor only | The key is present for a supervisor. `null` when the incident has no conflict, else `{ otherObservations, audit }` with `[]` for each list that has nothing stored (§6.3). Absent from a volunteer's read and from an older API |
| `agencyInCharge` | Same | The key is present for a supervisor. `null` until an agency is stored on the incident, which nothing does yet (§5.2). Absent from a volunteer's read and from an older API |
| `volunteers[].name`, `lastReportAt`, `lastSeverity`, `lastLat`, `lastLng`, `lastAccuracyM`, `distanceM` | Same | `null` when the volunteer has no report on the incident, or no name was stored |
| `volunteers[].lastHeardAt` | Same | `null` when they have no report and no heard task on the incident |
| `volunteers[].pushReady` | Same | Always a boolean. `false` when no device token is stored |
| `volunteers[].withdraw` | Same | `null` unless the volunteer is on an active withdraw. Inside it `heardAt`, `delivery`, `safeAt` and `safeBy` are `null` until stored (§6.3) |
| `editedBy` | `POST /tasks/{id}/edit` response | Absent when the token has no display name. No other route returns it |
| `incident.conflictId`, `conflict` | Incident, `GET /incidents/{id}` | `null` when there is no conflict |
| `incident.evidenceScore` | `GET /incidents`, `GET /incidents/{id}` | Not in the digest summary |
| `task.instruction` | Task | Typed as `string or null`. Every task the services create today has one |
| `myTasks` | Digest | `[]` for a supervisor |
| `displayName` | `GET /me` | `""` when the token has no name |
| `agency` | `GET /dashboard` | The key is always there. `null` when the caller has no stored agency (§6.9) |
| `approvalsCount` | `GET /dashboard` | `0` when no task is `proposed` |
| `serverTime` | `GET /dashboard` | Always present on `200`. The console shows it as local `HH:mm` and moves the clock on from that instant |
| `updatedAt` | `GET /dashboard` | Always present on `200`. Same instant as `serverTime`. The live banner shows it as local `HH:mm` |
| `nextSatellitePass` | `GET /dashboard` | The key is always there. `null` until a stored pass time exists. The banner shows the empty treatment |
| `liveFires` | `GET /dashboard` | `[]` when no incident is `open`, `held`, or `verified`. The banner is hidden. `liveCameras`, `photoCadence`, and `distanceToRisk` are always `null`. `since` is `null` when no observation of the incident can be read. `placeName` is `null` only when the incident has no area, name, or position |
| `reignitionAlert` | `GET /dashboard` | `null` when no undismissed alert exists. `code` is always `null`. `taskId` is `null` until Send. Lead id and coordinates are never returned |
| `seasonImpact` | `GET /dashboard` | The key is always there. Counts are `0` when there is nothing to count. `injuries`, `since`, `region`, and `medianTimeToHumanCheck` are `null` without a source. The cards stay visible |
| `charts` | `GET /dashboard` | The key is always there. Counts are `0` when there is nothing to count. `medianTarget` is always `null`, and the weather fields are `null` until ingest has stored a read. The cards stay visible |

### 12.3 Constraints the UI must respect

1. **`capturedAt` window.** It must be a UTC ISO-8601 time from 7 days before the server's time to 5 minutes after it. Outside that, `POST /observations` is `400` with `fields.capturedAt`. A phone clock that runs more than 5 minutes fast is rejected. An outbox item that waits more than 7 days is rejected when it is finally sent, and `400` is not retryable. The outbox must keep the original `capturedAt` and not re-stamp it.
2. **`clientId` replay.** Send the outbox item id as `clientId`. `201` and `200` both mean the report is stored. Use the returned `id`. A replay returns the first stored record even when the body differs. The same `clientId` from a different volunteer is a different report, because the stored id includes the volunteer's uid.
3. **Revoked tokens.** On a write (`POST`, `DELETE`), `401 unauthorized` can mean the user was deleted, disabled, or had their tokens revoked, not only that the token expired. A `GET` does not check revocation, so a revoked user can still read until the ID token expires. The UI cannot use a read to find out. The current outbox keeps a report queued on `401` and sends it again after the next sign-in. The API takes `volunteerId` from the token, so a queued report is stored under whoever is signed in when it is sent.
4. **Write requests only.** The revocation check, and the `409` and `403` rules in §6.5, apply to write routes. Treat each write as one request with its own `401`, `403`, `404`, `409`, or `400`.
5. **Roles.** A volunteer is `403` on every supervisor route and `404` on an incident they are not on. A supervisor is `403` on `POST /photos/upload-url` and `/notifications/token`.
6. **What an action may be offered for.** Do not offer approve, reject, or edit on a `withdraw` task. Offer verify only on `open` or `held`. Offer a lower severity only from `none`, `smoke`, `small_flame`, `large_flame`, and only a strictly lower value. Offer investigate approval only when the incident's conflict is not `open` (`409` otherwise).
7. **Photo reports.** Upload first (§6.7), with exactly the returned `method` and `Content-Type`, before the signed URL expires (300 s by default). Then send the `photo` observation with the returned `photoPath`. Only `image/jpeg` and `image/webp` are accepted.
8. **Text and chips.** Text is at most 280 characters. A `chip` report needs one of the four chips. A `text` report needs non-blank text and no chip.
9. **Errors.** Read `error.code` and `error.fields` when present. A body without `error.code` can happen (§3), so keep a fallback by HTTP status. `5xx` and `429` are the retryable statuses in the web clients.
10. **Order and time.** Incident and task lists are sorted by `id`, and an `id` is not chronological. Incidents and tasks have no created or updated time. The only "newer" signal for incidents is the `#<number>` in `name`. The digest's `updatedAt` is the time of the response, read from the server clock. The volunteer app compares it with the phone clock and adds the gap to the `capturedAt` it stamps, because §6.2 refuses a `capturedAt` more than 5 minutes ahead of the server.
11. **Language.** Enum values are fixed English wire values. `instruction`, `reasons`, error `message`, and evidence `detail` are English sentences written by the services, and the contract has no Bahasa form for them. Only `incident_summaries` has both `english` and `bahasa`, and it is not returned by any route.
12. **Updates.** There is no push to the console and no change feed. Both apps poll every 5 seconds. A volunteer's device also gets an FCM push for a new approved task or a WITHDRAW (§6.6).

### 12.4 Not returned by any route

The browser cannot read these. A screen that needs one needs a new REST route first. Do not design on the assumption that it exists.

- `incident.observationIds` (§5.2). `incident.evidenceFactors` is returned only on a supervisor's `GET /incidents/{id}` (§6.3).
- Photo bytes. `GET /incidents/{id}/photos/{observationId}` returns only a short-lived signed URL (§6.7).
- `photo_triage`, `sites` and their alerts, the `facts` of `incident_summaries` (its text is `summary` in §6.3), `leads`, `weather`, `psi`, `ingestRuns`, and `notificationAttempts` (§5.7). `GET /audit` reads the `audit` collection for supervisors (§5.5).
- Observations that are not on the two sides of a conflict, when the incident has a conflict, are not in `observations` (§6.3). A volunteer's read never has them. A supervisor's read returns them in `conflictContext.otherObservations`.
- A wind or satellite evidence factor, an audit row for the moment a conflict opened, an `investigate` proposal, and any agency assignment or hand-off (§5.2, §6.3, §10).
- A task or incident created or updated time.

### 12.5 Undecided

Each of these is a difference between what this contract implies and what the code does. None is decided here.

- **Browser WebSocket handshake.** A browser cannot send the headers the gateway wants, and the gateway rejects query-string tokens (§7).
- **App Check.** The contract says both headers are required. Both services only log a missing App Check token while `APP_CHECK_ENFORCE` is `false`, which is the current setting (§2).
- **`investigate` tasks.** Nothing creates them (§5.3), so dispatch approval cannot happen in the running system.
- **Conflict `resolved`.** Nothing sets it, so a conflict holds dispatch for good (§5.4).
- **Newest task.** `get_my_task` and the web app pick the "newest" task by comparing `id` strings (§7.1).
- **Supervisor alert push.** None exists (§6.6).
- **Live observation checks.** The gateway stores `capturedAt` from the phone without the REST window or format check, and does not limit text length (§7.1).
- **Resend of gateway observations.** An observation the gateway could not hand to agents is resent only when a later REST report reaches agents (§8).
- **Spotter routes.** Triage and summary exist, and nothing calls them (§8.1).
- **Minute caps.** They are counted in memory per instance (§7).
- **`volunteers/{uid}.displayName`.** Fusion reads it as a fallback, and nothing writes it (§5.7).
- **Settings.** `SIGNED_URL_TTL_SECONDS` in Terraform is not the variable the code reads, and the `.env.example` location differs from the docs (§11).

## 13. Changelog: what changed since v1

All dates are the merge date on `main`. One line for each.

Issues #62, #63, #67, #68, and #70 were delivered in PR #83, one commit per issue (the two web commits are both #70).

- 2026-10-15 · #64 (PR #81): `GET /incidents`, `/digest`, and `/incidents/{id}` use targeted queries, and incident detail reads its observations in one batch. Response shapes are unchanged.
- 2026-10-15 · #65 (PR #81): the re-ignition scan reads from `sites_meta/scan.lastScannedAt`, sites expire after `EMBER_SITE_WATCH_DAYS` (default 14), and a site keeps its newest 50 alerts (§5.7).
- 2026-10-15 · #71 (PR #81): this contract documented `observationIds`, `evidenceFactors`, `photo_triage`, `incident_summaries`, `sites`, `sites_meta`, `notificationAttempts`, the ingest collections, and the `site.reinspect` audit action.
- 2026-10-15 · PR #83 (#67), API: write requests check Firebase Auth for a revoked, disabled, or deleted user (`401`), and `capturedAt` must be within 7 days back to 5 minutes ahead (`400`) (§2, §5.1).
- 2026-10-15 · PR #83 (#62), API: `POST /observations` takes an optional `clientId` and a replay returns `200` with the stored report (§6.2).
- 2026-10-15 · PR #83 (#63), API: the agents intake call has a 3 second timeout, and missed calls wait in `intakePending` and are resent (§8).
- 2026-10-15 · PR #83 (#68), infra: the unused `AGENTS_BASE_URL` was removed from `ember-api`, and agents share one clock helper.
- 2026-10-15 · PR #83 (#70), web: the volunteer app and the console load as separate chunks, with React and Firebase in their own vendor files.
- 2026-10-15 · PR #83 (#70), web: Hosting caches `/assets` for a year and always revalidates the shell, `sw.js`, and the manifest, and adds security headers. No Content-Security-Policy yet.
- 2026-10-15 · #82 (UI fixes stack): nine volunteer app and console fixes for sign-in routing (`/pwa`, `/console`), page language, permissions, location prompt, chips, English mode, and the report form. No contract change.
- 2026-10-15 · #84: new incidents get a readable `name` such as `Bengkalis, Riau · Pak Dedi · #3`, from `counters/incidents`, and each new observation stores `volunteerName` (§5.1, §5.2).
- 2026-10-15 · #85: new incidents store `area`, and the console groups the queue by it (§5.2).
- 2026-10-15 · #86 (`Naushad/N06`): `.env.example` moved from `apps/web/` to the repository root, with more variables, and `.gitignore` now ignores `/.env.local` and `/.local` (§11.5).
- 2026-10-15 · #87: `voice-gateway` relays Gemini Live and writes `live` observations (§7), adds the Live-minute caps, and sets `EMBER_AGENTS_URL` for the gateway in Terraform.
- 2026-10-16 · #108: `GET /dashboard` returns `agency`, `serverTime`, and `approvalsCount` for the supervisor console chrome (§5.7, §6.9).
- 2026-10-16 · #95: a supervisor's `GET /incidents/{id}` adds `volunteerName` on each observation that has one and an `evidenceFactors` list (§5.2, §6.3). Both are optional additions; a volunteer's read is unchanged.
- 2026-10-16 · #99: `GET /audit` returns append-only rows for supervisors with `actorName`, `target`, `detail`, `incidentId`, and cursor paging (§5.5, §6).
- 2026-10-16 · #101: `incident.withdraw` gains optional `source`, `sentAt` and `safeVolunteerIds`, written by code and by the withdraw route. New `POST /incidents/{id}/withdraw/safe` (audit `withdraw.safe`) marks a volunteer found safe and never clears the withdraw. A supervisor's `GET /incidents/{id}` adds `volunteerPhones` (§5.2, §5.5, §6.3, §6.5). Open decision: whether all-safe ends a withdraw.
- 2026-10-16 · #96: `POST /tasks/{id}/edit` also returns `editedBy`, the editor's display name, when the token has one (§6.5, §12.2). The audit row is unchanged.
- 2026-10-16 · #94: tasks gain optional `sentAt`, `heardAt`, `sendCount` and a computed `resendAt` (§5.3). New `POST /tasks/{id}/resend` (supervisor) and `POST /tasks/{id}/heard` (volunteer), audits `task.resend` and `task.heard` (§5.5, §6.5). Approve, the withdraw route and code stamp `sentAt`. The volunteer app does not call `heard` yet.
- 2026-10-16 · #91: the same `GET /dashboard` body adds the live banner: `updatedAt`, `nextSatellitePass` (`null`), and `liveFires` for `open`, `held`, and `verified` incidents (§6.9).
- 2026-10-16 · #91: `GET /dashboard` adds `seasonImpact` and `charts`. Every field is `null` until a stored source exists (§6.9).
- 2026-10-16 · #103: `GET /dashboard` adds `reignitionAlert`. `POST /sites/{incidentId}/alerts/{alertId}/dismiss` and `/recheck` dismiss with a reason or create a proposed `verify` without reopening the incident (§6.9, §6.10).
- 2026-10-16 · `GET /dashboard` fills `liveFires[].code`, `placeName`, and `since`, `seasonImpact`, and `charts` from stored incidents, observations, tasks, audit rows, leads, device records, and `weather/current`. Same keys and null rules. Counts over no records are `0`. Cameras, photo cadence, distance to risk, the next satellite pass, injuries, and the median target stay `null` (§6.9).
- 2026-10-16 · #92, #101: a supervisor's `GET /incidents/{id}` adds `volunteers` (one card per volunteer, covering every report and the withdraw state of each), `timeline` (reports and audit rows, oldest first, newest 100) and `summary` (the stored incident summary). A `withdraw.safe` audit row now also carries `subjectId`, so a card shows who marked a volunteer safe and when. A volunteer's read is unchanged. Still not stored, so not returned: conditions at the site, volunteer role, crew, battery, network and place, the crew lead, and suggested instructions (§5.5, §5.7, §6.3, §12.2, §12.4).
- 2026-10-16 · #93, #94: new supervisor route `POST /incidents/{id}/volunteers/{volunteerId}/instruct` sends one free-text instruction to one volunteer as a new task type `instruct` (stored `approved`, pushed, audit `task.instruct`). It is refused for an extinguished incident and for a volunteer under an active withdraw who is not marked safe, so it never holds or replaces a WITHDRAW. New supervisor route `GET /incidents/{id}/photos/{observationId}` returns a short-lived signed read URL for a photo report. A volunteer card adds `lastHeardAt` and `pushReady`. The volunteer app now calls `POST /tasks/{id}/heard` when a sent task is on screen (§5.3, §5.5, §6.3, §6.5, §6.6, §6.7, §12.1).
- 2026-10-16 · #95, #105: a supervisor's `GET /incidents/{id}` adds `conflictContext` (the reports on neither side of a disagreement, and the audit rows that decide it) and `agencyInCharge` (the agency stored on the incident, `null` today). Both are optional additions; a volunteer's read and `GET /incidents` are unchanged. Not stored, so not returned: wind or satellite evidence factors, a "conflict opened" audit row, `investigate` proposals, and who is in charge (§5.2, §6.3, §12.2, §12.4). Handing an incident to an agency stays outside the contract (§10).
- 2026-10-16 · console gaps, audit: new supervisor audit rows store the optional `actorName` from the token, and `GET /audit` shows names instead of ids for the actor, the volunteer and the incident, with the fallbacks in §5.5. No route and no field is removed.
- 2026-10-16 · console gaps, lists: a supervisor's `GET /incidents` adds `reportCount`, `volunteerCount`, `needsHelp`, `verified` and `verifiedBy` to each record (§6.3), and the new supervisor route `GET /tasks?status=proposed` lists the tasks waiting for a decision with the incident label and the volunteer's name (§6.5, §12.1). A volunteer's `GET /incidents` and `/digest` are unchanged.
- 2026-10-16 · console gaps, map: `GET /dashboard` `charts` adds the numbers `windKmh` and `windDirDeg` from `weather/current`, `null` when not stored (§6.9). The console draws a wind arrow from them.
- 2026-10-16 · console gaps, names: `PLACES` gains seven checked towns and the two test cities Bengaluru and Pune (§5.2 naming rules), and `scripts/backfill-incident-names.py` names older incidents with the same code (dry run unless `--apply`). Existing names and areas are never changed.

Also on `main` since v1 and now in this contract: task and WITHDRAW pushes (#78, §6.6), photo observations and `POST /photos/upload-url` with push-token registration (#80, §6.2, §6.7, §6.8), and the `notificationAttempts` record (§5.7).

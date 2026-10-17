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
7. FIRMS hotspots are leads to verify. No REST or WebSocket payload in this contract has a lead, forecast, haze, or plume field. The one exception is a sentence: the `satellite` evidence factor (§5.2) says that an unverified lead was seen, how far away and when, and carries no id or coordinates. The collections that services keep for those are internal and listed in §5.7. Every number a client shows comes from one of these payloads.
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

Services also keep collections that no REST route returns (or that only return a safe subset). They are listed in §5.7 with the field types and the service that writes them: `liveSeats`, `photo_triage`, `incident_summaries`, `incident_suggestions`, `observation_translations`, `sites`, `sites_meta`, `notificationAttempts`, `photoUploads`, `intakePending`, `volunteers`, `counters`, `leads`, `weather`, `psi`, and `ingestRuns`.

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
| `device` | object, optional | Client, best effort. What the phone says about itself: `batteryPct` (a number from 0 to 100, rounded), `network` (`2g`, `3g`, `4g`, `wifi` or `unknown`) and `language` (`id` or `en`, the language the volunteer's app is shown in, not a detected spoken language), each present only when the phone sent a valid value. Any other key, or a value that is not valid, is dropped without an error, so a fire report never fails on telemetry. The key is absent when nothing valid was sent, and on every report stored before #92. Never in an observation from `GET /incidents/{id}`; a supervisor's card carries the newest one (§6.3) |
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

- `POST /observations` returns the full stored record, including `volunteerName`, `clientId` and `device` when they exist, and a `join` (§6.2) once agents have placed the report.
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
| `factor` | string | `severity`, `corroboration`, `photo`, `gps`, `wind`, `satellite`, or `conflict` |
| `points` | number | Negative for `conflict` |
| `detail` | string | A plain sentence, such as `highest reported severity is small_flame` |

Points:

| Factor | Points |
|---|---|
| `severity` | The highest severity among the incident's observations: `none` 0, `unknown` 5, `smoke` 20, `small_flame` 35, `large_flame` 50. A `live` observation counts as `unknown` here |
| `corroboration` | 15 for each volunteer beyond the first who reported `smoke` or worse, at most 30 |
| `photo` | 10 when any observation has a photo |
| `gps` | 10 when any observation has `accuracyM` of 50 m or better |
| `wind` | 0. Present only when `weather/current.windKmh` is stored. The sentence gives the speed and says it is the weather station's, not the incident's. It explains the picture and changes no score and no rule |
| `satellite` | 0. Present only when a `leads` document (§5.7) of kind `firms_hotspot` that no person dismissed (`status` is not `checked_no_fire`) lies within `EMBER_SATELLITE_RADIUS_M` (default 2000 m) of the incident and was acquired within `EMBER_SATELLITE_WINDOW_H` (default 24 h). The nearest such lead is named by distance, time and confidence only. A lead is unverified and adds no points, so it never raises severity or the score |
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
| `acceptedAt` | string or null | When the volunteer tapped Doing it (`POST /tasks/{id}/accept`). Set once. Absent until then |
| `declinedAt`, `declineReason`, `declineNote` | string, string, string, each or null | When the volunteer said they cannot do it (`POST /tasks/{id}/decline`), the reason key (§6.11) and the optional note. The instruction and `status` stay as they were. Absent until then |
| `sendCount` | number or null | 1 at the first send, plus one for each resend |
| `resendAt` | string or null | Computed on read, not stored: `sentAt` plus 60 seconds while the task is `approved`, not heard, and has a `sentAt`. `null` otherwise |
| `closedAt`, `closedBy`, `closedByName`, `closeMessage` | string each, optional | Set on open `verify` tasks when a supervisor verifies the incident (§6.5). Omitted (not `null`) until then. The PWA shows a thank-you when these are present |

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
| `conflict.open` | Code opened a disagreement between reports. `actorId` is `code` and `targetId` is the incident id. Written once, when the conflict is created. A conflict opened before #95 has no such row |
| `task.approve` | A supervisor approved a proposed task |
| `task.reject` | A supervisor rejected a proposed task |
| `task.edit` | A supervisor replaced a task instruction |
| `withdraw.safe` | A supervisor marked one withdrawn volunteer found safe. `targetId` is the incident id. The volunteer is in `incident.withdraw.safeVolunteerIds` and, on rows written since #92, in the row's `subjectId` |
| `task.resend` | A supervisor sent a sent, unheard task again. `targetId` is the task id |
| `task.instruct` | A supervisor sent a free-text instruction to one volunteer. `targetId` is the new `instruct` task id |
| `task.heard` | A volunteer's app confirmed it showed or spoke a task. `actorId` is the volunteer, `targetId` the task id |
| `task.accept` | A volunteer said Doing it (§6.11). `actorId` is the volunteer, `targetId` the task id |
| `task.decline` | A volunteer said Can't do it (§6.11). `targetId` is the task id |
| `withdraw.answer` | A volunteer answered an active withdraw (§6.11). `targetId` is the incident id, `subjectId` the volunteer |
| `observation.flag` | A volunteer flagged someone else's report as wrong (§6.11). `targetId` is the observation id |
| `join.request` | A volunteer asked to join an incident (§6.12). `actorId` and `subjectId` are the volunteer, `targetId` the incident id |
| `join.approve` | A supervisor added the requesting volunteer (§6.12). `targetId` is the join request id, `subjectId` the volunteer. The same commit also writes `task.instruct` for the first task |
| `join.decline` | A supervisor declined a join request (§6.12). `targetId` is the join request id, `subjectId` the volunteer |
| `task.withdraw` | Code or a supervisor issued a withdraw instruction. `targetId` is the incident id. Code writes one per intake that adds a volunteer or a reason |
| `incident.verify` | A supervisor verified the incident |
| `incident.extinguish` | A supervisor extinguished the incident |
| `incident.severity.lower` | A supervisor lowered severity |
| `incident.severity.raise` | Code raised severity on an existing incident. A new incident's first severity writes none |
| `site.reinspect` | Code found new activity near an extinguished site (§5.7). `actorId` is `code` and `targetId` is the incident id |
| `site.dismiss` | A supervisor dismissed a re-ignition alert with a reason. `targetId` is the incident id. The reason is stored on the alert |
| `site.recheck` | A supervisor sent a re-check: a proposed `verify` task on the extinguished incident. The incident status stays `extinguished` |
| `live.make` | A supervisor assigned the live-camera seat to a volunteer. `targetId` is the incident id |
| `live.retry` | A supervisor retried live for a volunteer who had dropped to photo cadence. `targetId` is the incident id |
| `live.drop` | Code freed the live seat after a weak signal or a disconnect. `actorId` is `code`. `targetId` is the incident id |
| `incident.join` | A volunteer joined a live incident with no approval (§6.11). `actorId` and `subjectId` are the volunteer; `targetId` is the incident id |
| `incident.en_route` | A volunteer on an incident said they are on the way (§6.11). `actorId` and `subjectId` are the volunteer; `targetId` is the incident id |

### 5.6 Digest

One current picture for Live context, REST polling, and the `digest` WebSocket message.

| Field | Type | Notes |
|---|---|---|
| `updatedAt` | string | |
| `incidents` | incident summary[] | `id`, `name`, `area`, `status`, `severity`, `withdraw`, `lat`, `lng`. No `evidenceScore` and no `conflictId` |
| `myTasks` | task[] | Every task whose `volunteerId` is the caller, in any status (`proposed`, `approved`, `rejected`). Empty for a supervisor |
| `nearby` | nearby incident[] | Volunteer only. Live incidents (`open`, `held`, `verified`) within `EMBER_NEARBY_RADIUS_M` (default 5000 m) that the caller is not already linked to by a task, report, withdraw, or membership. Empty when the request has no position, and omitted on a supervisor digest. Sorted by `distanceM`, then `id` |
| `sentToday` | sent report[], optional | Volunteer only, and only when the request carries `sentSince` (§6.4). The caller's own reports since that time, oldest first, at most 50 |
| `seasonStats` | object, optional | Volunteer only. `{ checksDone, falseAlarmsCleared }` counts of this volunteer's `verify` tasks and those with `closedAt`. Omitted when the volunteer has no `verify` task |
| `myJoinRequests` | join request summary[] | **Volunteer only, REST only.** The caller's own join requests (§6.12): `incidentId`, `status`, `createdAt`. Absent for a supervisor |

Each nearby row is an incident summary plus `distanceM` (straight-line metres from the phone), `bearingDeg` (0 to 359, compass bearing from the phone to the incident), `crewOnSite` (distinct volunteers with a report or an approved task on it) and `reporterName` (the first reporter's display name, or `null`). It is listed when its status is `open`, `held` or `verified`, the caller is not linked to it, and it is within `EMBER_NEARBY_RADIUS_M` (default 5000 m). The list is nearest first and holds at most 5. **Not returned, because no service stores a source:** wind at the incident and what a supervisor asked for. The phone's position comes from the request (§6.4) and is never stored.

The digest is built on request. A volunteer receives every incident, in any status including `extinguished`, that has one of their tasks, lists them in `withdraw.volunteerIds`, has one of their observations in its `observationIds` or one of its conflicts, or has an `incident_members` row for them (§5.7). A supervisor receives incidents whose status is `open`, `held`, or `verified`. Both lists are sorted by `id`, which is not chronological.

| Field | Type | Notes |
|---|---|---|
| `distanceM` | number | Straight-line metres from the phone's `lat`/`lng` to the incident |
| `bearingDeg` | number | Initial bearing from the phone to the incident, 0 = north |
| `crewOnSite` | number | Distinct volunteers with a report or an approved task on the incident |
| `reporterName` | string or null | Display name of the first reporter, or `null` |

Each `sentToday` row is `{ id, capturedAt, receivedAt, source, chip, text, accuracyM, join }`, plus `clientId` when the report had one. `join` is the object in §6.2, or `null` when agents have not placed the report (or the join could not be read). The phone matches a row to its own report by `capturedAt`, because its outbox does not keep the create response.

`ember-api` (`GET /digest`) and `voice-gateway` (the `digest` message and the Live tools) build the digest with separate code (`services/api/incidents/routes.py`, `services/voice-gateway/live/digest.py`) that follows the same rules.

### 5.7 Service-written collections

These are written and read by the backend services only, except the re-ignition alert fields that `GET /dashboard` returns (§6.9) and the live-seat fields that a supervisor's `GET /incidents/{id}` returns (§6.3). No client reads Firestore. All timestamps are ISO-8601 UTC strings. Advisory records never change an incident, an observation, or a severity.

#### `liveSeats`

One document per incident, with the incident id as the document id. Supervisors assign the seat through ember-api (`live.make`, `live.retry`). `voice-gateway` updates `signal` from `location.signal` and frees the seat (`live.drop`) when the holder falls below 3G or disconnects. Photo cadence is a media state (`photo_60s`); the browser does not schedule uploads.

| Field | Type | Notes |
|---|---|---|
| `incidentId` | string | |
| `status` | `free` \| `held` | |
| `holderId` | string or null | The volunteer on the live seat |
| `updatedAt` | string or null | |
| `lastDrop` | object or null | `volunteerId`, `at`, `reason` (`signal_below_3g` \| `connection_lost`), `signal` |
| `volunteers` | map | Per volunteer id: `signal` (`2g` \| `3g` \| `4g` \| `wifi` \| `unknown`), `media` (`live` \| `photo_60s` \| `none`), `updatedAt` |

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

#### `withdraw_answers`

Written by `ember-api` (`POST /incidents/{id}/withdraw/answer`, §6.11). One document per volunteer and incident, with `{incidentId}__{volunteerId}` as the document id. The latest answer replaces the earlier one. No client route returns it yet.

| Field | Type | Notes |
|---|---|---|
| `incidentId`, `volunteerId` | string | |
| `state` | string | `safe` or `stuck` |
| `lat`, `lng`, `accuracyM` | number or null | The phone's position when it answered, `null` when it had none |
| `at` | string | |

#### `observation_joins`

Written by `ember-agents` when it places an observation (§8), and read by `ember-api` for the `join` object in §6.2 and for `sentToday` (§5.6). One document per observation, with the observation id as the document id. Only agents write it, because only agents know the clustering radius (`EMBER_CLUSTER_RADIUS_M`). The first placement is kept: a repeated intake does not change it. An observation placed before #131 has none.

| Field | Type | Notes |
|---|---|---|
| `id`, `observationId` | string | The observation id |
| `incidentId` | string | The incident the report was placed on |
| `joined` | boolean | `true` when the report joined an incident that already had a report within the radius. `false` when it started the incident |
| `nearbyCount` | number | How many other reports, from other volunteers, the incident held within the radius when this one arrived |
| `nearestM` | number or null | Metres to the nearest of those, rounded. `null` when `nearbyCount` is `0` |
| `radiusM` | number | The radius used, in metres |
| `at` | string | |

#### `incident_members`

Written by `ember-api` (`POST /incidents/{id}/join` and `POST /incidents/{id}/en-route`, §6.11). One document per volunteer and incident, with `{incidentId}__{volunteerId}` as the document id. A join links the volunteer to the incident without a report or task. Optional route and meet fields stay `null` until something stores them; the phone omits those rows.

| Field | Type | Notes |
|---|---|---|
| `incidentId`, `volunteerId` | string | |
| `joinedAt` | string | When they joined |
| `addedBy` | string | Who added them. On Join now this is the volunteer |
| `addedByName` | string or null | Display name from the actor's token at join time |
| `teamRole` | string or null | e.g. pump team. `null` until stored |
| `enRouteAt` | string or null | Set once by I'm on my way |
| `destination`, `approach`, `meetPoint`, `meetPerson`, `meetNote` | string or null | Route and meet details. `null` until stored |

#### `observation_flags`

Written by `ember-api` (`POST /observations/{id}/flag`, §6.11). One document per volunteer and report, with `{observationId}__{volunteerId}` as the document id. A later flag from the same volunteer replaces the earlier one. The observation is not changed (observations are immutable, §5.1). No route returns these yet and the console does not show them.

| Field | Type | Notes |
|---|---|---|
| `observationId`, `incidentId`, `volunteerId` | string | `incidentId` is the incident whose `observationIds` holds the report |
| `reason` | string | `no_fire`, `duplicate`, `old_photo`, `wrong_place` or `fake` |
| `photoPath` | string or null | A path issued to the flagging volunteer by `/photos/upload-url`, or `null` |
| `at` | string | |

#### `joinRequests`

Written by `ember-api` (`POST /incidents/{id}/join-requests`, §6.12). One document per volunteer and incident, with `{incidentId}__{volunteerId}` as the document id, so a repeat request is the same document. The supervisor routes in §6.12 read and decide it.

| Field | Type | Notes |
|---|---|---|
| `incidentId`, `volunteerId` | string | |
| `volunteerName` | string or null | The display name on the volunteer's token when they asked |
| `status` | string | `pending`, `approved` or `declined` |
| `createdAt` | string | |
| `decidedAt`, `decidedBy` | string or null | When a supervisor decided it, and which supervisor |
| `taskId` | string or null | The `instruct` task an approval created |

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

#### `incident_suggestions`

Written by `ember-agents` (assist). One document per incident, with the incident id as the document id. It is a separate collection, not a field of the incident, because fusion rewrites the whole incident document. Code builds the facts from stored records (the incident, its reports, photo reads, tasks, volunteer names and crews, the device facts phones sent, and `weather/current`), the model proposes, and code keeps at most 4 well-formed items. An item that states a severity, a withdraw, an evacuation, an extinguish call or a confirmation is dropped, because those stay with code and people. When the model is not available, or nothing usable comes back, code stores a short rule-based list instead (`source: template`).

| Field | Type | Notes |
|---|---|---|
| `id` | string | The incident id |
| `incidentId` | string | |
| `suggestions` | array | At most 4 of `{ "text", "rationale" }`: `text` at most 200 characters, `rationale` at most 240 and naming the stored fact it rests on. May be empty |
| `source` | string | `model` or `template` |
| `advisory` | `true` | Always true |
| `model` | string or null | Null when `source` is `template` |
| `reportCount` | number | How many reports the incident held when it was made |
| `generatedAt` | string | |

A supervisor's `GET /incidents/{id}` returns `items`, `source` and `generatedAt` of this document as `suggestions` (§6.3). Satellite leads, phone numbers and device tokens are never part of the facts.

#### `observation_translations`

Written by `ember-agents` (assist). One document per observation that has text, with the observation id as the document id. Observations are immutable (§1 rule 1), so the translation lives here and the original `text` is never changed. Once stored it is final: a repeat call returns it and makes no model call.

| Field | Type | Notes |
|---|---|---|
| `id` | string | The observation id |
| `observationId` | string | |
| `volunteerId` | string or null | The reporting volunteer |
| `sourceLanguage` | string | Lowercase ISO 639-1 code the model named, or `und` when it could not tell or named something that is not a two or three letter code |
| `english` | string | At most 1200 characters. The same text when the report is already English |
| `advisory` | `true` | Always true |
| `model` | string | |
| `at` | string | |

Only the first 1000 characters of a report are translated. A supervisor's `GET /incidents/{id}` returns `english`, `sourceLanguage` and `at` as `translations[observationId]` (§6.3).

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

Returns §2. For a volunteer it also carries `crewName`: the crew written on their profile (`volunteers/{uid}.crewName`), or `null` when none is set or the profile cannot be read. A supervisor has no `crewName` field. `401` or `403` as in §3.

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

**Join (#131, #132).** The `201` and the `200` replay carry one more key, `join`, read from `observation_joins` (§5.7) after the hand-off. The key is absent when agents have not placed the report yet, when the record is missing, and when it cannot be read. A client must treat absent as "not known yet".

| Field | Type | Notes |
|---|---|---|
| `incidentId` | string | The incident the report is on |
| `incidentName`, `incidentArea` | string or null | The incident's stored `name` and `area`. The console and phone build their label from them (§12.2) |
| `joined` | boolean | `true` when it joined an incident another report had already opened, `false` when it started a new one |
| `nearbyCount` | number | Other reports, from other volunteers, within `radiusM` of this one when it arrived |
| `nearestM` | number or null | Metres to the nearest of them. `null` when `nearbyCount` is `0` |
| `radiusM` | number | The join radius in metres (`EMBER_CLUSTER_RADIUS_M`, default 300) |

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

**More supervisor extras (#92, #93).** Four more keys and four more card fields, all read from stored records. A volunteer's read has none of them.

`header`:

| Field | Type | Source |
|---|---|---|
| `code` | string | `#<n>` from the incident `name`, else `INC-` and the last 4 characters of the id in capitals |
| `placeName` | string | `area`, else the part of `name` before the first ` · `, else the coordinates |
| `openedAt` | string or null | `receivedAt` of the earliest report in `incident.observationIds`. `null` when none can be read |
| `peopleOnSite` | number | Distinct volunteers with a report or a task on the incident. It counts reporters, not people confirmed at the fire |
| `source` | source enum or null | `source` of that earliest report. A satellite lead is never named here |

`conditions` is `{ weather, air }`, each `null` when nothing is stored (or when the read fails). `weather` is `weather/current` (§5.7): `observedAt`, `windKmh`, `windDirDeg`, `windFrom` (a compass point such as `SW`, the direction the wind blows from), `gustKmh`, `tempC`, `humidityPct`, `rainMm` and `source`, each `null` when missing. `air` is `psi/current`: `observedAt`, `psi24hMax`, `pm25Max` (the largest regional 24 h value) and `source`. These are one fixed monitoring point and one national feed. **They are not measured at the incident**, and the console says so. Nothing here is a forecast, a plume or a predicted shift.

`photoReads` is an object keyed by observation id, for photo reports that have a `photo_triage` record with `status: ok`: `smokeVisible`, `flameVisible`, `burnScarVisible`, `notes` and `at`. It is `{}` when none. It is advisory text about the picture, it states no severity, and it changes nothing. `ember-api` asks agents for the photo read after it stores a photo report (§8.1), best effort, so a report's read appears a few seconds later, or never if that call fails.

Each `volunteers` card also has `crewName` (`volunteers/{uid}.crewName`), `teamRole` (`incident_members/{incidentId}__{uid}.teamRole`) and `device`: `{ batteryPct, network, language, at }` from the newest report that carried a `device` (§5.1), each part `null` when that report lacked it, and the whole value `null` when no report did. `at` is that report's `capturedAt`. Battery and network are what the phone said when it reported, not a live reading.

In `conflictContext` (below), `allObservations` lists every report of the incident and of the conflict, the two sides included, oldest first, in the same record shape as `otherObservations`.

**Model-written help.** Two more keys, supervisor only, both advisory text that changes nothing. `suggestions` is `null` until suggestions were made for the incident (§6.13), then `{ "items": [ { "text", "rationale" } ], "source", "generatedAt" }` from `incident_suggestions` (§5.7); `items` may be `[]`. `translations` is an object keyed by observation id, for reports that have text and a stored `observation_translations` record: `{ "english", "sourceLanguage", "at" }`. It is `{}` when none. A report whose `sourceLanguage` is `en` has nothing to add, and the console does not repeat it.

Not returned, because no service stores a source: the crew lead's phone and duty phones, the volunteer's own live battery or position, a predicted wind shift, spread and at-risk places. What EMBER proposes is the incident's `tasks` with `status: proposed` (agents write only `verify` proposals, when a conflict opens, §5.3) and the reasons behind the score are `evidenceFactors` (§6.3), so those are the suggestions a screen can show. `weather` and `psi` stay internal (§1 rule 7, §12.4).

Who can read what:

| Route | Supervisor | Volunteer |
|---|---|---|
| `GET /incidents` | Incidents with status `open`, `held`, or `verified` | Incidents linked to the caller by the rule in §5.6, in any status |
| `GET /incidents/{id}` | Any incident, including `extinguished` | `404` unless the caller has a task, a withdraw entry, or an observation on it. The caller then sees every observation listed, including other volunteers' `volunteerId` |

A supervisor's `GET /incidents/{id}` also carries `volunteerPhones`, an object of `volunteerId` to phone number, while a withdraw is active. It has an entry only for a volunteer on that withdraw whose `volunteers/{uid}.phone` is a non-blank string, and is `{}` when there is none. No service writes `phone` yet. A volunteer's read never has it.

**Supervisor extras (#95, #105).** For a supervisor the body has two more keys, both read from stored records. A volunteer's read has neither.

`conflictContext` is `null` when the incident has no conflict. Otherwise it is an object with three lists, `[]` when nothing is stored:

| Field | Type | Source |
|---|---|---|
| `otherObservations` | observation[] | The reports in `incident.observationIds` that are not in `conflict.observationIds` (a `smoke` or `unknown` report is on neither side, §5.4), oldest first. Each is the §5.1 record that `observations` carries, with `volunteerName` when one was stored. `observations` itself is unchanged and still lists only the two sides |
| `allObservations` | observation[] | Every report in `incident.observationIds` or `conflict.observationIds`, oldest first, in the same shape as `otherObservations`. The two sides are included |
| `audit` | timeline entry[] | The audit rows that decide the disagreement, oldest first, the newest 100, in the shape of a `timeline` audit entry: `conflict.open`, `task.approve`, `task.reject`, `task.edit`, `task.resend` and `task.heard` rows whose `targetId` is a `verify` or `investigate` task of the incident, and `incident.verify`, `incident.extinguish` and `incident.severity.lower` or `.raise` rows whose `targetId` is the incident. Withdraw, instruct, re-ignition and `observation.create` rows are left out |

The same data supports what the screen shows. The reasons behind `evidenceScore` are `evidenceFactors`. The `wind` and `satellite` factors are written with zero points (§5.2), and a conflict opened since #95 has a `conflict.open` audit row (§5.5); an older one has none, and the console then says it cannot show when it opened. **No service creates an `investigate` task** (§5.3), so a proposed dispatch appears in `tasks` only if one is written some other way. Nothing is invented here.

`agencyInCharge` is the trimmed `incidents/{id}.agency` (§5.2), or `null` when the field is missing, not a string or blank. Nothing writes it today, so it is `null` until a later change records an agency. It is never taken from the signed-in supervisor's profile: `GET /dashboard` returns that agency as `agency` (§6.9), and it names the supervisor's own agency, not the one in charge of an incident.

A supervisor's `GET /incidents/{id}` also carries `liveSeat` from `liveSeats/{incidentId}` (§5.7): `status` (`free` \| `held`), `holderId`, `holderName`, `lastDrop` (`volunteerId`, `volunteerName`, `at`, `reason`, `signal`), and `volunteers` keyed by volunteer id with `signal`, `media` (`live` \| `photo_60s` \| `none`), `photoCadence` (`every_60s` or `null`), `canRetry`, and `canMakeLive`. When no seat document exists the body still has `liveSeat` with `status: free`, empty `volunteers`, and `lastDrop: null`. A volunteer's read never has the key. `signal` is `2g`, `3g`, `4g`, `wifi`, or `unknown`. `canRetry` / `canMakeLive` are true only when the seat is free and that volunteer's signal is `3g`, `4g`, or `wifi` (and for retry, `media` is `photo_60s`).

`GET /incidents` returns the full incident record of §5.2 without `observationIds` and `evidenceFactors`, sorted by `id`.

### 6.4 `GET /digest`

Returns the §5.6 digest for the caller. The two web apps poll `GET /digest` (volunteer) and `GET /incidents` (console) every 5 seconds.

Optional query `sentSince`: an ISO-8601 time with a zone (for example the phone's local start of day, URL-encoded). A volunteer's digest then adds `sentToday` (§5.6), the caller's reports received or captured since that time. A value that is missing, unreadable, has no zone or lies in the future means the last 24 hours, and a value more than 48 hours back is held to 48 hours. A supervisor's digest ignores it. The list is built only when asked, and a failure to read it leaves the digest without the key rather than failing the digest.

A volunteer's phone may add its position: `GET /digest?lat=1.48&lng=102.11`. `lat` is -90 to 90 and `lng` is -180 to 180, and they go together (`400` with `fields.lat` or `fields.lng` otherwise). With a position the volunteer's `nearby` list is filled (§5.6); without one it is `[]`. A supervisor's request ignores both. The position is used for this read only and is not stored.

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
| `POST /incidents/{id}/verify` | none | `status` becomes `verified`. Also stamps open `verify` tasks on the incident with `closedAt`, `closedBy`, `closedByName`, and `closeMessage` so the volunteer digest can show the thank-you (§5.3). `409` unless the status is `open` or `held` |
| `POST /incidents/{id}/extinguish` | none | `status` becomes `extinguished`. `409` when it already is |
| `POST /incidents/{id}/severity` | `{ "severity": "smoke" }` | Stores the new severity only when it is strictly lower on the scale in §1, otherwise `409`. `severity` must be `none`, `smoke`, `small_flame`, or `large_flame`; `unknown` and anything else is `400`. A stored `unknown` severity is never lowered (`409`) |
| `POST /incidents/{id}/volunteers/{volunteerId}/instruct` | `{ "instruction": "Move to the east road and report" }` | Sends one free-text instruction to one volunteer. Creates an `instruct` task with `status: approved`, `sentAt` now and `sendCount` 1, pushes it (§6.6) and appends a `task.instruct` audit row. `201` with the task and `auditId`. `instruction` is required, not blank, at most 500 characters (`400`). The volunteer needs a report, a task or a withdraw entry on the incident (`400` on `fields.volunteerId`). `409` when the incident is `extinguished`, or when the volunteer is on an active withdraw and not in `safeVolunteerIds`: an instruction can never hold or replace a WITHDRAW. An open conflict does not block it. It changes nothing on the incident |
| `POST /incidents/{id}/withdraw` | see below | Issues a withdraw instruction. This is not an approval |
| `POST /incidents/{id}/withdraw/safe` | `{ "volunteerId": "uid_sari" }` | Adds the volunteer to `incident.withdraw.safeVolunteerIds` and appends a `withdraw.safe` audit. It never changes `active`. `400` when `volunteerId` is missing or not in `withdraw.volunteerIds`. `409` when there is no active withdraw or the volunteer is already marked. Returns the incident and `auditId` |
| `POST /incidents/{id}/live/make-live` | `{ "volunteerId": "uid_rizal" }` | Holds the live seat for that volunteer when their stored signal is `3g`, `4g`, or `wifi`. Sets `media: live`. Writes `live.make`. `409` when the seat is held by someone else or the signal is below 3G. Returns `{ liveSeat, auditId }`. Does not change incident status |
| `POST /incidents/{id}/live/retry` | `{ "volunteerId": "uid_sari" }` | Same seat write as make-live, only when that volunteer's `media` is `photo_60s`. Writes `live.retry`. `409` when signal is below 3G (seat stays free) or retry does not apply |

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
  "joinRequestsCount": 1,
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
| `joinRequestsCount` | number | How many `joinRequests` have `status: pending` (§6.12). Counted apart from `approvalsCount`, which stays equal to the `GET /tasks?status=proposed` list. The console adds the two for the Approvals badge. `0` when none are waiting |
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

### 6.11 Volunteer answers

Volunteer-only. A supervisor is `403`. A volunteer only ever acts for themselves. Each write appends an audit row with the volunteer as `actorId`.

| Route | Body | Result |
|---|---|---|
| `POST /tasks/{id}/accept` | none | Doing it. Sets `acceptedAt` once and appends `task.accept`. A repeat returns the task with `auditId: null` and writes nothing. Another volunteer's task or an unknown id is `404`. `409` unless the task is `approved` and not a `withdraw`, or when it was already declined |
| `POST /tasks/{id}/decline` | `{ "reason": "too_far", "note": "Road is flooded" }` | Can't do it. `reason` is required, one of `unsafe`, `too_far`, `no_equipment`, `other` (`400` on `fields.reason`). `note` is optional, at most 300 characters. Sets `declinedAt`, `declineReason` and `declineNote` and appends `task.decline`. The instruction is not changed. A repeat returns the first decline with `auditId: null`. Same `404` and `409` rules as accept, except a task that was accepted first can still be declined |
| `POST /incidents/{id}/withdraw/answer` | `{ "state": "safe", "lat": 1.49, "lng": 102.12, "accuracyM": 14 }` | The volunteer's answer to an active withdraw. `state` is `safe` (I'm safe upwind) or `stuck` (I can't get out). `lat` and `lng` are optional but go together; `accuracyM` is optional. Written to `withdraw_answers/{incidentId}__{volunteerId}` (the latest answer replaces the earlier one) and appended as `withdraw.answer` with `subjectId` the volunteer. It never changes `incident.withdraw`: `active` and `safeVolunteerIds` stay as they were, and only a supervisor marks a volunteer found safe (§6.5). `404` when the incident is unknown or does not name the caller in `withdraw.volunteerIds`, `409` when no withdraw is active |
| `POST /observations/{id}/flag` | `{ "reason": "no_fire", "photoPath": "photos/uid/20261016/ab12.jpg" }` | A volunteer says someone else's report looks wrong. `reason` is required, one of `no_fire` (I'm here, no fire), `duplicate` (same fire as another incident), `old_photo`, `wrong_place`, `fake` (`400` on `fields.reason`). `photoPath` is optional and must be a path issued to the caller (`400` on `fields.photoPath`). Written to `observation_flags/{observationId}__{volunteerId}` and appended as `observation.flag`. The observation is never changed and the response does not name its reporter. `404` when the report is unknown or not on an incident the caller is part of (a task, a withdraw entry or a report of their own), `409` for the caller's own report |
| `POST /incidents/{id}/join` | none | Join now. Writes `incident_members/{incidentId}__{volunteerId}` and appends `incident.join`. Immediate; no supervisor approval. `409` when the incident is not live (`open`, `held`, `verified`). `404` when unknown. A repeat returns the membership with `auditId: null` |
| `POST /incidents/{id}/en-route` | none | I'm on my way. Sets `enRouteAt` on the membership once and appends `incident.en_route`. Creates the membership if the volunteer is already on the incident by a task, report or withdraw but has no join row. `404` when the incident is unknown or the caller is not on it. A repeat returns the same `enRouteAt` with `auditId: null` |

`GET /digest` for a volunteer may take optional `lat` and `lng` query numbers. When both are valid, the response includes `nearby` (§5.6). A volunteer's `GET /incidents/{id}` includes `membership` when an `incident_members` row exists for them.

Success returns `{ "task": {}, "auditId": "aud_01" }` for the two task routes and `{ "answer": {}, "auditId": "aud_01" }` for the withdraw answer. The flag returns `{ "flag": {}, "auditId": "aud_01" }`. Join and en-route return `{ "membership": {}, "auditId": "aud_01" }`.

### 6.12 Training and practice

Volunteer-only. A supervisor is `403`. Practice never creates an observation, task, or incident, and never opens the live voice socket.

| Route | Body | Result |
|---|---|---|
| `GET /training` | — | Guide payload: `video` (id, localized title, `durationSec`, `url` or null, `progressSec`), `lessons` (id, localized title/summary/body, `minutes`, `status` `not_started` \| `in_progress` \| `done`, optional `score`), `doneCount`, `lessonCount`, `askChips`, `safetyLines` |
| `POST /training/progress` | `{ "videoProgressSec"?: number, "lessonId"?: string, "status"?: string, "score"?: number }` | `200` `{ ok: true }`. Persists video position and/or one lesson row under `volunteer_training/{uid}` |
| `POST /training/practice` | `{ "message": string, "lessonId"?: string, "optionId"?: string }` | `200` `{ practice: true, reply, correct, check, safetyLines }`. Fixture answers only. With `optionId` + `lessonId`, `correct` is boolean and `check` is null; otherwise `correct` is null and `check` may offer a quick question |

Lesson and reply copy is served as API fixtures until content is authored elsewhere. `message` is required, at most 500 characters.

### 6.13 Suggestions, Ask EMBER and translation

Supervisor-only (a volunteer is `403`). Each route calls a private agents route (§8.1) with the API's own Cloud Run ID token, and every answer is advisory text. None of them changes an incident, a severity, a task or a withdraw, writes an audit row, or sends anything to a volunteer. Sending stays with the instruction routes in §6.5.

| Route | Body | Result |
|---|---|---|
| `POST /incidents/{id}/suggestions` | none | Makes fresh suggestions from the stored facts and stores them for the incident. `200` `{ "items": [ { "text", "rationale" } ], "source": "model" \| "template", "generatedAt" }`, the same shape as `suggestions` in §6.3. `items` may be `[]` |
| `POST /incidents/{id}/ask` | `{ "question": string, "volunteerId"?: string }` | Answers from the stored facts only, and says when they do not hold what the question needs. `200` `{ "answer", "enoughData", "at" }`. `answer` is at most 700 characters; `enoughData` is `false` when the model says the facts are not enough, and `null` when it did not say. With `volunteerId` the answer is about that volunteer, who must be on the incident. Nothing is stored |
| `POST /incidents/{id}/observations/{observationId}/translate` | none | English translation of one report's text, stored in `observation_translations` (§5.7). `200` `{ "observationId", "sourceLanguage", "english", "at" }`. A repeat call returns the stored one |

`question` is required, not blank, and at most 500 characters (`400` with `fields.question` otherwise). `volunteerId` is a non-blank string when sent. `404 not_found` for an unknown incident, for an observation that is not one of the incident's (or its conflict's) reports, and for a `volunteerId` that is not on the incident. `400` when the report has no text. When agents or the model is not available the answer is `502 agents_unavailable` (or `503` when `EMBER_AGENTS_URL` is empty) and nothing is stored. Suggestions are the one exception to "nothing stored on failure": when only the model fails, agents store the rule-based list and answer `200` with `source: template`. These routes make one model call each, with a 40 second limit, and are never called on a timer: the console calls them only when a supervisor asks.

After `ember-api` stores a report it also starts model work for it on a background thread, which never delays or fails the report: a `photo` report is sent to the triage route (§8.1), and a report with text to the translate route. A failure is logged and leaves no record. `EMBER_ASSIST_BACKGROUND=off` turns these calls off (§11.1). Reports the voice gateway stores (`live`) are not sent; a supervisor can ask for their translation with the route above. Cloud Run is configured with `cpu_idle = true`, so CPU is only guaranteed during a request and the background call may finish late.

### 6.12 Join requests

A volunteer who sees a live fire near them (`nearby`, §5.6) can ask to join it. A supervisor decides. Approval adds the volunteer through the normal instruction path, so nothing else in the digest rules changes: the volunteer becomes part of the incident because they now have a task on it.

| Route | Who | Body | Result |
|---|---|---|---|
| `POST /incidents/{id}/join-requests` | volunteer | none | Writes `joinRequests/{incidentId}__{volunteerId}` as `pending` and appends `join.request`. `201 { "joinRequest": {}, "auditId": "aud_01" }`. A repeat while still `pending` is `200` with the first request and `auditId: null`. `404` for an unknown incident. `409` when the incident is `extinguished`, when the caller already has a task, report or withdraw entry on it, or when the request was already `declined` |
| `GET /join-requests?status=pending` | supervisor | none | `200` `[ { "request": {}, "incident": {}, "volunteerName": "Sari" } ]`, oldest first. `incident` is a summary or `null` if it is gone. `status` is required and only `pending` is accepted (`400` on `fields.status`) |
| `POST /join-requests/{id}/approve` | supervisor | `{ "instruction": "Meet at the north gate" }` | `instruction` is required, at most 500 characters (`400` on `fields.instruction`). In one commit the request becomes `approved` (`decidedAt`, `decidedBy`, `taskId`), an `approved` `instruct` task is created for the volunteer and `join.approve` and `task.instruct` are appended. The push goes out after the commit like any other approved task. `200 { "joinRequest": {}, "task": {}, "auditId": "aud_01" }`. `404` unknown id, `409` when the request is not `pending` or the incident is `extinguished` |
| `POST /join-requests/{id}/decline` | supervisor | none | The request becomes `declined` and `join.decline` is appended. `200 { "joinRequest": {}, "auditId": "aud_01" }`. `404` unknown id, `409` when the request is not `pending` |

A volunteer asking for a supervisor route, or a supervisor asking for the volunteer route, is `403`. The voice gateway's digest is separate code and does not return `nearby` or `myJoinRequests`.

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

- `location` needs `lat` (−90 to 90), `lng` (−180 to 180), and a non-empty `capturedAt` string. `accuracyM` is optional and kept only when it is a number from 0 to 1,000,000, otherwise it is `null`. Optional `signal` is `2g`, `3g`, `4g`, `wifi`, or `unknown` (case-insensitive); when present, the gateway writes it on `liveSeats` for the caller's digest incidents and frees the seat if that volunteer is the holder and signal is below 3G (§5.7). The latest valid `location` is kept, and it may arrive before or after `session.start`. The gateway does not check that `capturedAt` is an ISO timestamp.
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

After it places an observation, agents write `observation_joins/{observationId}` (§5.7) with the real clustering radius, the number of other reports within it and the distance to the nearest, and they write the `conflict.open` audit row when they create a conflict. A failure to read `leads` (for the `satellite` factor) is logged and leaves that factor out; it never stops the intake.

The high-wind threshold is `EMBER_WIND_WITHDRAW_KMH` (default 40 km/h), compared with `weather/current.windKmh`. If there is no value or the read fails, the wind rule is skipped for that intake. Crossing it produces the same WITHDRAW writes as a `large_flame` observation. The `large_flame` trigger uses the observation's own severity, so a `live` `large_flame` observation fires WITHDRAW even though it does not raise the incident's severity.

After it commits a code WITHDRAW, agents call `POST /internal/notifications/withdraw` on `ember-api` with `{ "incidentId": "inc_01", "tasks": [ { "id": "tsk_01", "volunteerId": "uid_sari" } ] }`, using its Cloud Run ID token, 10 second timeout, and up to 3 attempts. A failure is logged and never undoes the write. `ember-api` answers `202` with `{ "results": [ { "result": "sent", "attempts": 1 } ] }`. It sends the instruction stored on each task, and never text from the caller. It answers `400` when the incident's withdraw is not active or a task is not an approved `withdraw` task of that incident for a listed volunteer, and `404` for an unknown incident or task.

### 8.1 Other agents routes

All are private like the intake route. None is a route for a browser.

| Route | Body | Result |
|---|---|---|
| `POST /internal/sites/scan` | none | Runs the re-ignition watch (§5.7). Cloud Scheduler job `ember-sites-scan` calls it every 15 minutes by default. `200` `{ "sitesWatched", "sitesRemembered", "sitesExpired", "alertsCreated" }`, all numbers |
| `POST /internal/observations/{id}/triage` | Optional `{ "callerId": "<uid>" }` | Advisory photo triage. `200` with the `photo_triage` record (§5.7). `404 not_found` for an unknown observation. `403 forbidden` when the observation has no photo or the photo is not the reporter's (a `rejected` record is stored). `413 photo_too_large` over 8 MB (a `rejected` record is stored). `502 triage_failed` for a model or storage error (an `error` record is stored) |
| `POST /internal/incidents/{id}/summary` | none | Advisory summary. `200` with the `incident_summaries` record (§5.7). `404 not_found` for an unknown incident |
| `POST /internal/incidents/{id}/suggestions` | none | Advisory suggestions. Reads the incident's stored facts, asks the model, stores and returns the `incident_suggestions` record (§5.7). A model failure stores the rule-based list (`source: template`) and still answers `200`. `404 not_found` for an unknown incident |
| `POST /internal/incidents/{id}/ask` | `{ "question": string, "volunteerId"?: string }` | Advisory answer from the stored facts. `200` `{ "incidentId", "answer", "enoughData", "advisory", "model", "at" }`. Nothing is stored. `400 validation_error` for a missing, blank or over-500-character question, `404 not_found` for an unknown incident or a volunteer who is not on it, `502 model_unavailable` when the model fails |
| `POST /internal/observations/{id}/translate` | none | English translation of the report's text. `200` with the `observation_translations` record (§5.7), the stored one when it exists. `400 validation_error` when the report has no text, `404 not_found` for an unknown observation, `502 model_unavailable` when the model fails (nothing is stored) |

These errors use the §3 body without `fields`. `ember-api` calls the triage route after it stores a photo report, and the translate route after it stores a report with text (§6.13), and a supervisor's request calls the suggestions, ask and translate routes. Nothing calls the summary route yet, so `incident_summaries` stays empty until something does.

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
| Flash photo triage, summaries, suggestions, answers, translation, evals, Memory Bank | The routes exist (§8.1) and their records are in §5.7. `ember-api` calls triage and translate after a report is stored, and the supervisor routes in §6.13 call suggestions, ask and translate. Nothing calls the summary route yet. Evals and Memory Bank are later agent work |
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
| `EMBER_AGENTS_URL` | empty | Agents origin for the intake call and the assist calls (§6.13). The calls are skipped when it is empty |
| `EMBER_ASSIST_BACKGROUND` | on | `off` stops the photo read and translation calls that follow a stored report (§6.13). The supervisor routes still work |
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
| `EMBER_SATELLITE_RADIUS_M` | `2000` | How far from an incident a satellite lead is still named in the `satellite` factor (§5.2) |
| `EMBER_SATELLITE_WINDOW_H` | `24` | How old a lead may be to be named in that factor |
| `EMBER_API_URL` | empty | `ember-api` origin for the WITHDRAW push call. Skipped when empty |
| `EMBER_SITE_RADIUS_M` | `500` | Re-ignition alert radius |
| `EMBER_SITE_WATCH_DAYS` | `14` | Length of the watch window |
| `PHOTO_BUCKET` | built-in default | Bucket agents read photos from |
| `EMBER_FLASH_MODEL` | set in code | Model for triage, summaries, suggestions, answers and translations |
| `EMBER_FLASH_TIMEOUT_SECONDS` | `30` | Model call timeout |
| `EMBER_VERTEX_LOCATION` | `asia-southeast1` | Vertex region for the model calls |

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
| `POST /incidents/{id}/suggestions`, `POST /incidents/{id}/ask`, `POST /incidents/{id}/observations/{observationId}/translate` | supervisor | Yes (incident detail and volunteer pop-up, §6.13) |
| `GET /training`, `POST /training/progress`, `POST /training/practice` | volunteer | Yes (Guide and Practice, §6.12) |
| WebSocket at the gateway (§7) | any | No. Voice is unavailable in the browser (§7). Hold-to-talk UI shows unavailable and never invents a transcript |

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
| `device` | Observation, `POST /observations` request and response | Optional on the way in and absent on the way out unless a valid part was sent (§5.1) |
| `join` | `POST /observations` response, `sentToday[]` rows | Absent from the create response, and `null` in `sentToday`, until agents have placed the report. Never an error (§6.2) |
| `sentToday` | Volunteer digest | Present only when the request carried `sentSince` (§6.4) |
| `header`, `conditions`, `photoReads` | `GET /incidents/{id}`, supervisor only | Always present for a supervisor. `header.openedAt` and `header.source` are `null` when no report can be read. `conditions.weather` and `conditions.air` are `null` when nothing is stored. `photoReads` is `{}` when none (§6.3) |
| `suggestions`, `translations` | `GET /incidents/{id}`, supervisor only | Always present for a supervisor. `suggestions` is `null` until made, and its `items` may be `[]`. `translations` is `{}` when none is stored (§6.3) |
| `volunteers[].crewName`, `teamRole`, `device` | Same | `null` when nothing is stored. `device`'s parts are `null` when that report lacked them (§6.3) |
| `conflictContext.allObservations` | Same | `[]` when the incident has no readable report |
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
- `photo_triage` (except the `photoReads` in §6.3), `incident_suggestions` and `observation_translations` (except `suggestions` and `translations`, §6.3), `sites` and their alerts, the `facts` of `incident_summaries` (its text is `summary` in §6.3), `leads`, `weather`, `psi` (except the latest read in `conditions`, §6.3), `ingestRuns`, and `notificationAttempts` (§5.7). `GET /audit` reads the `audit` collection for supervisors (§5.5).
- Observations that are not on the two sides of a conflict, when the incident has a conflict, are not in `observations` (§6.3). A volunteer's read never has them. A supervisor's read returns them in `conflictContext.otherObservations`.
- An `investigate` proposal, and any agency assignment or hand-off (§5.2, §6.3, §10).
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
- **Summary route.** It exists and nothing calls it, so `summary` stays `null` (§8.1).
- **Background model calls.** They run on a thread after the report is stored, and Cloud Run only guarantees CPU during a request (§6.13).
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
- 2026-10-16 · Volunteer home and join-and-help: a volunteer's `GET /digest` accepts `lat` and `lng` and returns `nearby` and `myJoinRequests` (§5.6, §6.4). New routes `POST /incidents/{id}/join-requests`, `GET /join-requests`, `POST /join-requests/{id}/approve` and `.../decline` (§6.12), new `joinRequests` collection (§5.7) and audits `join.request`, `join.approve`, `join.decline` (§5.5). Wind and "supervisor asked for" are not returned because nothing stores them.
- 2026-10-16 · #102: `liveSeats/{incidentId}` holds the live-camera seat, last drop, and per-volunteer signal/media. A supervisor's `GET /incidents/{id}` returns `liveSeat`. `POST .../live/make-live` and `.../live/retry` assign the seat when signal is 3G+. The gateway updates signal from `location.signal` and writes `live.drop` (§5.5, §5.7, §6.3, §6.5, §7).
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
- 2026-10-16 · #152: `GET /me` adds `crewName` for a volunteer (`null` when none is stored). The volunteer header and Profile show it instead of a fixed crew line (§6.1).
- 2026-10-16 · #136, #137, #146 to #148: new volunteer routes `POST /tasks/{id}/accept`, `POST /tasks/{id}/decline` and `POST /incidents/{id}/withdraw/answer` (§6.11), audits `task.accept`, `task.decline` and `withdraw.answer`. Tasks gain optional `acceptedAt`, `declinedAt`, `declineReason` and `declineNote` (§5.3). The withdraw answer is stored in the new `withdraw_answers` collection and never changes `incident.withdraw`.
- 2026-10-16 · #141: new volunteer route `POST /observations/{id}/flag` (§6.11), audit `observation.flag`, stored in the new `observation_flags` collection. Observations stay immutable. The audit table (§5.5) also lists `task.accept`, `task.decline` and `withdraw.answer`, which #136, #137 and #146 to #148 already wrote.
- 2026-10-16 · #134, #135: `GET /digest` gains volunteer-only `nearby` (optional `lat`/`lng` query), new `incident_members` collection, `POST /incidents/{id}/join` and `POST /incidents/{id}/en-route`, audits `incident.join` and `incident.en_route`. A volunteer's `GET /incidents/{id}` may include `membership`. Wind/ask stay null until stored (§5.5, §5.6, §5.7, §6.11).
- 2026-10-16 · #129, #130, #140, #153, #154: hold-to-talk and coach reply stay UI-only until a browser WebSocket handshake exists (§7); spoken reports POST `/observations` only with a real gateway transcript. Tasks gain optional lead-closed fields and digest may include `seasonStats` (§5.3, §5.6); `POST /incidents/{id}/verify` closes open verify tasks. New volunteer routes `GET /training`, `POST /training/progress`, `POST /training/practice` (§6.12) for Guide and practice (never live voice or observations).
- 2026-10-16 · #131, #132: `POST /observations` (`201` and the `200` replay) adds `join` (`incidentId`, `incidentName`, `incidentArea`, `joined`, `nearbyCount`, `nearestM`, `radiusM`), read from the new `observation_joins` collection that agents write when they place a report. A volunteer's `GET /digest` adds `sentToday` when the request carries the new `sentSince` query, each row with the same `join` (§5.6, §5.7, §6.2, §6.4). The phone shows how many reports are near its own and the join radius.
- 2026-10-16 · #92, #93: `POST /observations` accepts an optional `device` (`batteryPct`, `network`, `language`), stored best effort and never failing a report (§5.1). A supervisor's `GET /incidents/{id}` adds `header`, `conditions` and `photoReads`, and each volunteer card adds `crewName`, `teamRole` and `device` (§6.3). The video, Ask EMBER and English translation parts of #93 are not built (§6.3, §12.4).
- 2026-10-16 · #95: evidence factors `wind` and `satellite`, each worth 0 points so no score or rule changes (§5.2), audit action `conflict.open` written by code when a conflict is created (§5.5), `conflictContext.allObservations` (§6.3). Settings `EMBER_SATELLITE_RADIUS_M` and `EMBER_SATELLITE_WINDOW_H` (§11.3). No `investigate` proposal is added (§12.5).
- 2026-10-17 · agents endpoints (#92, #93, #185): new private agents routes `POST /internal/incidents/{id}/suggestions`, `/ask` and `POST /internal/observations/{id}/translate` (§8.1), same Gemini client and settings as triage. New collections `incident_suggestions` and `observation_translations` (§5, §5.7). New supervisor routes `POST /incidents/{id}/suggestions`, `POST /incidents/{id}/ask` and `POST /incidents/{id}/observations/{observationId}/translate` (§6.13, §12.1), and a supervisor's `GET /incidents/{id}` adds `suggestions` and `translations` (§6.3, §12.2). `ember-api` now calls the existing triage route after a photo report and the translate route after a report with text, on a background thread that never delays the report, so `photoReads` fills in (§6.3, §8.1, §10). Setting `EMBER_ASSIST_BACKGROUND` (§11.1). No route changes an incident, a severity, a task or a withdraw. Still not built: an `investigate` proposal, sending to everyone on site, video, and the crew lead and duty numbers (§12.4).

Also on `main` since v1 and now in this contract: task and WITHDRAW pushes (#78, §6.6), photo observations and `POST /photos/upload-url` with push-token registration (#80, §6.2, §6.7, §6.8), and the `notificationAttempts` record (§5.7).

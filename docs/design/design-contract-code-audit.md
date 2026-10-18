# Design ↔ contract ↔ code audit — Supervisor Console

Read-only comparison of the final Figma page **Ember Final Design · Supervisor Console (Web)** (`204:2`), [contract #4](../contracts/shared-contract.md), and the code on 15 Oct 2026. Many items marked ❌ or ⚠️ in this snapshot have since been built; see the git log and `docs/api/api-map.md` for the current state. Route lookup: [docs/api/api-map.md](../api/api-map.md).

Figma was read through the REST API (file `WacSWJ9eGsdJ4vG9Q1nbyk`, version `2410619806413550595`, last modified 2026-10-15 16:10 UTC), one section at a time. Sections read: `205:2` User Flow, `205:3` Final Screens, `205:4` Important States. `205:5` WIP / Archive was not read. The volunteer page (`204:3`) and the Supervisor PWA page (`204:4`) were read for their dev notes only, to answer the volunteer and phone checks in §4. Their screens are not scored here.

**How a screen is scored.** ✅ built and matches. ⚠️ built and differs. ❌ not built. `/console` is one desktop page today (`apps/web/src/supervisor/SupervisorConsole.tsx`) that shows the queue, the map and one incident together.

**How a data item is scored.** One bullet under a dev note's "Data from API" is one item. "Everything in J2" and "Same as J1" are not counted again. Items marked "Device · not API" are not counted. ✅ Figma, contract and code agree. ⚠️ they differ in name, type, enum, shape or status vocabulary. ❌ missing from the contract, the code, or both.

## 1. Summary

**Screens:** 16 READY frames and 11 State frames.

| | ✅ | ⚠️ | ❌ | Frames |
|---|---:|---:|---:|---:|
| READY screens | 0 | 5 | 11 | 16 |
| State frames | 0 | 10 | 1 | 11 |
| **Total** | **0** | **15** | **12** | **27** |

**Data items:** dev-note bullets.

| | ✅ | ⚠️ | ❌ | Items |
|---|---:|---:|---:|---:|
| READY screens | 3 | 16 | 34 | 53 |
| State frames | 3 | 2 | 4 | 9 |
| **Total** | **6** | **18** | **38** | **62** |

The short version:

- What is built: sign-in and its errors, a queue and map, the conflict view, and task approve / reject / edit plus verify. Each differs from the final frame.
- `ember-api` already has extinguish, lower severity and supervisor WITHDRAW. The console client does not call them (`apps/web/src/supervisor/api/client.ts`).
- Most ❌ items need data no route returns, and much of that the contract does not allow on a client today. Examples: heard receipts, the live-camera seat, AI suggestions, audit read, weather, satellite leads, AQI, season metrics, villager broadcast, and agency hand-off.
- There are **no `Gap ·` frames** left on any of the three final pages. The four Loading gaps listed by the earlier draft of this file are now designed: `220:7249`, `221:7293`, `222:172` and `222:287`.

## 2. Per-screen

Code paths are under `apps/web/src/` unless they start with `services/`. Links use `-` in the node id.

### Journey C1 · Start a shift and coach the crew

| NN | Screen | Code | Data ✅ / ⚠️ / ❌ |
|---|---|---|---|
| 01 | [Sign in](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=205-8) | ⚠️ `routes/SignInScreen.tsx`, `routes/AuthShell.tsx`, `routes/copy.ts` | 0 / 0 / 1 |
| 02 | [Dashboard](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=205-26) | ⚠️ `supervisor/SupervisorConsole.tsx`, `IncidentQueue.tsx`, `queueGroups.ts`, `map/IncidentMap.tsx` | 0 / 4 / 3 |
| 03 | [Incident detail](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=205-285) | ⚠️ `supervisor/IncidentView.tsx` | 0 / 2 / 6 |
| 04 | [Volunteer pop-up](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=205-407) | ❌ | 0 / 0 / 6 |
| 05 | [Instruction delivered](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=205-674) | ❌ | 0 / 0 / 2 |

**01 Sign in**

- Screen: the copy matches `copy.signIn.supervisor`. The tagline differs: Figma says "The withdraw rule is code, not AI", and the code says "…is fixed in code".
- `config.demoMode` → no contract field → no route ❌. The "SIMULATED DEMO" strip is fixed copy (`copy.footnote`). Inside the console, "SIMULATED data" shows only when the build flag `VITE_USE_MOCK_API=true` is set.

**02 Dashboard**

- Screen differences:
  - The design has a top bar: profile, clock, ID/EN, Dark/Light, and nav for Incidents, Approvals · 3, Map, Audit log, Settings.
  - It also has a live banner, Season impact, map layer toggles, a list with status counts, four charts, and a "Weather now" card.
  - The code has a dark sidebar with "Live incident", the area-grouped queue and "On duty", then the map and the selected incident.
- Profile (name, agency), server clock, Approvals badge ⚠️:
  - Name: `GET /me` `displayName` ✅.
  - Agency: no field ❌.
  - Server clock: no field ❌.
  - Approvals count: no route ❌. It could only be counted by fetching every incident detail.
- Live banner ❌: count of fires needing her, `updatedAt`, next satellite pass. Per fire: code, placeName, on-site count, live-camera count, distance to an at-risk place, flags, photo cadence, since.
  - `GET /incidents` has none of these. It returns no `updatedAt` (only `GET /digest` does).
  - Next satellite pass and at-risk place are outside rule 7 and §5.7.
- Season impact ❌: fires contained, false alarms cleared, crew-hours, injuries, sorties, withdraw orders obeyed, median time to human check and its target, re-ignitions caught. Nothing in the contract or code.
- Map layers ⚠️:
  - Fires come from incident `lat`/`lng` ✅.
  - Crews, wind, hourly satellite leads and peat dryness have no client field ❌. Leads and weather are internal collections (§5.7), and rule 7 bars leads from any client payload.
- Incident list with counts Live / Held / Verified / Closed ⚠️:
  - Contract statuses are `open`, `held`, `verified`, `extinguished`.
  - Supervisor `GET /incidents` excludes `extinguished` (`LIVE_STATUSES` in `services/api/incidents/rules.py`), so the console cannot count "Closed".
  - "Live 2" in the frame is not a status. It counts fires with people on site. See §4 enums.
  - The rows show "4 reports · 3 volunteers": counts not on the list payload. "Verified by Bu Maya 12:10" has no `verifiedBy` or `verifiedAt` field.
- Charts ❌: satellite leads per day (real vs dismissed), median time to human check, crews by state, downwind AQI. The "Weather now" card shows Open-Meteo values that live only in internal `weather/current`.
- Refresh ⚠️:
  - The frame says "checks every 15 s and on push".
  - The code polls every 5 s (`POLL_MS = 5000` in `SupervisorConsole.tsx`).
  - Contract §6.6 defines polling plus FCM for volunteers. No push channel to the console exists.

**03 Incident detail**

- Screen differences:
  - The design has a header with Lower severity / Mark extinguished / Send withdraw / Audit log buttons, four stat cards, and a "Live from the field" bulletin per volunteer.
  - It also has instructions to everyone, including **villagers nearby (312 people, push + SMS)**, AI suggestions, Conditions, a Timeline and a map.
  - The code shows the name, status · severity · report count, a "Safety Guard on" chip, the withdraw banner, the evidence score card with Verify, the conflict pair or report list, and a task list.
- Header ⚠️:
  - Contract and code: `status`, `severity`, `id`, `name`, `area`.
  - The design adds `code` (`TOHOR-3`), a separate display id (`EMB-26-0142`), `placeName` ("Peat field behind SDN 2"), `openedAt`, its source (a FIRMS lead, 2.1 km), and "LIVE · 4 ON SITE".
  - The FIRMS source is a lead, which rule 7 keeps off client payloads.
- Stat cards ❌:
  - The severity card's rule and author ("Highest report wins · Sari 14:19") could be derived from observations ⚠️. Nothing returns which observation set it.
  - Wind and predicted shift, spread estimate, and the at-risk place have no field. A wind forecast is excluded by rule 7.
- Volunteer bulletin card ❌: initials, name, role ("crew lead"), crew, distance to the flame edge, network and battery, media (LIVE / PHOTO every N s / none), Gemini vision caption, speaking duration and voice level, last instruction with heard time or "not heard", and a resend countdown. None are in the contract or code.
- One live camera at a time ❌: the gateway has per-user and per-operation minute caps (`services/voice-gateway/live/caps.py`), not a seat.
- Common instructions ❌:
  - AI suggestions, a custom line, and the recipient count.
  - The frame also sends a safety notice to **villagers who are not volunteers**, by push and SMS, with an AI-drafted bilingual SMS.
  - No route sends one instruction to many volunteers, and nothing in the contract reaches non-volunteers.
- Conditions ❌: wind and gusts, humidity, downwind AQI, next satellite pass. Weather and PSI are internal (§5.7), and AQI drift is a forecast under rule 7.
- Timeline ❌: the audit log has no read route. The design's first row is "FIRMS · satellite lead 2.1 km NE", a lead on a client payload.
- Map ⚠️: the console map plots every incident (`map/IncidentMap.tsx`). The frame's map shows Sari and Rizal, and volunteer positions are not returned.

**04 Volunteer pop-up**

None of these are in the contract or code ❌:

- Live video for one volunteer. The gateway relays frames to Gemini only. It does not stream to the console.
- A transcript plus its English translation. The socket carries audio, not text.
- Snapshots saved to the incident.
- Instructions sent to this volunteer, with heard/done.
- Profile: position, on site since, network, battery, language, last heard.
- AI suggestions with rationale.

The frame also shows an **"Ask EMBER" chat** that drafts instructions for two volunteers before sending. The dev note does not list it, and it needs a supervisor-facing model route. Rule 2 still applies: it must not set severity.

**05 Instruction delivered**

- `heardAt` per volunteer ❌.
- The toast ("Sari heard it · 14:23 · spoken in Bahasa · logged") ❌.
- "Undo not possible · audit" implies an audit action for sending an instruction, which §5.5 does not have.

### Journey C2 · Resolve a held incident (from 02 · Dashboard)

| NN | Screen | Code | Data ✅ / ⚠️ / ❌ |
|---|---|---|---|
| 06 | [Reports disagree](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=205-804) | ⚠️ conflict card and task list in `supervisor/IncidentView.tsx` | 0 / 3 / 1 |
| 07 | [Edit instruction](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=205-906) | ⚠️ inline textarea in `TaskRow`, not a modal | 2 / 1 / 0 |
| 08 | [Lower severity](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=205-1016) | ❌ UI. `POST /incidents/{id}/severity` exists and is not called | 1 / 1 / 0 |
| 09 | [Mark extinguished](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=205-1134) | ❌ UI. `POST /incidents/{id}/extinguish` exists and is not called | 0 / 2 / 1 |
| 10 | [Audit log](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=205-1244) | ❌ | 0 / 0 / 2 |

**06 Reports disagree**

- Header (status, severity, evidence score, code, placeName) ⚠️. `evidenceScore` ✅ and is labelled "not a probability" in both. Code and placeName have the same gap as 03.
- Conflict block per report ⚠️:
  - Time `capturedAt` ✅, accuracy `accuracyM` ✅, chip (`api`, `aman`) ✅, severity ✅, transcript `text` ✅, mode = `source` (`live` → "voice") ✅.
  - Reporter name ❌ on this read. `volunteerName` is stored on create (§5.1) and omitted by `OBSERVATION_FIELDS`. The UI turns `uid_sari` into "Sari" (`volunteerName()` in `supervisor/view.ts`).
- Proposals with the inline 409 ⚠️:
  - `type`, `status`, `volunteerId` and `instruction` ✅. `POST /tasks/{id}/approve` returns `409 conflict` for `investigate` while a conflict is open ✅.
  - The UI pre-disables Approve with its own sentence, so the API's 409 text is never shown inline.
  - Fusion never creates `investigate` tasks, so this row cannot appear on real data (`services/agents/fusion/rules.py`).
  - The design labels the type "INVESTIGATE". The code labels it "Dispatch" (`TASK_LABEL`).
- Evidence factors, map, latest audit ❌:
  - `evidenceFactors` is stored and never returned (§5.2).
  - The design's factors ("Wind E → W 14 km/h", "Satellite lead nearby · planned") are not in the contract's factor list (`severity`, `corroboration`, `photo`, `gps`, `conflict`). The lead one also conflicts with rule 7.
  - Latest audit needs a read route. It lists "code · conflict opened", which is not an audit action, and "code · observation.create" (see §4).

**07 Edit instruction**

- Current instruction ✅ `task.instruction`, saved by `POST /tasks/{id}/edit`.
- Volunteer, type and incident stay the same ✅. The route replaces only `instruction`.
- "Saved as task.edit by Bu Maya" ⚠️. The audit stores `actorId` (a uid), the response is `{ task, auditId }`, and nothing returns the editor's name.

**08 Lower severity**

- Current severity ✅ `incident.severity`.
- Allowed lower values from the API ⚠️:
  - The route enforces strictly-lower and rejects `unknown` (`rules.is_lower`). Its 400 message omits `unknown` from the list.
  - No route returns the allowed list. The client would have to hard-code the §1 order, which the dev note forbids.
  - The design's options (Smoke, None) and its "Large flame / Unknown not offered" match the contract.

**09 Mark extinguished**

- Incident code ⚠️: same as 03.
- Re-ignition watch note ❌, marked "planned" in Figma. `sites` is written by agents and has no client route.
- Confirm writes an audit entry ⚠️. `incident.extinguish` is written ✅. The client only gets `auditId`, and the copy "logged … by Bu Maya at the time you confirm" needs the audit read.
- After confirming, the incident leaves supervisor `GET /incidents`, so the console loses it. 02 still expects it under "Closed".

**10 Audit log**

- Entries (time, actor, action, target, detail) ❌:
  - The contract record is `id`, `actorId`, `action`, `targetId`, `at`. There is no `detail` and no actor name.
  - The design's details ("smoke → small_flame", "Approved while conflict open (allowed)", "chip aman · none") are not stored.
  - §5.5 has no read route. The frame says "Clients can read, never write", which needs a contract change.
- Paging ❌.

### Journey C3 · Withdraw the crew (from 03 · Incident detail)

| NN | Screen | Code | Data ✅ / ⚠️ / ❌ |
|---|---|---|---|
| 11 | [Send WITHDRAW](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=205-1316) | ❌ UI. `POST /incidents/{id}/withdraw` exists and is not called | 0 / 2 / 1 |
| 12 | [WITHDRAW not confirmed](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=205-1443) | ❌ The withdraw banner from `incident.withdraw` exists. The escalation does not | 0 / 1 / 3 |

**11 Send WITHDRAW**

- Recipients (name, report count and time, task) with selection ⚠️:
  - The route accepts only `volunteerIds` that already have an observation or a task on the incident. That matches "volunteers on this incident".
  - There is no recipient list. When a conflict exists, `GET /incidents/{id}` returns only the conflict's observations, so other reporters cannot be listed. Names are missing as on 06.
- Instruction in ID and EN ❌. `instruction` is one string.
- Reason "supervisor instruction" ⚠️. `reasons` is a free string list, and the contract's example uses exactly that string. It is not an enum.

**12 WITHDRAW not confirmed**

- Withdraw event (source code, `sentAt`, trigger reason) ⚠️. `withdraw` has `active`, `instruction`, `reasons`, `volunteerIds` ✅. It has no `source` and no `sentAt`.
- Confirmations "3 of 4 safe upwind" ❌. There is no volunteer acknowledgement write.
- Unconfirmed volunteer (name, elapsed since sent, last heard, place, network) ❌.
- Phone number for "Call Pak Dedi" ❌. "Mark found safe (logged)" is a new write and a new audit action ❌.
- The copy "Instructions are paused while WITHDRAW is in force. They resume when code clears it or you mark everyone safe" has two problems:
  - Nothing in code ever clears `withdraw`: fusion only merges into it.
  - The contract says clearing it is not a client action.

### Journey C4 · Live video drops (from 03)

| NN | Screen | Code | Data ✅ / ⚠️ / ❌ |
|---|---|---|---|
| 13 | [Live video dropped](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=205-1589) | ❌ | 0 / 0 / 2 |

- Video-drop event (who, time, reason "signal below 3G") ❌.
- Live seat state (free / held, by whom) ❌.
- Nothing switches a volunteer to "a photo every 60 s". The PWA photo is a still the volunteer chooses (`pwa/photo/`).

### Journey C5 · Re-ignition watch (from 02)

| NN | Screen | Code | Data ✅ / ⚠️ / ❌ |
|---|---|---|---|
| 14 | [Re-ignition alert](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=205-1714) | ❌ UI. `POST /internal/sites/scan` writes `sites` alerts and a `site.reinspect` audit | 0 / 0 / 2 |

- Alert (distance from a new lead to the site, site code, extinguished date) ❌ on any client route.
  - The data exists internally: `sites.alerts[]` has `kind: lead`, `distanceM`, `at`, and the site has `extinguishedAt`.
  - Exposing it needs a contract exception: a lead on a client payload breaks rule 7.
- Drafted re-check task from code ❌:
  - The sites watch writes alerts only, not tasks (`services/agents/sites/watch.py`).
  - The frame says the task "needs your approval because the site was closed". That is a proposed task on an `extinguished` incident, which the contract does not describe.
  - "Dismiss with reason" needs a write and an audit action.
- The same frame shows "Satellite leads this week" and "Downwind air · Maps Air Quality · 121 AQI · Selatpanjang 38 km W · smoke drifts toward town". These are leads, AQI and drift, all outside rule 7 and §5.7. "Household alerts: decision pending" is printed on the frame.

### Journey C6 · Hand off to the fire agency (from 03)

| NN | Screen | Code | Data ✅ / ⚠️ / ❌ |
|---|---|---|---|
| 15 | [Hand off to agency](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=205-1982) | ❌ | 0 / 0 / 3 |
| 16 | [Agency in charge](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=205-2143) | ❌ | 0 / 0 / 1 |

- **15** These have no contract entity or route ❌:
  - Agencies: name, unit, type, distance, on-call status.
  - Hand-off reasons (multi-select).
  - Packet contents: pin, timeline, 14 photos plus the last 2 min of video, crew names, positions and **phone numbers**, wind and places downwind.
  - Contract §10 says "EMBER does not send agency reports".
- **16** Agency name, in charge since, reference number ❌.
  - "Your instructions go to crew leads only" needs a crew-lead role, which the contract does not have. Roles are `volunteer` and `supervisor`.
  - The heard receipts on this frame have the same gap as 05.

### Important states

| Frame | Code | Data ✅ / ⚠️ / ❌ |
|---|---|---|
| [Default · Sign in](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=206-6161) | ⚠️ same as 01 | counted on 01 |
| [Loading · Sign in](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=206-6179) | ⚠️ `SignInScreen` busy "Signing in…", then `RoleHome.tsx` `CheckingScreen` "Checking sign-in…" | 1 / 0 / 0 |
| [Error · Wrong role](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=206-6197) | ⚠️ `RequireRole` in `routes/RoleHome.tsx` | 1 / 1 / 1 |
| [Error · No access yet](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=206-6217) | ⚠️ `RequireRole`, `status === 'no-access'` | 1 / 0 / 1 |
| [Error · Page not found](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=206-6237) | ⚠️ `routes/NotFound.tsx` | 0 / 0 / 0 |
| [Default · Dashboard](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=206-6257) | ⚠️ same as 02 | counted on 02 |
| [Empty · No live incidents](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=206-6518) | ⚠️ empty state in `SupervisorConsole.tsx` | counted on 02 |
| [Loading · Dashboard](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=220-7249) | ⚠️ "Loading live incident…" text, no skeleton | 0 / 0 / 0 |
| [Default · Incident detail](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=206-6715) | ⚠️ same as 03 | counted on 03 |
| [Error · Connection lost](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=206-6839) | ❌ | 0 / 1 / 2 |
| [Loading · Incident detail](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=221-7293) | ⚠️ "Loading live incident…" text, no skeleton | 0 / 0 / 0 |

- **Loading · Sign in:**
  - Firebase Auth, then `GET /me` ✅ (`auth/AuthProvider.tsx`, `auth/api.ts`).
  - The design's "Waiting for the Google window…" with a disabled button is not the copy the code shows.
- **Wrong role:**
  - `me.role` ✅ decides the suggested app.
  - "403 · FORBIDDEN" ⚠️. `GET /me` returns `200` for a volunteer, and the console compares `me.role` itself. The 403 on the page is fixed copy (`copy.wrongRole.code`), not an API error.
  - `me.email` ❌. `/me` has no `email`. It is available on the device from the Firebase user.
  - The stored language and toggle are device-only. The code follows the stored language, and there is no toggle on this card.
- **No access yet:**
  - `403 role_missing` ✅.
  - `me.email` ❌: same as above. When `/me` fails there is no `me` body, so the email can only come from Firebase.
  - The design's "Check again" button is missing. The code offers only Sign out.
- **Page not found:** the design shows the requested path ("/console/nonexistent doesn't exist"). The code shows generic copy.
- **Empty dashboard:** the design keeps impact and charts and shows "Closed 10". The code shows a single empty card.
- **Loading dashboard and loading incident:** these have no dev note. The frames show a skeleton with Approvals, Live and Closed placeholders.
- **Connection lost:**
  - Last cached incident ⚠️. The code keeps the last queue and detail in memory and shows "Could not reach ember-api", but it does not mark them "LAST KNOWN".
  - `lastUpdateAt` and the retry schedule ❌. `GET /incidents` has no timestamp. The design retries every 8 s, and the code polls every 5 s.
  - Crew lead and BPBD duty phone numbers ❌.
  - The code does not block sending while offline. The design does ("Offline · can't send"; nothing is queued).

### Hard-coded values that Figma tags `[API]`

| Where | What is hard-coded | Figma |
|---|---|---|
| `supervisor/SupervisorConsole.tsx` | `POLL_MS = 5000` | "checks every 15 s and on push" (02), "Retrying every 8 s" (connection lost) |
| `supervisor/view.ts` `volunteerName()` | Volunteer names made from the uid (`uid_dedi` → "Dedi") | Names from the API (`volunteerName` is stored, not returned) |
| `supervisor/view.ts` `timeOf()` | Times shown as `HH:MM UTC` | Local `HH:mm` (14:07, 14:21) |
| `supervisor/view.ts` `TASK_LABEL` | `investigate` → "Dispatch" | "INVESTIGATE" |
| `supervisor/view.ts` `SEVERITY_LABEL` | `none` → "No fire" | "None — nothing burning" |
| `supervisor/view.ts` `taskControls()` | "Dispatch is held until the conflict is resolved." | The 409 text from the API, inline |
| `supervisor/map/markers.ts` | `WITHDRAW_ZONE_M = 500` | No withdraw radius in the contract. Site `radiusM` default 500 is server-side |
| `supervisor/IncidentView.tsx` | `maxLength={500}` on the instruction | Server limit `INSTRUCTION_MAX = 500`, not in the contract |
| `supervisor/IncidentView.tsx` | "Safety Guard on", "SAFETY RULE · SENT TO N PHONES" (English only) | STATIC, but the bundle is ID/EN and the console has no i18n |
| `routes/copy.ts` `footnote`, `supervisor/SupervisorConsole.tsx` | "SIMULATED" strip from copy, shown in the console only when `VITE_USE_MOCK_API=true` | `config.demoMode` |
| `supervisor/fixtures.ts`, `supervisor/map/fixtures.ts`, `supervisor/api/mock.ts` | Ketapang names, scores, coordinates | Allowed as API fixtures. Mock mode builds them into the client bundle |

## 3. API changes needed (proposals only)

Nothing below is implemented or written into the contract. Items marked **rule** need a contract rule change, not only a new field.

### New reads

| Proposal | Screens |
|---|---|
| `GET /config`: `demoMode`, `supportedLanguages`, poll interval, offline retry interval | 01, 02, connection lost |
| Extend `GET /me` with `agency`, `onDuty`, and server time (or a `Date` header). `email` can come from the Firebase user on the device | 02, wrong role, no access |
| `GET /audit?targetId=&cursor=`: `at`, `actorId`, actor display name, `action`, `targetId`, optional `detail`. **Rule** §5.5 has no read | 03 timeline, 06, 07, 09, 10 |
| `GET /tasks?status=proposed`, the approvals queue with incident label and volunteer name | 02 badge |
| Supervisor list of extinguished incidents (`GET /incidents?status=extinguished` or a counts object) | 02 "Closed", empty state |
| Re-ignition alerts for clients: site id, incident label, `distanceM`, `extinguishedAt`, alert `at`. **Rule** 7: a lead on a client payload | 14, 09 note |
| Season-impact metrics and chart series, with metric definitions ("How we count") | 02, 14 |
| Conditions: wind, gusts, humidity, AQI, next pass, plus map layers (crews, wind, leads, peat). **Rule** 7 for leads, AQI drift and the wind forecast | 02, 03, 12, 14 |
| Volunteers on an incident: id, `displayName`, role, crew, report count and last time, task, position, network, battery, media mode, last heard | 03, 04, 11, 12 |
| Allowed lower severities for an incident (or document that the client derives them from §1) | 08 |

### New writes and events

| Proposal | Screens |
|---|---|
| Send one instruction to many volunteers (incident-level instruction), with an audit action | 03, 04, 05, 16 |
| Heard receipt: `heardAt` per volunteer per instruction, plus resend | 03, 04, 05, 16 |
| Live-camera seat: holder, make-live, end, drop event with reason and time | 03, 04, 13 |
| AI suggestions (list, preselected, rationale), labelled advisory, plus the "Ask EMBER" drafting chat. Rule 2: must not set severity | 03, 04, 05 |
| Volunteer WITHDRAW acknowledgement: `safe` with location, or `cant_get_out`. Count "x of y confirmed" | 12 |
| "Mark found safe" supervisor write and audit action | 12 |
| Withdraw cleared event. **Rule** §5.2: clearing is not a client action, and no code path clears it today | 12 |
| Re-check task from a re-ignition alert, and "dismiss with reason". Neither may reopen or re-rate the incident (§5.7) | 14 |
| Villager safety notice (push + SMS to non-volunteers within 2 km). **Rule**: nothing in the contract reaches non-volunteers | 03, 04 |
| Agency hand-off (agencies, reasons, packet) and "agency in charge" (name, since, ref). **Rule** §10 | 15, 16 |
| Crew-lead role or flag, for "instructions go to crew leads only". **Rule** §2 roles | 16 |
| Phone numbers for volunteers, crew lead, and BPBD duty line | 12, 15, connection lost |

### New or changed fields

| Change | Screens |
|---|---|
| Add a stable short incident `code` (`TOHOR-3`) and `placeName`, or agree that `name` and `area` are the only labels. Today the client falls back to `INC-XXXX` (`pwa/incidentName.ts`) | 02, 03, 06, 08, 09, 14, 15, 16 |
| `openedAt` on the incident; `verifiedBy` and `verifiedAt` | 02, 03 |
| Return `volunteerName` on `GET /incidents/{id}` observations (stored, omitted by `OBSERVATION_FIELDS`) | 03, 06, 11 |
| Return all incident observations with the conflict pair, not only the pair | 06, 11 |
| `withdraw.source` (`code` or a supervisor uid) and `withdraw.sentAt` | 12, 03 banner |
| Bilingual instruction (`id`, `en`), or keep one string and label it with its language | 04, 05, 11 |
| `evidenceFactors` on the supervisor detail. The design's factor names (wind, satellite lead) need to match the contract's list | 06 |
| `updatedAt` on the `GET /incidents` response (today only `GET /digest` has it) | 02, connection lost |
| Report and volunteer counts on incident list rows | 02 |

### Enum and vocabulary changes

| Change | Screens |
|---|---|
| Decide what "Live" and "Closed" mean. Proposal: "Closed" = `extinguished`. "Live" is a derived count (people on site), not a status | 02, empty state |
| New audit actions if the writes above are added: instruction send, found-safe, re-ignition dismiss, re-check create, hand-off. "Conflict opened" is shown in 06 and is not an action today | 05, 06, 10, 12, 14, 15 |
| Withdraw reason vocabulary. Proposal: keep free strings, or add an enum including `supervisor_instruction`, `large_flame`, `wind_shift` | 11, 12 |

### Already in the contract and the code: the UI only needs to call them

- `POST /incidents/{id}/extinguish` (09)
- `POST /incidents/{id}/severity`, strictly lower only (08)
- `POST /incidents/{id}/withdraw`, no approval (11)
- `POST /tasks/{id}/approve`, `reject` and `edit`, with the investigate `409` (06, 07)
- `POST /incidents/{id}/verify` (06; already called)
- `evidenceScore` and `conflict` on `GET /incidents/{id}` (06)

## 4. Specific checks

### Status and severity enums

| Enum | Figma | Contract | Code | Result |
|---|---|---|---|---|
| Incident status | Live, Held ("Held · dispatch on hold"), Open, Verified, Closed | `open`, `held`, `verified`, `extinguished` | Same as the contract. Labels: Open, "Held · conflict", Verified, Extinguished. Supervisor list hides `extinguished` | ⚠️ "Live" and "Closed" are not statuses |
| Severity | Small flame, Smoke, None, Large flame, Unknown | `none`, `smoke`, `small_flame`, `large_flame`, `unknown` | Same values. `none` is labelled "No fire" | ✅ values, ⚠️ one label |
| Chip | Fire `api`, Safe `aman` | `asap`, `api`, `aman`, `butuh_bantuan` | Same | ✅ |
| Task type | VERIFY, INVESTIGATE | `verify`, `withdraw`, `investigate` | Same values. `investigate` labelled "Dispatch". Fusion never creates `investigate` | ⚠️ |
| Task status | PROPOSED | `proposed`, `approved`, `rejected` | Same | ✅ |
| Conflict status | "Reports disagree", resolved implied by the 409 lifting | `open`, `resolved` | No writer sets `resolved` | ⚠️ the 409 can never lift |
| Audit action | `observation.create`, `task.approve`, `task.edit`, `task.withdraw`, `incident.verify`, `incident.severity.raise`, "conflict opened" | The 11 actions in §5.5 | Same as the contract | ⚠️ "conflict opened" is not an action |

### Volunteer side (contract and code; designs on page `204:3`)

| Item | Contract #4 | Code | Result |
|---|---|---|---|
| Ask to join | Not present. A volunteer sees only incidents linked to their own observations, tasks or withdraw (§5.6) | Not present | ❌ (dev note VC says so) |
| Decline reasons | Not present | Not present | ❌ |
| Not-a-fire reasons + photo | Not present. Photo observations are outside §6.2 | "Not a fire" posts chip `aman`. `POST /photos/upload-url` exists and is not linked to the task | ❌ |
| Flag a wrong report | Not present. Observations are immutable | Not present | ❌ |
| Confirm safe / can't get out during WITHDRAW | Not present | "I'm safe" is local only in `pwa/WithdrawScreen.tsx` | ❌. Console 12 depends on it |
| Withdraw-cleared event | Clearing is not a client action. No event | No code clears `withdraw` | ❌ |
| Heard receipts | Not present | Not present | ❌. Console 03, 04, 05, 16 depend on it |
| Offline idempotency key (#62) | `clientId` on `POST /observations` (§5.1, §6.2) | `services/api/observations/store.py`. The outbox sends `clientId` | ✅. Dev note R8 still says "needs #62" |
| Photo upload (#61) | §6.2 rejects `source: "photo"`. §10 puts the signed URL outside the contract | `POST /photos/upload-url`, then `POST /observations` with `source: "photo"` | ⚠️ the code is ahead of the contract |

### Console

| Item | Contract #4 | Code | Result |
|---|---|---|---|
| Heard receipts and resend | Not present | Not present | ❌ |
| One-live-camera seat | Not present | Minute caps only (`voice-gateway/live/caps.py`) | ❌ |
| AI suggestions | `incident_summaries` is advisory and internal. No suggestion entity | Fusion uses a fixed `VERIFY_INSTRUCTION` | ❌ |
| Edit instruction | `POST /tasks/{id}/edit` | Route and UI | ✅ data. ⚠️ screen (inline, no editor name) |
| Lower severity, strictly lower | `POST /incidents/{id}/severity` | Route. No UI | ⚠️ no allowed-values list |
| Mark extinguished | `POST /incidents/{id}/extinguish` | Route. No UI | ⚠️ the incident then leaves the list |
| Supervisor WITHDRAW, recipients, confirmations | Route with `volunteerIds`, `instruction`, `reasons`. No confirmations | Route. No UI. No confirmations | ⚠️ / ❌ |
| Re-ignition alert | `sites` internal (§5.7). Rule 7 | Agents write alerts. No client route | ❌ |
| Agency hand-off | §10: EMBER does not send agency reports | Not present | ❌, needs a rule change |
| Audit log | Append-only, no read | Writes only | ❌ read |
| Season-impact metrics and charts | Not present. Several inputs break rule 7 | Not present | ❌ |
| Polling interval / push | Polling `GET /incidents`. FCM for volunteers only | Poll every 5 s. No console push | ⚠️ Figma says 15 s + push, and 8 s retry offline |

### Supervisor PWA (page `204:4`)

The six phone screens (`205:35841` Home, `205:35920` Incident, `205:36079` Volunteer sheet, `205:36285` WITHDRAW hold 2 s, `205:36470` Approvals, `205:36501` Incident compact) need the same data as the console. Their dev notes list: incident code, live fires, proposals, impact, wind, AQI, volunteer rows with heard receipts, suggestions, withdraw recipients, approvals queue with inline 409, conflict summary, and phone numbers.

**They can reuse the console endpoints and the proposals in §3. They do not need their own API.** The one phone-specific read is the approvals queue (`GET /tasks?status=proposed`), which console 02's badge also needs. There is no phone supervisor route in code today. `/console` stacks under 960 px and is not that design.

## 5. Contract #4 and the code disagree

| Topic | Contract | Code |
|---|---|---|
| Photo on `POST /observations` | §6.2 rejects `source: "photo"`. §10 puts the signed URL outside the contract | Accepted after `POST /photos/upload-url` (`services/api/photos/routes.py`) |
| `observation.create` audit actor | §5.5: `actorId` is "the supervisor uid, or `code` when code decided" | `actorId` is the volunteer's uid (`services/api/observations/store.py`, `services/voice-gateway/live/store.py`). Figma 06 shows `code` |
| `volunteerName`, `clientId` on incident detail | §5.1 lists both on the observation | `GET /incidents/{id}` omits both (`OBSERVATION_FIELDS`) |
| Extinguish, lower severity, supervisor withdraw | §6.5 | Routes exist in `services/api/incidents/routes.py`. `supervisor/api/client.ts` does not call them |
| `investigate` tasks | §6.5 approves them when no conflict is open. §9 shows one | Fusion creates only `verify` and `withdraw` (`services/agents/fusion/rules.py`) |
| Conflict `resolved` | Exists in the enum. Clients cannot set it | No writer sets it, so the dispatch hold never lifts |
| Instruction length | Not stated | `INSTRUCTION_MAX = 500` on edit and withdraw |
| Lower severity error text | §6.5 | The 400 message lists four values and leaves out that `unknown` is also rejected |
| Supervisor incident list | §5.6: supervisor sees `open`, `held`, `verified` | Matches. No route returns extinguished incidents |
| Audit read | None | None. Writes only |
| Withdraw clearing | Not a client action | Nothing clears it at all. Fusion only merges |
| Wrong role | §2: the wrong role is `403` | `GET /me` is `200` for any role. The console decides the wrong role on the client. Data routes do return `403 forbidden` |

## 6. Missing designs, and code with no final frame

### `Gap ·` frames

None. A name search over every section of `204:2`, `204:3` and `204:4` found only layout frames named `gap`. The earlier draft of this file listed four `Gap ·` loading frames. They have been replaced by designed states:

- [Loading · Dashboard](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=220-7249)
- [Loading · Incident detail](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=221-7293)
- [Loading · Supervisor PWA home](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=222-172)
- [Loading · Supervisor PWA incident](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=222-287)

Other design gaps, not marked as `Gap ·` frames:

- The two new Loading frames have no dev note.
- No error state for a failed first load of the dashboard. `routes/PageBoundary.tsx` has one in code.
- Nothing for the top-bar destinations other than Incidents and Audit log: Approvals, Map, Settings.
- No error state when an action fails (approve, edit, extinguish, withdraw).

### In the code with no final frame

- The single-page console: queue, map and incident on one screen. The design splits this into Dashboard and Incident detail.
- The area-grouped incident queue in the sidebar (`supervisor/IncidentQueue.tsx`, `queueGroups.ts`).
- The "Safety Guard on" chip and the per-action "Confirmed by ember-api · audit …" outcome lines.
- The schematic map fallback when the Maps key is absent (`supervisor/map/`).
- The mock-API mode with in-bundle fixtures (`VITE_USE_MOCK_API`).
- `routes/RoleChoice.tsx` at `/`. It is designed on the volunteer page, not the console page.

### Design tokens and i18n in the repo

- Tokens:
  - Console CSS variables in `supervisor/supervisor.css` (12 variables) are copied from `docs/design/EMBER_design_handoff.md` §3, for example `--ember #e2531b` and `--paper #faf7f2`.
  - The PWA has its own 12 in `pwa/volunteer.css`.
  - Nothing is generated from the Figma `EMBER / Semantic` collection. The page sets that collection's mode `190:0` on the canvas.
- Theme: the design shows a Dark / Light toggle in the console top bar. The code is light-only (`color-scheme: light`).
- i18n:
  - `pwa/i18n.ts` (`Lang = 'id' | 'en'`, `t()`, stored in `localStorage` key `ember.lang`) and `routes/copy.ts` cover sign-in and the error pages.
  - The console body (`supervisor/*.tsx`, `view.ts`) is English only, and the top-bar ID/EN toggle is not built.

## 7. Questions for the team

1. Is "Closed" the contract status `extinguished`, and should supervisors be able to list extinguished incidents?
2. What is "Live" on the dashboard? Is it a status, or a count of incidents with people on site?
3. Which dashboard and detail numbers may a client show under rule 7: leads, AQI, wind forecast, spread, next satellite pass?
4. Does the audit log get a read route, and should it carry actor names and a `detail` string?
5. Should `observation.create` audits use the volunteer uid (code today) or `code` (contract and Figma)?
6. Is a heard receipt a task field, a push result, or a new event, and who writes it?
7. Is the one-live-camera seat in scope, separate from the Live minute caps?
8. Are AI suggestions and the "Ask EMBER" chat in scope, and through which service?
9. Do supervisors send one instruction to everyone on site? Today only per-task edit exists.
10. Is the villager push + SMS notice in scope? It reaches people who are not EMBER users.
11. Who may clear a WITHDRAW, if anyone, and does "Mark found safe" or "everyone confirmed" clear it?
12. Does the volunteer "safe / can't get out" acknowledgement become a contract write?
13. Should fusion create `investigate` tasks, and what sets a conflict to `resolved` so the 409 can lift?
14. Does agency hand-off override §10 ("EMBER does not send agency reports")?
15. Is a crew-lead role needed for "instructions go to crew leads only"?
16. Do we add a short incident `code` and `placeName`, or use `name` and `area` everywhere?
17. Should bilingual instructions be stored as `id` and `en`, or as one string plus a language?
18. Is the console poll 15 s (Figma) or 5 s (code), and is there a push channel to the console?
19. Should `GET /me` carry `agency` and `onDuty`, with `email` taken from Firebase on the device?
20. Should §6.2 be updated to match the photo route that the code already has (#61)?
21. Can dev note R8's "needs #62" be closed, since `clientId` is already in the contract and code?
22. Does the Supervisor PWA replace the stacked `/console` layout under 960 px, or is it a separate route on the same API?
23. Should the console tokens be generated from the `EMBER / Semantic` variables, and does the console need Dark mode?

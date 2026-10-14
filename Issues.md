# EMBER issues

Snapshot of GitHub issues for local reference. GitHub remains the source of truth.

- Repo: [suhail39ahmed/ember-fire-commander](https://github.com/suhail39ahmed/ember-fire-commander)
- Captured: 13 Oct 2026
- Count: 27 open issues (no pull requests)

## Index

| # | State | Labels | Title |
|---|---|---|---|
| [4](#4-shared-define-shared-contracts) | closed | ui, backend, voice-gateway, agents, shared, P0 | [shared] Define shared contracts |
| [5](#5-demo-freeze-the-synthetic-demo-scenario) | open | demo, P0 | [demo] Freeze the synthetic demo scenario |
| [6](#6-ui-add-google-sign-in-and-role-based-routes) | open | ui, P0 | [ui] Add Google sign-in and role-based routes |
| [7](#7-backend-resolve-the-signed-in-user-and-role) | open | backend, P0 | [backend] Resolve the signed-in user and role |
| [8](#8-backend-verify-identity-on-ember-api) | open | backend, P0 | [backend] Verify identity on ember-api |
| [9](#9-voice-gateway-verify-identity-on-the-websocket-upgrade) | open | voice-gateway, P0 | [voice-gateway] Verify identity on the WebSocket upgrade |
| [10](#10-agents-implement-fusion-conflict-and-withdraw-rules) | open | agents, P0 | [agents] Implement fusion, conflict, and WITHDRAW rules |
| [11](#11-infra-reconcile-missing-project-docs) | open | documentation, infra, P1 | [infra] Reconcile missing project docs |
| [12](#12-backend-accept-chip-and-text-observations) | open | backend, P0, fallback-b | [backend] Accept chip and text observations |
| [13](#13-backend-expose-incident-digest-and-approval-apis) | open | backend, P0 | [backend] Expose incident, digest, and approval APIs |
| [14](#14-backend-issue-private-photo-upload-urls) | open | backend, P1 | [backend] Issue private photo upload URLs |
| [15](#15-voice-gateway-relay-gemini-live-and-write-observations) | open | voice-gateway, P0 | [voice-gateway] Relay Gemini Live and write observations |
| [16](#16-pwa-build-the-volunteer-report-screen) | open | pwa, P0 | [pwa] Build the volunteer report screen |
| [17](#17-pwa-add-chip-and-text-controls) | open | pwa, P0, fallback-b | [pwa] Add chip and text controls |
| [18](#18-supervisor-console-build-the-supervisor-decision-screen) | open | supervisor-console, P0 | [supervisor-console] Build the supervisor decision screen |
| [19](#19-pwa-make-the-volunteer-app-installable) | open | pwa, P0 | [pwa] Make the volunteer app installable |
| [20](#20-pwa-add-the-photo-upload-action) | open | pwa, P1 | [pwa] Add the photo-upload action |
| [21](#21-pwa-add-the-offline-report-outbox) | open | pwa, P2 | [pwa] Add the offline report outbox |
| [22](#22-supervisor-console-show-incident-locations) | open | supervisor-console, P1 | [supervisor-console] Show incident locations |
| [23](#23-backend-send-task-and-withdraw-pushes) | open | backend, P1 | [backend] Send task and WITHDRAW pushes |
| [24](#24-agents-add-flash-photo-triage-and-summaries) | open | agents, P2 | [agents] Add Flash photo triage and summaries |
| [25](#25-agents-add-re-ignition-watch) | open | agents, P2 | [agents] Add re-ignition watch |
| [26](#26-infra-add-hourly-firms-weather-and-psi-ingest) | open | infra, P2, fallback-c | [infra] Add hourly FIRMS, weather, and PSI ingest |
| [27](#27-shared-connect-the-end-to-end-demo-path) | open | pwa, supervisor-console, backend, voice-gateway, agents, shared, P0 | [shared] Connect the end-to-end demo path |
| [28](#28-infra-deploy-and-smoke-test-the-demo-path) | open | infra, P0 | [infra] Deploy and smoke-test the demo path |
| [29](#29-infra-turn-on-app-check-enforcement) | open | infra, P1 | [infra] Turn on App Check enforcement |
| [30](#30-demo-record-the-october-17-demo) | open | demo, P0 | [demo] Record the October 17 demo |

## Issues

### #4 [shared] Define shared contracts

- State: open
- Labels: ui, backend, voice-gateway, agents, shared, P0
- URL: https://github.com/suhail39ahmed/ember-fire-commander/issues/4

## Outcome
Write the shared contract that lets the PWA, supervisor console, ember-api, voice gateway, and agents be implemented independently.

## Owned paths
- `docs/contracts/`

## Acceptance criteria
- [ ] Document the observation, incident, task, conflict, and audit fields, plus example REST and WebSocket payloads.
- [ ] Cover `GET /me`, observation creation, incident and digest reads, approval actions, and `submit_observation`.
- [ ] Mark every observation immutable and identify which incident fields can change.
- [ ] Record that WITHDRAW requires no approval and dispatch always does.

## Out of scope
Implementing endpoints or UI.

## Verification
Another teammate can implement one workstream using only this document.

## Dependencies
None. This can start immediately.

## Pickup
- Assign yourself and move this item to **In progress**.
- Open one pull request that closes this issue.
- Stay inside the owned paths. Call out any shared file you must change.
- The browser talks only to `ember-api` and `voice-gateway`. Clients do not read or write Firestore or Cloud Storage directly.
- Services use `FIRESTORE_DATABASE=ember-db`.
- WITHDRAW is immediate and decided by code. The model must not set incident severity.

### #5 [demo] Freeze the synthetic demo scenario

- State: open
- Labels: demo, P0
- URL: https://github.com/suhail39ahmed/ember-fire-commander/issues/5

## Outcome
Freeze a script the whole team can demo without making new product decisions.

## Owned paths
- `docs/demo/`

## Acceptance criteria
- [ ] Script two simulated volunteers, one supervisor, one disagreement, and one large-flame or high-wind WITHDRAW.
- [ ] Give the exact spoken or chip input, expected incident state, and expected screen at each step.
- [ ] Label every person and report as synthetic, and label map guidance as indicative.
- [ ] State the October 14 Live gate and the October 15 chip/text fallback gate.

## Out of scope
Recording or deployment.

## Verification
A person unfamiliar with the code can follow the script without product decisions.

## Dependencies
None. This can start immediately.

## Pickup
- Assign yourself and move this item to **In progress** once it is on the project board.
- Open one pull request that closes this issue.
- Stay inside the owned paths. Call out any shared file you must change.
- The browser talks only to `ember-api` and `voice-gateway`. Clients do not read or write Firestore or Cloud Storage directly.
- Services use `FIRESTORE_DATABASE=ember-db`.
- WITHDRAW is immediate and decided by code. The model must not set incident severity.

### #6 [ui] Add Google sign-in and role-based routes

- State: open
- Labels: ui, P0
- URL: https://github.com/suhail39ahmed/ember-fire-commander/issues/6

## Outcome
A signed-in volunteer and supervisor land in different parts of the shared web app.

## Owned paths
- `apps/web/src/auth/`
- `apps/web/src/routes/`

## Acceptance criteria
- [ ] Google sign-in succeeds, and sign-out returns to the signed-out screen.
- [ ] A volunteer lands on the PWA route and a supervisor lands on the console route.
- [ ] Direct navigation to the wrong role route is rejected.
- [ ] The existing `/me` connectivity check still works.
- [ ] The Firebase client does not read or write Firestore directly.

## Out of scope
Report submission and supervisor decisions.

## Verification
Run the web app, sign in with one test user of each role, and confirm the route and API call.

## Dependencies
- #4 - [shared] Define shared contracts
- #7 - [backend] Resolve the signed-in user and role

## Design reference
Source: `docs/design/EMBER_design_handoff.md`. Visuals follow Figma. Behavior follows this issue.

- Supervisor login: [D-L](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=54-32) - `docs/design/ui/6-d-l-login-supervisor-console.png`
- The frame also shows email sign-in. This issue requires Google sign-in. Do not add email sign-in.
- Volunteer Google sign-in and the wrong-role screen are not designed. Volunteers currently enter through the invite-code frame on #19. Still reject a volunteer who opens a supervisor route.

## Pickup
- Assign yourself and move this item to **In progress**.
- Open one pull request that closes this issue.
- Stay inside the owned paths. Call out any shared file you must change.
- The browser talks only to `ember-api` and `voice-gateway`. Clients do not read or write Firestore or Cloud Storage directly.
- Services use `FIRESTORE_DATABASE=ember-db`.
- WITHDRAW is immediate and decided by code. The model must not set incident severity.

### #7 [backend] Resolve the signed-in user and role

- State: open
- Labels: backend, P0
- URL: https://github.com/suhail39ahmed/ember-fire-commander/issues/7

## Outcome
`GET /me` returns the real signed-in user and that person's role.

## Owned paths
- `services/api/`

## Acceptance criteria
- [ ] `GET /me` verifies the Firebase ID token and returns the user id, display name, and `volunteer` or `supervisor` role.
- [ ] A missing or invalid token returns 401.
- [ ] The development role source is explicit and documented. Roles are not accepted from arbitrary request JSON.
- [ ] `/healthz` remains unauthenticated.

## Out of scope
App Check enforcement and incident routes.

## Verification
Call `/me` with valid, invalid, and missing tokens.

## Dependencies
- #4  -  [shared] Define shared contracts

## Shared data shape
Until #4 replaces this, use these fields:
- Observation: `id`, `volunteerId`, `capturedAt`, `receivedAt`, `source` (`live`, `chip`, `text`, or `photo`), `lat`, `lng`, `accuracyM`, `chip` (`asap`, `api`, `aman`, `butuh_bantuan`, or null), `text`, `severity` (`none`, `smoke`, `small_flame`, `large_flame`, or `unknown`), `photoPath`, `immutable: true`.
- Incident: `id`, `status` (`open`, `held`, `verified`, `extinguished`), `severity`, `evidenceScore`, `conflictId`, `withdraw`, `lat`, `lng`.
- Task: `id`, `incidentId`, `volunteerId`, `type` (`verify`, `withdraw`, `investigate`), `status` (`proposed`, `approved`, `rejected`).
- Conflict: keep the observations separate, keep the higher severity, and hold dispatch.
- Audit: append-only `actorId`, `action`, `targetId`, `at`.

## Pickup
- Assign yourself and move this item to **In progress** once it is on the project board.
- Open one pull request that closes this issue.
- Stay inside the owned paths. Call out any shared file you must change.
- The browser talks only to `ember-api` and `voice-gateway`. Clients do not read or write Firestore or Cloud Storage directly.
- Services use `FIRESTORE_DATABASE=ember-db`.
- WITHDRAW is immediate and decided by code. The model must not set incident severity.

### #8 [backend] Verify identity on ember-api

- State: open
- Labels: backend, P0
- URL: https://github.com/suhail39ahmed/ember-fire-commander/issues/8

## Outcome
Protected ember-api routes reject unauthenticated clients before writing anything.

## Owned paths
- `services/api/auth/`

## Acceptance criteria
- [ ] Protected routes require a valid Firebase ID token and App Check token.
- [ ] Failed checks return a stable 401 or 403 response without partial writes.
- [ ] Tests cover missing, expired, and valid tokens.
- [ ] `/healthz` remains public.

## Out of scope
Enabling production enforcement.

## Verification
Run the API auth tests and one request against a protected route.

## Dependencies
- #4  -  [shared] Define shared contracts
- [backend] Resolve the signed-in user and role

## Shared data shape
Until #4 replaces this, use these fields:
- Observation: `id`, `volunteerId`, `capturedAt`, `receivedAt`, `source` (`live`, `chip`, `text`, or `photo`), `lat`, `lng`, `accuracyM`, `chip` (`asap`, `api`, `aman`, `butuh_bantuan`, or null), `text`, `severity` (`none`, `smoke`, `small_flame`, `large_flame`, or `unknown`), `photoPath`, `immutable: true`.
- Incident: `id`, `status` (`open`, `held`, `verified`, `extinguished`), `severity`, `evidenceScore`, `conflictId`, `withdraw`, `lat`, `lng`.
- Task: `id`, `incidentId`, `volunteerId`, `type` (`verify`, `withdraw`, `investigate`), `status` (`proposed`, `approved`, `rejected`).
- Conflict: keep the observations separate, keep the higher severity, and hold dispatch.
- Audit: append-only `actorId`, `action`, `targetId`, `at`.

## Pickup
- Assign yourself and move this item to **In progress** once it is on the project board.
- Open one pull request that closes this issue.
- Stay inside the owned paths. Call out any shared file you must change.
- The browser talks only to `ember-api` and `voice-gateway`. Clients do not read or write Firestore or Cloud Storage directly.
- Services use `FIRESTORE_DATABASE=ember-db`.
- WITHDRAW is immediate and decided by code. The model must not set incident severity.

### #9 [voice-gateway] Verify identity on the WebSocket upgrade

- State: open
- Labels: voice-gateway, P0
- URL: https://github.com/suhail39ahmed/ember-fire-commander/issues/9

## Outcome
A Live session cannot start until the WebSocket upgrade is authenticated.

## Owned paths
- `services/voice-gateway/auth/`

## Acceptance criteria
- [ ] The upgrade requires valid Firebase ID token and App Check credentials.
- [ ] Invalid credentials close the connection before a Gemini session starts.
- [ ] `/healthz` stays public.
- [ ] Tests cover accepted and rejected upgrades.

## Out of scope
Audio relay.

## Verification
Run the upgrade tests with valid and invalid credentials.

## Dependencies
- #4  -  [shared] Define shared contracts

## Shared data shape
Until #4 replaces this, use these fields:
- Observation: `id`, `volunteerId`, `capturedAt`, `receivedAt`, `source` (`live`, `chip`, `text`, or `photo`), `lat`, `lng`, `accuracyM`, `chip` (`asap`, `api`, `aman`, `butuh_bantuan`, or null), `text`, `severity` (`none`, `smoke`, `small_flame`, `large_flame`, or `unknown`), `photoPath`, `immutable: true`.
- Incident: `id`, `status` (`open`, `held`, `verified`, `extinguished`), `severity`, `evidenceScore`, `conflictId`, `withdraw`, `lat`, `lng`.
- Task: `id`, `incidentId`, `volunteerId`, `type` (`verify`, `withdraw`, `investigate`), `status` (`proposed`, `approved`, `rejected`).
- Conflict: keep the observations separate, keep the higher severity, and hold dispatch.
- Audit: append-only `actorId`, `action`, `targetId`, `at`.

## Pickup
- Assign yourself and move this item to **In progress** once it is on the project board.
- Open one pull request that closes this issue.
- Stay inside the owned paths. Call out any shared file you must change.
- The browser talks only to `ember-api` and `voice-gateway`. Clients do not read or write Firestore or Cloud Storage directly.
- Services use `FIRESTORE_DATABASE=ember-db`.
- WITHDRAW is immediate and decided by code. The model must not set incident severity.

### #10 [agents] Implement fusion, conflict, and WITHDRAW rules

- State: open
- Labels: agents, P0
- URL: https://github.com/suhail39ahmed/ember-fire-commander/issues/10

## Outcome
Observations become one incident, disagreements stay visible, and dangerous conditions trigger WITHDRAW in code.

## Owned paths
- `services/agents/fusion/`

## Acceptance criteria
- [ ] Cluster nearby observations into one incident and keep an explainable evidence score.
- [ ] Surface a small-flame versus no-flame disagreement as a conflict. Do not average it.
- [ ] Keep the higher severity, hold dispatch, and propose VERIFY tasks to both volunteers.
- [ ] Trigger immediate WITHDRAW for a large flame or high wind, write an audit event, and require no approval.
- [ ] Only a human action can verify, extinguish, or lower severity.
- [ ] Unit tests cover agreement, conflict, distance separation, and WITHDRAW.

## Out of scope
Gemini Live conversation and Flash photo analysis.

## Verification
Run the fusion test suite, including at least the four cases above.

## Dependencies
- #4  -  [shared] Define shared contracts

## Shared data shape
Until #4 replaces this, use these fields:
- Observation: `id`, `volunteerId`, `capturedAt`, `receivedAt`, `source` (`live`, `chip`, `text`, or `photo`), `lat`, `lng`, `accuracyM`, `chip` (`asap`, `api`, `aman`, `butuh_bantuan`, or null), `text`, `severity` (`none`, `smoke`, `small_flame`, `large_flame`, or `unknown`), `photoPath`, `immutable: true`.
- Incident: `id`, `status` (`open`, `held`, `verified`, `extinguished`), `severity`, `evidenceScore`, `conflictId`, `withdraw`, `lat`, `lng`.
- Task: `id`, `incidentId`, `volunteerId`, `type` (`verify`, `withdraw`, `investigate`), `status` (`proposed`, `approved`, `rejected`).
- Conflict: keep the observations separate, keep the higher severity, and hold dispatch.
- Audit: append-only `actorId`, `action`, `targetId`, `at`.

## Pickup
- Assign yourself and move this item to **In progress** once it is on the project board.
- Open one pull request that closes this issue.
- Stay inside the owned paths. Call out any shared file you must change.
- The browser talks only to `ember-api` and `voice-gateway`. Clients do not read or write Firestore or Cloud Storage directly.
- Services use `FIRESTORE_DATABASE=ember-db`.
- WITHDRAW is immediate and decided by code. The model must not set incident severity.

### #11 [infra] Reconcile missing project docs

- State: open
- Labels: documentation, infra, P1
- URL: https://github.com/suhail39ahmed/ember-fire-commander/issues/11

## Outcome
The README and architecture docs no longer claim files or infrastructure state that the repository does not support.

## Owned paths
- `README.md`
- `infra/README.md`
- `docs/architecture/`

## Acceptance criteria
- [ ] Locate or explicitly mark as missing the architecture images, draw.io source, fusion prototype, `imports.tf`, and cost document.
- [ ] Remove the contradiction about whether infrastructure has been applied.
- [ ] Do not describe unimplemented behavior as live.

## Out of scope
Rebuilding missing design history.

## Verification
Every path cited from the README resolves or is marked missing.

## Dependencies
None. This can start immediately.

## Pickup
- Assign yourself and move this item to **In progress** once it is on the project board.
- Open one pull request that closes this issue.
- Stay inside the owned paths. Call out any shared file you must change.
- The browser talks only to `ember-api` and `voice-gateway`. Clients do not read or write Firestore or Cloud Storage directly.
- Services use `FIRESTORE_DATABASE=ember-db`.
- WITHDRAW is immediate and decided by code. The model must not set incident severity.

### #12 [backend] Accept chip and text observations

- State: open
- Labels: backend, P0, fallback-b
- URL: https://github.com/suhail39ahmed/ember-fire-commander/issues/12

## Outcome
The API stores a chip or text report as an immutable observation.

## Owned paths
- `services/api/observations/`

## Acceptance criteria
- [ ] Accept the shared observation shape for `chip` and `text`, including `capturedAt`.
- [ ] Persist it as immutable in `ember-db` and reject client edits after creation.
- [ ] Validate coordinates, chip values, and required fields.
- [ ] Notify the agents service after a successful write. A test double is permitted locally.

## Out of scope
Live sessions and photo signing.

## Verification
Create valid and invalid observations, then read back the stored record.

## Dependencies
- #4  -  [shared] Define shared contracts
- #8  -  [backend] Verify identity on ember-api

## Shared data shape
Until #4 replaces this, use these fields:
- Observation: `id`, `volunteerId`, `capturedAt`, `receivedAt`, `source` (`live`, `chip`, `text`, or `photo`), `lat`, `lng`, `accuracyM`, `chip` (`asap`, `api`, `aman`, `butuh_bantuan`, or null), `text`, `severity` (`none`, `smoke`, `small_flame`, `large_flame`, or `unknown`), `photoPath`, `immutable: true`.
- Incident: `id`, `status` (`open`, `held`, `verified`, `extinguished`), `severity`, `evidenceScore`, `conflictId`, `withdraw`, `lat`, `lng`.
- Task: `id`, `incidentId`, `volunteerId`, `type` (`verify`, `withdraw`, `investigate`), `status` (`proposed`, `approved`, `rejected`).
- Conflict: keep the observations separate, keep the higher severity, and hold dispatch.
- Audit: append-only `actorId`, `action`, `targetId`, `at`.

## Pickup
- Assign yourself and move this item to **In progress** once it is on the project board.
- Open one pull request that closes this issue.
- Stay inside the owned paths. Call out any shared file you must change.
- The browser talks only to `ember-api` and `voice-gateway`. Clients do not read or write Firestore or Cloud Storage directly.
- Services use `FIRESTORE_DATABASE=ember-db`.
- WITHDRAW is immediate and decided by code. The model must not set incident severity.

### #13 [backend] Expose incident, digest, and approval APIs

- State: open
- Labels: backend, P0
- URL: https://github.com/suhail39ahmed/ember-fire-commander/issues/13

## Outcome
The PWA and supervisor console can read the shared incident picture and record a human decision.

## Owned paths
- `services/api/incidents/`

## Acceptance criteria
- [ ] Authenticated clients can read incidents, conflicts, tasks, and the shared digest.
- [ ] A supervisor can approve, edit, or reject a proposed task. A volunteer cannot.
- [ ] Every supervisor action appends an audit record.
- [ ] Verification, extinguishing, and lowering severity are allowed only through the human action.
- [ ] WITHDRAW remains immediate and does not wait for approval.

## Out of scope
FCM delivery.

## Verification
Test volunteer and supervisor authorization, one approval, one rejection, and the audit record.

## Dependencies
- #4  -  [shared] Define shared contracts
- #8  -  [backend] Verify identity on ember-api

## Shared data shape
Until #4 replaces this, use these fields:
- Observation: `id`, `volunteerId`, `capturedAt`, `receivedAt`, `source` (`live`, `chip`, `text`, or `photo`), `lat`, `lng`, `accuracyM`, `chip` (`asap`, `api`, `aman`, `butuh_bantuan`, or null), `text`, `severity` (`none`, `smoke`, `small_flame`, `large_flame`, or `unknown`), `photoPath`, `immutable: true`.
- Incident: `id`, `status` (`open`, `held`, `verified`, `extinguished`), `severity`, `evidenceScore`, `conflictId`, `withdraw`, `lat`, `lng`.
- Task: `id`, `incidentId`, `volunteerId`, `type` (`verify`, `withdraw`, `investigate`), `status` (`proposed`, `approved`, `rejected`).
- Conflict: keep the observations separate, keep the higher severity, and hold dispatch.
- Audit: append-only `actorId`, `action`, `targetId`, `at`.

## Pickup
- Assign yourself and move this item to **In progress** once it is on the project board.
- Open one pull request that closes this issue.
- Stay inside the owned paths. Call out any shared file you must change.
- The browser talks only to `ember-api` and `voice-gateway`. Clients do not read or write Firestore or Cloud Storage directly.
- Services use `FIRESTORE_DATABASE=ember-db`.
- WITHDRAW is immediate and decided by code. The model must not set incident severity.

### #14 [backend] Issue private photo upload URLs

- State: open
- Labels: backend, P1
- URL: https://github.com/suhail39ahmed/ember-fire-commander/issues/14

## Outcome
A volunteer receives a short-lived URL for uploading one still to the private bucket.

## Owned paths
- `services/api/photos/`

## Acceptance criteria
- [ ] A signed-in volunteer receives a short-lived V4 signed PUT URL for the private photo bucket.
- [ ] The API stores the object path, not a public URL.
- [ ] Expired or cross-user URLs fail.
- [ ] No bucket policy or object is made public.

## Out of scope
Image analysis.

## Verification
Obtain a URL, upload one test object, and confirm an unauthenticated read fails.

## Dependencies
- #8  -  [backend] Verify identity on ember-api

## Shared data shape
Until #4 replaces this, use these fields:
- Observation: `id`, `volunteerId`, `capturedAt`, `receivedAt`, `source` (`live`, `chip`, `text`, or `photo`), `lat`, `lng`, `accuracyM`, `chip` (`asap`, `api`, `aman`, `butuh_bantuan`, or null), `text`, `severity` (`none`, `smoke`, `small_flame`, `large_flame`, or `unknown`), `photoPath`, `immutable: true`.
- Incident: `id`, `status` (`open`, `held`, `verified`, `extinguished`), `severity`, `evidenceScore`, `conflictId`, `withdraw`, `lat`, `lng`.
- Task: `id`, `incidentId`, `volunteerId`, `type` (`verify`, `withdraw`, `investigate`), `status` (`proposed`, `approved`, `rejected`).
- Conflict: keep the observations separate, keep the higher severity, and hold dispatch.
- Audit: append-only `actorId`, `action`, `targetId`, `at`.

## Pickup
- Assign yourself and move this item to **In progress** once it is on the project board.
- Open one pull request that closes this issue.
- Stay inside the owned paths. Call out any shared file you must change.
- The browser talks only to `ember-api` and `voice-gateway`. Clients do not read or write Firestore or Cloud Storage directly.
- Services use `FIRESTORE_DATABASE=ember-db`.
- WITHDRAW is immediate and decided by code. The model must not set incident severity.

### #15 [voice-gateway] Relay Gemini Live and write observations

- State: open
- Labels: voice-gateway, P0
- URL: https://github.com/suhail39ahmed/ember-fire-commander/issues/15

## Outcome
A push-to-talk session reaches Gemini Live and stores the resulting observation.

## Owned paths
- `services/voice-gateway/live/`

## Acceptance criteria
- [ ] A press-to-talk session accepts audio and about one camera frame per second, then closes about 30 seconds after the reply.
- [ ] Inject the shared digest into the session context.
- [ ] A `submit_observation` tool call writes one immutable observation. GPS comes from the phone payload, not the model.
- [ ] Enforce a configurable per-user Live-minute cap and stop the session when it is reached.
- [ ] Notify `ember-agents` after the write.
- [ ] Record the measured Singapore-region latency and whether the October 14 gate passed.

## Out of scope
Direct browser-to-Gemini fallback and incident fusion.

## Verification
Run one scripted session against a Gemini test double and one real Live burst when credentials are available.

## Dependencies
- #4  -  [shared] Define shared contracts
- #9  -  [voice-gateway] Verify identity on the WebSocket upgrade

## Shared data shape
Until #4 replaces this, use these fields:
- Observation: `id`, `volunteerId`, `capturedAt`, `receivedAt`, `source` (`live`, `chip`, `text`, or `photo`), `lat`, `lng`, `accuracyM`, `chip` (`asap`, `api`, `aman`, `butuh_bantuan`, or null), `text`, `severity` (`none`, `smoke`, `small_flame`, `large_flame`, or `unknown`), `photoPath`, `immutable: true`.
- Incident: `id`, `status` (`open`, `held`, `verified`, `extinguished`), `severity`, `evidenceScore`, `conflictId`, `withdraw`, `lat`, `lng`.
- Task: `id`, `incidentId`, `volunteerId`, `type` (`verify`, `withdraw`, `investigate`), `status` (`proposed`, `approved`, `rejected`).
- Conflict: keep the observations separate, keep the higher severity, and hold dispatch.
- Audit: append-only `actorId`, `action`, `targetId`, `at`.

## Pickup
- Assign yourself and move this item to **In progress** once it is on the project board.
- Open one pull request that closes this issue.
- Stay inside the owned paths. Call out any shared file you must change.
- The browser talks only to `ember-api` and `voice-gateway`. Clients do not read or write Firestore or Cloud Storage directly.
- Services use `FIRESTORE_DATABASE=ember-db`.
- WITHDRAW is immediate and decided by code. The model must not set incident severity.

### #16 [pwa] Build the volunteer report screen

- State: open
- Labels: pwa, P0
- URL: https://github.com/suhail39ahmed/ember-fire-commander/issues/16

## Outcome
A volunteer can report from a phone-sized screen and see the resulting task or WITHDRAW state.

## Owned paths
- `apps/web/src/pwa/`

## Acceptance criteria
- [ ] A mobile layout shows push-to-talk, camera state, chips, the current task, and a full-screen WITHDRAW state.
- [ ] Pressing talk opens the gateway socket only while authenticated, and closes it after the reply or about 30 seconds.
- [ ] The screen shows task and WITHDRAW data returned by the API rather than locally invented incident state.
- [ ] Microphone, camera, and location permissions have a clear denied state.

## Out of scope
Offline storage, photo upload, and supervisor views.

## Verification
Exercise the screen against a local or mocked API and gateway, including denied permissions and the WITHDRAW state.

## Dependencies
- #4 - [shared] Define shared contracts
- #6 - [ui] Add Google sign-in and role-based routes
- #15 - [voice-gateway] Relay Gemini Live and write observations

## Shared data shape
Until #4 replaces this, use these fields:
- Observation: `id`, `volunteerId`, `capturedAt`, `receivedAt`, `source` (`live`, `chip`, `text`, or `photo`), `lat`, `lng`, `accuracyM`, `chip` (`asap`, `api`, `aman`, `butuh_bantuan`, or null), `text`, `severity` (`none`, `smoke`, `small_flame`, `large_flame`, or `unknown`), `photoPath`, `immutable: true`.
- Incident: `id`, `status` (`open`, `held`, `verified`, `extinguished`), `severity`, `evidenceScore`, `conflictId`, `withdraw`, `lat`, `lng`.
- Task: `id`, `incidentId`, `volunteerId`, `type` (`verify`, `withdraw`, `investigate`), `status` (`proposed`, `approved`, `rejected`).
- Conflict: keep the observations separate, keep the higher severity, and hold dispatch.
- Audit: append-only `actorId`, `action`, `targetId`, `at`.

## Design reference
Source: `docs/design/EMBER_design_handoff.md`. Visuals follow Figma. Behavior follows this issue.

- New task: [V1](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=4-2) - `docs/design/pwa/16-v1-verify-hotspot-new-task.png`
- Loading and empty: `docs/design/pwa/16-v-l-loading.png`, `docs/design/pwa/16-v-e-empty-no-tasks.png`
- Live coach: [V3](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=5-2) and connection states `docs/design/pwa/16-v3-live-connection-states.png`
- Approved task: [V6](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=10-4) - `docs/design/pwa/16-v6-approved-instruction-photo-mode-plus-push-to-talk-sari.png`
- Full-screen WITHDRAW: [V4](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=5-47) - `docs/design/pwa/16-v4-safety-guard-withdraw-upwind.png`. It interrupts every other volunteer screen.
- Use hold-to-talk, as required here and shown on V6. Do not implement V3's always-open microphone.
- Report chips are specified on #17. Permission-denied screens are not designed, but the denied states in this issue are still required.

## Pickup
- Assign yourself and move this item to **In progress**.
- Open one pull request that closes this issue.
- Stay inside the owned paths. Call out any shared file you must change.
- The browser talks only to `ember-api` and `voice-gateway`. Clients do not read or write Firestore or Cloud Storage directly.
- Services use `FIRESTORE_DATABASE=ember-db`.
- WITHDRAW is immediate and decided by code. The model must not set incident severity.

### #17 [pwa] Add chip and text controls

- State: open
- Labels: pwa, P0, fallback-b
- URL: https://github.com/suhail39ahmed/ember-fire-commander/issues/17

## Outcome
A volunteer can report without Gemini Live by using chips or text.

## Owned paths
- `apps/web/src/pwa/report/`

## Acceptance criteria
- [ ] `asap`, `api`, `aman`, and `butuh bantuan` each submit the shared observation shape with `source: chip`.
- [ ] Optional text submits `source: text` and preserves `capturedAt`.
- [ ] The UI shows success, retry, and validation errors from the API.
- [ ] Chip input works when Live voice is unavailable.

## Out of scope
Live audio and offline replay.

## Verification
Submit every chip and one text report, then confirm the request payload and visible result.

## Dependencies
- #4 - [shared] Define shared contracts
- #12 - [backend] Accept chip and text observations

## Design reference
Source: `docs/design/EMBER_design_handoff.md`. Visuals follow Figma. Behavior follows this issue.

- Report chips and text: [V8](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=107-70) - `docs/design/pwa/17-v8-report-chips-plus-text-report-send-validation-error-sent.png`
- Chips are `asap`, `api`, `aman`, and `butuh bantuan`.
- The frame makes a chip required. This issue also allows a text-only report, so do not reject a note that has no chip.
- Foundations is a shared visual reference only: `docs/design/ui/none-foundations.png`. It is not this control.

## Pickup
- Assign yourself and move this item to **In progress**.
- Open one pull request that closes this issue.
- Stay inside the owned paths. Call out any shared file you must change.
- The browser talks only to `ember-api` and `voice-gateway`. Clients do not read or write Firestore or Cloud Storage directly.
- Services use `FIRESTORE_DATABASE=ember-db`.
- WITHDRAW is immediate and decided by code. The model must not set incident severity.

### #18 [supervisor-console] Build the supervisor decision screen

- State: open
- Labels: supervisor-console, P0
- URL: https://github.com/suhail39ahmed/ember-fire-commander/issues/18

## Outcome
A supervisor can review an incident, including a disagreement, and record a decision.

## Owned paths
- `apps/web/src/supervisor/`

## Acceptance criteria
- [ ] Show the incident queue, evidence score, and both conflicting observations side by side.
- [ ] Approve, edit, and reject call the backend and show its confirmed result.
- [ ] A WITHDRAW alert is visible and cannot be dismissed by lowering severity in the UI.
- [ ] The UI cannot mark an incident verified, extinguished, or lower severity except through the permitted human action.

## Out of scope
Map rendering.

## Verification
Use fixture incidents for normal, conflict, and WITHDRAW states and complete each decision.

## Dependencies
- #4 - [shared] Define shared contracts
- #6 - [ui] Add Google sign-in and role-based routes
- #13 - [backend] Expose incident, digest, and approval APIs

## Design reference
Source: `docs/design/EMBER_design_handoff.md`. Visuals follow Figma. Behavior follows this issue.

- Live incident: [S1](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=12-2) - `docs/design/supervisor-console/18-s1-supervisor-console-live-incident.png`
- WITHDRAW already sent: [S2](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=13-2) - `docs/design/supervisor-console/18-s2-supervisor-console-wind-shift-withdraw-sent.png`
- Loading and empty: `docs/design/supervisor-console/18-d-ld-loading.png`, `docs/design/supervisor-console/18-d-e-empty-no-live-incidents.png`
- Edit, Override, and Separate incident are not designed. Implement the approve, edit, and reject actions required by this issue without inventing extra safety behavior.
- Do not let the UI lower severity or dismiss WITHDRAW. "Send team back in" needs an explicit product decision before it is built.

## Pickup
- Assign yourself and move this item to **In progress**.
- Open one pull request that closes this issue.
- Stay inside the owned paths. Call out any shared file you must change.
- The browser talks only to `ember-api` and `voice-gateway`. Clients do not read or write Firestore or Cloud Storage directly.
- Services use `FIRESTORE_DATABASE=ember-db`.
- WITHDRAW is immediate and decided by code. The model must not set incident severity.

### #19 [pwa] Make the volunteer app installable

- State: open
- Labels: pwa, P0
- URL: https://github.com/suhail39ahmed/ember-fire-commander/issues/19

## Outcome
The volunteer experience can be installed and launched as a PWA.

## Owned paths
- `apps/web/public/`
- `apps/web/src/pwa/install/`

## Acceptance criteria
- [ ] Add a web manifest, icons, and a service worker or app shell.
- [ ] The installed app launches the signed-in volunteer experience.
- [ ] Microphone, camera, notification, and location permission states are visible before use.
- [ ] The app remains usable when push is unavailable.

## Out of scope
Offline observation replay.

## Verification
Build the app and install it on one supported phone or browser, then relaunch it.

## Dependencies
- #16 - [pwa] Build the volunteer report screen

## Design reference
Source: `docs/design/EMBER_design_handoff.md`. Visuals follow Figma. Behavior follows this issue.

- Join, install, and permissions: [V0](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=19-10) - `docs/design/pwa/19-v0-join-invite-code-install-permissions.png`
- Splash and push: `docs/design/pwa/19-v-s-splash.png`, `docs/design/pwa/19-v-n-push-notification.png`
- Brand kit: `docs/design/ui/19-brand-kit.png`. Exported marks and icons are in `docs/design/`.
- The install instructions shown are iPhone-only. Android install and a maskable icon are not designed.

## Pickup
- Assign yourself and move this item to **In progress**.
- Open one pull request that closes this issue.
- Stay inside the owned paths. Call out any shared file you must change.
- The browser talks only to `ember-api` and `voice-gateway`. Clients do not read or write Firestore or Cloud Storage directly.
- Services use `FIRESTORE_DATABASE=ember-db`.
- WITHDRAW is immediate and decided by code. The model must not set incident severity.

### #20 [pwa] Add the photo-upload action

- State: open
- Labels: pwa, P1
- URL: https://github.com/suhail39ahmed/ember-fire-commander/issues/20

## Outcome
A volunteer can upload one fire-scene still through a signed URL.

## Owned paths
- `apps/web/src/pwa/photo/`

## Acceptance criteria
- [ ] Request a signed URL from `ember-api`, then upload the still directly to that URL.
- [ ] Keep the image suitable for fire evidence while avoiding intentional face capture.
- [ ] Show upload progress and failure, and submit `source: photo` only after upload succeeds.

## Out of scope
Changing bucket configuration.

## Verification
Upload one small image through the UI and confirm the API receives only its private storage path.

## Dependencies
- #14 - [backend] Issue private photo upload URLs

## Design reference
Source: `docs/design/EMBER_design_handoff.md`. Visuals follow Figma. Behavior follows this issue.

- Uploading: [V1a](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=56-122) - `docs/design/pwa/20-v1a-upload-uploading.png`
- Uploaded: `docs/design/pwa/20-v1b-upload-uploaded.png`
- Failed: `docs/design/pwa/20-v1c-upload-failed.png`
- Gemini result after upload: `docs/design/pwa/16-v2-photo-check-gemini-result.png`
- V1c says the photo is kept only on the screen. When #21 is built, the issue rule wins and the photo must survive a reload.

## Pickup
- Assign yourself and move this item to **In progress**.
- Open one pull request that closes this issue.
- Stay inside the owned paths. Call out any shared file you must change.
- The browser talks only to `ember-api` and `voice-gateway`. Clients do not read or write Firestore or Cloud Storage directly.
- Services use `FIRESTORE_DATABASE=ember-db`.
- WITHDRAW is immediate and decided by code. The model must not set incident severity.

### #21 [pwa] Add the offline report outbox

- State: open
- Labels: pwa, P2
- URL: https://github.com/suhail39ahmed/ember-fire-commander/issues/21

## Outcome
Reports made while offline are replayed once the phone reconnects.

## Owned paths
- `apps/web/src/pwa/outbox/`

## Acceptance criteria
- [ ] Store unsent chips, text, and completed photo references in IndexedDB.
- [ ] Replay them automatically when the connection returns, preserving `capturedAt`.
- [ ] Show queued, failed, and sent states without losing an item after reload.

## Out of scope
Offline Live audio.

## Verification
Disable the network, submit two reports, reload, reconnect, and confirm both replay once.

## Dependencies
- #17 - [pwa] Add chip and text controls
- #20 - [pwa] Add the photo-upload action

## Design reference
No offline-outbox frame exists. Build this issue from its acceptance criteria, using the colours and controls in `docs/design/EMBER_design_handoff.md`. Do not invent a new visual system. The upload-failed frame must not be copied literally: it says the photo exists only on that screen.

## Pickup
- Assign yourself and move this item to **In progress**.
- Open one pull request that closes this issue.
- Stay inside the owned paths. Call out any shared file you must change.
- The browser talks only to `ember-api` and `voice-gateway`. Clients do not read or write Firestore or Cloud Storage directly.
- Services use `FIRESTORE_DATABASE=ember-db`.
- WITHDRAW is immediate and decided by code. The model must not set incident severity.

### #22 [supervisor-console] Show incident locations

- State: open
- Labels: supervisor-console, P1
- URL: https://github.com/suhail39ahmed/ember-fire-commander/issues/22

## Outcome
The supervisor can see incident positions without calling map data APIs from the browser.

## Owned paths
- `apps/web/src/supervisor/map/`

## Acceptance criteria
- [ ] Render incident coordinates supplied by `ember-api`. Load only map tiles with the browser key.
- [ ] Label guidance as indicative and do not present a spread or haze forecast.
- [ ] Handle an empty incident list and a missing map key without breaking the decision screen.

## Out of scope
Weather calculations and tile proxying.

## Verification
Show at least two fixture incidents at distinct positions and the empty state.

## Dependencies
- #18 - [supervisor-console] Build the supervisor decision screen
- #13 - [backend] Expose incident, digest, and approval APIs

## Design reference
Source: `docs/design/EMBER_design_handoff.md`. Visuals follow Figma. Behavior follows this issue.

- Regional incidents: [S3](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=14-58) - `docs/design/supervisor-console/22-s3-regional-view-every-incident-hotspot-and-watched-site.png`
- Hotspot queue: [D1](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=6-2) - `docs/design/supervisor-console/22-d1-supervisor-console-hotspot-queue.png`
- Do not ship the "Illustrative data" chip. Do not link "Open exposure corridor" until that destination is approved.
- D1 shows hotspots, not confirmed incidents. Keep that distinction visible.

## Pickup
- Assign yourself and move this item to **In progress**.
- Open one pull request that closes this issue.
- Stay inside the owned paths. Call out any shared file you must change.
- The browser talks only to `ember-api` and `voice-gateway`. Clients do not read or write Firestore or Cloud Storage directly.
- Services use `FIRESTORE_DATABASE=ember-db`.
- WITHDRAW is immediate and decided by code. The model must not set incident severity.

### #23 [backend] Send task and WITHDRAW pushes

- State: open
- Labels: backend, P1
- URL: https://github.com/suhail39ahmed/ember-fire-commander/issues/23

## Outcome
Approved tasks and immediate WITHDRAW alerts can reach a volunteer through FCM.

## Owned paths
- `services/api/notifications/`

## Acceptance criteria
- [ ] Send a task push after supervisor approval and a WITHDRAW push immediately when the safety rule fires.
- [ ] Retry or record a failed send without losing the incident state.
- [ ] Keep notification content free of unnecessary personal information.

## Out of scope
Service-worker client behavior beyond the payload contract.

## Verification
Use a test FCM double for one task and one WITHDRAW event.

## Dependencies
- #13  -  [backend] Expose incident, digest, and approval APIs
- [shared] Connect the end-to-end demo path

## Shared data shape
Until #4 replaces this, use these fields:
- Observation: `id`, `volunteerId`, `capturedAt`, `receivedAt`, `source` (`live`, `chip`, `text`, or `photo`), `lat`, `lng`, `accuracyM`, `chip` (`asap`, `api`, `aman`, `butuh_bantuan`, or null), `text`, `severity` (`none`, `smoke`, `small_flame`, `large_flame`, or `unknown`), `photoPath`, `immutable: true`.
- Incident: `id`, `status` (`open`, `held`, `verified`, `extinguished`), `severity`, `evidenceScore`, `conflictId`, `withdraw`, `lat`, `lng`.
- Task: `id`, `incidentId`, `volunteerId`, `type` (`verify`, `withdraw`, `investigate`), `status` (`proposed`, `approved`, `rejected`).
- Conflict: keep the observations separate, keep the higher severity, and hold dispatch.
- Audit: append-only `actorId`, `action`, `targetId`, `at`.

## Pickup
- Assign yourself and move this item to **In progress** once it is on the project board.
- Open one pull request that closes this issue.
- Stay inside the owned paths. Call out any shared file you must change.
- The browser talks only to `ember-api` and `voice-gateway`. Clients do not read or write Firestore or Cloud Storage directly.
- Services use `FIRESTORE_DATABASE=ember-db`.
- WITHDRAW is immediate and decided by code. The model must not set incident severity.

### #24 [agents] Add Flash photo triage and summaries

- State: open
- Labels: agents, P2
- URL: https://github.com/suhail39ahmed/ember-fire-commander/issues/24

## Outcome
Flash can describe a photo and summarize an incident without making a safety decision.

## Owned paths
- `services/agents/spotter/`

## Acceptance criteria
- [ ] Return structured photo triage JSON and a Bahasa/English summary grounded in stored fields.
- [ ] Reject or flag an image path the caller does not own.
- [ ] The summary adds no incident severity or safety decision.

## Out of scope
Changing fusion rules.

## Verification
Run one image fixture and one unauthorized-path test.

## Dependencies
- #14  -  [backend] Issue private photo upload URLs
- #10  -  [agents] Implement fusion, conflict, and WITHDRAW rules

## Shared data shape
Until #4 replaces this, use these fields:
- Observation: `id`, `volunteerId`, `capturedAt`, `receivedAt`, `source` (`live`, `chip`, `text`, or `photo`), `lat`, `lng`, `accuracyM`, `chip` (`asap`, `api`, `aman`, `butuh_bantuan`, or null), `text`, `severity` (`none`, `smoke`, `small_flame`, `large_flame`, or `unknown`), `photoPath`, `immutable: true`.
- Incident: `id`, `status` (`open`, `held`, `verified`, `extinguished`), `severity`, `evidenceScore`, `conflictId`, `withdraw`, `lat`, `lng`.
- Task: `id`, `incidentId`, `volunteerId`, `type` (`verify`, `withdraw`, `investigate`), `status` (`proposed`, `approved`, `rejected`).
- Conflict: keep the observations separate, keep the higher severity, and hold dispatch.
- Audit: append-only `actorId`, `action`, `targetId`, `at`.

## Pickup
- Assign yourself and move this item to **In progress** once it is on the project board.
- Open one pull request that closes this issue.
- Stay inside the owned paths. Call out any shared file you must change.
- The browser talks only to `ember-api` and `voice-gateway`. Clients do not read or write Firestore or Cloud Storage directly.
- Services use `FIRESTORE_DATABASE=ember-db`.
- WITHDRAW is immediate and decided by code. The model must not set incident severity.

### #25 [agents] Add re-ignition watch

- State: open
- Labels: agents, P2
- URL: https://github.com/suhail39ahmed/ember-fire-commander/issues/25

## Outcome
An extinguished site can raise a re-inspection alert when something new appears nearby.

## Owned paths
- `services/agents/sites/`

## Acceptance criteria
- [ ] Remember an extinguished site and create a re-inspection alert when a new nearby lead or observation arrives.
- [ ] Do not automatically reopen it as a verified fire.

## Out of scope
Hourly ingest.

## Verification
Test one nearby new observation and one distant observation.

## Dependencies
- #10  -  [agents] Implement fusion, conflict, and WITHDRAW rules

## Shared data shape
Until #4 replaces this, use these fields:
- Observation: `id`, `volunteerId`, `capturedAt`, `receivedAt`, `source` (`live`, `chip`, `text`, or `photo`), `lat`, `lng`, `accuracyM`, `chip` (`asap`, `api`, `aman`, `butuh_bantuan`, or null), `text`, `severity` (`none`, `smoke`, `small_flame`, `large_flame`, or `unknown`), `photoPath`, `immutable: true`.
- Incident: `id`, `status` (`open`, `held`, `verified`, `extinguished`), `severity`, `evidenceScore`, `conflictId`, `withdraw`, `lat`, `lng`.
- Task: `id`, `incidentId`, `volunteerId`, `type` (`verify`, `withdraw`, `investigate`), `status` (`proposed`, `approved`, `rejected`).
- Conflict: keep the observations separate, keep the higher severity, and hold dispatch.
- Audit: append-only `actorId`, `action`, `targetId`, `at`.

## Pickup
- Assign yourself and move this item to **In progress** once it is on the project board.
- Open one pull request that closes this issue.
- Stay inside the owned paths. Call out any shared file you must change.
- The browser talks only to `ember-api` and `voice-gateway`. Clients do not read or write Firestore or Cloud Storage directly.
- Services use `FIRESTORE_DATABASE=ember-db`.
- WITHDRAW is immediate and decided by code. The model must not set incident severity.

### #26 [infra] Add hourly FIRMS, weather, and PSI ingest

- State: open
- Labels: infra, P2, fallback-c
- URL: https://github.com/suhail39ahmed/ember-fire-commander/issues/26

## Outcome
Satellite and weather inputs can be stored as leads for a person to verify.

## Owned paths
- `jobs/ingest/`

## Acceptance criteria
- [ ] A manual run stores source leads separately from verified incidents.
- [ ] Every lead is labeled for human verification, never as a confirmed fire.
- [ ] Weather and PSI failures are reported without destroying previously stored leads.
- [ ] A hand-seeded lead fixture remains available for the demo if scheduling is not ready.

## Out of scope
Tactical prediction and automatic dispatch.

## Verification
Run once against recorded fixtures and check the stored lead labels.

## Dependencies
- #4  -  [shared] Define shared contracts

## Shared data shape
Until #4 replaces this, use these fields:
- Observation: `id`, `volunteerId`, `capturedAt`, `receivedAt`, `source` (`live`, `chip`, `text`, or `photo`), `lat`, `lng`, `accuracyM`, `chip` (`asap`, `api`, `aman`, `butuh_bantuan`, or null), `text`, `severity` (`none`, `smoke`, `small_flame`, `large_flame`, or `unknown`), `photoPath`, `immutable: true`.
- Incident: `id`, `status` (`open`, `held`, `verified`, `extinguished`), `severity`, `evidenceScore`, `conflictId`, `withdraw`, `lat`, `lng`.
- Task: `id`, `incidentId`, `volunteerId`, `type` (`verify`, `withdraw`, `investigate`), `status` (`proposed`, `approved`, `rejected`).
- Conflict: keep the observations separate, keep the higher severity, and hold dispatch.
- Audit: append-only `actorId`, `action`, `targetId`, `at`.

## Pickup
- Assign yourself and move this item to **In progress** once it is on the project board.
- Open one pull request that closes this issue.
- Stay inside the owned paths. Call out any shared file you must change.
- The browser talks only to `ember-api` and `voice-gateway`. Clients do not read or write Firestore or Cloud Storage directly.
- Services use `FIRESTORE_DATABASE=ember-db`.
- WITHDRAW is immediate and decided by code. The model must not set incident severity.

### #27 [shared] Connect the end-to-end demo path

- State: open
- Labels: pwa, supervisor-console, backend, voice-gateway, agents, shared, P0
- URL: https://github.com/suhail39ahmed/ember-fire-commander/issues/27

## Outcome
One report travels from a volunteer through fusion and a supervisor decision, then back to the volunteer.

## Owned paths
- Integration tests and the minimum wiring needed at existing service boundaries

## Acceptance criteria
- [ ] A chip or text observation becomes an incident, reaches the supervisor decision, and returns as a volunteer task.
- [ ] A conflicting pair stays side by side and holds dispatch.
- [ ] A WITHDRAW input reaches the volunteer without waiting for approval.
- [ ] The Live observation follows the same path when the voice-gateway issue is available.
- [ ] Polling is the required update mechanism. Push is optional.
- [ ] Record whether the October 15 non-voice gate passed.

## Out of scope
New features and deployment.

## Verification
Run the scripted end-to-end scenario once through chip/text and once through Live or its documented fallback.

## Dependencies
- #16  -  [pwa] Build the volunteer report screen
- #17  -  [pwa] Add chip and text controls
- #18  -  [supervisor-console] Build the supervisor decision screen
- #12  -  [backend] Accept chip and text observations
- #13  -  [backend] Expose incident, digest, and approval APIs
- #15  -  [voice-gateway] Relay Gemini Live and write observations
- #10  -  [agents] Implement fusion, conflict, and WITHDRAW rules

## Shared data shape
Until #4 replaces this, use these fields:
- Observation: `id`, `volunteerId`, `capturedAt`, `receivedAt`, `source` (`live`, `chip`, `text`, or `photo`), `lat`, `lng`, `accuracyM`, `chip` (`asap`, `api`, `aman`, `butuh_bantuan`, or null), `text`, `severity` (`none`, `smoke`, `small_flame`, `large_flame`, or `unknown`), `photoPath`, `immutable: true`.
- Incident: `id`, `status` (`open`, `held`, `verified`, `extinguished`), `severity`, `evidenceScore`, `conflictId`, `withdraw`, `lat`, `lng`.
- Task: `id`, `incidentId`, `volunteerId`, `type` (`verify`, `withdraw`, `investigate`), `status` (`proposed`, `approved`, `rejected`).
- Conflict: keep the observations separate, keep the higher severity, and hold dispatch.
- Audit: append-only `actorId`, `action`, `targetId`, `at`.

## Pickup
- Assign yourself and move this item to **In progress** once it is on the project board.
- Open one pull request that closes this issue.
- Stay inside the owned paths. Call out any shared file you must change.
- The browser talks only to `ember-api` and `voice-gateway`. Clients do not read or write Firestore or Cloud Storage directly.
- Services use `FIRESTORE_DATABASE=ember-db`.
- WITHDRAW is immediate and decided by code. The model must not set incident severity.

### #28 [infra] Deploy and smoke-test the demo path

- State: open
- Labels: infra, P0
- URL: https://github.com/suhail39ahmed/ember-fire-commander/issues/28

## Outcome
The demo path is deployed and the synthetic scenario has been run against it.

## Owned paths
- `.github/workflows/`
- Deployment notes only

## Acceptance criteria
- [ ] Deploy the web app and all three services through the existing workflows.
- [ ] Confirm each service uses `FIRESTORE_DATABASE=ember-db` and its intended runtime service account.
- [ ] Run the synthetic scenario through the deployed environment and record pass or failure.
- [ ] Publish the working web URL, or the exact blocker if deployment fails.

## Out of scope
New cloud resources.

## Verification
Save command results for health checks and the scenario smoke test.

## Dependencies
- [shared] Connect the end-to-end demo path

## Shared data shape
Until #4 replaces this, use these fields:
- Observation: `id`, `volunteerId`, `capturedAt`, `receivedAt`, `source` (`live`, `chip`, `text`, or `photo`), `lat`, `lng`, `accuracyM`, `chip` (`asap`, `api`, `aman`, `butuh_bantuan`, or null), `text`, `severity` (`none`, `smoke`, `small_flame`, `large_flame`, or `unknown`), `photoPath`, `immutable: true`.
- Incident: `id`, `status` (`open`, `held`, `verified`, `extinguished`), `severity`, `evidenceScore`, `conflictId`, `withdraw`, `lat`, `lng`.
- Task: `id`, `incidentId`, `volunteerId`, `type` (`verify`, `withdraw`, `investigate`), `status` (`proposed`, `approved`, `rejected`).
- Conflict: keep the observations separate, keep the higher severity, and hold dispatch.
- Audit: append-only `actorId`, `action`, `targetId`, `at`.

## Pickup
- Assign yourself and move this item to **In progress** once it is on the project board.
- Open one pull request that closes this issue.
- Stay inside the owned paths. Call out any shared file you must change.
- The browser talks only to `ember-api` and `voice-gateway`. Clients do not read or write Firestore or Cloud Storage directly.
- Services use `FIRESTORE_DATABASE=ember-db`.
- WITHDRAW is immediate and decided by code. The model must not set incident severity.

### #29 [infra] Turn on App Check enforcement

- State: open
- Labels: infra, P1
- URL: https://github.com/suhail39ahmed/ember-fire-commander/issues/29

## Outcome
App Check is enforced only after the real clients pass.

## Owned paths
- App Check configuration and its documented setting

## Acceptance criteria
- [ ] Local and deployed web clients pass while enforcement is monitored.
- [ ] Enforcement is enabled only after those checks pass.
- [ ] A client without a valid token is rejected by protected API and gateway entry points.

## Out of scope
Changing the identity design.

## Verification
Record one accepted client and one rejected client after enforcement.

## Dependencies
- #8  -  [backend] Verify identity on ember-api
- #9  -  [voice-gateway] Verify identity on the WebSocket upgrade
- [infra] Deploy and smoke-test the demo path

## Pickup
- Assign yourself and move this item to **In progress** once it is on the project board.
- Open one pull request that closes this issue.
- Stay inside the owned paths. Call out any shared file you must change.
- The browser talks only to `ember-api` and `voice-gateway`. Clients do not read or write Firestore or Cloud Storage directly.
- Services use `FIRESTORE_DATABASE=ember-db`.
- WITHDRAW is immediate and decided by code. The model must not set incident severity.

### #30 [demo] Record the October 17 demo

- State: open
- Labels: demo, P0
- URL: https://github.com/suhail39ahmed/ember-fire-commander/issues/30

## Outcome
Publish the demo links for the October 17 submission.

## Owned paths
- `README.md`
- `docs/demo/`

## Acceptance criteria
- [ ] Add the live app URL, demo video URL, and pitch-deck link, or an explicit TODO where one is unavailable.
- [ ] Keep the recording under three minutes and include the synthetic-data and non-tactical disclosures.
- [ ] Show either the Live path or the documented fallback that was actually working.

## Out of scope
Feature development.

## Verification
The README demo table matches the published links.

## Dependencies
- #5  -  [demo] Freeze the synthetic demo scenario
- [infra] Deploy and smoke-test the demo path

## Pickup
- Assign yourself and move this item to **In progress** once it is on the project board.
- Open one pull request that closes this issue.
- Stay inside the owned paths. Call out any shared file you must change.
- The browser talks only to `ember-api` and `voice-gateway`. Clients do not read or write Firestore or Cloud Storage directly.
- Services use `FIRESTORE_DATABASE=ember-db`.
- WITHDRAW is immediate and decided by code. The model must not set incident severity.


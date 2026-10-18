# Live calls and connectivity testing

## Incident call flow

Open an incident volunteer popup in the supervisor console and select **Request live video**. The volunteer receives a push notification and a foreground invitation with **Join call** and **Decline**. Invitations expire after 45 seconds. The supervisor publishes audio only; the volunteer can share microphone and camera, mute, flip camera, or leave. Closing the supervisor popup asks to end the call first.

The request displays a `CALL-XXXX-XXXX` code below the call area. For manual testing, open **Profile → Test Connectivity → Microphone or Camera → Test a call → Receive / Join a test call** on a signed-in volunteer account and enter that code. Any signed-in volunteer can claim a pending code; the first volunteer to join takes the call. Joining uses the same incident call ID, room, and transcript. An active call cannot be taken over by a second volunteer. A different tester is explicitly named in the supervisor call panel; written instructions still target the original incident volunteer.

The separate supervisor connectivity test is under **header profile icon → Test connectivity**, opening a dialog. It is no longer on the main console surface.

Both participants send only their own unmuted microphone to `/calls/transcription`. The gateway writes shared ordered events under `calls/{callId}/events`, using server-derived speaker identities. The transcript panel shows the same history on both screens. The existing Gemini usage caps still apply. Calls stop after 30 minutes or after either participant is absent for 60 seconds; server reads and heartbeat requests enforce expiry. An external background expiry sweeper is not included in this hackathon implementation.

The supervisor can save a live frame to incident snapshots. Selected frames (at most about once per minute) provide a separate Gemini visual description. Ember AI questions and refreshed suggestions receive bounded recent transcript context plus the latest visual observation. AI never sends an instruction automatically; **Send** uses the existing instruction/notification path. The Chat tab is one-way written messaging. Private AI voice dictation and automatic transcript translation are deferred.

Use the existing LiveKit settings below and the existing Gemini gateway configuration. API, voice gateway, and agents service code all need to be current. For local agents, point `EMBER_AGENTS_URL` at the local agents service; a previously deployed agents version will not have the new call context and frame endpoint. A two-device test is still required to verify camera, microphone, notifications, and network conditions on the actual demo devices.

## Cloud Run configuration with Terraform

Terraform creates empty `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` secrets and
grants access only to `sa-ember-api`. Values are added separately and never enter
Terraform state. The root `.env` configures local processes only.

1. Merge the Terraform changes and run the existing Terraform apply workflow
   from `main`, leaving `livekit_url = ""` in `infra/terraform/terraform.tfvars`.
   This creates the secret containers without mounting empty secrets on Cloud Run.
2. In Google Cloud Secret Manager, add an enabled version containing the real
   value to each secret. Use the same LiveKit project as local testing.
3. Set `livekit_url = "wss://your-project.livekit.cloud"` to the real server URL
   in `infra/terraform/terraform.tfvars`, commit it, and run the apply workflow
   again. Terraform sets `LIVEKIT_URL` and mounts both secrets' `latest` versions
   on `ember-api`, after their access bindings are ready.
4. Deploy the current API image through the existing deploy workflow. After
   rotating secret values, deploy a new revision so all instances load them.

The voice gateway and browser do not need these credentials. Incident calls
work without the standalone test flags. To expose the optional connectivity
tests in staging, also configure `EMBER_LIVEKIT_TEST_ENABLED=true` on API and
gateway, and `VITE_LIVEKIT_TEST_ENABLED=true` for the web build; those flags
remain off by default and are separate from the LiveKit credential wiring.

## Standalone prototype test

For local photo/snapshot URLs with user ADC credentials, set `PHOTO_SIGNING_SERVICE_ACCOUNT` to the existing API service account; the user credential needs permission to sign as it. Cloud Run continues to use its runtime account. No private signing key is needed.

This tests live camera and microphone media between two signed-in sessions.
It does not create an incident call, ring another user, record call media, or
alter reporting or live-camera seat state. It stores a shared test transcript.

## Configure

Create a project in [LiveKit Cloud](https://cloud.livekit.io/). In the repository
root `.env`, fill in:

```dotenv
VITE_LIVEKIT_TEST_ENABLED=true
EMBER_LIVEKIT_TEST_ENABLED=true
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
```

The root `.env` is ignored by Git. `.env.example` contains placeholders only.
The API reads these LiveKit settings from the root `.env`; process environment
variables take precedence. Vite reads the public test flag from the root `.env`,
with process and app-local environment values taking precedence. Restart Vite
after changing it. Existing Firebase and API URL settings remain in
`apps/web/.env.local` as before. No LiveKit secret belongs in any `VITE_*` variable.

Install API dependencies from `services/api/requirements.txt` and browser
dependencies with `npm ci` in `apps/web`, then start the existing API and Vite
services normally. If using a deployed API, install/deploy the updated API and
inject the backend settings there; a local `.env` does not configure Cloud Run.
The web deployment must set `VITE_LIVEKIT_TEST_ENABLED=true` at build time.

## Test

1. Use two devices or separate browser profiles: a volunteer at `/pwa` and a
   supervisor in the console. Use real Firebase sign-in for both, and headphones.
2. On the volunteer Profile page, find **Test Connectivity** below Permissions.
   Use **Microphone → Test a call** for audio only, or **Camera → Test a call**
   for video and audio. On the supervisor console, open
   **header profile icon → Test connectivity**. Choose
   **Start a new test call** to generate an editable code and share it with the
   other participant. Supervisors and volunteers can both start a test call.
3. On the other screen, open its call test controls, choose
   **Receive / Join a test call**, and enter the same code. Either participant
   can join the room first. This manual code exchange does not ring the other screen.
4. Click the camera + microphone join button on each screen and allow browser
   permissions. Confirm each participant can see and hear the other.
5. Mute/unmute each microphone and toggle each camera. Verify the other screen
   reflects the change. Leave, rejoin, and verify media resumes.
6. Close the test panel or sign out. Confirm camera/microphone indicators stop.
7. Try a different room code and confirm the two sessions cannot see or hear
   each other. Rejoin the same code to resume the test.

Camera and microphone require HTTPS, except on localhost. A phone visiting an
HTTP LAN address cannot use them. A phone also cannot reach a laptop API via
`localhost`; use the existing HTTPS staging/tunnel setup and allowed browser
origin settings. Each device needs its own available camera and microphone.

Both sides publish camera/microphone and subscribe to the room. Tokens expire
for initial joins after five minutes and are restricted to the selected test
room, with no screen sharing or room administration grants. Only authenticated
volunteers and supervisors can request them. Any such user with the same code
can join while this test is enabled; use a fresh code per test. There is no
incident membership or supervisor assignment check in this prototype.

Disable both test flags to remove the controls and disable token issuance.
The SDK is loaded only when the test panel is opened. Leave rooms before
disabling the flags: disabling token issuance does not terminate an ongoing call.

The real two-device media check requires configured LiveKit credentials. Unit
tests and a successful build alone do not confirm a working video call.

## Speech transcription test

Profile → Test Connectivity has two rows: **Microphone** and **Camera**.
Select **Test a call** on either row, then connect or join. Speech transcription
starts automatically when the call connects, for audio and video tests alike.
There is no separate transcription row or Start transcription action. The same
automatic behavior applies to the supervisor test panel. You can test your own
speech before the other participant joins. This retains the Gemini integration;
it does not evaluate LiveKit's own transcription services.

The token endpoint returns a server-generated `callId` and `speakerId`, and
registers the authenticated caller as a member in `testCalls/{callId}/members`.
Both users entering the same test code receive the same call ID. Knowledge of
a call ID alone does not authorize transcript access. As with media access in
this prototype, any signed-in volunteer/supervisor with the test code can join;
incident assignment checks are deferred until the product call flow is defined.

Each browser reads **only its own** unmuted microphone track. A single
ticket-authenticated WebSocket at `/transcription-test` handles its local audio
and the shared transcript subscription. A viewer without a microphone still
receives history. The server derives speaker identity and name from membership,
not from labels in audio messages. It uses one Gemini session per publishing
speaker. Transactional 30-second leases, renewed while publishing, prevent a
second tab from transcribing the same speaker concurrently.

Gemini returns input transcription chunks. The gateway stores immutable events
in `testCalls/{callId}/events` with:

```json
{
  "type": "transcript.event",
  "callId": "<call ID>",
  "speakerId": "<server-assigned speaker ID>",
  "speakerName": "Volunteer",
  "eventId": "000000000001",
  "sequence": 1,
  "timestamp": "2026-10-18T12:00:00Z",
  "segmentId": "<utterance ID>",
  "text": "Hello",
  "finished": false
}
```

The call-wide sequence is allocated transactionally, including concurrent
speakers. Each event contains the current full text of its segment. Partial and
final updates reuse the segment ID. Both screens receive these same events;
clients replace segment snapshots and ignore duplicate/older events. The
gateway polls Firestore about once per second, so delivery can lag that much.
On reconnect, the browser supplies `afterSequence` and the server replays later
events. A page reload starts at zero and reloads history. Call access expires
two hours after creation; use a new test code after expiry. Expiration does not
delete the stored documents; transcript retention cleanup is not implemented.

```text
Volunteer local mic -> Gemini -> ordered Firestore transcript events
                                      |                 |
                                      v                 v
                                Volunteer UI       Supervisor UI
                                      ^                 ^
Supervisor local mic -> Gemini -> same call event history
```

Leaving the call or closing the test panel releases its audio processing and
Gemini sessions. Muted and unpublished tracks are not streamed. Model
audio replies are discarded. This endpoint has no reporting tools or incident
digest and cannot create observations. The browser displays the latest 200
segments; shared transcript events persist in Firestore. Google processes the
audio as part of the existing Gemini Live service. The two speakers still use
separate Gemini sessions; shared transcript delivery does not add a combined
Gemini reasoning context.

Restart the voice gateway after updating its requirements. It needs its existing
Google Application Default Credentials, `LIVE_MODEL`/`LIVE_LOCATION` settings,
and `FIRESTORE_DATABASE=ember-db` for consuming voice tickets. It reads the test
flag from the root `.env` during local testing; process env takes precedence.
The existing `VITE_VOICE_GATEWAY_WSS_URL` must point to this updated gateway.
There is no additional transcription API key. Each audio publishing session has
a two-minute test limit and contributes to the gateway's existing in-process
Live-minute usage. When publishing stops, the viewer remains subscribed to the
shared history. Rejoin the test call to start another audio test.

To verify: speak a short sentence, wait for it to appear, have the other person
reply, mute a microphone and verify no new words arrive for that speaker, then
leave the call and confirm local publishing stops. Both screens should display
the same text and timestamps. Rejoin with the same code and verify history is
restored. Verify an account that has not joined this call cannot subscribe by
guessing its call ID. Gemini readiness, shared delivery, and a working
two-speaker browser call are separate checks.

Local verification: the real Gemini Live session returned both sentences from
synthetic speech, including “This is a connectivity test” and a smoke report.
It misheard “road” as “room” in that sample. This confirms returned input
transcription, not perfect recognition or a completed two-person browser test.

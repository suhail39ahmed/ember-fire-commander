# Supervisor initiated volunteer call plan

Saved 18 October 2026. Status: implementation authorized by the user's “Go ahead with implementation”. The incident-call UI, invitation lifecycle, shared transcript, snapshots, and transcript-aware AI integration are implemented locally. Two-device media verification remains a manual demo check.

## Goal and visual references

Integrate the existing LiveKit and shared transcript prototype into the incident volunteer pop-up. Match the supplied proposed screens through browser screenshot comparisons at the reference viewport, then verify responsive behavior. Keep the existing project typography and design system where the references leave details unspecified.

Reference images in `supervisor-call-reference/`:

- `01-current.png`: current pop-up.
- `02-camera-off.png`: proposed idle state and two-column layout.
- `03-waiting.png`: pending invitation with countdown and cancellation.
- `04-live.png`: connected camera, transcript, media, and AI suggestions.

Another chat is modifying the report screen. Coordinate shared contracts before editing overlapping files and preserve its changes.

## User requirements

- Only the supervisor initiates calls. The volunteer receives an invitation and explicitly joins.
- No volunteer video by default. Request live video opens the invitation flow.
- Expand the left video area, add microphone control, show automatic shared transcription, and move incident snapshots/media up.
- Gemini Live listens during connected audio and video calls.
- The right pane has Ember AI and Chat with Volunteer tabs.
- Ember AI answers supervisor questions and offers suggestions with individual Send actions.
- Written messages go from supervisor to volunteer only.
- Reuse existing notification delivery rather than introduce an unrelated notification system.

## Confirmed call decisions

- User confirmed supervisor-only initiation, volunteer-only video, and two-way conversational audio.
- User selected Mute/Unmute for the supervisor call control instead of Hold to talk.
- User selected ending the call after confirmation when closing the pop-up. A minimized ongoing call is unnecessary for this hackathon. Cancelling the close confirmation keeps the call and pop-up open. Merely changing AI/chat tabs never ends the call.

## Remaining proposed defaults

- Volunteer can mute, stop camera, flip camera, or leave.
- Ember AI questions use the typed composer for this iteration. Separate private voice dictation remains deferred; the call microphone is only for speaking with the volunteer.
- Invitations expire after 45 seconds, matching the mock-up.
- Calls have a 30-minute maximum and end after either participant stops heartbeating for 60 seconds. Existing transcription usage limits still apply. Selected video frames are described about once per minute. Automatic translation and retention cleanup remain deferred.

## Hackathon testing additions confirmed by the user

- Show a `CALL-XXXX-XXXX` join code below the supervisor call area, with “You can also ask Sari to join this call by entering the code” (using the selected volunteer's name).
- Any signed-in volunteer with the pending code can join; there is no invited-volunteer restriction for this prototype. The first volunteer claims the call, using their real server-derived identity and the same shared transcript. Another volunteer cannot replace an active participant. The original invitation expires after 45 seconds.
- When a different volunteer joins for testing, show their name explicitly. The incident panel and written instruction recipient remain the original volunteer; this testing fallback does not reassign incident work.
- Move the standalone supervisor LiveKit test launcher under the header profile icon as “Test connectivity”, opening a dialog. Keep it off the main console surface.

## Implementation preferences

The user selected GPT-Astra with Extra High reasoning and requested careful credit usage. Reuse the existing implementation, keep work focused on the agreed hackathon scope, batch independent inspection, and run relevant checks without unnecessary repetition. Do not spawn additional agents unless explicitly authorized. These preferences were followed after the explicit implementation go-ahead.

## Supervisor field view

Left column order: large live video stage, call controls, scrolling shared transcript, incident media strip, instruction/delivery activity.

States: idle, requested, accepted/connecting, live, audio only, reconnecting, ended, declined, expired, failed. Show LIVE only when actual media arrives. A stored uploaded clip belongs in the media strip and is not labelled a live stream.

Requested state shows the volunteer name, server-based expiry countdown, and Cancel request. Connected state offers mute/unmute, snapshot when a frame exists, and End live session. Audio-only/reconnecting states clearly describe missing video while retaining usable audio.

Snapshot saving creates an incident attachment with call ID, capture time, volunteer identity, and capturing supervisor; it appears in incident media. Snapshot authorization and attachment contracts must align with the report-screen work.

## Invitation and connection flow

1. Supervisor requests video for a volunteer in an incident.
2. API verifies supervisor authorization and the incident/volunteer relationship, checks existing call and live-seat policy, then stores an expiring invitation.
3. Supervisor sees Waiting. Volunteer receives a push and an in-app invitation while the app is open.
4. Tapping push opens Join/Decline; it never starts capture automatically.
5. Server revalidates the invitation on acceptance. The volunteer grants camera/microphone permission and receives scoped LiveKit credentials.
6. Connection progresses through Connecting to Live when media actually arrives.
7. Cancel, decline, expiry, end, and connection failure update authoritative call state and release resources/reservations.

Push is an alert; stored call state is authoritative. Delayed pushes cannot revive expired/cancelled calls. Handle missing push permission, permission denial, duplicate tabs/devices, double acceptance, offline users, and reconnects. An open app must discover invitations even if push fails.

## Media and transcript flow

Volunteer video and audio reach the supervisor through LiveKit; supervisor audio returns through LiveKit. The confirmed flow does not use a supervisor camera.

Each participant sends only their own unmuted microphone audio to the authenticated transcription gateway. Gemini transcription produces backend events with callId, speakerId, eventId, segmentId, sequence, timestamp, text, and completion state. Authorized screens replay the same ordered history using a sequence cursor; partial updates replace segment snapshots rather than duplicating text. Retain speaker labels, compact text, timestamps, and automatic scrolling.

The existing test implementation uses separate Gemini sessions per speaking participant. Shared transcript storage does not itself provide a combined AI reasoning context.

The mock-up's Gemini sees the frame feature requires additional volunteer-frame sampling and visual analysis; current test-call transcription does not send camera frames. Provide recent transcript, relevant incident facts, and available visual observations explicitly to the AI suggestion flow. Keep original speech, translated text, and AI visual interpretation distinct. Translation is additional scope rather than a transcription guarantee.

## AI and written instructions

Ember AI tab: questions, advisory answers, quick prompts, suggested instructions, and explicit Send for each suggestion. Sending uses the existing authorized instruction delivery path and records the action.

Chat with Volunteer tab: direct supervisor composer and sent history with known delivery/acknowledgement states. No volunteer reply composer. Avoid badges that imply incoming chat; any badge needs a defined meaning such as unacknowledged instructions. Call transcription may still contain both participants' spoken words.

AI must not send instructions automatically. Preserve existing WITHDRAW priority and instruction blocking rules.

## Integration points

- `apps/web/src/supervisor/detail/ExpandedVolunteerView.tsx`: existing pop-up, currently disabled live controls, uploaded clip stage, AI pane, media, and sent instructions.
- `apps/web/src/supervisor/detail/IncidentDetailView.tsx`: incident pop-up wiring.
- `apps/web/src/livekit/`: reusable media, local-track processing, shared transcript client, transcript log, and prototype controls.
- `apps/web/src/pwa/layout/VolunteerProvider.tsx` and `PhoneLayout.tsx`: app-level invitation/call ownership and existing voice interactions.
- `apps/web/src/pwa/push/target.ts`, `usePushNavigation.ts`, and `apps/web/public/sw.js`: new call invitation payload and deep link alongside task/WITHDRAW navigation.
- `services/api/notifications/`: existing FCM token registration, delivery, retries, and recorded outcomes; extend with a call-specific invitation type.
- `services/api/incidents/live_seat.py`: integrate existing seat eligibility/reservation/release with actual call lifecycle.
- `services/api/calls/`: incident-scoped lifecycle, membership, tokens, snapshots, AI context, and the approved manual join-code fallback. `services/api/livekit_test.py` and `test_calls.py` retain isolated connectivity tests.
- `services/voice-gateway/live/transcription.py` and `shared_transcripts.py`: reuse ordered transcript delivery, speaker ownership leases, and reconnect replay with product call authorization.
- Existing supervisor `sendInstruction`, `askIncident`, and suggestion APIs: reuse delivery; explicitly add call context for AI where appropriate.

Server call state includes incident, requesting supervisor, target volunteer, lifecycle timestamps, invitation expiry, room identity, and end reason. Enforce role restrictions and membership at every media/token/transcript operation. Ending a call must terminate media participation and transcription, not merely mark a record ended. Existing two-minute test cap and two-hour test membership expiry are prototype settings, not product defaults.

## Delivery and verification after confirmation

Implementation verification: frontend typecheck/build/lint and relevant UI, API, gateway, and agents tests pass. An isolated test against real Firestore and LiveKit verified manual-code substitution, real speaker identity, identical ordered transcript histories, AI context assembly, room creation, and server-side room cleanup. No human call or Gemini request was used in that verification. Two-device camera/audio and push checks remain manual. Local signed media URLs are currently blocked by the configured user credential lacking `iam.serviceAccounts.signBlob`; Cloud Run uses its runtime signing identity.

1. Call lifecycle and notifications: request, join, decline, cancel, expiry, access control, duplicate protection.
2. Real call in the pop-up: volunteer video, two-way audio, mute/end, reconnect, automatic shared transcript.
3. Layout and interactions matching the reference states: field view, transcript, media strip, AI/chat tabs.
4. Incident snapshots and transcript-aware AI suggestions; add frame analysis and translation according to confirmed scope.

Validate two real devices/users, notification deep links, foreground invitations, permission denial, expired invitations, unauthorized access, identical transcript/replay, media cleanup after end, and audio-only fallback. Compare browser screenshots for idle, waiting, live, and responsive layouts. Run relevant API/gateway/frontend checks while preserving concurrent report-screen changes.

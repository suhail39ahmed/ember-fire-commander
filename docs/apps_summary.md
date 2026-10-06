# EMBER application summary: Volunteer mobile app + Supervisor console

Sat 3 Oct 2026 (IST). Tags: [V] read, [S] snippet, [U] unverified/assumption, [BUILT] built and run. Nothing in this file is implemented yet (no app code exists); it is the design to build between 3 and 17 Oct.

## 1. Recommendation: PWA for both, one React/Vite/TypeScript codebase

| | PWA (recommended) | Flutter / native |
|---|---|---|
| Time to a working 3-phone demo by 18 Oct | Fastest: one codebase for phones and console, deploy to Firebase Hosting, install by QR | Second codebase for the console (Flutter web is possible but heavy); APK sideload or TestFlight friction; iOS builds need a Mac/Apple account [U] |
| Offline | Firestore web offline persistence works but is **off by default** and must be enabled (`persistentLocalCache`, multi-tab option) [V https://firebase.google.com/docs/firestore/manage-data/enable-offline] | Same SDK feature, plus background work |
| Push | FCM web push; **iOS needs a Home-Screen-installed PWA, iOS 16.4+, permission requested from a user tap** [S https://firebase.blog/posts/2023/08/fcm-for-safari/]; Android Chrome works normally | Native push, more reliable |
| Camera / mic / GPS | Foreground only: `getUserMedia`, Geolocation | Background location and audio possible |
| Review friction | None | Store review, or sideload |

**Honest limits of the PWA (state them in the README):** no reliable background GPS or background audio (location pings pause when the screen is off); iOS may evict site storage after inactivity [U]; Bahasa on-device speech voices vary by phone [U]. **Roadmap:** a Flutter/Android app for background tracking after the hackathon. Decision rule: if the team's strongest mobile skill is Flutter and the PWA push test on a real iPhone/Android fails by Tue 6 Oct, switch only the volunteer app to Flutter and keep the web console.

**Bahasa-first:** every string lives in `id.json` (default) and `en.json` (i18next); the Live system prompt and Flash prompts are Bahasa-first; device language is only the default, the toggle is on the first screen. Short, polite imperative phrasing and no jargon; **a native speaker must review every string and prompt** (open risk R-Bahasa in plan §8).

## 2. User roles

| Role | Who | Can do | Cannot do |
|---|---|---|---|
| **Volunteer** | Village fire-brigade member (e.g. MPA) | Report (voice/photo/chip), receive and acknowledge tasks, see the incident ring and wind on their own mini-map | See other villages' reports, conflict internals, raw scores, other crews |
| **Crew lead** (optional flag on a volunteer) | One per crew | Everything a volunteer does + see crewmates' positions and acknowledgments, send "crew ready/blocked" | Approve dispatch |
| **Supervisor** | Posko/MPA coordinator (persona: Ibu Rahma) | Everything on the COP, approve/edit/reject proposals, resolve conflicts, verify/close incidents, assign crews, message crews, switch voice off | Send agency reports (EMBER only drafts; supervisor sends them outside EMBER) |
| **Agency liaison** | BPBD/Manggala Agni contact | Read-only COP link, view drafts (optional, post-MVP) | Any write |
| **Admin/dev** | Team | Create ops, mint invite codes, caps, audit | — |

## 3. Authentication
- **Volunteer:** supervisor creates an *operation* and a QR invite link + 6-digit code → PWA calls `ember-api`, which mints a Firebase **custom token** carrying `{role, opId, crewId}` claims (Admin SDK) [V https://firebase.google.com/docs/auth/admin/create-custom-tokens]. Claims are what Firestore Security Rules check. No SMS (phone auth is per-SMS billed and region-gated by default [V https://firebase.google.com/docs/auth/web/phone-auth]). The signed-in session persists after the one-hour token life [V].
- **Supervisor/admin:** Google or email sign-in; role set by an admin through custom claims.
- Gateway verifies the ID token on WebSocket upgrade; optional App Check (no cost [V https://firebase.google.com/pricing]). Invite codes expire with the operation window; a supervisor can revoke a volunteer instantly.
- Simulated session: all identities are demo accounts; no real volunteer data.

## 4. Volunteer app (phone PWA)

**Screens**
1. **Onboarding:** invite code → name (display) → language (Bahasa default) → consent text (location during an active operation, voice, photos; no faces) → permissions asked one at a time from a button tap (mic, camera, location, notifications).
2. **Home:** one big push-to-talk mic; status line ("Siap / Mendengarkan / Memeriksa / Menunggu supervisor"); current-task card; mini-map (own position, incident ring, upwind arrow); quick chips: *asap* (smoke), *api* (flame), *aman* (all clear), *butuh bantuan* (need help).
3. **Camera:** one still per report, guidance "jaga jarak aman, tanpa wajah" (keep a safe distance, no faces); preview → send. Photos compressed on the phone (≈100–200 KB target [U]).
4. **Task detail:** instruction text (Bahasa + English), staging point on map, buttons *Siap/Acknowledge* and *Tidak bisa/Can't*. VERIFY tasks are phrased as "look and photograph from a safe distance"; none tell a volunteer to engage a fire.
5. **WITHDRAW screen:** full-screen, high-contrast, not colour-only (icon + text + vibration + sound): "MUNDUR ke titik kumpul" with the upwind staging point; a single *Saya sudah mundur* button.
6. **Outbox/History:** every report with state *queued → uploaded → in incident INC-x*; shows offline queue.
7. **Settings:** language, text size, low-data mode, share-location-with-crew toggle, leave operation.

**Features:** voice report (push-to-talk, Gemini Live burst), photo report (Flash triage), chips, location pings (foreground 30 s; low-data 120 s), task push, shared common-picture digest read aloud on request ("apa kabar kebakaran?"), crewmate dots (crew only, opt-out).

**Offline / low bandwidth**
- Firestore offline cache and write queue: chips, pings and text reports queue and sync on reconnect; observations carry `capturedAt` so the aggregator merges late reports correctly (`receivedAt` is kept separately) [V offline behaviour; BUILT merge uses capture time].
- Photos queue in IndexedDB and upload via signed URL when online.
- Voice needs a connection; if offline, record a ≤ 10 s clip, queue it, and have Flash transcribe it later [U]. The UI says plainly "tidak ada sinyal — laporan disimpan".
- Low-data mode: ping interval 120 s, smaller photos, no map tiles beyond the mini-map, optional Opus uplink with gateway transcoding to reduce the ≈ 1.9 MB/min 16 kHz PCM uplink [U, to test].
- Stale-data banner when the shared picture is older than N minutes (`fromCache` metadata [V]).

**Notifications:** FCM push + vibration + in-app banner for: new task, WITHDRAW (high priority), supervisor message. iOS requires installed PWA [S]. WITHDRAW is also repeated through the live Firestore listener, so a foregrounded app never depends on push.

**What a volunteer sees:** her own task and acknowledgments; incident ring (not other villages' reports); wind and upwind arrow; crewmates (same crew, opt-out); plain-language status. Not shown: conflict flags, evidence scores, other observers' photos, supervisor queue.

## 5. Supervisor console (web, laptop or tablet)

**Screens / panels**
1. **COP (hero map):** Google Maps vector + deck.gl: satellite leads (grey, size = FRP), incident rings (amber = reported/corroborated, magenta = verified, teal = extinguished, dashed = re-ignition watch; not red/green only), volunteer dots (by crew, with last-seen age), crews' staging points and proposed routes, wind arrows, indicative exposure corridor labelled "indicative — not a forecast", SG PSI chip. Footer carries NASA acknowledgment/disclaimer and other attributions.
2. **Verification queue:** ranked list of leads and incidents (Risk Ranker priority with the five chips, plus evidence score and observer count); filters: needs-verification / conflicts / awaiting approval / stale.
3. **Incident detail drawer:** photos by volunteer and time, transcripts (Bahasa + English), evidence components, linked satellite lead, wind, safety-rule chip (R1…R5), full audit trail.
4. **Approvals inbox:** one card per crew: proposed instruction, rule that produced it, assumptions; **Approve / Edit / Reject** (ADK HITL pause). Withdrawals are shown as *already sent* with undo-free log.
5. **Conflicts panel:** side-by-side photos/claims, the system's default (max severity), buttons *Merge / Keep split / Set severity / Mark verified / Mark false alarm*.
6. **Crew roster & tasking:** assign volunteers to crews, send a message/check-in request, see acknowledgments, Live minutes used, silent volunteers.
7. **Re-ignition sites:** extinguished sites with days since and new nearby anomalies.
8. **Replay & eval card:** timeline scrubber (29 Sep replay), eval/back-test numbers from the latest run.
9. **Settings:** voice on/off, Live-minute caps, thresholds display (read-only), invite QR.

**Supervisor's queue logic.** Three kinds of items, in this order: (1) **conflicts** that hold a dispatch; (2) **approvals** (dispatch proposals, merges); (3) **verification requests** to send (EMBER can send observe-only VERIFY tasks itself, since no one is told to engage). Only the supervisor can set VERIFIED, EXTINGUISHED, FALSE_ALARM or lower a severity. Every action writes an `audit` record.

**Notifications (console):** sound + browser notification for: new corroborated incident, conflict flagged, approval pending, WITHDRAW issued, volunteer silent for N minutes [U N=10], re-ignition alert. The console works as a text-first screen; no Live session by default.

**What the supervisor sees:** everything in the operation including exact volunteer positions (R10: disclosed in onboarding consent, TTL-deleted).

## 6. Same data, three views
| Item | Volunteer | Crew lead | Supervisor |
|---|---|---|---|
| Own observations and outbox | ✔ | ✔ | ✔ (all) |
| Incident ring + wind | ✔ (redacted projection) | ✔ | ✔ full |
| Crewmate positions | opt-out, same crew only | ✔ crew | ✔ all |
| Conflicts, scores, other observers' photos | ✘ | ✘ | ✔ |
| Approve/reject/verify | ✘ | ✘ | ✔ |
| Own task + ack | ✔ | ✔ crew | ✔ all |

## 7. Build effort (my estimate, [U])
Volunteer PWA ≈ 4–5 person-days, console additions ≈ 3–4 person-days, gateway + aggregator wiring ≈ 3 person-days, Firestore rules + emulator tests ≈ 1 day. If time runs short, cut in this order: crew-lead role, agency liaison, re-ignition panel polish, offline voice clip, Opus uplink; keep: PTT report, photo, chips, task cards, WITHDRAW, conflict panel, approvals inbox. Fallback for the demo: 2 real phones + 1 scripted simulated volunteer (labelled).

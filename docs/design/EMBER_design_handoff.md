# EMBER — Design handoff for the GitHub backlog

Revision 2 · 13 Oct 2026 · Figma file **Google Hackathon 2026** (key `WacSWJ9eGsdJ4vG9Q1nbyk`)
Link pattern: `https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=<id with - instead of :>`

Figma is the visual source of truth. GitHub issues own behaviour. Where they disagree, the issue wins and the conflict is listed in §14.

## 0. Limits of this handoff

1. **Acceptance criteria:** #16 and #17 are checked against the acceptance criteria supplied for this revision (§5, §6). #6 and #18–#22 are still checked against **issue titles only**, because the repo is private and the bodies were not readable. Re-check those discrepancy lines against the issue bodies.
2. **Approval status:** Figma has no Approved / Final / Ready-for-dev markers. §1 lists which frames are treated as final, and why.
3. **No tokens in Figma:** 0 variables, 0 paint/text/effect styles. Values below are read from layers and from the `Foundations` and `Brand kit` frames.
4. **No prototype wiring.** All navigation is inferred from labels and marked *(inferred)*.
5. **Only five components exist,** all brand marks. Chips, buttons, inputs and nav items are plain frames.
6. **All screen data is illustrative** (cover note `3:7`).
7. **Device and browser chrome is mock-up only.** Mobile status bars (`14:24`, `4G  82%`, …) and the fake browser bar on `D-L` are not to be built.

## 1. Approved / final frames

Treated as final (27 frames): every screen frame on `02 · Volunteer app` and `03 · Supervisor console (BPBD)`, the new `V8` frame for #17, and the reference frames `Foundations` and `Brand kit`. **Confirming this list is Needs decision.**

| Excluded | Node | Reason |
|---|---|---|
| H1 · Haze shield — WhatsApp closed-room plan | `7:2` | "Decision pending" frame `19:53`: no delivery channel. **Explicit gap** |
| H2 · Elder check-in call (Twilio voice) | `7:43` | Twilio is not in the architecture. **Explicit gap** |
| H3 · Family alert — missed check-in | `7:66` | Same. **Explicit gap** |
| D2 · Exposure corridor — where smoke may drift | `6:135` | On-canvas "TODO before demo … Do not show placeholder numbers." **Explicit gap** |
| Cover | `3:7` | Index |
| Demo video — script & storyboard | `8:99` | Storyboard of cloned screens |

## 2. Frame-to-issue mapping

| Node | Frame | Workstream | Issue | PNG path |
|---|---|---|---|---|
| `54:32` | D-L · Login — Supervisor Console | [ui] | #6 | `docs/design/ui/6-d-l-login-supervisor-console.png` |
| `4:2` | V1 · Verify hotspot — new task | [pwa] | #16 current task | `docs/design/pwa/16-v1-verify-hotspot-new-task.png` |
| `4:53` | V2 · Photo check — Gemini result | [pwa] | #16 | `docs/design/pwa/16-v2-photo-check-gemini-result.png` |
| `56:46` | V-L · Loading | [pwa] | #16 state | `docs/design/pwa/16-v-l-loading.png` |
| `56:71` | V-E · Empty — no tasks | [pwa] | #16 state | `docs/design/pwa/16-v-e-empty-no-tasks.png` |
| `5:2` | V3 · Live guidance — Gemini Live coach | [pwa] | #16 push-to-talk + live coach + camera | `docs/design/pwa/16-v3-live-guidance-gemini-live-coach.png` |
| `56:261` | V3 · Live connection states | [pwa] | #16 (same state as V3) | `docs/design/pwa/16-v3-live-connection-states.png` |
| `5:47` | V4 · Safety Guard — withdraw upwind | [pwa] | #16 full-screen WITHDRAW | `docs/design/pwa/16-v4-safety-guard-withdraw-upwind.png` |
| `10:4` | V6 · Approved instruction — photo mode + push-to-talk (Sari) | [pwa] | #16 approved task | `docs/design/pwa/16-v6-approved-instruction-photo-mode-plus-push-to-talk-sari.png` |
| `107:70` | **V8 · Report chips + text report — send, validation error, sent** (new) | [pwa] | #17 (consumed by #16) | `docs/design/pwa/17-v8-report-chips-plus-text-report-send-validation-error-sent.png` |
| `12:2` | S1 · Supervisor console — live incident | [supervisor-console] | #18 (map also #22) | `docs/design/supervisor-console/18-s1-supervisor-console-live-incident.png` |
| `13:2` | S2 · Supervisor console — wind shift, withdraw sent | [supervisor-console] | #18 | `docs/design/supervisor-console/18-s2-supervisor-console-wind-shift-withdraw-sent.png` |
| `54:265` | D-LD · Loading | [supervisor-console] | #18 state | `docs/design/supervisor-console/18-d-ld-loading.png` |
| `54:91` | D-E · Empty — no live incidents | [supervisor-console] | #18 state | `docs/design/supervisor-console/18-d-e-empty-no-live-incidents.png` |
| `19:10` | V0 · Join — invite code, install, permissions | [pwa] | #19 (touches #6) | `docs/design/pwa/19-v0-join-invite-code-install-permissions.png` |
| `56:31` | V-S · Splash | [pwa] | #19 | `docs/design/pwa/19-v-s-splash.png` |
| `56:96` | V-N · Push notification | [pwa] | #19 | `docs/design/pwa/19-v-n-push-notification.png` |
| `49:30` | Brand kit | [ui] | #19 icons/manifest | `docs/design/ui/19-brand-kit.png` |
| `56:122` | V1a · Upload — uploading | [pwa] | #20 | `docs/design/pwa/20-v1a-upload-uploading.png` |
| `56:168` | V1b · Upload — uploaded | [pwa] | #20 | `docs/design/pwa/20-v1b-upload-uploaded.png` |
| `56:214` | V1c · Upload — failed | [pwa] | #20 | `docs/design/pwa/20-v1c-upload-failed.png` |
| — | *(no frame — explicit gap)* | [pwa] | **#21** | — |
| `14:58` | S3 · Regional view — every incident, hotspot and watched site | [supervisor-console] | #22 | `docs/design/supervisor-console/22-s3-regional-view-every-incident-hotspot-and-watched-site.png` |
| `6:2` | D1 · Supervisor Console — hotspot queue | [supervisor-console] | #22 (hotspots, not incidents) | `docs/design/supervisor-console/22-d1-supervisor-console-hotspot-queue.png` |
| `8:24` | Foundations | [ui] | shared reference (no issue) | `docs/design/ui/none-foundations.png` |
| `5:66` | V5 · Re-ignition watch — re-check task | [pwa] | none | `docs/design/pwa/none-v5-re-ignition-watch-re-check-task.png` |
| `56:287` | V7 · Settings & profile | [pwa] | none | `docs/design/pwa/none-v7-settings-and-profile.png` |
| `56:341` | V7a · Settings — language picker | [pwa] | none | `docs/design/pwa/none-v7a-settings-language-picker.png` |

`none-` = approved but outside #6–#22. `D-L` is classified [ui] because #6 is the shared auth issue.

## 3. Shared foundations

`Foundations` (`8:24`, https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=8-24) is the shared reference for colour, type and the status language. It is **not** the #17 deliverable.

### 3.1 Colour tokens

| Suggested token | Hex | Documented role |
|---|---|---|
| `color.ember` | `#E2531B` | Brand, primary action, unverified hotspot |
| `color.danger` | `#C81E1E` | Withdraw, confirmed fire, unhealthy air, failures, validation errors |
| `color.safe` | `#2F7D4F` | Safety tips, all-clear, uploaded, sent, live connection |
| `color.haze` | `#B7791F` | Re-check, moderate, caveats, connecting |
| `color.data` | `#2563EB` | Wind, data layers, AI signals, en route |
| `color.ink` | `#1C1917` | Text, dark buttons, selected chips |
| `color.paper` | `#FAF7F2` | App background, text on Night/Ink |
| `color.night` | `#141210` | Sidebar, splash, login |

Undocumented colours used on screens (**Needs decision**: adopt or replace):

| Hex | Where | Suggested name |
|---|---|---|
| `#6B645C` | Secondary text, section labels, placeholders | `color.ink-muted` |
| `#FFFFFF` | Cards, secondary buttons, unselected chips, inputs | `color.surface` |
| `#E7E1D8` | Borders (inputs, chips, secondary buttons), progress track | `color.line` |
| `#D6CFC4` | Device-frame stroke | mock-up only |
| `#8E877D` | Dismissed | `color.neutral` |
| `#FDF0D5` / `#E3F2E8` / `#E0EAFD` | Haze / Safe / Data tints | `color.*-tint` |
| `#FDE8DE`, `#FDE2E2`, `#EFEBE5` | D1 tints | Needs decision |
| `#A79F94`, `#8A8278`, `#2E2A26`, `#221F1C` | Sidebar text, label, active nav, card | `color.night-*` |
| `#B91C1C`, `#FFE4E4`, `#FFD0D0` | V4 full-screen withdraw, S2 banner text | **Conflict:** V4 uses `#B91C1C`, not Danger `#C81E1E` |
| `#F59E6B`, `#BDB5AA`, `#D9D1C6` | V3 overlay text | Needs decision |
| Map/photo greens and browns | V1, V2, V3, V6, D1, S1, S3 | Illustration only |

### 3.2 Typography

Inter only. Documented ramp: Display 40 Bold · Title 28 Bold · Heading 20 Semi Bold · Body L 16 Regular · Body 14 Regular · Label 12 Semi Bold, tracked 8%, caps. Screens also use 10, 11 (section labels, tracked 6%), 13, 15, 17.6, 18, 22, 24, 26, 30, 34, 36, 76, 80, and Medium weight. **Needs decision:** snap or extend the ramp.

### 3.3 Spacing and radii

| | Mobile (390 × 844) | Desktop (1440 × 900) |
|---|---|---|
| Screen padding | horizontal 20 | main 24/28 |
| Sidebar | — | 248 wide, padding 24/16, item gap 6; nav item 216 × 37, padding 10/12, radius 10 |
| Block gap | 6–14 | 16 |
| Card | white, radius 18, padding 16 or 16/20 | radius 12–16, padding 12–16 |
| Button | height 54, padding 0/20, radius 14, label 16 Semi Bold | radius 12, label 13–15 Semi Bold |
| Input | radius 12, padding 14/16, 1.5 border `#E7E1D8`, text 15 Regular | radius 12, text 15 |
| Pill / chip | radius 999 | radius 999 |
| Device frame radius 40 | mock-up only | — |

### 3.4 Shared patterns (frames, not components)

| Pattern | States seen | Frames |
|---|---|---|
| Primary button (Ember) | default, disabled-looking ("Waiting for upload…") | V1, V0, V1a, V8 |
| Dark button (Ink) | default | S1, V6 "Hold to talk" |
| Safe button | default | S1 "Approve" |
| Danger button | default; inverse (white fill, red label) | V3/V6 "Withdraw", V4 |
| Secondary button (white, 1.5 `#E7E1D8`) | default | many |
| **Report chip** | unselected, selected, error | **V8 only** (§6) |
| **Text field** | empty (placeholder), filled | V8, V0 (invite code), D-L (email) |
| Status chip | Awaiting volunteer, En route, Confirmed fire, Re-check, Dismissed, Unhealthy, Moderate | Foundations, D1, S3 |
| Info chip | haze / data / neutral | V1 |
| Map layer segmented control | selected = Ink fill + Paper text | V1, D1, S1, S3 |
| Language choice row | selected (Ink, `✓`) / unselected | V0, V7a |
| Live pill `● LIVE` | — | S1, S2, V6 |
| Live session chip | Connecting… / LIVE / Reconnecting… / Connection lost | V3 states |
| Responder avatar | merged (Data) / merge pending (Haze) | S1, V6 |
| Sidebar nav item | selected / default | desktop |

### 3.5 Exported brand SVGs and app icons

Exported from the Figma components (vectors, text outlined). Raster icons are rendered from those vectors, because the App icon component is 180 × 180 (the Brand kit's "master 1024 × 1024" is not a separate node).

| File | Source node | Size / format |
|---|---|---|
| `public/brand/ember-emblem.svg` | `49:7` Brand/Emblem | 64 × 64 SVG |
| `public/brand/ember-lockup.svg` | `49:8` Brand/Lockup (Ink on Paper) | 129 × 32 SVG |
| `public/brand/ember-lockup-on-night.svg` | `49:51` Lockup · Paper on Night | 205 × 52 SVG |
| `public/icons/app-icon.svg` | `49:14` Brand/App icon | 180 × 180 SVG |
| `public/icons/icon-1024.png`, `icon-512.png`, `icon-192.png` | from `49:14` | PNG RGBA |
| `public/icons/apple-touch-icon-180.png` | from `49:14` | PNG RGBA |
| `public/icons/push-badge.svg`, `push-badge-96.png` | `49:23` Brand/Push icon (mono) | 96 × 96 |
| `public/favicon.svg`, `favicon-32.png`, `favicon-16.png` | `49:25` Brand/Favicon | 32 / 16 |

Asset findings (Needs decision, not fixed here):
- **Push badge is not pure white.** The outline is white, but the flame is `#D9D9D9`. Android uses only the alpha channel for badges, so it renders correctly there, but the Brand kit says "white on transparent".
- **App icon has rounded corners baked in** (rx 40, transparent corners). That works for `apple-touch-icon` and `purpose: "any"`, but no **maskable** icon with full-bleed safe zone exists. This is part of the Android install gap.
- `public/` is a suggested location; move to the PWA's actual static folder.
- Google "G" on D-L is a text glyph; use Google's official sign-in asset, do not export it.
- All other icons on screens are text glyphs (`✓ ○ ‹ › → ↖ ↻ ● ×`). Keep or replace with an icon set: Needs decision.

### 3.6 Accessibility (WCAG 2.1 AA, computed)

| Pair | Ratio | Result |
|---|---|---|
| White on Ember button (16 Semi Bold) | 3.83 | **Fails** |
| Ember text on Paper (12 px labels) | 3.58 | **Fails** |
| Haze text on Paper / tint (11–12 px) | 3.41 / 3.22 | **Fails** |
| Safe on safe tint / Data on data tint (12 px) | 4.35 / 4.27 | **Fail** |
| `#8E877D` on white | 3.55 | **Fails** |
| Muted `#6B645C` on Paper / white | 5.45 / 5.83 | Pass |
| White on Danger / on `#B91C1C` | 5.74 / 6.47 | Pass |
| Danger `#C81E1E` on white (V8 error text, 13 Medium) | 5.74 | Pass |
| Ink on white / Paper on Ink (V8 chips) | 17.49 / 16.37 | Pass |

Fixing the failures changes brand colours: **Needs decision.**

### 3.7 Responsive

Each screen exists at one size only: mobile 390 × 844, desktop 1440 × 900. `V3 · Live connection states` (390 × 293) and `V8` (390 × 1171) are state sheets, not viewports. No breakpoints are designed. Mobile: content scrolls, actions pinned bottom *(inferred)*. Desktop: fixed 248 sidebar + fluid main *(inferred)*.

---

## 4. Issue #6 — Google sign-in and role-based routes

### D-L · Login — Supervisor Console — `54:32`
- **URL:** https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=54-32
- **Workstream / issue:** [ui] · #6 · **Viewport:** 1440 × 900
- **Copy:** `SUPERVISOR CONSOLE · BPBD` · `One safety agent for communities at both ends of the smoke.` · `The AI advises; people decide.` · `Sign in` · `Supervisor Console · BPBD` · `Sign in with Google` · `or` · `Work email` · `name@agency.go.id` · `Continue with email` · `Access for invited BPBD supervisors only.` · page title `EMBER · Supervisor Console`
- **Components:** Lockup (Paper on Night), Google button, "or" divider, text field, primary button.
- **Interaction *(inferred)*:** Google → OAuth → `D-LD` → `S1` or `D-E`. Email path: Needs decision.
- **States:** loading, OAuth error/cancel, not-invited / wrong role, offline — **missing**.
- **Visual:** left Night panel, tagline 36 Bold Paper; right Paper, title 28 Bold, buttons radius 12, labels 15 Semi Bold.
- **A11y:** Ember button fails contrast; input needs a programmatic label.
- **Explicit gaps (do not invent screens):** **volunteer Google sign-in** and **wrong-role routing**. Volunteers currently join by invite code (`V0`). Email sign-in on D-L conflicts with "Google sign-in": Needs decision.

---

## 5. Issue #16 — Volunteer report screen

### 5.1 Acceptance-criteria coverage

| Required state | Frame(s) | Status |
|---|---|---|
| Push-to-talk | `V3` `5:2` (live coach), `V6` `10:4` ("Hold to talk") | ⚠️ V3 has no hold-to-talk control; it shows open-mic "Listening — ask anything". The PTT button exists only on V6. Needs decision: is V3's open mic the PTT state? |
| Camera state | `V3` (full camera, "You are the live camera"), `V6` (photo mode) | ✅ live and photo modes. ❌ camera permission denied |
| Report chips | `V8` `107:70` (#17) | ✅ controls designed. ⚠️ Where the chips sit on the report screen is not designed |
| Current task | `V1` `4:2` (new task), `V6` (approved task) | ✅ |
| Full-screen WITHDRAW | `V4` `5:47` | ✅ |
| Permission-denied states | none | ❌ **P0 gap.** No denied state for camera, microphone, location or notifications on any volunteer frame |

Supporting frames: V2 (Gemini result), V-L, V-E, V3 connection states.

### V1 · Verify hotspot — new task — `4:2`
- **URL:** https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=4-2
- **Workstream / issue:** [pwa] · #16 current task · **Viewport:** 390 × 844
- **Copy:** `EMBER` · `Group 3 · Sungai Tohor` · `NEW TASK · VIA PUSH NOTIFICATION · 14:02` · `Verify hotspot` · map `Peat field`, `Village`, `Hotspot · 2.1 km NE`, `You`, `Wind from SE ↖` · layers `Hotspots`, `Burn scars`, `Vegetation/peat` · `Hotspot 2.1 km NE` · `NASA FIRMS (VIIRS) · satellite pass 11:40 · pulled 14:00` · `Peat zone` · `Wind SE 12 km/h` · `~25 min walk` · `Wind · Source: Open-Meteo` · `Check from a safe distance. Approach from upwind (south-east).` · `Confirm fire + photo` · `Not a fire`
- **Components:** Lockup, team chip, illustrative map with dashed route, layer control, detail card (white r18 p16/20), info chips, safe tip box, primary + secondary buttons.
- **Interaction *(inferred)*:** Confirm → camera → V1a. Not a fire → dismiss (no confirm/reason screen).
- **States:** loading V-L ✅ · empty V-E ✅ · error ❌ · location denied ❌ · offline ❌ (#21) · task taken by someone else ❌ · WITHDRAW: no on-screen control (V4 interrupts) ⚠️
- **A11y:** Ember and Haze 12 px labels fail contrast; map needs a text equivalent (the card provides distance/direction).

### V2 · Photo check — Gemini result — `4:53`
- **URL:** https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=4-53
- **Copy:** `‹` · `Hotspot 2.1 km NE` · `Photo · 14:41 · 180 m from hotspot` · `Gemini check` · `High confidence` · `Likely smouldering peat` · `✓ Low white smoke, no open flame` · `✓ Charred ground at the edge of the clearing` · `✓ Photo location matches the hotspot (180 m)` · `Gemini suggests. You make the call.` · `Confirm fire` · `Dismiss — not a fire`
- **States:** low/medium confidence, "not a fire" result, Gemini error — **missing**.

### V3 · Live guidance — Gemini Live coach — `5:2`
- **URL:** https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=5-2
- **Workstream / issue:** [pwa] · #16 push-to-talk / live-coach / camera state · **Viewport:** 390 × 844
- **Purpose:** The volunteer holding the single live-video seat; Gemini Live coaches by voice.
- **Copy:** `School` · `● LIVE · Field coach` · `EN` · `End` · `Wind SE 12 km/h · Source: Open-Meteo` · `Hotspot 180 m N` · `Smoke: moderate` · `Bu Maya · BPBD watching` · `You are the live camera` · `EMBER · SPEAKING` · `“The fire is spreading toward the school. Protect the north side first. Keep everyone upwind.”` · `  Listening — ask anything` · `Withdraw now` · `Safety Guard on · withdrawal rules can’t be overridden`
- **Components:** `Brand/Emblem`; full-bleed camera (placeholder); session chip (see V3 states); `EN` language chip; `End` pill; context chips (data, ember, haze, safe); bottom sheet Night 82%; "EMBER · SPEAKING" label `#F59E6B`; caption 22 Semi Bold white; listening line with caret vector (`54:519`); Danger "Withdraw now" button.
- **Interaction *(inferred)*:** `End` ends the live session; `EN` opens language (V7a); Withdraw now → V4 for this responder (Needs decision: does a manual withdraw also notify the group?).
- **States:** connection states ✅ (`56:261`) · mic/camera denied ❌ · live seat moved to another responder ("Make live" on S1) ❌ · WITHDRAW ✅ button + V4.
- **A11y:** caption must be live text (`aria-live`), not only audio; `#F59E6B` label on Night 82% unverified for contrast.
- **Discrepancy:** see PTT row in §5.1.

### V3 · Live connection states — `56:261`
- **URL:** https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=56-261
- **Workstream / issue:** [pwa] · #16 (part of the V3 state) · **Size:** 390 × 293 state sheet
- **Copy:** `SHOWN IN THE V3 SESSION BAR` · `● Connecting…` `Opening the voice coach.` · `● LIVE · Field coach` `Coach is listening and speaking.` · `● Reconnecting…` `Signal dropped. Trying again automatically.` · `● Connection lost` `Try again` `Could not reconnect. Withdraw still works.`
- **Visual:** Night `#141210` sheet radius 24; dots Haze (connecting, reconnecting), white (live), Danger (lost); labels 12 Semi Bold; helper 12 Regular Paper 70%.
- **Behaviour:** Withdraw stays available in every connection state (copy is binding). Retry count/back-off: Needs decision.

### V4 · Safety Guard — withdraw upwind — `5:47`
- **URL:** https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=5-47
- **Workstream / issue:** [pwa] · #16 full-screen WITHDRAW · **Viewport:** 390 × 844
- **Copy:** `SAFETY GUARD · FIXED RULE` · `PUSH NOTIFICATION · 15:12` · `→` · `WITHDRAW NOW` · `Withdraw upwind. Do not engage. Head east, 200 m to the road.` · `WHY` · `• Wind shifted — now blowing from the east, toward you` · `• Fixed rule: sent to all 3 responders at once, no approval needed` · `Bu Maya (BPBD) has been alerted. Repeated aloud every 10 s until you confirm. The AI cannot change this instruction.` · `I'm safe — tell my group`
- **Visual:** full-bleed `#B91C1C` (conflict with Danger token); arrow 80 Bold; title 40 Bold white; instruction 20 Medium `#FFE4E4`; WHY 11 Semi Bold `#FFD0D0`; reasons 15 Regular white; inverse button white, label `#B91C1C`, radius 14.
- **Behaviour (from copy):** overrides every other screen including V1a upload and V8 report; repeats aloud every 10 s until confirmed; not editable by the AI. Arrow direction must be computed: Needs decision.
- **A11y:** `role="alertdialog"`, focus on the confirm button, vibration.

### V6 · Approved instruction — photo mode + push-to-talk (Sari) — `10:4`
- **URL:** https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=10-4
- **Workstream / issue:** [pwa] · #16 approved-task state (and PTT, photo-mode camera) · **Viewport:** 390 × 844
- **Copy:** `Incident · peat field` · `● LIVE` · `APPROVED BY BU MAYA · BPBD` · `“Ibu Sari, wet the ground along the west ditch.”` · `●` · `Photo mode · a photo goes to Bu Maya every 15 s · last 14:58. Pak Dedi has the live video.` · `School` · `Marked by responders` · `EMBER suggests · tap to confirm` · `D` `S` `R` · `Wind SE 12 km/h · Source: Open-Meteo` · `TEAM PLAN` · `Dedi` `Hold the north line by the school` · `Rizal` `Keep the east road clear · water truck in 20 min` · `Hold to talk` · `Mark fire edge` · `Withdraw`
- **Components:** Emblem, live pill, instruction card (Night) with safe "approved" chip, photo-mode strip (data tint), mini map with responder avatars and markers (solid = responder, dashed = EMBER suggestion), team plan list, Ink "Hold to talk" button, secondary "Mark fire edge", Danger "Withdraw".
- **Interaction *(inferred)*:** Hold to talk = press-and-hold; Mark fire edge → marker placement (not designed); dashed marker tap → confirm.
- **States:** mic denied ❌ · photo upload failing in photo mode ❌ · WITHDRAW ✅.
- **Needs decision:** the 15 s photo interval was flagged earlier as invented.

### V-L · Loading — `56:46` and V-E · Empty — no tasks — `56:71`
- **URLs:** https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=56-46 · https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=56-71
- **Copy V-L:** `Group 3 · Sungai Tohor` · `Loading your tasks…` · `Checking for hotspots near you`
- **Copy V-E:** `Group 3 · Sungai Tohor` · `No tasks right now` · `You’ll get a push notification when a hotspot near you needs checking.` · `Push notifications on`
- **Gaps:** V-E variant for push denied ❌; no entry point to a report from the empty state (if #16 requires one).

---

## 6. Issue #17 — Chip and text controls

### V8 · Report chips + text report — send, validation error, sent — `107:70` (new in revision 2)
- **URL:** https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=107-70
- **Location:** page `02 · Volunteer app`, new section `5 · Report chips (#17)` (`107:67`), right of Settings.
- **Workstream / issue:** [pwa] · #17 (consumed by #16) · **Size:** 390 × 1171 state sheet (three states stacked; not a single viewport)
- **Purpose:** The four required report chips (`asap`, `api`, `aman`, `butuh bantuan`) plus an optional text report, with send, validation-error and sent states. Built only from existing tokens and patterns: status bar and app bar are cloned from V1a; chip selection reuses the Ink-fill + `✓` pattern from V0/V7a; button, card and sent message follow V1a/V1b.
- **Copy (exact):**
  - App bar: `‹` · `Incident · peat field`
  - State 1: `STATE 1 · READY TO SEND` · `QUICK REPORT` · `asap` · `api ✓` · `aman` · `butuh bantuan` · `NOTE (OPTIONAL)` · `Past the west ditch.` · `Send report`
  - State 2: `STATE 2 · VALIDATION ERROR — NO CHIP CHOSEN` · `QUICK REPORT` · `asap` · `api` · `aman` · `butuh bantuan` · `Choose one: asap, api, aman or butuh bantuan.` · `NOTE (OPTIONAL)` · `Add a short note` (placeholder) · `Send report`
  - State 3: `STATE 3 · SENT` · `QUICK REPORT` · `asap` · `api ✓` · `aman` · `butuh bantuan` · `NOTE (OPTIONAL)` · `Past the west ditch.` · `Report sent ✓` · `14:58 · Your supervisor can see it now.`
  - `STATE n · …` tags are annotations; do not build them.
  - New copy (labels, placeholder, error, sent message) is **draft and needs team review**, including Bahasa versions. Chip labels are from the acceptance criteria.
- **Components and variants (build as one `ReportChip` + one `TextField` in [ui]):**
  - `ReportChip` · unselected: white fill, 1.5 border `#E7E1D8`, label 15 Medium Ink · selected: Ink `#1C1917` fill, no border, label 15 Semi Bold Paper with trailing ` ✓` · error: white fill, 1.5 border Danger `#C81E1E`, label 15 Medium Ink. Radius 999, padding 13/16, height 47. Wrap row, gap 8 horizontal and vertical.
  - `TextField` · empty: placeholder 15 Regular `#6B645C` · filled: 15 Regular Ink. White, 1.5 border `#E7E1D8`, radius 12, padding 14/16. Single line shown; multi-line growth Needs decision.
  - Section label: 11 Semi Bold `#6B645C`, caps, tracking 6%.
  - Error message: 13 Medium Danger, directly under the chip row.
  - Primary button: Ember, height 54, radius 14, label 16 Semi Bold white.
  - Sent message: Safe tint `#E3F2E8`, radius 12, padding 14/16, gap 4; title 18 Semi Bold Safe; detail 13 Regular Ink. Replaces the button.
  - Card: white, radius 18, padding 16, gap 12. Body padding 8/20/24/20, gap 14.
- **Interaction (as drawn):** tap a chip to select (one shown selected); "Send report" with no chip → State 2; with a chip → State 3. The note is optional.
- **Assumptions in this frame (cheap to reverse; Needs decision):** chips are **single-select**; **a chip is required**, so a note-only report is a validation error; the sent state keeps chips and note visible and read-only.
- **States not in this frame:** sending/in-progress ❌ · send failed (network) ❌ · offline → queued in outbox ❌ (#21 gap) · note max length ❌ · focus/disabled styles ❌ · WITHDRAW mid-report → V4 overrides.
- **Placement:** where this block appears in the #16 flow (inline on V6, a sheet from V3, or a separate screen) is **not designed**. Needs decision.
- **A11y:** chips as a `radiogroup` with `aria-checked` (if single-select); error text `role="alert"` and linked with `aria-describedby`; the field needs a programmatic label ("Note (optional)"); chip height 47 meets the 44 px target; `✓` is decorative (selection must be announced by state, not the glyph); Ember button fails contrast (§3.6).
- **Discrepancies vs #17 AC:** none in controls. Open: single vs multi-select and chip language under the English UI setting.

Foundations (`8:24`) is no longer mapped to #17; it stays a shared reference (§3).

---

## 7. Issue #18 — Supervisor decision screen

### S1 · Supervisor console — live incident — `12:2`
- **URL:** https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=12-2
- **Workstream / issue:** [supervisor-console] · #18 · **Viewport:** 1440 × 900
- **Copy:**
  - Sidebar: `EMBER` · `Live incident` · `Regional view` · `Hotspot queue` · `Sites & re-ignition` · `Volunteers` · `Exposure corridor` · `Haze shield` · `ON DUTY` · `Bu Maya · Supervisor` · `BPBD Kepulauan Meranti`
  - Header: `Peat field behind SD Sungai Tohor` · `INC-0929-03 · opened 14:31 by Pak Dedi · 3 responders · live video: Pak Dedi` · `● LIVE` · `Safety Guard on`
  - Map: `Wind SE 12 km/h ↖ · Source: Open-Meteo` · `School · protect` · `West ditch` · `East road` · `FIRMS hotspot · pass 11:40` · `D` `S` `R` · `Fire edge · marked by responder` · `Fire edge · EMBER suggests, unconfirmed` · `Responder · merged` · `Responder · merge pending` · `Hotspots` `Burn scars` `Vegetation/peat`
  - Cameras: `Pak Dedi · north` `● LIVE VIDEO` `Merged` · `Ibu Sari · west` `Photo · 12 s ago` `Merged` `Make live` · `Rizal · east road` `Photo · 20 s ago` `Same fire?` `Make live`
  - Merge card: `EMBER IS NOT SURE` · `Is Rizal’s report the same fire as Pak Dedi’s?` · `Matched on: 420 m apart · reported 6 min apart · Rizal’s photos and Pak Dedi’s video show one smoke column. EMBER can’t judge distance from images, so it’s asking you.` · `Same fire — merge` · `Separate incident`
  - Suggestion: `EMBER suggests` · `From Sari’s photos` · `Fire has crossed the west ditch. Move Sari to the west ditch. Pak Dedi holds the north line by the school.` · `Approve` · `Edit` · `Override`
  - Transcript: `Live transcript` · `English` · `Dedi · 14:52` `The smoke is turning grey-white.` · `EMBER → Dedi` `Protect the north side first.` · `Sari · 14:55` `It’s past the ditch here.`
  - Footer: `Hold to talk to the team`
- **Interaction *(inferred)*:** merge → responder marked merged; Approve → V6 on responder phones; Make live → moves the single video seat; Hold to talk = PTT.
- **States:** loading D-LD ✅ · empty D-E ✅ · conflict "Same fire?" ✅ · WITHDRAW S2 ✅ · error, non-supervisor, offline, concurrent supervisors ❌
- **Explicit gaps (do not invent screens):** **Edit**, **Override**, and the **Separate incident** result.
- **A11y:** haze-on-tint text fails; transcript `aria-live`; PTT needs a keyboard equivalent.

### S2 · Supervisor console — wind shift, withdraw sent — `13:2`
- **URL:** https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=13-2
- **Copy (deltas vs S1):** subtitle `… · Rizal merged by Bu Maya 14:57` · `SAFETY RULE · SENT TO ALL 3 PHONES · 15:12 · NO APPROVAL NEEDED` · `The wind has shifted. Withdraw upwind. Do not engage.` · `Send team back in` · `Wind shifted · from E 18 km/h · Source: Open-Meteo` · `Withdrawing →` ×3 · Rizal `Merged` · `Plan approved 15:01` · `Edited by Bu Maya` · `Dedi` `Hold the north line by the school` · `Sari` `Wet the ground along the west ditch` · `Rizal` `Keep the east road clear · water truck coming` · `Paused while the team withdraws.` · transcript `EMBER → all · 15:12 · safety rule` `The wind has shifted. Withdraw upwind.`
- **Needs decision:** who may "Send team back in", confirmation, and whether the Safety Guard blocks it. Per-responder acknowledgement is not shown.

### D-LD · Loading — `54:265` · D-E · Empty — no live incidents — `54:91`
- **URLs:** https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=54-265 · https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=54-91
- **Copy D-LD:** `Loading live incident…` · `Map, responders and transcript`
- **Copy D-E:** `Live incident` · `Kepulauan Meranti · 15:40` · `No live incidents` · `When a volunteer confirms a fire, the incident opens here with live video, the transcript and EMBER’s suggested plan.` · `5 hotspots waiting for a check` · `Open hotspot queue` · `Regional view`

---

## 8. Issue #19 — Installable volunteer PWA

### V0 · Join — invite code, install, permissions — `19:10`
- **URL:** https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=19-10
- **Copy:** `Join your team` · `Join your village team. Your coordinator gave you an invite code.` · `APP & COACH LANGUAGE` · `English ✓` · `Bahasa Indonesia` · `TOHOR-3 · 4821` · `ON IPHONE: ADD TO HOME SCREEN` · `Withdraw alerts can only reach an iPhone when EMBER is installed. Share → Add to Home Screen, then open it from there.` · `EMBER NEEDS` · `✓ Notifications` `Withdraw alerts and tasks` · `✓ Location` `So the team knows where you are` · `✓ Camera` `Photos and live video at a fire` · `○ Microphone` `Talk to EMBER and your team` · `Allow microphone & join`
- **Behaviour *(inferred)*:** CTA names the next ungranted permission.
- **Gaps:** invalid/expired code, any permission denied, offline at join ❌. **Explicit gap: Android install flow** (no `beforeinstallprompt` UI, no installed confirmation, no maskable icon).

### V-S · Splash — `56:31`
- **URL:** https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=56-31
- **Copy:** `EMBER` · `One safety agent for communities at both ends of the smoke.`
- **Manifest:** `background_color: #141210`; `theme_color` Needs decision.

### V-N · Push notification — `56:96`
- **URL:** https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=56-96
- **Payload copy:** `EMBER · New hotspot to verify` · `Hotspot 1.2 km from you. Satellite pass 11:40 · pulled 14:00.` · actions `Open task`, `Later`. Badge: `public/icons/push-badge-96.png`.
- **Notes:** 1.2 km here vs 2.1 km on V1 (illustrative, keep consistent). Notification actions on iOS web push: Needs decision. Withdraw push payload is not designed.

### Brand kit — `49:30`
- **URL:** https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=49-30
- Source of §3.5 exports.

---

## 9. Issue #20 — Photo-upload action

Shared copy: `‹` · `Hotspot 2.1 km NE` · `Photo · 14:41 · 180 m from hotspot` · `PHOTO UPLOAD`. Layout: photo preview r18, status card white r18 p16 gap 12, progress bar (track `#E7E1D8`, fill Ember, r4, height 8), two buttons.

- **V1a · Upload — uploading — `56:122`** · https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=56-122 · `Uploading photo… 62%` · `Keep EMBER open. Gemini checks the photo once it is uploaded.` · `Waiting for upload…` (disabled) · `Cancel`
- **V1b · Upload — uploaded — `56:168`** · https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=56-168 · `Uploaded ✓` · `Gemini is checking your photo now.` · `See Gemini check` · `Retake photo`
- **V1c · Upload — failed — `56:214`** · https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=56-214 · `Upload failed — check signal` · `Move to a spot with better signal, then retry. Your photo is kept on this screen.` · `Retry` · `Retake photo`
- **A11y:** `role="progressbar"` with value; real `disabled` on the waiting button.
- **Gaps:** camera denied, size/type error, Gemini failure after upload ❌.
- **Conflict with #21:** V1c says the photo is kept "on this screen", which contradicts an outbox. The issue wins; V1c copy will need to change when #21 is designed.

---

## 10. Issue #21 — Offline report outbox

**Explicit gap. No frame exists and none was added.** There is no outbox list, queued indicator, offline banner, sync state or retry state. Build to the issue AC only, using §3 tokens.

---

## 11. Issue #22 — Incident locations

### S3 · Regional view — `14:58`
- **URL:** https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=14-58
- **Copy:** `Riau · regional view` · `All districts · incidents, hotspots, watched sites and responders · 15:40` · `Illustrative data` · `10` `Live incidents` · `31` `Hotspots not yet checked` · `14` `Dismissed today` · `47` `Sites on re-ignition watch` · `86` `Responders in the field` · `SINGAPORE` · `INC-0929-03 · out · watching` · legend `Live incident`, `Hotspot · not yet checked`, `Re-ignition watch`, `Responder`, `Smoke corridor · not a forecast` · `Live incidents` `Most responders first` · `Tebing Tinggi barat` `5 responders · 2 cameras · open transcript` `Withdrawn` · `Rangsang, kebun sagu` `3 responders · plan approved · open transcript` `Active` · `Merbau, tepi kanal` `2 responders · merge pending · open transcript` `Same fire?` · `Pulau Padang` `1 responder · just opened · open transcript` `Active` · `Smoke corridor → Singapore` · `Built from all live incidents and wind (Source: Open-Meteo). Exposure, not a forecast. Opens the corridor view with the back-test.` · `Open exposure corridor`
- **Explicit gap:** "Open exposure corridor" leads to the **exposure-corridor result screen (D2), which is excluded**. Hide the button or ship without a destination: Needs decision.
- **Gaps:** no coordinates/address/open-in-Maps; marker popovers, clustering, loading/empty/error ❌. "Illustrative data" chip must not ship.

### D1 · Hotspot queue — `6:2`
- **URL:** https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=6-2
- **Copy:** `Hotspot queue` · `Satellite detections become tasks for the nearest volunteer group.` · `Satellite pull 14:00 · hourly` · `5 open tasks` · `5` `Open hotspots` · `1` `Confirmed fire` · `3` `Dismissed today (false alarms)` · `38 min` `Median time to verify` · villages `Sungai Tohor`, `Tanjung Sari`, `Kayu Ara` · `H-2071` `En route` `2.1 km NE of Sungai Tohor` `Rizal · 14:22` · `H-2068` `Confirmed fire` `Tanjung Sari peat block` `Group 3 · 13:51` · `H-2066` `Dismissed · trash fire` `Kayu Ara, plantation edge` `Siti · 13:10` · `H-2063` `Re-check` `300 m from site S-14 (put out 3 Oct)` `Unassigned` · `H-2061` `Awaiting volunteer` `West of Kayu Ara` `Unassigned · 12:58` · sidebar footer `REGION` `Kepulauan Meranti, Riau` `Supervisor · Bu Maya (BPBD)`
- **Notes:** hotspots, not incidents; sidebar footer differs from other desktop frames; no assign control.

---

## 12. Approved frames with no issue in #6–#22

- **V5 · Re-ignition watch — re-check task — `5:66`** · https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=5-66 · `Group 3 · Sungai Tohor` · `RE-CHECK · VIA PUSH NOTIFICATION · 09:12` · `Possible re-ignition` · `Put out · yesterday` · `New · 300 m` · `New satellite detection 300 m from the site your team put out yesterday.` · `Peat can keep smouldering underground and flare up again.` · `Yesterday · 14:31` `Fire reported · Dedi, Sari, Rizal` · `Yesterday · 18:50` `Marked out by Bu Maya` · `Today · 09:12` `New detection, 300 m · sent to you by Bu Maya` · `Accept re-check` · `Pass to another volunteer`
- **V7 · Settings & profile — `56:287`** · https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=56-287 · `Settings & profile` · `Pak Dedi` · `Team TOHOR-3 · Sungai Tohor` · `Volunteer` · `APP` · `Language` `App and coach language` `English` · `Notifications` `New tasks and withdraw alerts` `Push on` · `Location` `So the team knows where you are` `Allowed` · `Camera & microphone` `Photos, live video, talk to EMBER` `Allowed` · `About EMBER` `Version, privacy and help` · `EMBER volunteer app · installed`. No sign-out row (relevant to #6).
- **V7a · Settings — language picker — `56:341`** · https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=56-341 · sheet: `App & coach language` · `EMBER shows text and speaks in this language.` · `English ✓` · `Bahasa Indonesia` · `Done`

---

## 13. Missing or unresolved states

✅ designed · ⚠️ partial · ❌ missing · — n/a

| Flow | Loading | Empty | Error | Permission denied | Offline | Conflict | Task | WITHDRAW |
|---|---|---|---|---|---|---|---|---|
| #6 D-L | ❌ | — | ❌ | ❌ not invited / wrong role | ❌ | — | — | — |
| #6 volunteer Google sign-in, wrong-role routing | **explicit gap** | | | | | | | |
| #16 V1 current task | ✅ V-L | ✅ V-E | ❌ | ❌ location | ❌ | ❌ task taken | ✅ | ⚠️ via V4 only |
| #16 V2 Gemini result | ⚠️ | — | ❌ | — | ❌ | ❌ low confidence | — | ⚠️ via V4 |
| #16 V3 live / PTT / camera | ✅ Connecting | — | ✅ Connection lost | ❌ mic, camera | ✅ Reconnecting | ❌ seat moved | — | ✅ |
| #16 V6 approved task | — | — | ❌ photo-mode failure | ❌ mic | ❌ | — | ✅ | ✅ |
| #16 V4 withdraw | — | — | — | — | ❌ offline delivery | — | — | ✅ |
| #16 permission-denied (any) | | | | **❌ P0 gap** | | | | |
| #17 V8 chips + text | ❌ sending | ✅ empty field | ✅ validation / ❌ network | — | ❌ (→ #21) | — | — | ⚠️ V4 overrides |
| #18 S1/S2 | ✅ D-LD | ✅ D-E | ❌ | ❌ | ❌ | ✅ Same fire? / ❌ concurrent | — | ✅ S2 |
| #18 Edit, Override, Separate incident | **explicit gap** | | | | | | | |
| #19 V0 join | ❌ | — | ❌ code | ❌ any permission | ❌ | — | — | — |
| #19 Android install | **explicit gap** | | | | | | | |
| #20 upload | ✅ V1a | — | ✅ V1c / ❌ type, Gemini | ❌ camera | ⚠️ V1c | — | — | ❌ during upload |
| #21 outbox | **explicit gap** | | | | | | | |
| #22 S3 / D1 | ❌ | ❌ | ❌ | — | ❌ | — | — | ✅ "Withdrawn" chip |
| Haze shield, Twilio, exposure-corridor result | **explicit gap** (excluded, §1) | | | | | | | |

## 14. Conflicts and Needs decision

**Explicit gaps (left undesigned on purpose):**
1. Volunteer Google sign-in and wrong-role routing (#6)
2. Supervisor Edit, Override and Separate-incident flows (#18)
3. Offline report outbox (#21)
4. Android install flow, including maskable icon (#19)
5. Haze shield, Twilio, and the exposure-corridor result screen (excluded frames H1–H3, D2)

**P0 for #16:** permission-denied states do not exist for camera, microphone, location or notifications.

**Needs decision:**
6. Approval list (§1)
7. #6 email sign-in on D-L vs Google sign-in
8. #16 PTT: V3 shows open mic, not hold-to-talk; PTT control is on V6
9. #16 placement of the V8 report block in the flow
10. #17 single vs multi-select; chip required vs note-only report; chip language when UI is English; note max length; sending/failed states
11. #18 "Send team back in" permissions and Safety Guard interaction
12. #20 vs #21: V1c "kept on this screen" copy vs outbox
13. #22 location detail; D1 shows hotspots; "Illustrative data" chip; "Open exposure corridor" with no destination
14. Tokens: undocumented colours, `#B91C1C` vs Danger, off-ramp type sizes
15. Contrast failures (§3.6)
16. Push badge flame `#D9D9D9` vs "white"
17. Glyph icons vs icon set; responsive breakpoints; sidebar footer inconsistency
18. `none-` frames (V5, V7, V7a, Foundations) have no issue

## 15. Exports

- **Brand SVGs and app icons:** exported (§3.5) under `public/`.
- **Frame PNGs:** `docs/design/export_ember_frames.py` writes all 27 to the §2 paths. Run from the repo root with `FIGMA_TOKEN` in the environment (2× default, `SCALE=1` for 1×). No token is stored in the repo.

## 16. Changes in revision 2

- #16 remapped against its acceptance criteria: V3 (`5:2`), V3 connection states (`56:261`), V4 (`5:47`) and V6 (`10:4`) moved from `none-` to `16-`. Added the #16 coverage table (§5.1) with permission-denied as a P0 gap and the V3 push-to-talk discrepancy.
- #17 no longer maps to Foundations. New Figma frame `V8` (`107:70`, section `107:67`) adds the four report chips, optional text field, and send / validation-error / sent states. Foundations is now `none-foundations.png`, a shared reference.
- Brand SVGs and app icons exported; push-badge colour and missing maskable icon flagged.
- Export script moved to `docs/design/`, paths updated, 27 frames.
- Gaps the team named are recorded as explicit gaps, not screens (§14).

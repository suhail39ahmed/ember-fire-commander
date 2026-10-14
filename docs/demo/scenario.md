# EMBER demo scenario: "Two volunteers, one fire" (SYNTHETIC)

> **Every person, report, photo, position and number here is SYNTHETIC.** The people are fictional composites. No real volunteer, NGO or agency is involved or endorses EMBER. Map guidance (incident ring, staging point, "upwind") is **indicative**. Satellite items are **thermal anomalies (leads)**, never "fires", until a human verifies them.
> The exact inputs are also in [`scenario-data.json`](scenario-data.json). Bahasa lines need a native speaker's review before recording.

State names, fields and routes follow [`docs/contracts/shared-contract.md`](../contracts/shared-contract.md). If the contract changes, the contract wins and this script is updated to match.

## Cast and setup

| Who | Role claim | User id | Device | Label shown on screen |
|---|---|---|---|---|
| **Pak Dedi** | `volunteer` | `uid_dedi` | Phone 1 (PWA at `/pwa`) | "Pak Dedi · SIMULATED" |
| **Ibu Sari** | `volunteer` | `uid_sari` | Phone 2 (PWA at `/pwa`) | "Ibu Sari · SIMULATED" |
| **Ibu Rahma** | `supervisor` | `uid_rahma` | Laptop (console at `/console`) | "Supervisor · SIMULATED" |

**Before you start**
1. Each demo account signs in with Google and has its `role` custom claim set. Sign out and in again after setting a claim.
2. No incidents exist. Both phones show an empty task list (`GET /digest` returns `myTasks: []`).
3. The console map is centred on the demo area, with the SIMULATED banner visible.

## Rules the script relies on (decided by code, not the model)
- The model **never sets incident severity**. Chip reports map to severity on the server (`asap` → `smoke`, `api` → `small_flame`, `aman` → `none`, `butuh_bantuan` → `unknown`). Agents compute incident severity and may only raise it. Only a supervisor can lower it.
- Disagreement opens a **conflict** that keeps both observations side by side and is **never averaged**. The incident becomes `held` and `dispatchHeld` is `true`: approving an `investigate` task returns `409 conflict` while the conflict is open.
- A `large_flame` observation, or the agents high-wind rule, makes code issue **WITHDRAW immediately**: `incident.withdraw`, one `withdraw` task per volunteer with `status: approved`, and a `task.withdraw` audit record with `actorId: code`. There is no approval step.
- Dispatch (an `investigate` task) always needs the supervisor's approval. EMBER does not send agency reports.

## Script

Each step gives the input to say or tap, then the expected state and screens. **Voice path:** say the Bahasa line with push-to-talk held; the model calls `submit_observation` and `voice-gateway` writes a `live` observation using the phone's last `location` message. **Chip/text path:** tap the chip or type the text; the PWA sends `POST /observations`. Both paths should give the same incident state, except where step 7 notes otherwise.

### Step 1: Satellite lead (optional, outside the contract)
- Hotspot leads come from the ingest work (contract §10). If it has landed, the console shows a grey marker "satellite lead · needs verification". If not, skip this step. Nothing below depends on it.

### Step 2: Pak Dedi reports a small flame
- **Voice (Dedi):** "Komandan, ada asap putih dari parit di belakang kebun. Sepertinya ada api kecil." *(Commander, there's white smoke from the ditch behind the garden. Looks like a small flame.)*
- **Chip/text fallback:** chip **`api`**.
- **Expected state:** an immutable observation with severity `small_flame`. Agents create `inc_demo_01`: `status: open`, `severity: small_flame`.
- **Console:** a ring for `inc_demo_01`. The drawer shows Dedi's report (with the Bahasa transcript on the voice path).
- **Dedi's phone:** acknowledgement. No numbers unless they come from a tool.

### Step 3: Ibu Sari reports smoke, no flame (the disagreement)
- **Voice (Sari):** "Saya lihat asap saja, tidak ada api." *(I only see smoke, no flame.)*
- **Chip/text fallback:** chip **`asap`**.
- **Expected state:** observation severity `smoke`, clustered into `inc_demo_01`. Conflict `con_demo_01` opens: `status: open`, `higherSeverity: small_flame`, `dispatchHeld: true`. The incident becomes `held` and stays `small_flame`. Agents create a proposed `verify` task for Dedi and one for Sari.
- **Console:** amber conflict badge, both observations side by side, "dispatch held".

### Step 4: Supervisor approves the verify tasks
- **Input (Rahma):** approve both verify tasks (`POST /tasks/{id}/approve`). Verify tasks can be approved while the conflict is open.
- **Expected state:** both tasks `approved`. Two `task.approve` audit records.
- **Both phones:** the verify card from `myTasks`: "Foto lebih lebar ke arah tanah. Jaga jarak aman. Katakan apakah api terlihat." *(Take a wider photo towards the ground. Keep a safe distance. Say whether you can see flame.)*

### Step 5: Pak Dedi re-checks
- **Voice (Dedi):** "Sudah saya foto lebih lebar. Api kecil di tanah gambut, sekitar satu meter." *(I took a wider photo. Small flame on the peat, about one metre.)*
- **Chip/text fallback:** chip **`api`**.
- **Expected state:** a new `small_flame` observation on `inc_demo_01`. The conflict is **still open**; clients have no route that resolves it.

### Step 6: Supervisor verifies; dispatch stays held
- **Input (Rahma):** **Verify** the incident (`POST /incidents/inc_demo_01/verify`). Then try to approve the proposed `investigate` task.
- **Expected state:** `inc_demo_01` becomes `verified` (a human-only action) with an `incident.verify` audit record. The investigate approval returns **`409 conflict`** because `con_demo_01` is open.
- **Console:** verified colour on the ring; the dispatch card shows "held: open conflict". This is the point of the step: a disagreement blocks dispatch until it is settled.

### Step 7: Large flame → WITHDRAW (no approval)
- **Voice (Sari):** "Api membesar! Apinya besar sekarang, anginnya kencang." *(The fire is growing! Big flames now, strong wind.)* The `live` observation stores `large_flame`, and code issues WITHDRAW.
- **Chip/text fallback:** chip **`butuh_bantuan`** with text "Api besar, angin kencang". No chip maps to `large_flame`, so on this path WITHDRAW comes from the agents **wind rule** (synthetic wind 31 km/h, above the configured threshold).
- **Expected state:** `incident.withdraw` is active with `volunteerIds: [uid_dedi, uid_sari]`. Each gets a `withdraw` task with `status: approved`. One `task.withdraw` audit record with `actorId: code`. No approval was asked for.
- **Both phones** (next `GET /digest` or socket `digest` message): full-screen, high-contrast **MUNDUR** with vibration: "MUNDUR sekarang ke titik kumpul di arah datangnya angin. Jangan padamkan sendiri." *(WITHDRAW now to the assembly point upwind. Don't fight it yourself.)*
- **Console:** "WITHDRAW sent · no approval needed · logged", with a timestamp.

### Step 8: Close
- **Console:** the audit log lists `observation.create` for each report, `task.approve` ×2, `incident.verify` and `task.withdraw` (`actorId: code`).
- **Narration point:** two volunteers, one picture; the disagreement went to a human and held dispatch; the withdrawal never waited.

## Gates

| Date (2026) | Gate | Pass | If it fails |
|---|---|---|---|
| **Wed 14 Oct** | **Live gate:** a push-to-talk voice report through `voice-gateway` → Gemini Live produces the step 2 observation end to end on a real phone | Steps 2, 3, 5 and 7 run by voice | Voice is shown only where it works (or in a clearly labelled recorded clip). The steps run on the chip/text path. |
| **Thu 15 Oct** | **Chip/text fallback gate:** steps 2, 3, 5 and 7 run through `POST /observations` and produce the expected states above | The whole script runs without voice | Cut to the minimum: steps 2, 3, 6 and 7 with one phone and one clearly labelled scripted volunteer. Don't add new behaviour. |

## Honesty checklist for anyone running the demo
- The SIMULATED banner is visible on every screen. Persona labels are visible.
- Say "thermal anomaly" or "lead", never "fire", for satellite items.
- Say "indicative" for the ring, staging point and upwind guidance.
- Only numbers that come from the system appear on screen. Don't improvise numbers.
- EMBER does not send agency reports.

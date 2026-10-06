# ember-agents

ADK 2.0 Python graph for multi-volunteer observation aggregation, fusion, and planning.

## Agent Graph Stages

### 1. Intake
- Idempotent by `obsId`
- Uses `capturedAt` (not arrival time) so late offline reports merge correctly
- Future: Observations with GPS accuracy > 200m kept as text only

### 2. Geometry
- Observation with bearing + distance → estimated fire point
- Radius = max(GPS accuracy, 30m) + 0.15 × distance
- No bearing → observer position, radius = accuracy + 150m

### 3. Dedupe / Cluster
- Merge if `d / (r_obs + r_inc + 100m) ≤ 0.6` and time gap ≤ 45 min
- Ratio 0.6–1.5 → stay separate but flagged "possible duplicate" (C_LOC conflict)
- Ratio > 1.5 → separate incident

### 4. Fusion
- Link FIRMS lead if within incident radius + 1km and ≤ 6h old
- Weather (wind) from cached BigQuery / Open-Meteo values
- Google Weather API is live cross-check only

### 5. Conflict Detection
- `C_SEV`: Flame levels differ ≥ 2 steps, or ≥ 1 step with higher ≥ small
- `C_TYPE`: Fire vs non-fire types
- `C_LOC`: Possible duplicate (geometry overlap)
- `C_STATUS`: Smoke/flame after human set EXTINGUISHED
- **Conflicts are flagged to human, never silently resolved**

### 6. Score (Evidence)
Evidence score 0–100:
- +35 observers: min(1, (n−1)/2)
- +25 photo × Spotter confidence
- +10 distinct viewpoints
- +15 satellite link
- +15 recency
- −8 per open conflict

**Not a probability.** Status ladder:
- LEAD → REPORTED → CORROBORATED (≥2 distinct observers within 30 min, or photo + satellite)
- VERIFIED / EXTINGUISHED / FALSE_ALARM (human only)

### 7. Consolidate + Plan
- Build `digest/current` (≤ 400 tokens)
- Generate instructions per crew:
  - **WITHDRAW**: No approval; staging point 300m along wind-FROM bearing (R1 rule)
  - **VERIFY**: Observe-only; no approval
  - **DISPATCH_PROPOSAL**: Supervisor approval required
- While C_SEV or C_TYPE conflict is open, VERIFY goes out and dispatch is held

## Safety Rules (Deterministic Code)

- R1 (WITHDRAW): Large flame or wind ≥ 25 km/h with flame
- R2–R5: Graded safety advisories
- Highest severity reported wins for safety; only human can downgrade
- **Safety rules never wait for approval**

## Tech Stack

- **Language:** Python 3.11+
- **Framework:** ADK 2.0 (adk.dev/2.0)
- **Models:**
  - Gemini 3.8 Flash for photo triage (Spotter) and Bahasa/English summaries
  - Deterministic Python for all geometry, scoring, and safety decisions
- **Deployment:** Cloud Run (asia-southeast1)
- **Triggers:** Firestore (via Eventarc) or Pub/Sub on new observation documents
- **Database:** Firestore Admin SDK

## Code Files

- `aggregator.py`: Main ADK graph (7 stages)
- `test_aggregator.py`: Unit tests (pytest)
- `sim_multiuser_eval.py`: Synthetic noise model stress test
- `cost_model_multiuser.py`: Cost projections
- `safety_rules.py`: R1–R5 rule engine

## Development

*Coming soon: Virtual environment setup, dependency installation, local testing with Firestore emulator, deployment*

## Back-Test Results

Synthetic noise model (300 scenarios, GPS σ 15–60m, bearing σ 15°, distance error 20%):
- **Precision:** 1.00
- **Auto-merge recall:** 0.617
- **Recall including human-flagged pairs:** 0.956
- **Silent splits:** 4.4% (65 of 1,472 true pairs)
- **Severity conflicts flagged:** 183/183

**Note:** These are synthetic results. Field tuning required.

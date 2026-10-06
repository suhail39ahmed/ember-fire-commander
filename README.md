# EMBER: Many Eyes, One Fire

![EMBER Architecture](docs/architecture/ember_infra_v2.png)

**Bahasa-first voice + camera AI fire commander for village volunteer firefighters during Southeast Asian haze fires, with a human supervisor who approves every high-stakes call.**

## The Problem

During the 2026 haze crisis, over 202,000 hectares burned in Indonesia (January–July), with West Kalimantan the worst affected region ([Reuters, September 2026](https://www.reuters.com/investigates/special-report/asia-weather-indonesia-wildfire-women/)). On September 29, Singapore's air quality entered unhealthy ranges across all regions due to smoke from fires in southern Sumatra and Kalimantan. Village fire brigades like the Power of Mama—an all-women volunteer group patrolling 10 villages in West Kalimantan—work unpaid on motorbikes to record hotspots and extinguish fires. They face thousands of satellite thermal anomalies daily but can only reach a handful.

EMBER helps scarce village brigades decide where to look first.

## How It Works

EMBER is a weather-aware, voice-first triage and verification loop for peat-fire response:

1. **Risk Ranking**: Every day, thousands of satellite thermal anomalies appear. EMBER ranks them by spread risk using wind, temperature, humidity, rain/dry-spell history, and peat context. Each detection gets an explainable 0–100 score with visible components (e.g., "8 dry days · RH 39% · wind 10 km/h · 62% peat").

2. **Volunteer PWA**: Volunteers use a push-to-talk Bahasa-first Progressive Web App to report via voice and camera. They talk hands-free to a Gemini 3.8 Live "komandan" in Bahasa Indonesia, show smouldering ditches on camera, and receive triage results with nearby detection checks and wind data.

3. **Multi-Volunteer Fusion**: Several volunteers can report on the same fire. An Aggregator/Fusion agent (deterministic Python inside an ADK 2.0 graph) merges their voice reports, photos, and location pings with satellite leads and weather into one shared incident picture in Firestore. Reports of the same fire collapse into a single incident with a transparent evidence score.

4. **Conflict Resolution**: When volunteers disagree (e.g., "small flame" vs "no flame"), the system flags the conflict to the supervisor and holds dispatch proposals. It never silently averages disagreements.

5. **Supervisor Console**: A human supervisor sees a shared operating picture on a web console—ranked hotspots, verification status, wind, and an indicative downwind exposure corridor. The supervisor reviews conflicts side-by-side, approves or edits dispatch proposals, and verifies incidents. WITHDRAW instructions (fixed safety rule: "withdraw upwind") broadcast instantly with no approval needed.

6. **Safety Rules**: Hard-coded safety rules in deterministic code (not model inference) enforce withdrawal on large flames or high wind. Only humans can verify, extinguish, downgrade severity, or approve dispatch.

7. **Re-ignition Watch**: Peat fires smoulder underground and re-ignite. EMBER remembers every extinguished site in Firestore and flags new satellite detections near previously closed sites for re-inspection.

8. **External Hotspot Integration**: NASA FIRMS satellite hotspots are treated as leads to verify, never as confirmed fires. NASA's own disclaimer states that FIRMS data should not be used for tactical decision-making. EMBER turns anomalies into human-verified ground truth.

## Architecture

### Backend-Mediated Design

The UI talks only to our backend (with two exceptions: signed-URL upload for photos, and WebSocket to voice-gateway for Gemini Live). The backend talks to Google Cloud, third parties, and Firestore.

### Live Path Decision

**Default (relay):** PWA → Cloud Run Load Balancing → voice-gateway (WebSocket proxy) → Gemini 3.8 Live. Audio + video (~1 fps JPEG frames), replies both ways. The gateway holds the Gemini session, verifies Firebase ID tokens (+ App Check), enforces per-user Live-minute caps, and writes observations.

**Fallback (Preview):** Direct phone → Gemini Live connection using ephemeral tokens minted by voice-gateway. This fallback is used only if latency tests show the relay does not meet targets. Requires the Gemini Developer API (`BidiGenerateContentConstrained`, v1beta).

### Cost Control

Push-to-talk bursts instead of always-open Live sessions: ~$0.09 per volunteer-hour (8 bursts) vs. ~$4.42 per volunteer-hour for open-mic. The gateway opens a Live session on button press, sends activity markers, closes ~30 seconds after reply.

## Google Cloud Services

| Service | Role |
|---------|------|
| **Firebase Hosting** | Serves volunteer PWA and supervisor console over global CDN |
| **Firebase Authentication** | Custom tokens with `{role, opId, crewId}` claims for volunteers; Google/email for supervisors |
| **Firebase App Check** | Optional fraud protection on WebSocket upgrade |
| **Firebase Cloud Messaging (FCM)** | Push notifications for task assignments, WITHDRAW alerts, supervisor messages |
| **Cloud Load Balancing** | Routes HTTPS/WebSocket traffic to Cloud Run services |
| **Cloud Run: voice-gateway** | WebSocket relay (default path) or ephemeral-token mint (fallback); verifies ID tokens; enforces Live-minute caps; writes observations |
| **Cloud Run: ember-api** | REST API for custom token minting, signed URLs for photo upload, approvals/claims endpoints, role checks, audit logging |
| **Cloud Run: ember-agents** | ADK 2.0 Python graph: Intake, Dedupe/Cluster, Fusion, Conflict detection, Evidence scoring, Consolidation, Planning. Uses Gemini 3.8 Flash for photo triage (Spotter) and Bahasa/English summaries |
| **Gemini 3.8 Live** | Native-audio Bahasa voice conversation per push-to-talk burst; tool calls: `submit_observation`, `get_common_picture`, `get_my_task` |
| **Gemini 3.8 Flash** | Photo triage (Spotter confidence scoring), structured JSON, consolidated Bahasa/English summaries, report drafts |
| **ADK 2.0 Agents** | Graph workflows with HITL pause (`RequestedInput`), automatic retries; runs on Agent Runtime |
| **Agent Platform Memory Bank** | Long-term memory for landmarks, language preferences (consent-based) |
| **Firestore** | Shared incident state written by backend services (ember-api, ember-agents, voice-gateway); clients receive updates via ember-api REST endpoints, WebSocket digest, and FCM push notifications (no direct client Firestore listeners); Security Rules by role claim; collections: ops, volunteers, pings (TTL 24h), observations (immutable), leads, incidents, conflicts, tasks, crews, digest, audit, sites (re-ignition watch) |
| **Eventarc** | Triggers ember-agents on new observation documents |
| **Cloud Run Functions** | Event-driven functions for aggregation triggers (optional Pub/Sub path if Firestore triggers prove slow) |
| **Cloud Storage** | Compressed stills (~100–200 KB JPEG), signed-URL upload, lifecycle TTL |
| **Cloud Scheduler + Cloud Run Job (ember-ingest)** | Hourly pulls: NASA FIRMS hotspots, data.gov.sg PSI, Open-Meteo wind/weather → BigQuery; top-N leads synced to Firestore |
| **BigQuery** | Archive tables: FIRMS, PSI, weather, peat mask, risk scores, back-test results; `ST_DWITHIN` for re-ignition queries |
| **Google Earth Engine** | Peat-soil data, burn history, vegetation indices (future roadmap) |
| **Maps Platform (JavaScript API + deck.gl)** | Map tiles render in browser with restricted Maps JS key (display only); all Maps data calls (routes, weather, air quality, geocoding) proxied through ember-api |
| **Maps Platform (Weather API)** | Live wind, temperature, humidity, precipitation fetched by ember-api and served to clients; not stored beyond cache terms |
| **Secret Manager** | API keys for Maps, Weather, FIRMS MAP_KEY, data.gov.sg |
| **IAM** | Service accounts, role bindings, custom claims verification |
| **Cloud Logging / Monitoring** | Traces, latency metrics, cost counters per burst, alerting on silent volunteers and conflict backlogs |

### External Data Sources

- **NASA FIRMS** (Fire Information for Resource Management System): Satellite thermal anomalies (VIIRS/MODIS). Treated as leads to verify, not confirmed fires. Attribution required.
- **Open-Meteo**: Archive-grade weather for back-tests and historical risk scoring. Non-commercial use terms apply for hackathon.
- **data.gov.sg PSI**: Singapore's official Pollutant Standards Index for air quality display.

## Limitations (Stated Honestly)

1. **No smoke/haze forecast**: EMBER does not claim to forecast smoke plumes or fire spread. The exposure corridor is indicative, not predictive.
2. **FIRMS not for tactical decisions**: NASA's own disclaimer states FIRMS data should not be used for tactical decision-making. EMBER uses hotspots only as verification leads for human ground truth.
3. **PWA constraints**: No reliable background GPS or background audio (location pings pause when screen is off). iOS may evict site storage after inactivity. iOS web push requires a Home-Screen-installed PWA (iOS 16.4+).
4. **Risk Ranker back-test**: The explainable 0–100 spread-risk score is hand-weighted and published with its back-test results, including cases where it does not beat simple baselines. It is not a probability and does not predict fire spread.
5. **De-duplication from synthetic data**: Conflict-detection thresholds are stress-tested on synthetic GPS noise models, not real field data. Practitioners must tune them.
6. **Simulated personas**: The field session and Pak Dedi/Bu Rahma personas are simulated. No endorsement by YIARI, Power of Mama, BPBD, Manggala Agni, NEA, or ASMC.

## Repository Layout

```
ember/
├── apps/
│   └── web/              # React + Vite + TypeScript PWA (volunteer + supervisor)
├── services/
│   ├── voice-gateway/    # Cloud Run WebSocket relay for Gemini Live
│   ├── api/              # Cloud Run REST API (ember-api)
│   └── agents/           # ADK 2.0 Python graph (ember-agents)
├── jobs/
│   └── ingest/           # Cloud Run job for hourly FIRMS/weather/PSI pulls
├── infra/                # Terraform or gcloud deployment scripts
├── docs/
│   ├── architecture/     # Architecture diagram (PNG, drawio), component table, schema
│   └── apps_summary.md   # Volunteer app + supervisor console screens
├── .github/
│   └── PULL_REQUEST_TEMPLATE.md
├── .gitignore
├── LICENSE               # Apache-2.0
├── CONTRIBUTING.md       # Branch and PR conventions
└── README.md             # This file
```

## Local Setup

*Placeholder: Full setup instructions will be added as services are implemented.*

### Prerequisites

- Node.js 20+ and npm (for `apps/web`)
- Python 3.11+ (for `services/agents`, `jobs/ingest`)
- Google Cloud SDK (`gcloud`)
- Firebase CLI
- Docker (optional, for local service containers)

### Quick Start (Coming Soon)

1. Clone the repository
2. Install dependencies for each service
3. Configure Firebase project and Google Cloud project IDs
4. Set up local `.env` files (use `.env.example` as template)
5. Run services locally or deploy to Cloud Run

Detailed setup, build, and deployment instructions will be added in each service's README.

## Team

*Placeholder: Team member names, roles, and contact information will be added here.*

## Built for Google Cloud AI Builder Cup 2026

**Submission Requirements:**
- Deployed on Cloud Run / Firebase ✓ (architecture planned)
- Uses Gemini ✓ (Gemini 3.8 Live + Flash)
- Public GitHub repository (made public before submission)
- Live link (to be deployed)
- Video demo (<3 minutes, to be recorded)
- PDF deck (to be prepared)
- Submission deadline: October 17–18, 2026

---

**EMBER does not claim to predict fire spread or smoke plumes. It ranks satellite anomalies by spread-risk conditions, turns them into human-verified ground truth, and remembers peat that comes back.**

**Attributions:** NASA FIRMS, Open-Meteo, data.gov.sg, Google Maps Platform, Google Earth Engine. Inspired by reporting on the Power of Mama volunteer group (Reuters, September 2026).

**License:** Apache-2.0 (see LICENSE file)

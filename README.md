# EMBER: Many eyes, one fire

**A Bahasa-first voice and camera AI fire commander for village volunteer firefighters in Sumatra and Kalimantan. Several volunteers' phones feed one shared incident, and a human supervisor approves every high-stakes call.**

![Gemini](https://img.shields.io/badge/Gemini-Live%20%2B%20Flash-4285F4?logo=googlegemini&logoColor=white)
![Cloud Run](https://img.shields.io/badge/Google%20Cloud-Cloud%20Run-4285F4?logo=googlecloud&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-Hosting%20%7C%20Auth%20%7C%20App%20Check%20%7C%20FCM-FFCA28?logo=firebase&logoColor=black)
![Terraform](https://img.shields.io/badge/IaC-Terraform-7B42BC?logo=terraform&logoColor=white)
![License](https://img.shields.io/badge/license-Apache--2.0-blue)

> Built for the **Google Cloud AI Builder Cup 2026**.
> **Status (14 Oct 2026):** the Google Cloud infrastructure is live in `ember-fire-commander` (asia-southeast1), defined in Terraform and deployed through the pipeline. The application code is **in progress**. Anything not built yet is marked *planned* or *in progress* below.

---

## Demo

| | Link |
|---|---|
| Live app | **TODO:** `https://ember-fire-commander.web.app` (goes live once the web app is deployed) |
| Demo video (< 3 min) | **TODO:** add link |
| Pitch deck (PDF) | **TODO:** add link (`docs/EMBER-deck.pdf`) |

---

## 30-second pitch

Village fire brigades in Indonesia's peatlands are unpaid volunteers on motorbikes. Each day they see thousands of satellite hotspots, and they can only reach a handful. EMBER gives each volunteer a hands-free, Bahasa-speaking "komandan" on their phone. They talk, show the fire on camera, and get guidance back. Reports from many phones are fused into **one incident picture** for a supervisor, who verifies, resolves conflicts and approves dispatch. The rule that tells volunteers to withdraw is written in code, not left to the model, and it never waits for approval.

EMBER helps scarce brigades decide **where to look first**. It does **not** forecast fire spread or haze, and it does not stop haze.

## The problem

- About **202,000 ha burned in Indonesia from January to July 2026**, with West Kalimantan worst hit (more than 38,000 ha). The forestry minister said the fires could last until early November. ([Reuters, Sep 2026](https://www.reuters.com/investigates/special-report/asia-weather-indonesia-wildfire-women/))
- Groups like **the Power of Mama**, more than 140 women patrolling 10 villages in Ketapang, West Kalimantan, work unpaid on motorbikes. They record hotspots and put out fires. Their NGO partner does not let them handle big fires, and peat fires "smoulder underground" and come back. (same Reuters report)
- NASA FIRMS satellite hotspots are thermal anomalies, not confirmed fires, and NASA says FIRMS is not meant for tactical decisions. Someone on the ground has to verify them, and there are few volunteers to do it.

## How it works

1. **Leads:** every hour, NASA FIRMS hotspots and weather are pulled in and each hotspot is given an explainable 0–100 *spread-risk* score with its reasons shown (for example "8 dry days · RH 39% · wind 10 km/h · 62% peat"). These are **leads to verify**, never "fires". *(planned)*
2. **Report:** a volunteer presses push-to-talk on the Bahasa-first PWA and speaks to Gemini Live while the camera streams frames, or taps a quick chip (*asap*, *api*, *aman*, *butuh bantuan*). *(in progress)*
3. **Fuse:** the agents service merges reports, photos and positions from several volunteers, plus satellite leads and wind, into one incident with a transparent evidence score. *(in progress: a fusion prototype with unit tests exists but is **not yet in this repository**; the `ember-agents` service is in progress)*
4. **Conflicts are surfaced:** if volunteers disagree ("small flame" vs "no flame"), EMBER flags it, shows both side by side and holds dispatch. It never averages the reports. *(planned)*
5. **Human approves:** the supervisor console shows the shared picture, a verification queue, wind and an *indicative* downwind exposure corridor. The supervisor approves, edits or rejects each proposal. Only a human can mark an incident verified or extinguished, or lower its severity. *(planned)*
6. **Safety first:** deterministic rules in code (not model output) send **WITHDRAW upwind** on large flames or high wind, immediately and logged. *(planned)*
7. **Re-ignition watch:** extinguished sites are remembered, and new detections near them raise a re-inspection alert. *(planned)*

## Architecture

![EMBER architecture](docs/architecture/ember_infra_v2.png)

Editable source: [`docs/architecture/ember_infra_v2.drawio`](docs/architecture/ember_infra_v2.drawio). Details: [`docs/architecture/architecture.md`](docs/architecture/architecture.md).

**Backend-mediated rule.** The browser talks only to our backend, and the backend talks to Google Cloud, third parties and the database. There are just two exceptions:
1. Photo upload: an HTTPS `PUT` to Cloud Storage using a short-lived **signed URL** issued by `ember-api`.
2. Live voice and video: a **WSS** connection to `voice-gateway`, which holds the Gemini session.

The browser never opens Firestore listeners and never calls Gemini or the Maps/Weather data APIs directly. The map tiles are the only Maps call from the browser, using a referrer-restricted key.

| Component | Runs on | What it does |
|---|---|---|
| Volunteer PWA + supervisor console | Firebase Hosting | One React/Vite web app with role-based routes. Push-to-talk, camera, chips, task cards, WITHDRAW screen, shared map |
| `ember-api` (public) | Cloud Run | REST: sessions and roles, signed upload URLs, approvals, incident and digest reads, Maps/Weather proxy, FCM sends, audit log |
| `voice-gateway` (public, WSS) | Cloud Run | Verifies Firebase ID token and App Check, relays audio and video to Gemini Live, enforces Live-minute caps, writes observations from tool calls |
| `ember-agents` (private) | Cloud Run | ADK agent graph: intake, dedupe/cluster, fusion, conflict, scoring, plan. Only `ember-api` and `voice-gateway` can call it |
| `ember-ingest` *(planned)* | Cloud Run job + Scheduler | Hourly FIRMS, weather and PSI pulls |
| Firestore `ember-db` | Firestore Native | Shared incident state. Client access denied, so only the backend reads and writes it |
| Photo bucket | Cloud Storage | Private compressed stills, deleted after 14 days |

### Live voice and video path

Relay through `voice-gateway` is the **default**. A direct phone-to-Gemini connection with an ephemeral token is only a **fallback** (Preview), used if the latency test from Singapore shows the relay is too slow.

```mermaid
sequenceDiagram
    autonumber
    actor V as Volunteer (PWA)
    participant GW as voice-gateway (Cloud Run, asia-southeast1)
    participant L as Gemini Live
    participant AG as ember-agents (private)
    participant DB as Firestore ember-db
    participant API as ember-api
    actor S as Supervisor console

    V->>GW: WSS upgrade + Firebase ID token + App Check token
    GW->>GW: verify identity, role, Live-minute cap
    V->>GW: press to talk: mic audio + ~1 fps camera frames
    GW->>L: open Live session, send shared digest as context
    L-->>GW: Bahasa audio reply + tool call submit_observation()
    GW->>DB: write immutable observation (GPS from phone)
    GW-->>V: audio reply
    GW->>AG: notify new observation (authenticated call)
    AG->>DB: fuse into incident, flag conflicts, propose task
    S->>API: poll incident / approvals (REST)
    S->>API: Approve / Edit / Reject
    API-->>V: task or WITHDRAW via FCM push
```

## How we use Gemini and Google Cloud AI

| Model / tool | Used for | Status |
|---|---|---|
| **Gemini 3.8 Live** | Bahasa voice conversation per push-to-talk burst, with audio and about 1 fps video. Tool calls `submit_observation`, `get_common_picture`, `get_my_task`. The model never changes incident state itself | in progress |
| **Gemini 3.8 Flash** | Photo triage ("Spotter") with structured JSON output, and Bahasa/English incident summaries and report drafts | planned |
| **ADK (Agent Development Kit)** | The agent graph in `ember-agents`, with a human-in-the-loop pause for supervisor approval | in progress |
| **Agent Platform Evals** | Scenario tests with simulated volunteers as a quality gate | planned |
| **Agent Platform Memory Bank** | Remembering landmarks and language preference, with consent | optional / planned |

Design principle: **the deterministic code decides and Gemini talks and looks.** Distances, wind, scores and safety rules come from code and data, and every number spoken or shown comes from a tool or database value. Gemini is called through **Agent Platform** with service-account auth, so no Gemini API key is used on the default path.

## Google Cloud services

| Service | Why we use it | Status |
|---|---|---|
| Cloud Run (`ember-api`, `voice-gateway`, `ember-agents`) | Serverless containers with WebSocket support (up to a 60-minute timeout) and scale to zero | **live** (placeholder image until app code ships) |
| Firestore (Native, `ember-db`) | Shared incident state. Point-in-time recovery and daily backups are on | **live** |
| Cloud Storage | Private photo bucket: uniform access, public access prevention, 14-day lifecycle, soft delete, signed-URL uploads | **live** |
| Secret Manager | FIRMS, data.gov.sg and Maps server keys. Each secret is readable only by the service that needs it | **live** |
| Artifact Registry (`ember`) | Container images, with a cleanup policy | **live** |
| IAM | One least-privilege service account per service | **live** |
| Firebase Hosting | Serves the PWA and console over a global CDN | **live** (web app not deployed yet) |
| Firebase Authentication | Google sign-in. Phone/SMS sign-in is deliberately off | **live** |
| Firebase App Check | reCAPTCHA Enterprise (Fraud Defense) attestation, 6 h token TTL. Not enforced until the demo | **live** (registered) |
| Firebase Cloud Messaging | Task and WITHDRAW push | **live** (key generated) |
| Maps JavaScript API | Map for the console and the volunteer mini-map, with a referrer- and API-restricted browser key | **live** (key and Map ID) |
| Maps Weather API | Wind, humidity and rain at an incident, fetched by `ember-api` with a Weather-only server key | **live** (key) |
| Cloud Billing budgets | Budget alert emails | **live** |
| Gemini on Agent Platform | Live, Flash, ADK, Evals (see above) | in progress |
| Cloud Scheduler, BigQuery | Hourly ingest and archive / back-test tables | planned |

## Security and responsible AI

- **Backend-mediated:** client Firestore and Storage rules are *deny-all*. Data reaches the browser only through authenticated backend endpoints.
- **ID tokens and App Check:** `ember-api` verifies the Firebase ID token on every route except `GET /healthz` and reads the role from the `role` custom claim (`volunteer` or `supervisor`); a missing role is `403`. It checks the `X-Firebase-AppCheck` header in log-only mode (`APP_CHECK_ENFORCE=false`) until just before the demo. The same checks on the `voice-gateway` WebSocket upgrade are *planned*.
- **Least privilege:** one service account per service. `ember-agents` is private and only `ember-api` and `voice-gateway` can invoke it. Secrets are scoped per accessor.
- **Keyless CI/CD:** GitHub Actions authenticates with Workload Identity Federation, so no JSON keys are stored in the repo.
- **Human in the loop:** dispatch always needs supervisor approval. Only a human can verify or extinguish an incident or lower its severity. WITHDRAW is a hard-coded safety rule, not a model output.
- **Honest data use:** FIRMS hotspots are leads to verify, never "fires". Exposure corridors are labelled *indicative, not a forecast*.
- **Synthetic data:** development and the demo use simulated volunteers and personas. No real volunteer data is used, and we claim no endorsement by any NGO or agency.
- **Privacy:** no faces in photos, photos deleted after 14 days, and volunteers can opt out of sharing their location with their crew.

### Limitations

- EMBER does **not** forecast fire spread or smoke plumes.
- The risk score is hand-weighted and is not a probability. Its back-test will be published, including the cases where it does not beat simple baselines.
- Dedupe and conflict thresholds were tuned on **synthetic** GPS-noise models, not field data. Practitioners need to tune them.
- PWA limits: no reliable background GPS or audio, and iOS web push needs a Home-Screen install (iOS 16.4+).
- Gemini Live runs outside Asia (there is no Asia endpoint), so voice has a cross-region hop. Latency will be measured from Singapore.
- Bahasa prompts and UI text need review by a native speaker.

## Infrastructure as code and CI/CD

All of the above is defined in **Terraform** under [`infra/`](infra/README.md) and is **applied** (55 resources in the first apply, plus the CI/CD identities added since). Nothing in the project is changed by hand in the console.

- **Remote state** in a private, versioned GCS bucket (`gs://ember-fire-commander-tfstate`) with native locking. State is not kept in Git.
- **Pipeline-owned:** infrastructure changes go through a pull request. `terraform plan` runs on every PR, and `apply` runs from `main` only after approval in the `production` environment. GitHub Actions authenticates with **Workload Identity Federation** as `sa-ember-terraform`, with no JSON keys.
- **App deploy pipelines** (`.github/workflows/deploy-*.yml`, with Cloud Build alternatives in `infra/pipelines/`) build images into Artifact Registry and deploy each Cloud Run service as its own runtime service account. Terraform ignores the image, so pipelines own the code and Terraform owns everything else.

### What is NOT managed by Terraform

These are deliberately done by hand or are one-time console settings:

| Item | Why |
|---|---|
| Firebase Auth sign-in providers (Google) | Console setting |
| App Check app registration and reCAPTCHA (Fraud Defense) key | Console setting (optional Terraform flag exists) |
| FCM Web Push (VAPID) key pair | Generated in the Firebase console only |
| Maps Map ID | Created in Map management |
| Maps daily quotas | The free trial blocks quota changes. To be set after upgrading |
| Maps API keys | Kept out of Terraform so the key strings never land in state |
| Secret **values** | Added with `gcloud secrets versions add` so they never enter state |
| Removing Editor from the default compute service account | One-off cleanup command |
| Project Owner binding | Kept outside Terraform so it can't lock us out |
| Budget alerts | Only if `enable_budget` is off |
| The Terraform state bucket | Must exist before `terraform init` |

## Cost

From our cost model (prices checked 3–6 Oct 2026, 16 days, 4 developers, one project). *The cost model document (`ember_cost_estimate.md`) is **not yet in this repository**; the figures below are its summary.*

| Scenario | Estimate (USD) |
|---|---|
| Managed plan (dev on synthetic data, pay mainly for demo takes and evals) | ≈ $12 |
| Low | ≈ $29 |
| Expected | ≈ $192 |
| High (everything goes wrong) | ≈ $1,338 |

Gemini Live is the biggest cost driver, because each turn re-bills the accumulated context. Push-to-talk bursts cost about **$0.093 per volunteer-hour (8 bursts)**, compared with about **$4.42** for an always-open mic, roughly 47× cheaper. Other guardrails: per-user Live-minute caps, budget alerts, and Cloud Run min 0 / max 3 instances. All figures are estimates, not measured spend.

## Repository layout

```
.
├── apps/web/                 # React + Vite + TypeScript PWA – Google sign-in, role routes (/pwa volunteer, /console supervisor), in progress
├── services/
│   ├── api/                  # ember-api (Cloud Run) – Flask: /healthz, GET /me (ID token + role claim, App Check log-only); other routes in progress
│   ├── voice-gateway/        # WSS relay to Gemini Live (Cloud Run) – Flask skeleton (/healthz), in progress
│   └── agents/               # ADK agent graph (ember-agents) – Flask skeleton (/healthz), in progress
├── jobs/ingest/              # hourly FIRMS / weather / PSI job – planned
├── infra/
│   ├── terraform/            # all GCP + Firebase resources, GCS backend
│   ├── pipelines/            # Cloud Build configs
│   └── README.md             # infra runbook
├── .github/workflows/        # terraform.yml + deploy-*.yml
├── docs/contracts/           # shared-contract.md: REST, WebSocket, entities, errors (source of truth)
├── docs/api/                 # api-map.md: route lookup, who calls each one
├── docs/architecture/        # ember_infra_v2.png/.drawio, ember_infra_simple_data_paths.png, architecture.md
├── LICENSE                   # Apache-2.0
└── README.md
```

## Local setup

> The application code is in progress. Commands marked TODO will be confirmed once each service exists.

Prerequisites: Node.js 20+, Python 3.11+, the Google Cloud SDK (`gcloud`), the Firebase CLI, and optionally Docker.

```bash
git clone https://github.com/suhail39ahmed/ember-fire-commander.git
cd ember-fire-commander
gcloud auth application-default login
gcloud config set project ember-fire-commander

# Web app
cd apps/web && cp .env.example .env.local   # Firebase config, App Check site key, VAPID key, Maps browser key, Map ID, API/gateway URLs
npm install && npm run dev                  # http://localhost:5173

# Backend services (TODO)
# FIRESTORE_DATABASE=ember-db must be set for every service
```

Values in `.env` (the Firebase web config, the reCAPTCHA site key, the restricted Maps browser key) are public by design, but are still kept out of Git. Server secrets live only in Secret Manager. For App Check on localhost, register a debug token in the Firebase console.

For local Google sign-in, open the browser developer console and find the App Check debug token printed when the first account check runs. Register it under Firebase Console → App Check → Apps → the web app's menu → Manage debug tokens. To reuse a registered development token across ports or incognito sessions, set `VITE_FIREBASE_APPCHECK_DEBUG_TOKEN` in `apps/web/.env.local` and restart Vite. Treat this token as a secret and never commit it. This setting is only used in development.

An unregistered debug token causes `appCheck/fetch-status-error` (HTTP 403). Because App Check initializes on the first API account check, the initial Google popup can work while subsequent sign-ins fail before opening a popup. Refreshing temporarily resets that initialization; registering the debug token fixes the configuration. Do not disable App Check enforcement to work around it. See the [Firebase debug-provider setup](https://firebase.google.com/docs/app-check/web/debug-provider).

## Roadmap

- Native app (**React Native**) for reliable background GPS and audio
- Offline voice: record a short clip and transcribe it with Flash when back online
- Google Earth Engine peat and burn-history layers in the risk score
- Agency report drafts (BPBD / Manggala Agni) for the supervisor to send outside EMBER
- Field tuning of thresholds with practitioners, and a native-speaker review of all Bahasa text

## Team

| Name | Role |
|---|---|
| Suhail Ahmed | Solution Architect, AI & Automation |
| Md Naushad ([@MdNaushad](https://github.com/MdNaushad)) | Lead Software Engineer |
| Zeeshan ([@zeeshrocky](https://github.com/zeeshrocky)) | UI/UX Designer |
| Aqib Pasha | Salesforce Solution Architect |

## License

[Apache-2.0](LICENSE)

## Acknowledgements and attributions

- **NASA FIRMS:** "We acknowledge the use of data and/or imagery from NASA's Fire Information for Resource Management System (FIRMS) (https://earthdata.nasa.gov/firms), part of NASA's Earth Science Data and Information System (ESDIS)." FIRMS data is not intended for tactical decision-making.
- **Open-Meteo:** weather data by [Open-Meteo.com](https://open-meteo.com/), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- **data.gov.sg:** Singapore PSI data from data.gov.sg, under the Singapore Open Data Licence.
- **Google Maps Platform:** maps and Weather API, used under the Google Maps Platform terms.
- Inspired by Reuters' reporting on the Power of Mama volunteer brigade (Sep 2026). The personas in our demo are simulated, and EMBER is not affiliated with or endorsed by any organisation mentioned.

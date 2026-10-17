# EMBER infrastructure (Terraform + pipelines)

All Google Cloud and Firebase infrastructure for EMBER is defined in Terraform and **applied** to project `ember-fire-commander` (number `991193351821`, region `asia-southeast1`).

- **State:** `gs://ember-fire-commander-tfstate`. The bucket is private and versioned, with native locking. State is never stored in Git.
- **Ownership:** every infrastructure change goes through a pull request and the `terraform` pipeline. **Don't change resources in the console**, because the next plan will show the edit as drift.
- **Current state:** `terraform plan` on `main` shows **No changes**. The three Cloud Run services run app skeletons or the placeholder image until the app code ships.

```
infra/
├── README.md                    ← you are here
├── terraform/                   ← infrastructure (run terraform here)
│   ├── versions.tf              providers (google / google-beta 8.6.x, time)
│   ├── backend.tf               GCS backend (ember-fire-commander-tfstate)
│   ├── variables.tf             every knob, with defaults + explanations
│   ├── terraform.tfvars         real, non-secret values (committed)
│   ├── terraform.tfvars.example template
│   ├── main.tf                  locals, optional project creation (off)
│   ├── apis.tf                  APIs + propagation wait
│   ├── iam.tf                   4 runtime SAs, teammates
│   ├── cicd_identities.tf       sa-ember-terraform, sa-ember-deployer + roles
│   ├── wif.tf                   GitHub Workload Identity Federation
│   ├── firestore.tf             Firestore Native `ember-db` + PITR + daily backups
│   ├── storage.tf               photo bucket (private, 14-day TTL, CORS) + build-source bucket
│   ├── secrets.tf               secret containers + per-secret access (values never in state)
│   ├── artifact_registry.tf     Docker repo "ember" + cleanup policy
│   ├── cloud_run.tf             ember-api, voice-gateway, ember-agents
│   ├── firebase.tf              Firebase project, Hosting site, optional web app/App Check
│   ├── maps_keys.tf             optional restricted Maps keys (off)
│   ├── budget.tf                optional budget (off; console alerts are used)
│   ├── outputs.tf               URLs, SA emails, WIF provider
│   └── rules/                   firestore.rules, storage.rules (both deny-all)
└── pipelines/                   Cloud Build alternatives (manual `gcloud builds submit`)
    ├── cloudbuild-api.yaml / -voice-gateway.yaml / -agents.yaml
    ├── cloudbuild-terraform.yaml
    ├── cloudbuild-web.yaml      Vite build → Firebase Hosting
    └── firebase.json.example
```

GitHub Actions workflows are in `.github/workflows/` at the repository root: `terraform.yml` and `deploy-*.yml`.

## Decisions baked in

| Decision | Value |
|---|---|
| Billing | $300 free trial |
| Gemini | **Agent Platform** (`aiplatform.googleapis.com`) with service accounts (`roles/aiplatform.user` on voice-gateway and agents). No API key. A `GEMINI_API_KEY` secret is created only if `create_gemini_api_key_secret = true` (for the direct-Live fallback). |
| Region | `asia-southeast1` everywhere. `LIVE_LOCATION=us-central1` is only an env var on voice-gateway. |
| Firestore | Native mode, database **`ember-db`** (not `(default)`), `asia-southeast1` (**permanent**), PITR on, daily backups kept for 7 days, delete protection on |
| Browser access | Backend-mediated. Firestore rules deny all. The photo bucket is private and accepts only signed-URL PUTs minted by ember-api. |
| Cloud Run | min 0 / max 3. voice-gateway: 3600 s timeout and session affinity. ember-agents is private (only the api and gateway SAs can invoke it). |
| Team | `team_member_emails` → `roles/editor` |

## How changes flow (pipeline)

1. Edit `infra/terraform/*.tf` (or `terraform.tfvars`) on a `feat/` or `fix/` branch and open a PR.
2. **terraform / plan** runs on the PR through WIF as `sa-ember-terraform` and posts the plan. Read it: look for `0 to destroy` and no unexpected `must be replaced`.
3. Merge to `main`.
4. Go to Actions → **terraform** → Run workflow → action `apply`, then approve it in the **`production`** environment.
5. Run `plan` again. It should say **No changes**.

GitHub repository variables (Settings → Secrets and variables → Actions → **Repository variables**): `GCP_WIF_PROVIDER`, `GCP_TF_SA`, `GCP_DEPLOYER_SA`, `GCP_PROJECT_ID`. They must be repository variables, not environment variables, because the plan job doesn't use an environment.

Cloud Build alternative: `infra/pipelines/cloudbuild-terraform.yaml` (see its header).

### Running a plan locally (read-only check)

```bash
cd infra/terraform
gcloud auth application-default login
gcloud auth application-default set-quota-project ember-fire-commander
terraform init        # uses the GCS backend
terraform plan        # expect: No changes
```
Don't `apply` from a laptop. Apply goes through the pipeline. On PowerShell, quote flags that contain `=`, for example `terraform plan "-out=tfplan"`.

## What each file creates

| File | Resources |
|---|---|
| `apis.tf` | run, artifactregistry, cloudbuild, firestore, storage, secretmanager, iam, iamcredentials, logging, monitoring, firebase, identitytoolkit, fcm, firebaseappcheck, recaptchaenterprise, **aiplatform**, firebaserules, firebasehosting, sts, serviceusage, cloudresourcemanager |
| `iam.tf` | `sa-ember-api` (datastore.user, firebaseauth.admin, Token Creator for signed URLs), `sa-voice-gateway` (datastore.user, aiplatform.user), `sa-ember-agents` (datastore.user, aiplatform.user), `sa-ember-ingest` (logs only for now; BigQuery later). All get logWriter + metricWriter. Teammates get Editor. |
| `cicd_identities.tf` | `sa-ember-terraform` (Owner-lite roles for managing infra) and `sa-ember-deployer` (run.developer, firebasehosting.admin, logWriter, Artifact Registry writer, actAs the 3 runtime SAs only) |
| `wif.tf` | Pool `github`, provider `github-oidc` restricted to `suhail39ahmed/ember-fire-commander` |
| `firestore.tf` | Native DB `ember-db` in `asia-southeast1`, PITR, daily backup schedule; optional rules release |
| `storage.tf` | `ember-fire-commander-ember-photos` (UBLA, public access prevention, delete after 14 days, CORS PUT from localhost:5173 + Hosting domains; objectAdmin for ember-api only) and `ember-fire-commander-ember-build-src` (Cloud Build source, 7-day TTL) |
| `secrets.tf` | `FIRMS_MAP_KEY`, `DATA_GOV_SG_API_KEY` (→ ingest), `MAPS_SERVER_API_KEY` (→ api) |
| `artifact_registry.tf` | `asia-southeast1-docker.pkg.dev/ember-fire-commander/ember`, keeps the 5 newest images, deletes images older than 30 days |
| `cloud_run.tf` | The 3 services with env vars (`FIRESTORE_DATABASE=ember-db`, etc.). ember-api and voice-gateway are public (auth in code); ember-agents can only be invoked by the api and gateway SAs. Terraform **ignores image changes**, so the deploy pipelines own the image. |
| `firebase.tf` | Firebase on the project and the Hosting site; optional web app / App Check |
| `budget.tf`, `maps_keys.tf` | Optional (off) |

**Secret values** never go through Terraform. Add them by hand so they never enter state:
```bash
printf %s "<value>" | gcloud secrets versions add FIRMS_MAP_KEY --data-file=-
```
`FIRMS_MAP_KEY` and `DATA_GOV_SG_API_KEY` hold placeholders until the keys are registered.

## Not managed by Terraform (deliberately)

| Item | Why |
|---|---|
| Firebase Auth sign-in providers (Google) | Console setting. **Phone sign-in stays off.** |
| App Check registration + reCAPTCHA (Fraud Defense) key | Console setting. Debug tokens: App Check → Apps → ⋮ → Manage debug tokens. `APP_CHECK_ENFORCE=false` until just before the demo. |
| FCM Web Push (VAPID) key | Generated in the Firebase console only |
| Maps keys + Map ID `ember-map` | Kept out of state. Browser key: Maps JavaScript API only, HTTP-referrer restricted. Server key: in `MAPS_SERVER_API_KEY`. |
| Maps quotas | The free trial blocks quota edits. Set them after upgrading. |
| Firestore rules | Console deny-all rules (`manage_firestore_rules = false`) |
| Budget alerts | Console budget alerts (`enable_budget = false`) |
| Secret **values** | `gcloud secrets versions add` |
| Project Owner binding | Kept outside Terraform so it can't lock us out |
| State bucket `ember-fire-commander-tfstate` | Must exist before `terraform init` (its object access for `sa-ember-terraform` is granted on the bucket) |

## Smoke tests (infrastructure)

```bash
R=asia-southeast1
gcloud run services list --region=$R --project=ember-fire-commander
curl -s -o /dev/null -w '%{http_code}\n' https://ember-api-xmjvsg4o6a-as.a.run.app/       # 200 (or 404 from the app)
curl -s -o /dev/null -w '%{http_code}\n' https://voice-gateway-xmjvsg4o6a-as.a.run.app/   # 200 (or 404 from the app)
curl -s -o /dev/null -w '%{http_code}\n' https://ember-agents-xmjvsg4o6a-as.a.run.app/    # 403 (private)
gcloud firestore databases describe --database=ember-db --project=ember-fire-commander --format='value(type,locationId)'
gcloud secrets list --project=ember-fire-commander
```

## Deploying code

App code is deployed by `.github/workflows/deploy-{api,voice-gateway,agents,web}.yml`. They're manual (`workflow_dispatch`), run from `main` only, and use WIF as `sa-ember-deployer`. Each deploy changes **only the image**, and passes the same runtime SA and env vars that Terraform sets, so `terraform plan` stays clean.

Cloud Build alternative:
```bash
gcloud builds submit . --config=infra/pipelines/cloudbuild-api.yaml --region=asia-southeast1 \
  --gcs-source-staging-dir=gs://ember-fire-commander-ember-build-src/source
```
App code must open Firestore database **`ember-db`** from `FIRESTORE_DATABASE`, for example Python `firestore.Client(database=os.environ["FIRESTORE_DATABASE"])` or Node `getFirestore(app, process.env.FIRESTORE_DATABASE)`.

## Costs (caveat)

Things that cost money only when used: Cloud Run requests (min instances 0), Gemini calls, Maps calls, Cloud Build minutes, storage. Things that can run up a bill: Maps server calls (no quotas on the trial), raising `run_min_instances`, and leaving Live sessions open. Budgets **alert only**; they don't stop spend.

## Teardown

`terraform destroy` is not part of the normal flow. Firestore uses `deletion_policy = "ABANDON"` and delete protection, so a destroy leaves the database in place. **The Firestore location is permanent.** To remove everything, including billing: `gcloud projects delete ember-fire-commander` (30-day recovery window).

## Confirm list

- `LIVE_MODEL` is `gemini-live-2.5-flash-native-audio` (Vertex AI Agent Platform GA id; retires 2026-12-13). Live-minute caps (10 per user, 60 per op) are placeholders.
- `api_token_creator_scope = "self"` for least privilege. Test signed URLs after changing it.
- Out of scope for now: Scheduler + `ember-ingest` job, BigQuery, Pub/Sub, Earth Engine, Load Balancer/Cloud Armor, custom domain.

# EMBER infrastructure: day 1 (Terraform + pipelines)

This folder sets up EMBER's day-1 Google Cloud project as code. It follows
`ember_cloud_setup_day1.md`. You run every command by hand first so you learn
what each piece does. Nothing here has been applied to a real project yet.

```
ember-infra/
├── README.md                    ← you are here
├── terraform/                   ← infrastructure (run terraform here)
│   ├── versions.tf              providers (google / google-beta 8.6.x, time), ADC auth
│   ├── backend.tf               local state now; GCS backend steps (commented)
│   ├── variables.tf             every knob, with defaults + explanations
│   ├── terraform.tfvars.example copy to terraform.tfvars
│   ├── main.tf                  locals, OPTIONAL project creation (off)
│   ├── apis.tf                  day-1 APIs + 60 s propagation wait
│   ├── iam.tf                   4 runtime SAs, teammates, deployer SA
│   ├── firestore.tf             Firestore Native (asia-southeast1) + deny-all rules
│   ├── storage.tf               photo bucket (private, 14-day TTL, CORS) + build-source bucket
│   ├── secrets.tf               empty secrets + per-secret access
│   ├── artifact_registry.tf     Docker repo "ember" + cleanup policy
│   ├── cloud_run.tf             ember-api, voice-gateway, ember-agents (placeholder image)
│   ├── firebase.tf              Firebase project, web app, Hosting site; optional Auth/App Check
│   ├── maps_keys.tf             OPTIONAL restricted Maps keys (off)
│   ├── budget.tf                OPTIONAL budget 25/50/80/100% (off)
│   ├── wif.tf                   OPTIONAL GitHub Workload Identity Federation (off)
│   ├── outputs.tf               URLs, SA emails, Firebase web config ...
│   └── rules/                   firestore.rules, storage.rules (both deny-all)
├── pipelines/                   Cloud Build configs (manual `gcloud builds submit`)
│   ├── cloudbuild-api.yaml / -voice-gateway.yaml / -agents.yaml
│   ├── cloudbuild-web.yaml      Vite build → Firebase Hosting
│   └── firebase.json.example
└── .github/workflows/           GitHub Actions examples (workflow_dispatch only)
    └── deploy-api.yml / deploy-voice-gateway.yml / deploy-agents.yml / deploy-web.yml
```

## Decisions baked in

| Decision | Value |
|---|---|
| Billing | $300 free trial |
| Gemini | **Agent Platform** (`aiplatform.googleapis.com`) with service accounts (`roles/aiplatform.user` on voice-gateway + agents). No API key. `GEMINI_API_KEY` secret only if `create_gemini_api_key_secret = true`. |
| Region | `asia-southeast1` everywhere; `LIVE_LOCATION=us-central1` is only an env var on voice-gateway |
| Firestore | Native mode, `asia-southeast1` (**permanent**) |
| Browser access | Backend-mediated. Firestore rules deny all. Photo bucket private, only signed-URL PUTs from ember-api. Not linked to Firebase Storage. |
| Cloud Run | min 0 / max 3; voice-gateway timeout 3600 s; ember-agents private |
| Team | `team_member_emails` → `roles/editor` |

---

## 1. Prerequisites (your laptop)

- `gcloud` CLI: https://cloud.google.com/sdk/docs/install
- Terraform ≥ 1.9 (tested with **1.16.5**): https://developer.hashicorp.com/terraform/install
- Node 22 + `npx firebase-tools` (for Hosting deploys)
- Docker (optional; Cloud Build can build for you)
- A billing account with the $300 trial (Console → Billing)

## 2. Create the project and link billing (by hand, once)

Terraform *can* do this (`create_project = true`), but doing it by hand first
is simpler and avoids chicken-and-egg problems.

```bash
gcloud auth login                      # you, in the browser
gcloud auth application-default login  # credentials Terraform uses

export PROJECT_ID=ember-fire-commander   # confirm: must be globally unique
gcloud projects create $PROJECT_ID --name="EMBER"
gcloud billing accounts list           # copy the ACCOUNT_ID
gcloud billing projects link $PROJECT_ID --billing-account=XXXXXX-XXXXXX-XXXXXX
gcloud config set project $PROJECT_ID
gcloud auth application-default set-quota-project $PROJECT_ID
```

## 3. Bootstrap APIs Terraform itself needs

```bash
gcloud services enable serviceusage.googleapis.com cloudresourcemanager.googleapis.com
```

Terraform enables everything else (`apis.tf`).

## 4. Run Terraform

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars: project_id, team_member_emails, etc.

terraform init        # downloads providers (writes .terraform.lock.hcl)
terraform fmt         # formats files
terraform validate    # syntax/type check, no cloud calls
terraform plan -out=day1.plan   # READ THIS: what will be created
terraform apply day1.plan
terraform output      # URLs, SA emails, Firebase web config
```

Tips:
- First apply takes ~5 min. If it fails with "API ... has not been used" or
  "service not enabled", wait a minute and run `terraform apply` again.
- If you created the default Hosting site in the console first, import it:
  `terraform import google_firebase_hosting_site.web projects/$PROJECT_ID/sites/$PROJECT_ID`
- Already created something by hand with gcloud? Import it instead of
  recreating, e.g.
  `terraform import 'google_service_account.runtime["ember-api"]' projects/$PROJECT_ID/serviceAccounts/sa-ember-api@$PROJECT_ID.iam.gserviceaccount.com`
  (every resource page in the Terraform registry has an "Import" section).

Learn by turning things on one at a time. Each flag is off by default:

| Flag | What it adds |
|---|---|
| `enable_budget` (+ `billing_account_id`, `budget_alert_emails`) | Budget with 25/50/80/100% alerts, credits excluded so alerts track real usage during the trial |
| `enable_app_check` | reCAPTCHA Enterprise key + App Check provider for the web app |
| `enable_identity_platform` | Auth authorized domains + email/password via Identity Platform (an upgrade; check its pricing page first) |
| `create_maps_keys` | Two restricted Maps keys (key strings stored in state) |
| `create_gemini_api_key_secret` | `GEMINI_API_KEY` secret for the Developer API / direct-Live fallback |
| `enable_github_wif` | GitHub Actions → GCP without JSON keys |

## 5. What each file creates

| File | Resources |
|---|---|
| `apis.tf` | run, artifactregistry, cloudbuild, firestore, storage, secretmanager, iam, iamcredentials, logging, monitoring, firebase, identitytoolkit, fcm, firebaseappcheck, recaptchaenterprise, **aiplatform**, plus firebaserules, firebasehosting, sts, serviceusage, cloudresourcemanager. APIs are left on during `destroy`. |
| `iam.tf` | `sa-ember-api` (datastore.user, firebaseauth.admin, Token Creator on itself for signed URLs), `sa-voice-gateway` (datastore.user, aiplatform.user), `sa-ember-agents` (datastore.user, aiplatform.user), `sa-ember-ingest` (logs only for now; BigQuery later). All get logWriter + metricWriter. Teammates → Editor. `sa-ember-deployer` → run.developer, firebasehosting.admin, logWriter, actAs the 3 runtime SAs only. |
| `firestore.tf` | `(default)` Native DB in `asia-southeast1`, deny-all rules release |
| `storage.tf` | `<project>-ember-photos` (UBLA, public access prevention, delete after 14 days, CORS PUT + Content-Type from localhost:5173 + Hosting domains; objectAdmin for ember-api only). `<project>-ember-build-src` (Cloud Build source uploads, 7-day TTL). |
| `secrets.tf` | Empty `FIRMS_MAP_KEY`, `DATA_GOV_SG_API_KEY` (→ ingest), `MAPS_SERVER_API_KEY` (→ api), optional `GEMINI_API_KEY` (→ gateway) |
| `artifact_registry.tf` | `asia-southeast1-docker.pkg.dev/<project>/ember`, keeps 5 newest, deletes >30 days; deployer = writer |
| `cloud_run.tf` | 3 services on the `hello` image with env vars from the checklist. ember-api + voice-gateway public (auth in code); ember-agents invoker = api + gateway SAs only. Terraform **ignores image changes** so pipelines own the image. |
| `firebase.tf` | Firebase on the project, web app `ember-web`, Hosting site |
| `budget.tf`, `maps_keys.tf`, `wif.tf` | Optional (see flags) |

Secrets are created **empty**. Add values by hand so they never enter Terraform state:

```bash
printf %s "<value>" | gcloud secrets versions add FIRMS_MAP_KEY --data-file=-
```

Don't mount a secret on Cloud Run until it has a version (see the comment in `secrets.tf`).

## 6. Manual steps (console only, or deliberately left manual)

1. **Firebase Auth providers:** Firebase console → Authentication → Sign-in method → enable **Google** (and Email/Password if wanted). **Do not enable Phone.** Settings → Authorized domains: add `<project>.web.app`, `<project>.firebaseapp.com`, `localhost`.
2. **App Check:** Firebase console → App Check → ember-web → reCAPTCHA Enterprise (or `enable_app_check = true`). Each developer registers a **debug token** for localhost (App Check → Apps → ⋮ → Manage debug tokens). Keep `APP_CHECK_ENFORCE=false` (log only) until just before the demo.
3. **FCM web push VAPID key:** Firebase console → Project settings → Cloud Messaging → Web Push certificates → Generate key pair → `VITE_FIREBASE_VAPID_KEY`.
4. **Maps keys** (or `create_maps_keys = true`): Google Maps Platform → Keys & Credentials.
   - Browser key: API restriction = Maps JavaScript API only; application restriction = HTTP referrers (`http://localhost:5173/*`, `https://<project>.web.app/*`, `https://<project>.firebaseapp.com/*`).
   - Server key: API restriction = Weather API only. Put it in `MAPS_SERVER_API_KEY`.
   - Map Management → create a **vector Map ID** → `VITE_MAPS_MAP_ID`.
   - Enable Maps JavaScript API + Weather API in the Maps console.
5. **Maps quotas:** APIs & Services → each Maps API → Quotas: map loads ≤ 400/day, Weather ≤ 300/day.
6. **Spend caps (Preview)**, if your account shows them: Cloud Run ~$20, Agent Platform ~$60.
7. **Secret values:** FIRMS MAP_KEY (register at https://firms.modaps.eosdis.nasa.gov/api/map_key/), data.gov.sg key (optional), Maps server key.
8. **Gemini model access:** in Agent Platform, check the Live model is available to the project in `us-central1`, and whether the trial credit covers a tiny test session (look at Billing → Reports after one "hello").

## 7. Smoke tests

```bash
R=asia-southeast1
gcloud services list --enabled | grep -E 'run|firestore|aiplatform|firebase'
gcloud run services list --region=$R

curl -s -o /dev/null -w '%{http_code}\n' $(terraform output -raw ember_api_url)       # 200
curl -s -o /dev/null -w '%{http_code}\n' $(terraform output -raw voice_gateway_url)   # 200
curl -s -o /dev/null -w '%{http_code}\n' $(terraform output -raw ember_agents_url)    # 403

gcloud firestore databases describe --database='(default)' --format='value(type,locationId)'
gcloud secrets list

# Signed-URL upload as ember-api (you need Token Creator on sa-ember-api;
# Owner is not enough on its own: grant it to yourself temporarily).
# confirm: flags for your gcloud version (gcloud storage sign-url --help)
BUCKET=$(terraform output -raw photo_bucket)
SA=sa-ember-api@$PROJECT_ID.iam.gserviceaccount.com
URL=$(gcloud storage sign-url gs://$BUCKET/test/smoke.jpg \
  --impersonate-service-account=$SA --http-verb=PUT --duration=10m \
  --headers=Content-Type=image/jpeg --format='value(signed_url)')
curl -X PUT -H 'Content-Type: image/jpeg' --data-binary @some.jpg "$URL"
gcloud storage ls gs://$BUCKET/test/
```

Also check: the Hosting URL loads; a client-SDK Firestore read from the browser is **denied**; Google sign-in works locally; the App Check debug token is accepted; the map renders; and a budget alert email arrives (if enabled). After the WSS echo stub is deployed: `npx wscat -c $(terraform output -raw voice_gateway_wss_url)`.

## 8. Deploying code

**By hand first (Cloud Build, from the app repo root):**

```bash
gcloud builds submit . --config=pipelines/cloudbuild-api.yaml --region=asia-southeast1 \
  --gcs-source-staging-dir=gs://$PROJECT_ID-ember-build-src/source
```

Same for `cloudbuild-voice-gateway.yaml` and `cloudbuild-agents.yaml`. Each service folder needs a `Dockerfile` listening on `$PORT`. For the web app, see the header of `cloudbuild-web.yaml` (pass `VITE_*` values as `--substitutions`) and copy `firebase.json.example` to `apps/web/firebase.json`.

Builds run as `sa-ember-deployer` and change **only the image**. Timeout, scaling, env vars and service account stay as Terraform set them. Because `cloud_run.tf` ignores image changes, `terraform apply` never rolls your code back to `hello`.

**Later, GitHub Actions:** set `enable_github_wif = true`, apply, then add repo variables `GCP_PROJECT_ID`, `GCP_WIF_PROVIDER` (`terraform output -raw github_wif_provider`) and `GCP_DEPLOYER_SA`. Copy `.github/workflows/*.yml` into the app repo when you decide to. They are **manual** (`workflow_dispatch`) and only run from `main`. Add `push:` triggers once you trust them.

**Moving state to GCS** when the team shares Terraform: see `terraform/backend.tf`.

## 9. Costs (caveat)

This folder doesn't change the cost estimate in `ember_cost_estimate.md`. Things that cost money only when used: Cloud Run requests (min instances 0), Gemini calls, Maps calls, Cloud Build minutes, storage. Things that can run up a bill: Maps server calls (set quotas), raising `run_min_instances`, leaving Live sessions open. Budgets **alert only**. They don't stop spend. Check each product's pricing page yourself before you switch on optional flags (Identity Platform, reCAPTCHA Enterprise).

## 10. Teardown

```bash
cd terraform
terraform destroy
```

- Firestore is deleted only because `firestore_delete_protection = false` and `deletion_policy = "DELETE"`. Turn protection on before real data.
- **The Firestore location is permanent for the project.** After deletion you can recreate the `(default)` DB, but you can't move an existing one. Pick the region carefully.
- Buckets are force-deleted while `bucket_force_destroy = true`.
- Firebase web app goes into a 30-day soft delete.
- APIs stay enabled (harmless).
- To remove everything, including billing: `gcloud projects delete $PROJECT_ID` (30-day recovery window).

## Notes / confirm list

- `confirm`: project ID availability; billing account currency for `budget_amount`; Maps API service names (`maps-backend.googleapis.com`, `weather.googleapis.com`); `LIVE_MODEL` ID; Live-minute caps (10/user, 60/op are placeholders); signed-URL method in ember-api (IAM signBlob → Token Creator on itself); `firebase-tools` major version.
- Out of scope for day 1 (add later): Eventarc + functions, Scheduler + ember-ingest job, BigQuery, Pub/Sub, Earth Engine, Load Balancer/Cloud Armor, custom domain.

---

# Adopt existing resources (v2, 2026-10-10)

You built everything by hand in the console first. This section makes
Terraform **take over** those resources (import) instead of creating new
ones, stores state in GCS, and sets up a Terraform pipeline. All commands are
**PowerShell on Windows**.

## 0. Move files to the final repo layout

GitHub only reads workflows from `.github/workflows` **at the repo root**.
Today you have `C:\Users\admin_test\Downloads\ember-fire-commander\ember-infra\{terraform,pipelines,.github,README.md}`.

```powershell
cd C:\Users\admin_test\Downloads\ember-fire-commander
Rename-Item ember-infra infra
New-Item -ItemType Directory -Force .github\workflows | Out-Null
Move-Item infra\.github\workflows\* .github\workflows\
Remove-Item infra\.github -Recurse
# Result: .github\workflows\*.yml  and  infra\terraform, infra\pipelines, infra\README.md
```

## A. Create the state bucket (once, by hand)

**Why GCS, not GitHub?** State contains sensitive data (IDs, emails, and any
key strings if you ever manage API keys). GCS gives IAM, private access,
versioning (roll back a bad state) and **locking** so two `apply`s can't
collide. A state file in GitHub has no locking and lives in git history forever.

gcloud:
```powershell
gcloud storage buckets create gs://ember-fire-commander-tfstate `
  --project=ember-fire-commander --location=asia-southeast1 `
  --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets update gs://ember-fire-commander-tfstate --versioning
gcloud storage buckets describe gs://ember-fire-commander-tfstate --format="yaml(location,versioning,iamConfiguration)"
```
Console: Cloud Storage > Buckets > Create > name `ember-fire-commander-tfstate`
> Region `asia-southeast1` > Standard > tick **Enforce public access
prevention** > Access control **Uniform** > Protection: tick **Object
versioning** > Create.

The bucket is NOT in Terraform on purpose (chicken-and-egg).

## B. Init

```powershell
cd C:\Users\admin_test\Downloads\ember-fire-commander\infra\terraform
gcloud auth application-default login      # Terraform uses ADC, not `gcloud auth login`
gcloud auth application-default set-quota-project ember-fire-commander
terraform init
```

## C. Plan (imports)

`imports.tf` holds `import {}` blocks for every resource that already exists.
```powershell
terraform plan -out=tfplan
```
Read the top lines: you want lots of **"will be imported"** and **0 to destroy**.
Look for anything marked `must be replaced` (`-/+`). If you see one on a
resource you built by hand, STOP and send me the plan.

### Expected diffs (intended)

| Resource | Change | Why |
|---|---|---|
| `google_cloud_run_v2_service.voice_gateway` | SA default-compute -> `sa-voice-gateway`, timeout 300s -> 3600s, env vars added | Live config is wrong; WebSockets need 60 min |
| `google_cloud_run_v2_service.ember_api` / `ember_agents` | env vars added (incl. `FIRESTORE_DATABASE=ember-db`), labels added, maybe cpu/memory | Console services had no env vars |
| `google_firestore_database.default` | delete protection DISABLED -> ENABLED | Safety |
| `google_storage_bucket.photos` | CORS added (PUT from localhost:5173 + Hosting domains), labels added | Browser photo upload |
| `google_secret_manager_secret.this[*]`, `google_artifact_registry_repository.ember` | labels added | Tagging only |
| `time_sleep.wait_for_apis` | create | Local helper, touches nothing in GCP |
| `google_firebase_project.this`, `google_firebase_hosting_site.web` | import, probably no change | |

**confirm** (can only be checked by a real plan): AR cleanup-policy IDs
typed in the console may differ from `keep-recent-5` / `delete-older-than-30d`
(in-place update, harmless); Cloud Run CPU/memory from the console may differ
from 1 CPU / 512Mi (in-place). Anything else unexpected: send me the plan.

### Not expected (should NOT appear)
New service accounts, new secrets, new buckets, new API keys, a WIF pool,
budget, App Check or Identity Platform changes. Those are all gated off.

## D. Apply

```powershell
terraform apply tfplan
terraform plan          # second plan should say: No changes.
```
The voice-gateway update creates a new revision (a few seconds; nothing to lose,
it's still the hello image).

## E. Manual fixes (not done by Terraform)

1. **Default compute SA has Editor on the project** — remove it once nothing
   runs as it (after step D, voice-gateway no longer does):
   ```powershell
   gcloud run services list --region asia-southeast1 --format="table(metadata.name,spec.template.spec.serviceAccountName)"
   gcloud projects remove-iam-policy-binding ember-fire-commander `
     --member="serviceAccount:991193351821-compute@developer.gserviceaccount.com" --role="roles/editor"
   ```
   (Cloud Build in some setups uses this SA; our pipelines use their own SAs.)
2. **Least privilege for Token Creator (optional):** sa-ember-api has
   `roles/iam.serviceAccountTokenCreator` at **project** level (can mint tokens
   for every SA). Set `api_token_creator_scope = "self"` in `terraform.tfvars`
   and apply: the plan adds the binding on sa-ember-api itself and removes the
   project-level one. Test signed URLs afterwards.
3. Confirm `aqibpasha.20@gmail.com` is a teammate (it's in tfvars as Editor).
4. App code must open Firestore database **`ember-db`** (env `FIRESTORE_DATABASE`),
   e.g. Python `firestore.Client(database=os.environ["FIRESTORE_DATABASE"])`,
   Node `getFirestore(app, process.env.FIRESTORE_DATABASE)`.
5. Console-managed and staying that way: Auth Google provider, App Check
   (Fraud Defense key, TTL 6h), FCM VAPID key, Map ID, Maps keys, Firestore
   rules, budget alerts, quotas (free trial blocks quota edits).

### Optional adoptions (gated, need IDs Terraform can't guess)
| What | Flag(s) in tfvars | Get the ID |
|---|---|---|
| Firebase web app `ember-web` | `manage_firebase_web_app = true`, `firebase_web_app_id` | `firebase apps:list WEB --project ember-fire-commander` (or Project settings > Your apps > App ID) |
| Maps keys | `create_maps_keys = true`, `maps_browser_key_uid`, `maps_server_key_uid` | `gcloud services api-keys list --project ember-fire-commander --format="table(uid,displayName)"` — **key strings then land in state** |
| Firestore rules | `manage_firestore_rules = true` | release `cloud.firestore/ember-db` (confirm it exists: Firestore > Rules) |

Never set `create_maps_keys = true` without both UIDs, or Terraform creates 2 new keys.

## F. Bootstrap the pipeline identity (local, once)

Chicken-and-egg: the pipeline can't create the identity it logs in with, so
**you** (Owner) run this first apply locally.

1. In `terraform.tfvars` set `enable_github_wif = true` and check
   `github_repository = "<owner>/<repo>"` (confirm the real name).
2. ```powershell
   terraform plan -out=tfplan   # INTENDED additions: sts API, WIF pool+provider,
                                # sa-ember-terraform (+roles), sa-ember-deployer (+roles),
                                # build-src bucket, workloadIdentityUser bindings
   terraform apply tfplan
   terraform output github_wif_provider
   terraform output github_terraform_sa
   terraform output github_deployer_sa
   ```
3. Let the Terraform SA use the state bucket (bucket is outside TF):
   ```powershell
   gcloud storage buckets add-iam-policy-binding gs://ember-fire-commander-tfstate `
     --member="serviceAccount:sa-ember-terraform@ember-fire-commander.iam.gserviceaccount.com" `
     --role="roles/storage.objectAdmin"
   ```

**sa-ember-terraform roles** (Owner-lite, in `cicd_identities.tf`):
projectIamAdmin, serviceAccountAdmin, serviceAccountUser,
workloadIdentityPoolAdmin, serviceUsageAdmin, run.admin, datastore.owner,
storage.admin, secretmanager.admin, artifactregistry.admin, firebase.admin,
firebaserules.admin, serviceusage.apiKeysAdmin, recaptchaenterprise.admin,
monitoring.notificationChannelEditor. Terraform needs broad rights because it
manages IAM; that's why apply is gated by an approval. It cannot touch billing
or delete the project. PR plans also use this SA (WIF trusts any ref of the
repo for it); a stricter option is a separate read-only plan SA.

## G. GitHub setup and first pipeline run

1. Repo > Settings > Secrets and variables > Actions > **Variables**:
   `GCP_WIF_PROVIDER`, `GCP_TF_SA` (from step F); for app deploys also
   `GCP_PROJECT_ID = ember-fire-commander`, `GCP_DEPLOYER_SA`.
2. Settings > Environments > New `production` > Required reviewers: you.
3. Commit + push (`infra/terraform/terraform.tfvars` and `.terraform.lock.hcl`
   ARE committed; `*.tfstate` and `.terraform/` are not).
4. Actions > **terraform** > Run workflow > `plan` → expect **No changes**.
5. From then on: change infra in a PR → plan is posted on the PR → merge →
   Run workflow `apply` on main → approve in `production`.

Cloud Build alternative: `infra/pipelines/cloudbuild-terraform.yaml` (see header).

**Azure vs Google:** this is the same pattern as an Azure Storage Account
backend for state + a federated credential (OIDC) on an Entra app/managed
identity for GitHub Actions. GCS locks natively; Azure uses blob leases. Same idea.

## App deploy pipelines (updated)
`deploy-*.yml` and `pipelines/cloudbuild-{api,agents,voice-gateway}.yaml` now
pass the runtime SA explicitly (voice-gateway: `sa-voice-gateway`,
`--timeout=3600`, session affinity) and set `FIRESTORE_DATABASE=ember-db` /
`EMBER_FIRESTORE_DB=ember-db`, matching Terraform so plans stay clean.

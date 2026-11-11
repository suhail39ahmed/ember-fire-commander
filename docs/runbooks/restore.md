# Restore EMBER on Google Cloud

Two paths. Prefer **(a) undelete** while the 30-day window is open: same project ID, URLs, users, images and data. Use **(b) fresh project** only after the window closes or if you deliberately want a new project (the ID `ember-fire-commander` cannot be reused after permanent deletion).

Secret **values** never go through Terraform. After either path, keep `C:\Users\admin_test\ember-backup\default.tfstate` (and any other copy) private: it contains sensitive attributes.

The committed `infra/terraform/terraform.tfvars` matches the live project (`create_project = false` and the optional Firebase/Maps/App Check/budget flags off). Do not apply `fresh-project.tfvars.example` against the undeleted live project.

## (a) Undelete within 30 days

This is restore, not rebuild. Do **not** run `scripts/bootstrap-gcp.ps1` or create a new state bucket.

1. From an account that can undelete:

   ```powershell
   gcloud projects undelete ember-fire-commander
   ```

2. Confirm the project is `ACTIVE` and billing is still linked:

   ```powershell
   gcloud projects describe ember-fire-commander --format="value(lifecycleState)"
   gcloud billing projects describe ember-fire-commander
   ```

   Re-link billing if needed (the previous billing account ID is in `infra/terraform/terraform.tfvars` as `billing_account_id`):

   ```powershell
   gcloud billing projects link ember-fire-commander --billing-account=XXXXXX-XXXXXX-XXXXXX
   ```

3. Wait a few minutes, then check Cloud Run, Firestore `ember-db`, Secret Manager, Hosting, and the state bucket:

   ```powershell
   gcloud storage ls gs://ember-fire-commander-tfstate/terraform/state/
   gcloud run services list --region=asia-southeast1 --project=ember-fire-commander
   gcloud firestore databases describe --database=ember-db --project=ember-fire-commander
   gcloud secrets list --project=ember-fire-commander
   ```

4. If the state bucket objects are present, leave them. If they are missing, upload the backed-up state (do not commit it to Git):

   ```powershell
   gcloud storage cp C:\Users\admin_test\ember-backup\default.tfstate gs://ember-fire-commander-tfstate/terraform/state/default.tfstate
   ```

5. Optional sanity check after `gcloud auth application-default login`:

   ```powershell
   cd C:\Users\admin_test\Downloads\ember-patches\repo\infra\terraform
   gcloud auth application-default set-quota-project ember-fire-commander
   terraform init
   terraform plan
   ```

   Expect **No changes** to resources. A newly added output (for example `github_actions_variables`) may appear under "Changes to Outputs" only; that does not change GCP. Do not apply from a laptop unless the pipeline cannot run.

6. Smoke-test `https://ember-fire-commander.web.app` (`/console` and `/pwa`), the Cloud Run API and voice-gateway URLs printed by `terraform output`, and Google sign-in with the existing demo accounts. GitHub WIF variables stay valid (same project number).

7. Redeploy a service only if its revision did not come back healthy. Do not rotate App Check, Maps or VAPID keys unless something was wiped.

## (b) Fresh new project

Terraform can provision the skeleton; it cannot finish the product on its own. The first main apply must be local (as project Owner) because GitHub Actions cannot create the WIF identity it logs in with.

### 1. Bootstrap the project and state bucket

Either run the helper (quotes on `-var` flags matter in PowerShell if you invoke Terraform yourself):

```powershell
cd <repo>
.\scripts\bootstrap-gcp.ps1 -ProjectId your-new-project-id -BillingAccountId XXXXXX-XXXXXX-XXXXXX -CreateProject
```

Or apply `infra/terraform/bootstrap` by hand (`create_project = true` or create the project with `gcloud` first and leave that flag false). The bootstrap stack enables `serviceusage.googleapis.com`, `cloudresourcemanager.googleapis.com`, `cloudbilling.googleapis.com`, `storage.googleapis.com` and `iam.googleapis.com`, and creates a versioned, private bucket named `<project_id>-tfstate` by default.

Do not set `-GrantTerraformSa` yet: `sa-ember-terraform` does not exist until the main stack applies with `enable_github_wif = true`.

Bootstrap uses **local** state. Keep that `terraform.tfstate` file private (or migrate it into the new bucket later). If you lose it and need to re-run bootstrap, import the existing bucket first:

```powershell
terraform import "-var=project_id=your-new-project-id" google_storage_bucket.tfstate[0] your-new-project-id-tfstate
```

### 2. Apply the main stack

```powershell
cd infra\terraform
copy fresh-project.tfvars.example my-new-project.tfvars
# Edit project_id, billing_account_id (if needed), team_member_emails, github_repository.
terraform init "-backend-config=bucket=your-new-project-id-tfstate"
terraform apply "-var-file=my-new-project.tfvars"
```

`fresh-project.tfvars.example` turns on the optional flags that stay **off** for the live project so a greenfield apply also creates the Firebase web app, Identity Platform authorized domains, App Check + reCAPTCHA key, restricted Maps keys, and deny-all Firestore rules. It does **not** create: the Google sign-in OAuth client, FCM VAPID key, Maps Map ID, Cloud Run *images*, Hosting *files*, Firestore documents, or demo users.

The main stack already enables every required API through `google_project_service.apis` (including Service Usage and Resource Manager). Bucket names are derived from `project_id` (`<project_id>-ember-photos`, `<project_id>-ember-build-src`). Cloud Run URLs come from resource outputs, not a hardcoded hash.

### 3. Grant the Terraform service account access to the state bucket

```powershell
.\scripts\bootstrap-gcp.ps1 -ProjectId your-new-project-id -GrantTerraformSa
```

### 4. Add secret values

```powershell
.\scripts\restore-secrets.ps1 -ProjectId your-new-project-id
```

This prompts for `FIRMS_MAP_KEY`, `DATA_GOV_SG_API_KEY`, `MAPS_SERVER_API_KEY`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` and runs `gcloud secrets versions add`. Reuse the existing LiveKit Cloud URL if those keys are the same, then set `livekit_url` in your tfvars and apply again so `ember-api` mounts the two LiveKit secrets.

### 5. Console steps that stay outside Terraform

- Firebase Auth: enable the **Google** provider (Identity Platform authorized domains are set when `enable_identity_platform = true`, but the OAuth client is still created in the console). Phone sign-in stays off.
- Authorized domains should include `localhost`, `<site>.web.app` and `<site>.firebaseapp.com`.
- App Check debug tokens for localhost.
- FCM Web Push VAPID key.
- Maps Map ID (previously `ember-map`).

### 6. GitHub repository variables

```powershell
terraform output -json github_actions_variables
terraform output -json github_web_variables
terraform output -json firebase_web_config
terraform output -json maps_browser_key
```

Set at least: `GCP_PROJECT_ID`, `GCP_WIF_PROVIDER` (embeds the **new** project number), `GCP_TF_SA`, `GCP_DEPLOYER_SA`, `VITE_EMBER_API_URL`, `VITE_VOICE_GATEWAY_WSS_URL`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_VAPID_KEY`, `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY`, `VITE_MAPS_BROWSER_KEY`, `VITE_MAPS_MAP_ID`.

If the Hosting site ID is not `ember-fire-commander`, set the repository variable `FIREBASE_HOSTING_SITE` to the site ID (same as `terraform output hosting_url` without the scheme/domain). `deploy-web.yml` rewrites `apps/web/firebase.json` only when that variable is set, so the live project keeps deploying to `ember-fire-commander` without any new variable.

### 7. Deploy application images and the website

Run from `main`, in order: `deploy-api`, `deploy-agents`, `deploy-voice-gateway`, `deploy-ingest` (optional `run_now`, or `python -m ingest.run --seed-demo`), `deploy-web`. Until those run, Cloud Run serves the public hello placeholder.

Point `GCP_WIF_PROVIDER` at the new project **before** expecting Actions to work. The first WIF apply is the local apply in step 2.

### 8. Demo data and users

Sign in with the demo Gmail accounts and complete volunteer/supervisor registration so custom claims exist. Recreate `ops/config` (`demoMode`) if the simulated-demo strip is needed. Scenario data lives in `docs/demo/scenario-data.json` and is not loaded by Terraform.

## What a fresh apply still cannot do

| Item | Why |
|---|---|
| Secret **values** | `scripts/restore-secrets.ps1` / `gcloud secrets versions add` |
| Cloud Run and job images | GitHub deploy workflows |
| Hosting file content | `deploy-web.yml` |
| Google sign-in OAuth client | Firebase console |
| FCM VAPID key | Firebase console |
| Maps Map ID | Google Maps console |
| Firestore documents and demo users | App registration + optional ingest seed |
| Project Owner binding | Kept outside Terraform on purpose |
| Maps quotas | Console, after leaving the trial |

## Plan safety (live project)

New resources in `infra/terraform` stay behind the existing flags (`create_project`, `manage_firebase_web_app`, `enable_identity_platform`, `enable_app_check`, `create_maps_keys`, `manage_firestore_rules`, `enable_budget`, `create_gemini_api_key_secret`), all of which remain `false` in the committed `terraform.tfvars`. The state bucket and project creation live only in `infra/terraform/bootstrap`. Empty Maps key UIDs now create keys instead of failing, but only when `create_maps_keys = true`.

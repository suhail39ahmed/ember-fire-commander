# ---------------------------------------------------------------------------
# CI/CD identities — ALL gated behind enable_github_wif (default false).
# None of this exists live yet. Turning the flag on is an INTENDED addition:
#   - sa-ember-deployer  : app pipelines (Cloud Build / GitHub Actions) deploy images
#   - sa-ember-terraform : the Terraform pipeline plans/applies this folder
#   - build-src bucket   : Cloud Build source staging
#   - WIF pool/provider  : in wif.tf
# Bootstrap: the FIRST apply with enable_github_wif = true must run locally
# (Suhail, Owner) — the pipeline can't create the identity it logs in with.
# ---------------------------------------------------------------------------
locals {
  cicd = var.enable_github_wif ? 1 : 0

  # Roles for sa-ember-terraform. Broad on purpose: Terraform manages IAM,
  # Cloud Run, Firestore, Firebase, secrets (metadata only), buckets, APIs.
  # This is an "Owner-lite" set; it can't touch billing or delete the project.
  terraform_sa_roles = [
    "roles/resourcemanager.projectIamAdmin", # project IAM bindings
    "roles/iam.serviceAccountAdmin",         # create SAs + SA-level IAM
    "roles/iam.serviceAccountUser",          # attach SAs to Cloud Run
    "roles/iam.workloadIdentityPoolAdmin",   # WIF pool/provider
    "roles/serviceusage.serviceUsageAdmin",  # enable APIs
    "roles/run.admin",                       # Cloud Run services + IAM
    "roles/datastore.owner",                 # Firestore DB + backup schedules
    "roles/storage.admin",                   # buckets (incl. reading the state bucket)
    "roles/secretmanager.admin",             # secret metadata + IAM (never values)
    "roles/artifactregistry.admin",          # repo + cleanup policies
    "roles/firebase.admin",                  # Firebase project/web app/hosting/app check
    "roles/firebaserules.admin",             # Firestore rules (if managed)
    "roles/serviceusage.apiKeysAdmin",       # API keys (if managed)
    "roles/recaptchaenterprise.admin",       # App Check key (if managed)
    "roles/monitoring.notificationChannelEditor",
    "roles/cloudscheduler.admin", # ember-ingest hourly trigger (#26)
  ]
}

resource "google_service_account" "deployer" {
  count        = local.cicd
  project      = local.project_id
  account_id   = "sa-ember-deployer"
  display_name = "EMBER deployer (Cloud Build / GitHub Actions app deploys)"

  depends_on = [time_sleep.wait_for_apis]
}

resource "google_project_iam_member" "deployer" {
  for_each = var.enable_github_wif ? toset([
    "roles/run.developer",                     # deploy new revisions (not change IAM)
    "roles/logging.logWriter",                 # Cloud Build writes build logs as this SA
    "roles/firebasehosting.admin",             # firebase deploy --only hosting
    "roles/serviceusage.serviceUsageConsumer", # firebase-tools quota project checks
  ]) : toset([])

  project = local.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.deployer[0].email}"
}

# Deployer may "act as" the Cloud Run runtime SAs (ember-ingest added for the job, #26) (needed by
# `gcloud run deploy --service-account`), and nothing else.
resource "google_service_account_iam_member" "deployer_acts_as_runtime" {
  for_each = var.enable_github_wif ? toset(["ember-api", "voice-gateway", "ember-agents", "ember-ingest"]) : toset([])

  service_account_id = google_service_account.runtime[each.value].name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer[0].email}"
}

resource "google_artifact_registry_repository_iam_member" "deployer_writer" {
  count      = local.cicd
  project    = local.project_id
  location   = google_artifact_registry_repository.ember.location
  repository = google_artifact_registry_repository.ember.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.deployer[0].email}"
}

# Cloud Build source staging bucket; keeps the deployer away from photos.
resource "google_storage_bucket" "build_src" {
  count    = local.cicd
  project  = local.project_id
  name     = "${local.project_id}-ember-build-src"
  location = upper(var.region)

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = true
  labels                      = local.labels

  lifecycle_rule {
    condition {
      age = 7
    }
    action {
      type = "Delete"
    }
  }

  depends_on = [time_sleep.wait_for_apis]
}

resource "google_storage_bucket_iam_member" "build_src_deployer" {
  count  = local.cicd
  bucket = google_storage_bucket.build_src[0].name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.deployer[0].email}"
}

# ---------------- Terraform pipeline identity
resource "google_service_account" "terraform" {
  count        = local.cicd
  project      = local.project_id
  account_id   = "sa-ember-terraform"
  display_name = "EMBER Terraform pipeline (plan/apply)"

  depends_on = [time_sleep.wait_for_apis]
}

resource "google_project_iam_member" "terraform" {
  for_each = var.enable_github_wif ? toset(local.terraform_sa_roles) : toset([])

  project = local.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.terraform[0].email}"
}

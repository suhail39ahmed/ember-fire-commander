# Real, NON-SECRET values for project ember-fire-commander (verified 2026-10-10).
# No secret values here, ever: secret VALUES go in with `gcloud secrets versions add`.
# This file is safe to commit for a private repo (the pipeline needs it);
# it only holds IDs and teammate emails.

project_id         = "ember-fire-commander" # project number 991193351821
region             = "asia-southeast1"
create_project     = false
billing_account_id = "01696D-367603-4DF080" # only used if enable_budget = true

# Teammate Editors. The project Owner binding is not managed here.
team_member_emails = [
  "aqibpasha.20@gmail.com",
  "mdnaushad5009@gmail.com",
  "zeesh.rocky@gmail.com",
]
team_role = "roles/editor"

# Gemini via Agent Platform (service accounts). No GEMINI_API_KEY secret live.
create_gemini_api_key_secret = false
live_location                = "us-central1"
live_model                   = "gemini-live-2.5-flash-native-audio"

# Firestore: named database "ember-db". Location is PERMANENT.
firestore_database_name     = "ember-db"
firestore_location          = "asia-southeast1"
firestore_delete_protection = true
manage_firestore_rules      = false # deny-all rules are managed outside Terraform

# Photo bucket: ember-fire-commander-ember-photos (name derived from project_id)
photo_retention_days = 14
bucket_force_destroy = false

# Cloud Run
run_min_instances       = 0
run_max_instances       = 3
run_deletion_protection = false
app_check_enforce       = false

# IAM shape that matches live
api_token_creator_scope    = "project" # live; "self" = least privilege later
enable_observability_roles = false

# Firebase (project + default Hosting site are always managed)
hosting_site_id          = "ember-fire-commander"
manage_firebase_web_app  = false # set true + fill firebase_web_app_id to manage ember-web
firebase_web_app_id      = ""    # firebase apps:list WEB --project ember-fire-commander
enable_identity_platform = false # Auth (Google sign-in) stays console-managed
enable_app_check         = false # App Check stays console-managed (would create a 2nd key)

# Maps keys are kept out of Terraform. To manage them: create_maps_keys = true + both UIDs.
create_maps_keys     = false
maps_browser_key_uid = "" # gcloud services api-keys list --project ember-fire-commander
maps_server_key_uid  = ""

# Budget: billingbudgets API not enabled; you already have console budget alerts.
enable_budget       = false
budget_amount       = 50
budget_alert_emails = ["suhail39ahmed@gmail.com"]

# CI/CD: GitHub Workload Identity Federation + sa-ember-terraform + sa-ember-deployer.
enable_github_wif  = true
github_repository  = "suhail39ahmed/ember-fire-commander"
github_allowed_ref = "refs/heads/main"

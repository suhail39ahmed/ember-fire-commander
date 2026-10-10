# Real, NON-SECRET values for project ember-fire-commander (verified 2026-10-10).
# No secret values here, ever: secret VALUES go in with `gcloud secrets versions add`.
# This file is safe to commit for a private repo (the pipeline needs it);
# it only holds IDs and teammate emails.

project_id         = "ember-fire-commander" # project number 991193351821
region             = "asia-southeast1"
create_project     = false
billing_account_id = "01696D-367603-4DF080" # only used if enable_budget = true

# Live Editors (imported). Your own Owner binding is not managed here.
team_member_emails = [
  "aqibpasha.20@gmail.com", # confirm: 4th teammate
  "mdnaushad5009@gmail.com",
  "zeesh.rocky@gmail.com",
]
team_role = "roles/editor"

# Gemini via Agent Platform (service accounts). No GEMINI_API_KEY secret live.
create_gemini_api_key_secret = false
live_location                = "us-central1"

# Firestore: hand-made DB is "ember-db". Location is PERMANENT.
firestore_database_name     = "ember-db"
firestore_location          = "asia-southeast1"
firestore_delete_protection = true  # live: OFF -> plan turns it ON (intended)
manage_firestore_rules      = false # live deny-all rules stay console-managed

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

# Firebase (project + default Hosting site are always imported)
hosting_site_id          = "ember-fire-commander"
manage_firebase_web_app  = false # set true + fill firebase_web_app_id to adopt ember-web
firebase_web_app_id      = ""    # firebase apps:list WEB --project ember-fire-commander
enable_identity_platform = false # Auth (Google sign-in) stays console-managed
enable_app_check         = false # App Check stays console-managed (would create a 2nd key)

# Maps keys (console-made). To adopt: create_maps_keys = true + both UIDs.
create_maps_keys     = false
maps_browser_key_uid = "" # gcloud services api-keys list --project ember-fire-commander
maps_server_key_uid  = ""

# Budget: billingbudgets API not enabled; you already have console budget alerts.
enable_budget       = false
budget_amount       = 50
budget_alert_emails = ["suhail39ahmed@gmail.com"]

# CI/CD: OFF for the first (adoption) apply. Then flip to true and apply
# LOCALLY once (bootstrap) to create WIF + sa-ember-terraform + sa-ember-deployer.
enable_github_wif  = true
github_repository  = "suhail39ahmed/ember-fire-commander" # confirm: real owner/repo
github_allowed_ref = "refs/heads/main"

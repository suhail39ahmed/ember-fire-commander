# ---------------------------------------------------------------------------
# Adopt resources that were created BY HAND in the console (2026-10-10).
#
# `import {}` blocks (Terraform >= 1.5; for_each in import needs >= 1.7) make
# `terraform plan` show "will be imported" instead of "will be created".
# `terraform apply` then writes them into state. After the first successful
# apply these blocks are no-ops; you may delete this file (or keep it as
# documentation — re-importing something already in state is skipped).
#
# ID formats are for hashicorp/google 8.x. Import IDs may only use variables
# and locals that are known at plan time (no resource attributes).
# ---------------------------------------------------------------------------
locals {
  p   = var.project_id
  r   = var.region
  sa  = { for k, _ in local.runtime_sas : k => "sa-${k}@${var.project_id}.iam.gserviceaccount.com" }
  run = "projects/${var.project_id}/locations/${var.region}/services"

  # APIs verified enabled live. (sts / billingbudgets / apikeys are NOT
  # imported: they're either gated or not confirmed enabled.)
  live_apis = toset([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "firestore.googleapis.com",
    "storage.googleapis.com",
    "secretmanager.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "firebase.googleapis.com",
    "identitytoolkit.googleapis.com",
    "fcm.googleapis.com",
    "firebaseappcheck.googleapis.com",
    "recaptchaenterprise.googleapis.com",
    "aiplatform.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "serviceusage.googleapis.com",
    "firebaserules.googleapis.com",
    "firebasehosting.googleapis.com",
    "maps-backend.googleapis.com",
    "weather.googleapis.com",
  ])
}

# ---------------- APIs  (ID: <project>/<service>)
import {
  for_each = local.live_apis
  to       = google_project_service.apis[each.value]
  id       = "${local.p}/${each.value}"
}

# ---------------- Service accounts (ID: projects/<p>/serviceAccounts/<email>)
import {
  for_each = local.runtime_sas
  to       = google_service_account.runtime[each.key]
  id       = "projects/${local.p}/serviceAccounts/${local.sa[each.key]}"
}

# ---------------- Project IAM members (ID: "<project> <role> <member>")
import {
  for_each = { for p in local.sa_role_pairs : "${p.sa}|${p.role}" => p }
  to       = google_project_iam_member.runtime[each.key]
  id       = "${local.p} ${each.value.role} serviceAccount:${local.sa[each.value.sa]}"
}

import {
  for_each = var.api_token_creator_scope == "project" ? toset(["0"]) : toset([])
  to       = google_project_iam_member.api_token_creator_project[0]
  id       = "${local.p} roles/iam.serviceAccountTokenCreator serviceAccount:${local.sa["ember-api"]}"
}

import {
  for_each = toset(var.team_member_emails)
  to       = google_project_iam_member.team[each.value]
  id       = "${local.p} ${var.team_role} user:${each.value}"
}

# ---------------- Firestore
import {
  to = google_firestore_database.default
  id = "projects/${local.p}/databases/${var.firestore_database_name}"
}

import {
  to = google_firestore_backup_schedule.daily
  id = "projects/${local.p}/databases/${var.firestore_database_name}/backupSchedules/b4a483ed-d7c3-47f6-90d0-2d2637438d44"
}

# Rules release (gated). ruleset itself is created fresh (rulesets are immutable).
import {
  for_each = var.manage_firestore_rules ? toset(["0"]) : toset([])
  to       = google_firebaserules_release.firestore[0]
  id       = "projects/${local.p}/releases/${var.firestore_database_name == "(default)" ? "cloud.firestore" : "cloud.firestore/${var.firestore_database_name}"}"
}

# ---------------- Storage
import {
  to = google_storage_bucket.photos
  id = "${local.p}-ember-photos"
}

import {
  to = google_storage_bucket_iam_member.photos_api_object_user
  id = "b/${local.p}-ember-photos roles/storage.objectUser serviceAccount:${local.sa["ember-api"]}"
}

# ---------------- Secrets (metadata + accessor IAM only; values never in TF)
import {
  for_each = local.secrets
  to       = google_secret_manager_secret.this[each.key]
  id       = "projects/${local.p}/secrets/${each.key}"
}

import {
  for_each = { for p in local.secret_accessor_pairs : "${p.secret}|${p.sa}" => p }
  to       = google_secret_manager_secret_iam_member.accessor[each.key]
  id       = "projects/${local.p}/secrets/${each.value.secret} roles/secretmanager.secretAccessor serviceAccount:${local.sa[each.value.sa]}"
}

# ---------------- Artifact Registry
import {
  to = google_artifact_registry_repository.ember
  id = "projects/${local.p}/locations/${local.r}/repositories/ember"
}

# ---------------- Cloud Run services + invokers
import {
  to = google_cloud_run_v2_service.ember_api
  id = "${local.run}/ember-api"
}

import {
  to = google_cloud_run_v2_service.voice_gateway
  id = "${local.run}/voice-gateway"
}

import {
  to = google_cloud_run_v2_service.ember_agents
  id = "${local.run}/ember-agents"
}

import {
  to = google_cloud_run_v2_service_iam_member.api_public
  id = "${local.run}/ember-api roles/run.invoker allUsers"
}

# confirm: voice-gateway was recreated with "Allow public access". If the
# binding doesn't exist, plan fails on this import: delete this block and
# Terraform will simply create the binding instead.
import {
  to = google_cloud_run_v2_service_iam_member.gateway_public
  id = "${local.run}/voice-gateway roles/run.invoker allUsers"
}

import {
  for_each = toset(["ember-api", "voice-gateway"])
  to       = google_cloud_run_v2_service_iam_member.agents_invokers[each.value]
  id       = "${local.run}/ember-agents roles/run.invoker serviceAccount:${local.sa[each.value]}"
}

# ---------------- Firebase
import {
  to = google_firebase_project.this
  id = "projects/${local.p}"
}

import {
  to = google_firebase_hosting_site.web
  id = "projects/${local.p}/sites/${local.hosting_site_id}"
}

# GATED: needs the web app's App ID (firebase apps:list WEB --project ember-fire-commander)
import {
  for_each = var.manage_firebase_web_app ? toset([var.firebase_web_app_id]) : toset([])
  to       = google_firebase_web_app.ember_web[0]
  id       = "projects/${local.p}/webApps/${each.value}"
}

# ---------------- Maps API keys (GATED: needs key UIDs)
#   gcloud services api-keys list --project ember-fire-commander --format="table(uid,displayName)"
import {
  for_each = var.create_maps_keys ? toset([var.maps_browser_key_uid]) : toset([])
  to       = google_apikeys_key.maps_browser[0]
  id       = "projects/${local.p}/locations/global/keys/${each.value}"
}

import {
  for_each = var.create_maps_keys ? toset([var.maps_server_key_uid]) : toset([])
  to       = google_apikeys_key.maps_server[0]
  id       = "projects/${local.p}/locations/global/keys/${each.value}"
}

# NOT imported on purpose (console-managed, see README):
#   - Firebase Auth Google provider, App Check registration (Fraud Defense key)
#   - Firestore rules (unless manage_firestore_rules)
#   - Owner binding (suhail39ahmed@gmail.com), default compute SA + its Editor
#   - firebase-adminsdk-fbsvc SA, Firebase auto-created browser API key
#   - Secret VERSIONS (values must never enter state)
#   - Console budget alerts

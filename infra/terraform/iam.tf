# ---------------------------------------------------------------------------
# Runtime service accounts: one per service, least privilege (checklist step 4)
# These four exist already (created by hand) and are imported in imports.tf.
# ---------------------------------------------------------------------------
locals {
  runtime_sas = {
    ember-api     = "ember-api runtime"
    voice-gateway = "voice-gateway runtime"
    ember-agents  = "ember-agents runtime"
    ember-ingest  = "ember-ingest runtime (job, later)"
  }

  # Project-level roles per SA = what is live today (verified 2026-10-10), plus
  # the NEW grants noted below, which are created by apply and have no import.
  # Every other key "<sa>|<role>" here has a matching import block in imports.tf.
  sa_project_roles_live = {
    "ember-api" = [
      "roles/datastore.user",     # Firestore read/write via Admin SDK
      "roles/firebaseauth.admin", # verify users / custom tokens
      # NEW (#23): firebase_admin messaging.send() calls FCM HTTP v1, which needs
      # cloudmessaging.messages.create. Smallest predefined role that has it
      # (the service-agent roles that also do are off limits to normal SAs).
      "roles/firebasecloudmessaging.admin",
    ]
    "voice-gateway" = [
      "roles/datastore.user",  # writes observations
      "roles/aiplatform.user", # Gemini Live via Agent Platform
    ]
    "ember-agents" = [
      "roles/datastore.user",
      "roles/aiplatform.user", # Flash + ADK
    ]
    "ember-ingest" = [
      "roles/logging.logWriter",
      "roles/datastore.user", # #26: writes leads, weather, psi, ingestRuns
      # LATER: roles/bigquery.dataEditor (dataset-level) + roles/bigquery.jobUser
    ]
  }

  # OPTIONAL extras (enable_observability_roles, default false). Not live.
  # Cloud Run already ships stdout logs without these; they matter only if the
  # code writes logs/metrics through the client libraries.
  sa_project_roles_observability = var.enable_observability_roles ? {
    for sa in ["ember-api", "voice-gateway", "ember-agents"] :
    sa => ["roles/logging.logWriter", "roles/monitoring.metricWriter"]
  } : {}

  sa_role_pairs = flatten([
    for sa, roles in local.sa_project_roles_live : [
      for r in roles : { sa = sa, role = r }
    ]
  ])

  sa_role_pairs_obs = flatten([
    for sa, roles in local.sa_project_roles_observability : [
      for r in roles : { sa = sa, role = r }
    ]
  ])
}

resource "google_service_account" "runtime" {
  for_each = local.runtime_sas

  project      = local.project_id
  account_id   = "sa-${each.key}"
  display_name = each.value

  depends_on = [time_sleep.wait_for_apis]

  lifecycle {
    # display_name/description were typed by hand in the console; don't fight them.
    ignore_changes = [display_name, description]
  }
}

resource "google_project_iam_member" "runtime" {
  for_each = { for p in local.sa_role_pairs : "${p.sa}|${p.role}" => p }

  project = local.project_id
  role    = each.value.role
  member  = "serviceAccount:${google_service_account.runtime[each.value.sa].email}"
}

resource "google_project_iam_member" "runtime_observability" {
  for_each = { for p in local.sa_role_pairs_obs : "${p.sa}|${p.role}" => p }

  project = local.project_id
  role    = each.value.role
  member  = "serviceAccount:${google_service_account.runtime[each.value.sa].email}"
}

# ember-api signs GCS URLs with the IAM signBlob API (Cloud Run has no key
# file), which needs Token Creator.
#
# LIVE: granted at PROJECT level (= ember-api can mint tokens for ANY SA in the
# project). Kept as-is so the import is a no-op.
# LEAST PRIVILEGE (later): set api_token_creator_scope = "self". The plan then
# ADDS a binding on sa-ember-api itself and REMOVES the project-level one.
resource "google_project_iam_member" "api_token_creator_project" {
  count = var.api_token_creator_scope == "project" ? 1 : 0

  project = local.project_id
  role    = "roles/iam.serviceAccountTokenCreator"
  member  = "serviceAccount:${google_service_account.runtime["ember-api"].email}"
}

resource "google_service_account_iam_member" "api_self_token_creator" {
  count = var.api_token_creator_scope == "self" ? 1 : 0

  service_account_id = google_service_account.runtime["ember-api"].name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.runtime["ember-api"].email}"
}

# ---------------------------------------------------------------------------
# Teammates (Editor). Editor cannot change IAM; only you (Owner) can.
# Your own Owner binding is deliberately NOT managed by Terraform.
# ---------------------------------------------------------------------------
resource "google_project_iam_member" "team" {
  for_each = toset(var.team_member_emails)

  project = local.project_id
  role    = var.team_role
  member  = "user:${each.value}"
}

# NOTE: the default compute SA (<number>-compute@developer.gserviceaccount.com)
# has roles/editor live. Terraform deliberately does NOT manage it. Remove it by
# hand once nothing runs as it (README "Manual fixes").

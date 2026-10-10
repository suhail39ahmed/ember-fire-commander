# ---------------------------------------------------------------------------
# Secret Manager — checklist step 8
# Terraform creates EMPTY secrets (no versions). You add values by hand so
# they never land in Terraform state:
#   printf %s "<value>" | gcloud secrets versions add FIRMS_MAP_KEY --data-file=-
# Each secret is readable ONLY by the service account that needs it.
# ---------------------------------------------------------------------------
locals {
  secrets = merge(
    {
      FIRMS_MAP_KEY       = ["ember-ingest"]
      DATA_GOV_SG_API_KEY = ["ember-ingest"]
      MAPS_SERVER_API_KEY = ["ember-api"]
    },
    var.create_gemini_api_key_secret ? {
      # Only for Developer API (option b) / direct ephemeral-token fallback.
      GEMINI_API_KEY = ["voice-gateway"]
    } : {}
  )

  secret_accessor_pairs = flatten([
    for name, sas in local.secrets : [
      for sa in sas : { secret = name, sa = sa }
    ]
  ])
}

resource "google_secret_manager_secret" "this" {
  for_each = local.secrets

  project   = local.project_id
  secret_id = each.key
  labels    = local.labels

  replication {
    auto {}
  }

  depends_on = [time_sleep.wait_for_apis]
}

resource "google_secret_manager_secret_iam_member" "accessor" {
  for_each = { for p in local.secret_accessor_pairs : "${p.secret}|${p.sa}" => p }

  project   = local.project_id
  secret_id = google_secret_manager_secret.this[each.value.secret].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime[each.value.sa].email}"
}

# NOTE: secrets are NOT mounted on Cloud Run yet (checklist: don't mount a
# secret until it has a version, or the revision fails to start). When
# MAPS_SERVER_API_KEY has a version, add to ember-api in cloud_run.tf:
#
#   env {
#     name = "MAPS_SERVER_API_KEY"
#     value_source {
#       secret_key_ref {
#         secret  = google_secret_manager_secret.this["MAPS_SERVER_API_KEY"].secret_id
#         version = "latest"
#       }
#     }
#   }

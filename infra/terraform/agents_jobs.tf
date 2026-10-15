# ---------------------------------------------------------------------------
# ember-agents extras for photo triage (#24) and re-ignition watch (#25).
#
# Already in place (iam.tf / cloud_run.tf), not repeated here:
#   sa-ember-agents: roles/datastore.user, roles/aiplatform.user (project)
#   sa-ember-api, sa-voice-gateway: roles/run.invoker on ember-agents
#
# Needs the Cloud Scheduler API and roles/cloudscheduler.admin on the
# Terraform SA, both added by the ingest change (#26). Merge that first.
# ---------------------------------------------------------------------------

# Photo triage reads the uploaded photo. Read-only, this bucket only.
resource "google_storage_bucket_iam_member" "photos_agents_object_viewer" {
  bucket = google_storage_bucket.photos.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.runtime["ember-agents"].email}"
}

# Dedicated identity for the scan trigger. Its only grant is run.invoker on
# ember-agents, so nothing else can be reached with its OIDC token.
resource "google_service_account" "sites_scan_scheduler" {
  project      = local.project_id
  account_id   = "sa-ember-scheduler"
  display_name = "Cloud Scheduler caller for ember-agents"

  depends_on = [time_sleep.wait_for_apis]
}

resource "google_cloud_run_v2_service_iam_member" "agents_scheduler_invoker" {
  project  = local.project_id
  location = var.region
  name     = google_cloud_run_v2_service.ember_agents.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.sites_scan_scheduler.email}"
}

resource "google_cloud_scheduler_job" "ember_sites_scan" {
  project          = local.project_id
  region           = var.region
  name             = "ember-sites-scan"
  description      = "Re-ignition watch: POST ember-agents /internal/sites/scan."
  schedule         = var.sites_scan_schedule
  time_zone        = "Etc/UTC"
  paused           = var.sites_scan_schedule_paused
  attempt_deadline = "120s"

  # No retry_config: Cloud Scheduler's default retry_count is 0 (no retry; the
  # next run is 15 minutes away). An explicit `retry_count = 0` is never kept
  # in state by the provider, so it showed as a change on every plan.

  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.ember_agents.uri}/internal/sites/scan"
    headers = {
      "Content-Type" = "application/json"
    }
    body = base64encode("{}")

    oidc_token {
      service_account_email = google_service_account.sites_scan_scheduler.email
      audience              = google_cloud_run_v2_service.ember_agents.uri
    }
  }

  depends_on = [
    google_cloud_run_v2_service_iam_member.agents_scheduler_invoker,
    google_project_iam_member.terraform, # cloudscheduler.admin for the pipeline SA
  ]
}

# ---------------------------------------------------------------------------
# Hourly ingest (#26): Cloud Run JOB ember-ingest + Cloud Scheduler trigger.
# Code: jobs/ingest. Image: deploy-ingest.yml (Terraform ignores image changes).
#
# Writes Firestore leads (FIRMS hotspots, labelled unverified), weather/current
# (windKmh, read by the agents WITHDRAW rule) and psi/current, plus an
# ingestRuns report per run. It never writes incidents.
#
# FIRMS_MAP_KEY / DATA_GOV_SG_API_KEY are read at run time through the Secret
# Manager API (accessor bindings in secrets.tf), NOT mounted, so the job still
# starts before a secret has a version; only the FIRMS step reports a failure.
# ---------------------------------------------------------------------------
resource "google_cloud_run_v2_job" "ember_ingest" {
  project             = local.project_id
  name                = "ember-ingest"
  location            = var.region
  deletion_protection = var.run_deletion_protection
  labels              = local.labels

  template {
    task_count = 1

    template {
      service_account = google_service_account.runtime["ember-ingest"].email
      timeout         = "600s"
      max_retries     = 0 # next hourly run is the retry; don't hammer FIRMS

      containers {
        image = var.ingest_job_placeholder_image

        resources {
          limits = {
            cpu    = "1"
            memory = "512Mi"
          }
        }

        env {
          name  = "GOOGLE_CLOUD_PROJECT"
          value = local.project_id
        }
        env {
          name  = "FIRESTORE_DATABASE"
          value = google_firestore_database.default.name # "ember-db"
        }
        env {
          name  = "EMBER_FIRESTORE_DB"
          value = google_firestore_database.default.name
        }
        env {
          name  = "EMBER_FIRMS_BBOX"
          value = "95,-6,119,6" # west,south,east,north: Sumatra + Kalimantan
        }
        env {
          name  = "EMBER_FIRMS_SOURCE"
          value = "VIIRS_SNPP_NRT"
        }
        env {
          name  = "EMBER_WEATHER_LAT"
          value = "-1.849" # demo area (docs/demo/scenario-data.json)
        }
        env {
          name  = "EMBER_WEATHER_LNG"
          value = "110.051"
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].template[0].containers[0].image, # deploy-ingest.yml owns the image
      client,
      client_version,
    ]
  }

  depends_on = [google_project_iam_member.runtime, google_firestore_database.default]
}

# Scheduler calls the Run Admin API as sa-ember-ingest, which may run only this job.
resource "google_cloud_run_v2_job_iam_member" "ingest_scheduler_invoker" {
  project  = local.project_id
  location = var.region
  name     = google_cloud_run_v2_job.ember_ingest.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.runtime["ember-ingest"].email}"
}

resource "google_cloud_scheduler_job" "ember_ingest_hourly" {
  project          = local.project_id
  region           = var.region
  name             = "ember-ingest-hourly"
  description      = "Runs the ember-ingest Cloud Run job (FIRMS leads, weather, PSI)."
  schedule         = var.ingest_schedule
  time_zone        = "Etc/UTC"
  paused           = var.ingest_schedule_paused
  attempt_deadline = "180s"

  # No retry_config: Cloud Scheduler's default retry_count is 0 (no retry; the
  # next hourly run is the retry). An explicit `retry_count = 0` is never kept
  # in state by the provider, so it showed as a change on every plan.

  http_target {
    http_method = "POST"
    uri         = "https://run.googleapis.com/v2/projects/${local.project_id}/locations/${var.region}/jobs/${google_cloud_run_v2_job.ember_ingest.name}:run"

    oauth_token {
      service_account_email = google_service_account.runtime["ember-ingest"].email
      scope                 = "https://www.googleapis.com/auth/cloud-platform"
    }
  }

  depends_on = [
    google_cloud_run_v2_job_iam_member.ingest_scheduler_invoker,
    google_project_iam_member.terraform, # cloudscheduler.admin for the pipeline SA
  ]
}

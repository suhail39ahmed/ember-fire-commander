# ---------------------------------------------------------------------------
# Photo bucket — checklist step 7
# Private, uniform access, no public access, 14-day lifecycle, CORS for
# signed-URL PUTs from the PWA. NOT linked to Firebase Storage on purpose.
# ---------------------------------------------------------------------------
resource "google_storage_bucket" "photos" {
  project  = local.project_id
  name     = "${local.project_id}-ember-photos"
  location = upper(var.region)

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = var.bucket_force_destroy
  labels                      = local.labels

  # Live: 7-day soft delete (console default).
  soft_delete_policy {
    retention_duration_seconds = 604800
  }

  lifecycle_rule {
    condition {
      age = var.photo_retention_days
    }
    action {
      type = "Delete"
    }
  }

  # INTENDED CHANGE: not live yet. Needed so the PWA can PUT photos to
  # signed URLs from the browser.
  cors {
    origin          = local.photo_origins
    method          = ["PUT"]
    response_header = ["Content-Type"]
    max_age_seconds = 3600
  }

  depends_on = [time_sleep.wait_for_apis]
}

# Only ember-api can read/write objects in this bucket.
# Live role: objectUser (read/write/delete objects, no bucket IAM changes).
resource "google_storage_bucket_iam_member" "photos_api_object_user" {
  bucket = google_storage_bucket.photos.name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.runtime["ember-api"].email}"
}

# build-src bucket for Cloud Build lives in cicd_identities.tf (gated).

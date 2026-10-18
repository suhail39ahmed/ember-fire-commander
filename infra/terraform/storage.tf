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

  # Allows the PWA to PUT photos and video clips to signed URLs, and allows the
  # supervisor console to GET signed video URLs for playback. GET is required
  # because Safari sends Origin on <video> range requests even without the
  # crossorigin attribute; without it, seeking fails on Safari. Content-Range
  # and Accept-Ranges must be exposed so range-aware players can buffer correctly.
  cors {
    origin          = local.photo_origins
    method          = ["PUT", "GET"]
    response_header = ["Content-Type", "Content-Range", "Content-Length", "Accept-Ranges"]
    max_age_seconds = 3600
  }

  # Videos keep a shorter lifecycle than photos because clips are evidence aids,
  # not the primary record. Adjust var.video_retention_days as needed (default 7).
  lifecycle_rule {
    condition {
      age            = var.video_retention_days
      matches_prefix = ["videos/"]
    }
    action {
      type = "Delete"
    }
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

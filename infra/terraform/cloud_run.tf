# ---------------------------------------------------------------------------
# Cloud Run services — checklist step 9
# First apply deploys the public "hello" placeholder image. Your pipelines
# (pipelines/*.yaml or GitHub Actions) then deploy real images; Terraform
# ignores image changes so it never rolls your code back to "hello".
# ---------------------------------------------------------------------------
locals {
  allowed_origins_csv = join(",", local.web_origins)
}

# ---------------- ember-api (public edge; app checks Firebase ID token + App Check)
resource "google_cloud_run_v2_service" "ember_api" {
  project  = local.project_id
  name     = "ember-api"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"
  # Public: matches console 'Allow public access' (IAM invoker check off). App code verifies Firebase ID token + App Check.
  invoker_iam_disabled = true
  deletion_protection  = var.run_deletion_protection
  labels               = local.labels

  template {
    service_account = google_service_account.runtime["ember-api"].email

    scaling {
      min_instance_count = var.run_min_instances
      max_instance_count = var.run_max_instances
    }

    containers {
      image = var.placeholder_image

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle = true # CPU only during requests = request-based billing
      }

      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = local.project_id
      }
      env {
        name  = "REGION"
        value = var.region
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
        name  = "PHOTO_BUCKET"
        value = google_storage_bucket.photos.name
      }
      env {
        name  = "SIGNED_URL_TTL_SECONDS"
        value = "600"
      }
      env {
        name  = "TRAINING_VIDEO_URL"
        value = var.training_video_url
      }
      env {
        name  = "ALLOWED_ORIGINS"
        value = local.allowed_origins_csv
      }
      env {
        name  = "APP_CHECK_ENFORCE"
        value = tostring(var.app_check_enforce)
      }
      env {
        name  = "EMBER_AGENTS_URL"
        value = google_cloud_run_v2_service.ember_agents.uri
      }
      env {
        # notifications/caller.py accepts only this service account on the internal withdraw route.
        name  = "EMBER_AGENTS_CALLER"
        value = google_service_account.runtime["ember-agents"].email
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image, # pipelines own the image
      client,
      client_version,
    ]
  }

  depends_on = [google_project_iam_member.runtime, google_firestore_database.default]
}

# ---------------- voice-gateway (WSS relay to Gemini Live)
resource "google_cloud_run_v2_service" "voice_gateway" {
  project  = local.project_id
  name     = "voice-gateway"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"
  # Public: matches console 'Allow public access' (IAM invoker check off). App code verifies Firebase ID token + App Check.
  invoker_iam_disabled = true
  deletion_protection  = var.run_deletion_protection
  labels               = local.labels

  template {
    service_account = google_service_account.runtime["voice-gateway"].email

    # INTENDED CHANGE vs live: live runs as the DEFAULT COMPUTE SA with a
    # 300s timeout. Terraform moves it to sa-voice-gateway and 3600s.
    # WebSockets: max request timeout is 60 min. Clients must reconnect.
    timeout = "3600s"
    # Best-effort stickiness for reconnects; NOT guaranteed.
    session_affinity = true
    # Many sockets per instance (each is mostly idle waiting on audio).
    max_instance_request_concurrency = 80

    scaling {
      min_instance_count = var.run_min_instances
      max_instance_count = var.run_max_instances
    }

    containers {
      image = var.placeholder_image

      # HTTP/1.1 on purpose: do NOT enable end-to-end HTTP/2 (h2c) for WSS.

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle = true
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
        name  = "LIVE_BACKEND"
        value = "agent-platform"
      }
      env {
        name  = "LIVE_MODEL"
        value = var.live_model
      }
      env {
        name  = "LIVE_LOCATION"
        value = var.live_location
      }
      env {
        name  = "EMBER_AGENTS_URL"
        value = google_cloud_run_v2_service.ember_agents.uri
      }
      env {
        name  = "LIVE_MINUTE_CAP_USER"
        value = "10" # confirm: placeholder cap
      }
      env {
        name  = "LIVE_MINUTE_CAP_OP"
        value = "60" # confirm: placeholder cap
      }
      env {
        name  = "ALLOWED_ORIGINS"
        value = local.allowed_origins_csv
      }
      env {
        name  = "APP_CHECK_ENFORCE"
        value = tostring(var.app_check_enforce)
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [google_project_iam_member.runtime, google_firestore_database.default]
}

# Live URL of ember-api. Read from the deployed service, not from
# google_cloud_run_v2_service.ember_api.uri: that resource already reads
# ember_agents.uri, and the reverse reference would be a cycle.
data "google_cloud_run_v2_service" "ember_api_live" {
  project  = local.project_id
  name     = "ember-api"
  location = var.region
}

# ---------------- ember-agents (PRIVATE: no public invoker)
resource "google_cloud_run_v2_service" "ember_agents" {
  project             = local.project_id
  name                = "ember-agents"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL" # reachable, but IAM-protected (403 without auth)
  deletion_protection = var.run_deletion_protection
  labels              = local.labels

  template {
    service_account = google_service_account.runtime["ember-agents"].email

    scaling {
      min_instance_count = 0
      max_instance_count = var.run_max_instances
    }

    containers {
      image = var.placeholder_image

      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
        cpu_idle = true
      }

      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = local.project_id
      }
      env {
        name  = "REGION"
        value = var.region
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
        name  = "PHOTO_BUCKET"
        value = google_storage_bucket.photos.name # read-only for #24 photo triage
      }
      env {
        name  = "EMBER_FLASH_MODEL"
        value = var.agents_flash_model
      }
      env {
        name  = "VERTEX_SEARCH_DATASTORE"
        value = var.practice_search_datastore
      }
      env {
        name  = "EMBER_VERTEX_LOCATION"
        value = var.agents_vertex_location
      }
      env {
        # fusion/notify.py posts code WITHDRAW here. Skipped when empty.
        name  = "EMBER_API_URL"
        value = data.google_cloud_run_v2_service.ember_api_live.uri
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [google_project_iam_member.runtime, google_firestore_database.default]
}

# ---------------- Who may call what
# ember-api and voice-gateway are public via invoker_iam_disabled above (no allUsers binding).

# ember-agents: only ember-api and voice-gateway may invoke it.
resource "google_cloud_run_v2_service_iam_member" "agents_invokers" {
  for_each = toset(["ember-api", "voice-gateway"])

  project  = local.project_id
  location = var.region
  name     = google_cloud_run_v2_service.ember_agents.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.runtime[each.value].email}"
}

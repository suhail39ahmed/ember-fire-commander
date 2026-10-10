# ---------------------------------------------------------------------------
# Artifact Registry — checklist step 9
# Images: asia-southeast1-docker.pkg.dev/<project>/ember/<service>:<tag>
# ---------------------------------------------------------------------------
resource "google_artifact_registry_repository" "ember" {
  project       = local.project_id
  location      = var.region
  repository_id = "ember"
  description   = "EMBER container images"
  format        = "DOCKER"
  labels        = local.labels

  # Keep storage small: delete images older than 30 days, but always keep
  # the 5 most recent versions of each image.
  cleanup_policy_dry_run = false

  cleanup_policies {
    id     = "keep-recent-5"
    action = "KEEP"
    most_recent_versions {
      keep_count = 5
    }
  }

  cleanup_policies {
    id     = "delete-older-than-30d"
    action = "DELETE"
    condition {
      tag_state  = "ANY"
      older_than = "2592000s"
    }
  }

  depends_on = [time_sleep.wait_for_apis]

  lifecycle {
    ignore_changes = [description] # typed by hand in the console
  }
}
# Deployer writer binding lives in cicd_identities.tf (gated).

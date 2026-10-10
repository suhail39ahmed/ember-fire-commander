# ---------------------------------------------------------------------------
# Locals shared by every file
# ---------------------------------------------------------------------------
locals {
  project_id = var.create_project ? google_project.this[0].project_id : var.project_id

  hosting_site_id = var.hosting_site_id != "" ? var.hosting_site_id : var.project_id

  # Default Firebase Hosting domains + Vite dev server.
  default_web_origins = [
    "http://localhost:5173",
    "https://${local.hosting_site_id}.web.app",
    "https://${local.hosting_site_id}.firebaseapp.com",
  ]

  web_origins   = concat(local.default_web_origins, var.allowed_origins_extra)
  photo_origins = length(var.photo_cors_origins) > 0 ? var.photo_cors_origins : local.default_web_origins

  labels = {
    app        = "ember"
    managed-by = "terraform"
  }
}

# ---------------------------------------------------------------------------
# OPTIONAL: project creation. Default is OFF.
# Recommended path (learning): create the project + link billing with gcloud
# (README step 2), then let Terraform manage everything *inside* it.
# ---------------------------------------------------------------------------
resource "google_project" "this" {
  count = var.create_project ? 1 : 0

  project_id      = var.project_id
  name            = "EMBER"
  org_id          = var.org_id != "" ? var.org_id : null
  billing_account = var.billing_account_id
  labels          = local.labels

  # Keep the default network; deleting the project on destroy is explicit.
  deletion_policy = "DELETE"
}

data "google_project" "current" {
  project_id = local.project_id
}

locals {
  project_id = var.create_project ? google_project.this[0].project_id : var.project_id
  state_bucket_name = (
    var.state_bucket_name != "" ? var.state_bucket_name : "${local.project_id}-tfstate"
  )
  terraform_sa_email = (
    var.terraform_sa_email != ""
    ? var.terraform_sa_email
    : "sa-ember-terraform@${local.project_id}.iam.gserviceaccount.com"
  )
  labels = {
    app        = "ember"
    managed-by = "terraform"
    stack      = "bootstrap"
  }
}

resource "google_project" "this" {
  count = var.create_project ? 1 : 0

  project_id      = var.project_id
  name            = var.project_name
  org_id          = var.org_id != "" ? var.org_id : null
  billing_account = var.billing_account_id != "" ? var.billing_account_id : null
  labels          = local.labels
  deletion_policy = "PREVENT"
}

resource "google_billing_project_info" "this" {
  count = var.link_billing && !var.create_project ? 1 : 0

  project         = local.project_id
  billing_account = var.billing_account_id

  depends_on = [google_project.this]
}

resource "google_project_service" "bootstrap_apis" {
  for_each = var.enable_bootstrap_apis ? toset([
    "serviceusage.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "cloudbilling.googleapis.com",
    "storage.googleapis.com",
    "iam.googleapis.com",
  ]) : toset([])

  project                    = local.project_id
  service                    = each.value
  disable_on_destroy         = false
  disable_dependent_services = false

  depends_on = [
    google_project.this,
    google_billing_project_info.this,
  ]
}

resource "time_sleep" "wait_for_apis" {
  count           = var.enable_bootstrap_apis ? 1 : 0
  create_duration = "30s"
  depends_on      = [google_project_service.bootstrap_apis]
}

resource "google_storage_bucket" "tfstate" {
  count = var.create_state_bucket ? 1 : 0

  project                     = local.project_id
  name                        = local.state_bucket_name
  location                    = upper(var.region)
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  labels                      = local.labels

  versioning {
    enabled = true
  }

  depends_on = [time_sleep.wait_for_apis]
}

# objectAdmin is enough for the GCS backend (state read/write/lock objects).
# The SA itself is created by the main stack; enable this after that apply.
resource "google_storage_bucket_iam_member" "terraform_sa_state" {
  count = var.grant_terraform_sa ? 1 : 0

  bucket = var.create_state_bucket ? google_storage_bucket.tfstate[0].name : local.state_bucket_name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${local.terraform_sa_email}"
}

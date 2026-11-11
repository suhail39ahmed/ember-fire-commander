# ---------------------------------------------------------------------------
# Remote state in Google Cloud Storage
# ---------------------------------------------------------------------------
# Why GCS and not GitHub?
#   - State holds sensitive data (resource IDs, emails, and any secret-ish
#     attributes such as API key strings if you ever manage them). A bucket
#     with IAM, no public access and versioning keeps it private and lets you
#     roll back a bad state.
#   - GCS backend LOCKS the state during plan/apply, so you, a teammate and
#     the pipeline can't corrupt it by running at the same time. A file in a
#     GitHub repo has no locking and ends up in git history forever.
#
# The bucket must exist BEFORE `terraform init` (Terraform can't store its
# state in a bucket it hasn't created yet). Create it with the separate
# bootstrap stack (infra/terraform/bootstrap) or scripts/bootstrap-gcp.ps1.
# This file keeps the live project's bucket name so an undelete needs no
# extra flags. For a new project override it without editing this file:
#   terraform init "-backend-config=bucket=YOUR_PROJECT_ID-tfstate"
# or copy backend.hcl.example to backend.hcl (gitignored).
terraform {
  backend "gcs" {
    bucket = "ember-fire-commander-tfstate"
    prefix = "terraform/state"
  }
}

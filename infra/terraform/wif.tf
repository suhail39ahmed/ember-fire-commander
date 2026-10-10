# ---------------------------------------------------------------------------
# Workload Identity Federation for GitHub Actions (enable_github_wif)
# GitHub's OIDC token is exchanged for short-lived tokens of sa-ember-deployer
# (app deploys) and sa-ember-terraform (Terraform pipeline). No JSON keys.
#
# Pool condition: only var.github_repository may use the pool at all.
# Ref restriction is enforced per SA:
#   - deployer: only var.github_allowed_ref (main)
#   - terraform: any ref of the repo, because PR plans run on PR refs.
#     Apply is restricted to main by the workflow + the GitHub "production"
#     environment approval. confirm: you're OK with PR plans using this SA.
#     Tighter option: a separate read-only "plan" SA (roles/viewer +
#     roles/iam.securityReviewer + storage.objectAdmin on the state bucket).
# ---------------------------------------------------------------------------
resource "google_iam_workload_identity_pool" "github" {
  count = local.cicd

  project                   = local.project_id
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"
  description               = "OIDC from GitHub Actions for EMBER"

  depends_on = [time_sleep.wait_for_apis]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  count = local.cicd

  project                            = local.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github[0].workload_identity_pool_id
  workload_identity_pool_provider_id = "github-oidc"
  display_name                       = "GitHub OIDC"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
    "attribute.actor"      = "assertion.actor"
  }

  attribute_condition = "assertion.repository == '${var.github_repository}'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

locals {
  wif_pool_name = var.enable_github_wif ? google_iam_workload_identity_pool.github[0].name : ""
}

resource "google_service_account_iam_member" "github_wif_deployer" {
  count = local.cicd

  service_account_id = google_service_account.deployer[0].name
  role               = "roles/iam.workloadIdentityUser"
  member = (var.github_allowed_ref != ""
    ? "principalSet://iam.googleapis.com/${local.wif_pool_name}/attribute.ref/${var.github_allowed_ref}"
  : "principalSet://iam.googleapis.com/${local.wif_pool_name}/attribute.repository/${var.github_repository}")
}

resource "google_service_account_iam_member" "github_wif_terraform" {
  count = local.cicd

  service_account_id = google_service_account.terraform[0].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${local.wif_pool_name}/attribute.repository/${var.github_repository}"
}

variable "project_id" {
  description = "GCP project ID. Must be globally unique if create_project is true."
  type        = string
}

variable "project_name" {
  description = "Display name used only when create_project is true."
  type        = string
  default     = "EMBER"
}

variable "region" {
  description = "Location for the state bucket (use the same region as the main stack)."
  type        = string
  default     = "asia-southeast1"
}

variable "create_project" {
  description = "If true, create the project and optionally link billing. Default false: create the project with gcloud (or undelete) first."
  type        = bool
  default     = false
}

variable "org_id" {
  description = "Organization ID for create_project. Leave empty for a personal (no-org) account."
  type        = string
  default     = ""
}

variable "billing_account_id" {
  description = "Billing account ID (XXXXXX-XXXXXX-XXXXXX). Required when create_project or link_billing is true."
  type        = string
  default     = ""
}

variable "link_billing" {
  description = "Link billing_account_id onto an already-existing project. Leave false when create_project already set the billing account, and on the current live project."
  type        = bool
  default     = false
}

variable "enable_bootstrap_apis" {
  description = "Enable Service Usage, Resource Manager, Cloud Billing, Storage and IAM so the bucket and the main stack can run."
  type        = bool
  default     = true
}

variable "create_state_bucket" {
  description = "Create the versioned, private Terraform state bucket. Do not set true against a project that already has this bucket unless you import it first."
  type        = bool
  default     = true
}

variable "state_bucket_name" {
  description = "Globally unique GCS bucket name. Empty = <project_id>-tfstate (the live project uses ember-fire-commander-tfstate)."
  type        = string
  default     = ""
}

variable "grant_terraform_sa" {
  description = "Grant roles/storage.objectAdmin on the state bucket to sa-ember-terraform. The SA is created by the main stack (enable_github_wif), so leave this false on the first bootstrap apply and turn it on after the main apply."
  type        = bool
  default     = false
}

variable "terraform_sa_email" {
  description = "Email of sa-ember-terraform. Empty = sa-ember-terraform@<project_id>.iam.gserviceaccount.com."
  type        = string
  default     = ""
}

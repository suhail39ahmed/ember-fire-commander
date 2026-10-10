# Terraform + provider versions. Pinned so every teammate gets the same behaviour.
# Upgrade deliberately: bump the version, run `terraform init -upgrade`, then `terraform plan`.

terraform {
  required_version = ">= 1.9.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.6"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 8.6"
    }
    time = {
      source  = "hashicorp/time"
      version = "~> 0.13"
    }
  }
}

# Both providers authenticate with your Application Default Credentials:
#   gcloud auth application-default login
#
# user_project_override + billing_project make "quota project" APIs (Firebase,
# Billing Budgets, API Keys, reCAPTCHA) bill quota to *this* project instead of
# failing with "requires a quota project" when you use user credentials.
provider "google" {
  project               = var.project_id
  region                = var.region
  user_project_override = true
  billing_project       = var.project_id
}

provider "google-beta" {
  project               = var.project_id
  region                = var.region
  user_project_override = true
  billing_project       = var.project_id
}

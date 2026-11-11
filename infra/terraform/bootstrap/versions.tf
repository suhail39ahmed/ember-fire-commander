# Separate root module: project + billing + bootstrap APIs + state bucket.
# Not part of the main stack, so an undelete + plan on infra/terraform is unchanged.
# State is local (chicken-and-egg: this module creates the bucket the main
# stack uses as its backend). After the bucket exists you can optionally move
# this state with: terraform init -migrate-state -backend-config=...

terraform {
  required_version = ">= 1.9.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.6"
    }
    time = {
      source  = "hashicorp/time"
      version = "~> 0.13"
    }
  }
}

provider "google" {
  project               = var.project_id
  region                = var.region
  user_project_override = true
  billing_project       = var.project_id
}

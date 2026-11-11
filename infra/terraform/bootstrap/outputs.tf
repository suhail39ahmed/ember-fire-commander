output "project_id" {
  value = local.project_id
}

output "state_bucket" {
  description = "Pass to the main stack as: terraform init -backend-config=bucket=<this>"
  value       = var.create_state_bucket ? google_storage_bucket.tfstate[0].name : local.state_bucket_name
}

output "terraform_sa_email" {
  description = "Granted on the bucket only when grant_terraform_sa is true."
  value       = local.terraform_sa_email
}

output "next_init" {
  description = "Command to point the main stack at this bucket (quoted for PowerShell)."
  value = format(
    "terraform init \"-backend-config=bucket=%s\"",
    var.create_state_bucket ? google_storage_bucket.tfstate[0].name : local.state_bucket_name,
  )
}

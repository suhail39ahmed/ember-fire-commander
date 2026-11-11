# Bootstrap stack

One-time Terraform root module that creates what the main stack cannot create for itself: the GCP project (optional), a billing link (optional), Service Usage / Resource Manager / Storage / IAM APIs, and the versioned state bucket plus (after the main apply) `sa-ember-terraform` object access on that bucket.

It is a **separate** root module with **local** state so it never appears in `infra/terraform` plans. Applying `infra/terraform` with the committed `terraform.tfvars` against the undeleted live project still plans with no resource changes.

Do **not** run this against the existing `ember-fire-commander` project after an undelete (the state bucket already exists there).

See [docs/runbooks/restore.md](../../../docs/runbooks/restore.md) for the PowerShell steps, and `scripts/bootstrap-gcp.ps1` to apply this folder.

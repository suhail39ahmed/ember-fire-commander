<#
.SYNOPSIS
  Apply the bootstrap Terraform stack (project, billing, APIs, state bucket).

.DESCRIPTION
  Runs terraform init/apply in infra/terraform/bootstrap. This is a separate
  root module with local state; it does not change the main stack's plan.
  Do not run this against the existing ember-fire-commander project after an
  undelete. After the main stack creates sa-ember-terraform, re-run with
  -GrantTerraformSa so that service account can lock the state bucket.

.PARAMETER ProjectId
  New (or already created) GCP project ID.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectId,

    [string]$BillingAccountId = "",
    [string]$Region = "asia-southeast1",
    [string]$OrgId = "",
    [string]$StateBucket = "",

    [switch]$CreateProject,
    [switch]$LinkBilling,
    [switch]$GrantTerraformSa
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$bootstrap = Join-Path $repoRoot "infra\terraform\bootstrap"

if (-not (Get-Command terraform -ErrorAction SilentlyContinue)) {
    throw "terraform is not on PATH. Install Terraform >= 1.9 and try again."
}
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
    throw "gcloud is not on PATH."
}

$tfVars = @(
    "-var=project_id=$ProjectId",
    "-var=region=$Region",
    "-var=create_project=$($CreateProject.IsPresent.ToString().ToLowerInvariant())",
    "-var=link_billing=$($LinkBilling.IsPresent.ToString().ToLowerInvariant())",
    "-var=grant_terraform_sa=$($GrantTerraformSa.IsPresent.ToString().ToLowerInvariant())"
)
if ($BillingAccountId) { $tfVars += "-var=billing_account_id=$BillingAccountId" }
if ($OrgId) { $tfVars += "-var=org_id=$OrgId" }
if ($StateBucket) { $tfVars += "-var=state_bucket_name=$StateBucket" }

Push-Location $bootstrap
try {
    terraform init
    if ($LASTEXITCODE -ne 0) { throw "terraform init failed" }
    # Quote -var / -var= for PowerShell (README convention).
    $quoted = @("apply", "-input=false") + ($tfVars | ForEach-Object { $_ })
    & terraform @quoted
    if ($LASTEXITCODE -ne 0) { throw "terraform apply failed" }
    Write-Host ""
    Write-Host "Bootstrap finished. Next:"
    Write-Host "  1. cd infra\terraform"
    $bucket = if ($StateBucket) { $StateBucket } else { "$ProjectId-tfstate" }
    Write-Host "  2. terraform init "-backend-config=bucket=$bucket""
    Write-Host "  3. Copy fresh-project.tfvars.example, edit it, then terraform apply "-var-file=....tfvars""
    Write-Host "  4. .\scripts\restore-secrets.ps1 -ProjectId $ProjectId"
    Write-Host "  5. Re-run this script with -GrantTerraformSa after the main apply creates sa-ember-terraform."
}
finally {
    Pop-Location
}

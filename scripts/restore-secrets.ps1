<#
.SYNOPSIS
  Add Secret Manager versions without putting values in Terraform or Git.

.DESCRIPTION
  Prompts for each known EMBER secret and runs `gcloud secrets versions add`
  with --data-file=- so the value is not left on the command line. Blank
  input skips that secret. The secret *containers* must already exist
  (created by infra/terraform/secrets.tf).

.PARAMETER ProjectId
  GCP project ID. Default: ember-fire-commander
#>
[CmdletBinding()]
param(
    [string]$ProjectId = "ember-fire-commander"
)

$ErrorActionPreference = "Stop"

function ConvertFrom-SecureStringPlain {
    param([Security.SecureString]$Secure)
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

$names = @(
    "FIRMS_MAP_KEY",
    "DATA_GOV_SG_API_KEY",
    "MAPS_SERVER_API_KEY",
    "LIVEKIT_API_KEY",
    "LIVEKIT_API_SECRET"
)

Write-Host "Adding secret versions in project $ProjectId."
Write-Host "A blank value skips that secret. Values are not printed."

foreach ($name in $names) {
    $exists = & gcloud secrets describe $name --project $ProjectId 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Secret $name does not exist in $ProjectId. Apply Terraform first, then re-run."
        continue
    }

    $secure = Read-Host "Value for $name (blank to skip)" -AsSecureString
    $value = ConvertFrom-SecureStringPlain $secure
    if ([string]::IsNullOrEmpty($value)) {
        Write-Host "Skipped $name."
        continue
    }

    $value | & gcloud secrets versions add $name --project $ProjectId --data-file=-
    if ($LASTEXITCODE -ne 0) {
        throw "gcloud secrets versions add failed for $name"
    }
    Write-Host "Added a new version of $name."
}

Write-Host "Done. If you set LIVEKIT_API_KEY and LIVEKIT_API_SECRET, set livekit_url in terraform.tfvars and apply again so ember-api mounts them."

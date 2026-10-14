output "project_id" {
  value = local.project_id
}

output "project_number" {
  value = data.google_project.current.number
}

output "region" {
  value = var.region
}

output "ember_api_url" {
  description = "VITE_EMBER_API_URL"
  value       = google_cloud_run_v2_service.ember_api.uri
}

output "voice_gateway_url" {
  description = "HTTPS URL of voice-gateway"
  value       = google_cloud_run_v2_service.voice_gateway.uri
}

output "voice_gateway_wss_url" {
  description = "VITE_VOICE_GATEWAY_WSS_URL (connect directly, not through Hosting rewrites)"
  value       = replace(google_cloud_run_v2_service.voice_gateway.uri, "https://", "wss://")
}

output "ember_agents_url" {
  description = "Private: returns 403 without an identity token"
  value       = google_cloud_run_v2_service.ember_agents.uri
}

output "photo_bucket" {
  value = google_storage_bucket.photos.name
}

output "build_source_bucket" {
  value = var.enable_github_wif ? google_storage_bucket.build_src[0].name : null
}

output "firestore_database" {
  description = "Use as FIRESTORE_DATABASE in app code (Firestore client database=...)"
  value       = google_firestore_database.default.name
}

output "artifact_registry" {
  description = "Image prefix: <this>/<service>:<tag>"
  value       = "${var.region}-docker.pkg.dev/${local.project_id}/${google_artifact_registry_repository.ember.repository_id}"
}

output "service_accounts" {
  value = merge(
    { for k, sa in google_service_account.runtime : k => sa.email },
    var.enable_github_wif ? {
      deployer  = google_service_account.deployer[0].email
      terraform = google_service_account.terraform[0].email
    } : {}
  )
}

output "secrets" {
  description = "Empty secrets. Add values with: gcloud secrets versions add <NAME> --data-file=-"
  value       = keys(google_secret_manager_secret.this)
}

output "firebase_web_app_id" {
  value = var.manage_firebase_web_app ? google_firebase_web_app.ember_web[0].app_id : var.firebase_web_app_id
}

output "firebase_web_config" {
  description = "Paste into apps/web/.env as VITE_FIREBASE_* (never commit .env). Only when manage_firebase_web_app."
  value = var.manage_firebase_web_app ? {
    VITE_FIREBASE_API_KEY             = data.google_firebase_web_app_config.ember_web[0].api_key
    VITE_FIREBASE_AUTH_DOMAIN         = data.google_firebase_web_app_config.ember_web[0].auth_domain
    VITE_FIREBASE_PROJECT_ID          = local.project_id
    VITE_FIREBASE_APP_ID              = google_firebase_web_app.ember_web[0].app_id
    VITE_FIREBASE_MESSAGING_SENDER_ID = data.google_firebase_web_app_config.ember_web[0].messaging_sender_id
  } : null
}

output "hosting_url" {
  value = "https://${google_firebase_hosting_site.web.site_id}.web.app"
}

output "recaptcha_enterprise_site_key" {
  description = "VITE_RECAPTCHA_ENTERPRISE_SITE_KEY (only if enable_app_check)"
  value       = var.enable_app_check && var.manage_firebase_web_app ? google_recaptcha_enterprise_key.web[0].name : null
}

output "maps_browser_key" {
  description = "VITE_MAPS_BROWSER_KEY (only if create_maps_keys)"
  value       = var.create_maps_keys ? google_apikeys_key.maps_browser[0].key_string : null
  sensitive   = true
}

output "maps_server_key" {
  description = "Copy into the MAPS_SERVER_API_KEY secret (only if create_maps_keys)"
  value       = var.create_maps_keys ? google_apikeys_key.maps_server[0].key_string : null
  sensitive   = true
}

output "github_wif_provider" {
  description = "GitHub repo variable GCP_WIF_PROVIDER (only if enable_github_wif)"
  value       = var.enable_github_wif ? google_iam_workload_identity_pool_provider.github[0].name : null
}

output "github_deployer_sa" {
  description = "GitHub repo variable GCP_DEPLOYER_SA (only if enable_github_wif)"
  value       = var.enable_github_wif ? google_service_account.deployer[0].email : null
}

output "github_terraform_sa" {
  description = "GitHub repo variable GCP_TF_SA (only if enable_github_wif)"
  value       = var.enable_github_wif ? google_service_account.terraform[0].email : null
}

output "ingest_job_name" {
  description = "Cloud Run job run hourly by Cloud Scheduler (deploy-ingest.yml updates its image)"
  value       = google_cloud_run_v2_job.ember_ingest.name
}

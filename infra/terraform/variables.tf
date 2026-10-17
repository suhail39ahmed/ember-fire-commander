# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------
variable "project_id" {
  description = "GCP project ID (permanent, globally unique). Suggested: ember-fire-commander (confirm it's free)."
  type        = string
}

variable "region" {
  description = "Main region for Cloud Run, Artifact Registry, Firestore and Storage."
  type        = string
  default     = "asia-southeast1"
}

variable "live_location" {
  description = "Gemini Live location. Only passed to voice-gateway as an env var (LIVE_LOCATION). Live has no Asia endpoint."
  type        = string
  default     = "us-central1"
}

variable "live_model" {
  description = "Gemini Live model ID passed to voice-gateway as LIVE_MODEL (confirm the exact ID in Agent Platform Model Garden)."
  type        = string
  default     = "gemini-3.8-live"
}

# ---------------------------------------------------------------------------
# Optional project creation (default: you create the project by hand first)
# ---------------------------------------------------------------------------
variable "create_project" {
  description = "If true, Terraform creates the project and links billing. Default false: create it with gcloud first (see README step 2)."
  type        = bool
  default     = false
}

variable "billing_account_id" {
  description = "Billing account ID (XXXXXX-XXXXXX-XXXXXX). Needed if create_project = true or enable_budget = true."
  type        = string
  default     = ""
}

variable "org_id" {
  description = "Organization ID for create_project. Leave empty for a personal (no-org) Gmail account."
  type        = string
  default     = ""
}

# ---------------------------------------------------------------------------
# People
# ---------------------------------------------------------------------------
variable "team_member_emails" {
  description = "Teammate Google account emails that get roles/editor on the project (e.g. Naushad, Zeeshan). Owner (you) is not listed here."
  type        = list(string)
  default     = []
}

variable "api_token_creator_scope" {
  description = "Where sa-ember-api gets roles/iam.serviceAccountTokenCreator: \"project\" (live today) or \"self\" (least privilege: only on its own SA)."
  type        = string
  default     = "project"

  validation {
    condition     = contains(["project", "self"], var.api_token_creator_scope)
    error_message = "api_token_creator_scope must be \"project\" or \"self\"."
  }
}

variable "enable_observability_roles" {
  description = "Grant logging.logWriter + monitoring.metricWriter to api/voice-gateway/agents. Not live; default false."
  type        = bool
  default     = false
}

variable "team_role" {
  description = "Project role for teammates. Editor can deploy and debug but cannot change IAM."
  type        = string
  default     = "roles/editor"
}

# ---------------------------------------------------------------------------
# Gemini
# ---------------------------------------------------------------------------
variable "create_gemini_api_key_secret" {
  description = "Create the GEMINI_API_KEY secret (only for the Developer API path / direct ephemeral-token fallback). Off: we use Agent Platform with service accounts on the $300 trial."
  type        = bool
  default     = false
}

# ---------------------------------------------------------------------------
# Data stores
# ---------------------------------------------------------------------------
variable "firestore_location" {
  description = "Firestore location. CANNOT be changed after creation."
  type        = string
  default     = "asia-southeast1"
}

variable "firestore_database_name" {
  description = "Firestore database ID. Live DB was created by hand as \"ember-db\" (not \"(default)\"). App code must pass this name to the Firestore client."
  type        = string
  default     = "ember-db"
}

variable "firestore_delete_protection" {
  description = "Firestore delete protection. Live is OFF; true (default) turns it ON = intended change."
  type        = bool
  default     = true
}

variable "manage_firestore_rules" {
  description = "Manage Firestore security rules (deny-all) in Terraform. Live already has console deny-all rules; default false."
  type        = bool
  default     = false
}

variable "photo_retention_days" {
  description = "Delete photo objects older than this many days."
  type        = number
  default     = 14
}

variable "photo_cors_origins" {
  description = "Origins allowed to PUT photos via signed URLs. Empty = http://localhost:5173 plus the default Firebase Hosting domains."
  type        = list(string)
  default     = []
}

variable "bucket_force_destroy" {
  description = "Allow `terraform destroy` to delete non-empty buckets. False: the bucket now holds real photos."
  type        = bool
  default     = false
}

# ---------------------------------------------------------------------------
# Cloud Run
# ---------------------------------------------------------------------------
variable "placeholder_image" {
  description = "Image used for the first deploy, before your own images exist. Pipelines replace it later (Terraform ignores image changes)."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "run_max_instances" {
  description = "Max instances per Cloud Run service (cost guardrail)."
  type        = number
  default     = 3
}

variable "run_min_instances" {
  description = "Min instances. Keep 0 (scale to zero = no idle cost). Raise to 1 only right before recording the demo."
  type        = number
  default     = 0
}

variable "run_deletion_protection" {
  description = "Terraform-level deletion protection on Cloud Run services. false = `terraform destroy` can remove them."
  type        = bool
  default     = true
}

variable "app_check_enforce" {
  description = "Value of APP_CHECK_ENFORCE env var for ember-api and voice-gateway. Start false (log only), set true before the demo."
  type        = bool
  default     = false
}

variable "allowed_origins_extra" {
  description = "Extra browser origins for ALLOWED_ORIGINS (CORS) on ember-api / voice-gateway, e.g. a custom domain."
  type        = list(string)
  default     = []
}

# ---------------------------------------------------------------------------
# Firebase
# ---------------------------------------------------------------------------
variable "hosting_site_id" {
  description = "Firebase Hosting site ID. Empty = use project_id (the default site). If the default site already exists, import it (README)."
  type        = string
  default     = ""
}

variable "manage_firebase_web_app" {
  description = "Manage (import) the hand-made ember-web Firebase web app. Needs firebase_web_app_id."
  type        = bool
  default     = false
}

variable "firebase_web_app_id" {
  description = "App ID of the live ember-web app (1:991193351821:web:xxxx). Get it with: firebase apps:list WEB --project ember-fire-commander"
  type        = string
  default     = ""
}

variable "enable_identity_platform" {
  description = "Manage Firebase Auth settings (authorized domains) with Terraform. This upgrades Auth to Identity Platform. Default false: do Auth in the console (README manual step)."
  type        = bool
  default     = false
}

variable "enable_app_check" {
  description = "Create a NEW reCAPTCHA Enterprise key + App Check config. Keep false: App Check was set up by hand (live). Also requires manage_firebase_web_app."
  type        = bool
  default     = false
}

variable "app_check_token_ttl" {
  description = "App Check token TTL for reCAPTCHA Enterprise (checklist prefers >= 6 h)."
  type        = string
  default     = "21600s"
}

# ---------------------------------------------------------------------------
# Maps keys (optional; default = console)
# ---------------------------------------------------------------------------
variable "create_maps_keys" {
  description = "Create the two restricted Maps API keys (browser: Maps JS only; server: Weather only) with Terraform. Default false: create them in the console. Key strings end up in Terraform state if true."
  type        = bool
  default     = false
}

variable "maps_browser_key_uid" {
  description = "UID of the live ember-maps-browser key (gcloud services api-keys list). Required if create_maps_keys."
  type        = string
  default     = ""
}

variable "maps_server_key_uid" {
  description = "UID of the live ember-maps-server key. Required if create_maps_keys."
  type        = string
  default     = ""
}

# ---------------------------------------------------------------------------
# Budget
# ---------------------------------------------------------------------------
variable "enable_budget" {
  description = "Create a billing budget with 25/50/80/100% alerts. Needs billing_account_id and Billing Account Administrator/Costs Manager on the billing account."
  type        = bool
  default     = false
}

variable "budget_amount" {
  description = "Budget amount in the BILLING ACCOUNT's currency (USD or INR, whatever your account uses). Confirm: pick a number from the cost estimate."
  type        = number
  default     = 50
}

variable "budget_alert_emails" {
  description = "Emails that receive budget alerts (via Cloud Monitoring email channels). Billing admins also get emails by default."
  type        = list(string)
  default     = []
}

# ---------------------------------------------------------------------------
# CI/CD
# ---------------------------------------------------------------------------
variable "enable_github_wif" {
  description = "Create CI/CD identities: WIF pool/provider, sa-ember-deployer, sa-ember-terraform, build-src bucket, STS API. Not live; turning it on is an INTENDED addition. First apply must be local (bootstrap)."
  type        = bool
  default     = false
}

variable "github_repository" {
  description = "GitHub repo (owner/name) allowed to use WIF."
  type        = string
  default     = "suhail39ahmed/ember-fire-commander"
}

variable "github_allowed_ref" {
  description = "Git ref allowed to deploy through WIF (empty = any branch of the repo)."
  type        = string
  default     = "refs/heads/main"
}

# ---------------- Hourly ingest (#26, ingest.tf)
variable "ingest_schedule" {
  description = "Cron for the ingest job (Cloud Scheduler)."
  type        = string
  default     = "0 * * * *"
}

variable "ingest_schedule_paused" {
  description = "Pause the hourly trigger (e.g. to save FIRMS quota). The job can still be run by hand."
  type        = bool
  default     = false
}

variable "ingest_job_placeholder_image" {
  description = "First image for the job before deploy-ingest.yml runs. Must exit on its own (the service hello image never exits)."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/job"
}

# ---------------------------------------------------------------------------
# ember-agents: photo triage (#24) and re-ignition watch (#25)
# ---------------------------------------------------------------------------
variable "agents_flash_model" {
  description = "Gemini model ember-agents uses for photo triage and incident summaries."
  type        = string
  default     = "gemini-2.5-flash"
}

variable "training_video_url" {
  description = "Guide training video: YouTube watch URL or hosted video URL."
  type        = string
  default     = "https://www.youtube.com/watch?v=LVcnXNLAPKo"
}

variable "practice_search_datastore" {
  description = "Fully qualified Vertex AI Search datastore containing services/agents/practice/guidance. Empty disables live practice."
  type        = string
  default     = ""
}

variable "agents_vertex_location" {
  description = "Vertex AI location for agents_flash_model. gemini-2.5-flash is served in asia-southeast1."
  type        = string
  default     = "asia-southeast1"
}

variable "sites_scan_schedule" {
  description = "Cron (UTC) for the ember-sites-scan re-ignition watch."
  type        = string
  default     = "*/15 * * * *"
}

variable "sites_scan_schedule_paused" {
  description = "Create the ember-sites-scan scheduler job paused."
  type        = bool
  default     = false
}

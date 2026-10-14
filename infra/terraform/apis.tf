# ---------------------------------------------------------------------------
# Day-1 APIs (checklist step 3) + what Terraform itself needs.
# Bootstrap: serviceusage + cloudresourcemanager must be enabled by hand once
# (README step 3) because Terraform needs them to enable everything else.
# ---------------------------------------------------------------------------
locals {
  day1_apis = [
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "firestore.googleapis.com",
    "storage.googleapis.com",
    "secretmanager.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "firebase.googleapis.com",
    "identitytoolkit.googleapis.com",
    "fcm.googleapis.com",
    "firebaseappcheck.googleapis.com",
    "recaptchaenterprise.googleapis.com",
    # Gemini via Agent Platform (service-account auth, billed to Cloud Billing).
    "aiplatform.googleapis.com",
    # Needed by Terraform resources in this folder:
    "cloudresourcemanager.googleapis.com",
    "serviceusage.googleapis.com",
    "firebaserules.googleapis.com",   # Firestore security rules
    "firebasehosting.googleapis.com", # Hosting site
    "maps-backend.googleapis.com",    # Maps JavaScript API (enabled by hand, step 16)
    "weather.googleapis.com",         # Weather API (enabled by hand, step 16)
    "cloudscheduler.googleapis.com",  # hourly ember-ingest trigger (#26)
  ]

  optional_apis = concat(
    # STS = Workload Identity Federation token exchange. Not enabled live yet;
    # enabling it is an INTENDED addition when you turn on enable_github_wif.
    var.enable_github_wif ? ["sts.googleapis.com"] : [],
    var.enable_budget ? ["billingbudgets.googleapis.com", "cloudbilling.googleapis.com"] : [],
    # confirm: Maps service names. maps-backend = Maps JavaScript API.
    var.create_maps_keys ? ["apikeys.googleapis.com"] : [],
    var.create_gemini_api_key_secret ? ["generativelanguage.googleapis.com"] : [],
  )

  # Later (NOT day 1): eventarc, bigquery, pubsub, earthengine,
  # routes, geocoding-backend, airquality.
}

resource "google_project_service" "apis" {
  for_each = toset(concat(local.day1_apis, local.optional_apis))

  project = local.project_id
  service = each.value

  # Don't switch APIs off on destroy: other things in the project may use them,
  # and turning off e.g. Firestore API on a live DB is painful.
  disable_on_destroy         = false
  disable_dependent_services = false
}

# Newly enabled APIs take a minute to propagate. Without this pause the first
# apply often fails with "API has not been used in project ... before".
resource "time_sleep" "wait_for_apis" {
  create_duration = "60s"
  depends_on      = [google_project_service.apis]
}

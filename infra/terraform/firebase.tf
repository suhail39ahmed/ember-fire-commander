# ---------------------------------------------------------------------------
# Firebase — checklist steps 5, 10, 11, 12
# Uses google-beta (Firebase management resources live there).
#
# Managed here: Firebase on the project, the web app, the Hosting site.
# Optional (flags, default OFF): Identity Platform config, App Check.
# Console-only (see README "Manual steps"): Auth sign-in providers, App Check
# debug tokens, FCM VAPID key, Maps Map ID.
# ---------------------------------------------------------------------------

resource "google_firebase_project" "this" {
  provider = google-beta
  project  = local.project_id

  depends_on = [time_sleep.wait_for_apis]
}

# GATED (manage_firebase_web_app). The live app "ember-web" was registered by
# hand; importing it needs its App ID (var.firebase_web_app_id), e.g.
#   firebase apps:list WEB --project ember-fire-commander
#   (or Firebase console > Project settings > General > Your apps > App ID)
resource "google_firebase_web_app" "ember_web" {
  count        = var.manage_firebase_web_app ? 1 : 0
  provider     = google-beta
  project      = local.project_id
  display_name = "ember-web"

  # DELETE = `terraform destroy` removes the app (Firebase keeps it in a
  # 30-day soft-delete). Use "ABANDON" to leave it in place on destroy.
  deletion_policy = "ABANDON" # never delete the hand-made app on destroy

  depends_on = [google_firebase_project.this]
}

# Values for the PWA's local .env (VITE_FIREBASE_*). These are client
# identifiers, not secrets, but keep .env out of git anyway.
data "google_firebase_web_app_config" "ember_web" {
  count      = var.manage_firebase_web_app ? 1 : 0
  provider   = google-beta
  project    = local.project_id
  web_app_id = google_firebase_web_app.ember_web[0].app_id
}

# Default Hosting site (site ID = project ID), created by the console when you
# ticked "Also set up Firebase Hosting". Imported in imports.tf.
# app_id is only set when the web app is managed too; otherwise it's ignored
# so Terraform doesn't unlink the console's link. confirm on first plan.
resource "google_firebase_hosting_site" "web" {
  provider = google-beta
  project  = local.project_id
  site_id  = local.hosting_site_id
  app_id   = var.manage_firebase_web_app ? google_firebase_web_app.ember_web[0].app_id : null

  lifecycle {
    ignore_changes = [app_id]
  }

  depends_on = [google_firebase_project.this]
}

# ---------------------------------------------------------------------------
# OPTIONAL: Firebase Auth settings via Identity Platform (enable_identity_platform)
# Upgrades Firebase Auth to Identity Platform (has its own free tier; check
# pricing yourself before enabling). Sign-in PROVIDERS (Google) still need an
# OAuth client created in the console, so they stay a manual step.
# Phone auth stays OFF on purpose (SMS cost).
# ---------------------------------------------------------------------------
resource "google_identity_platform_config" "auth" {
  count    = var.enable_identity_platform ? 1 : 0
  provider = google-beta
  project  = local.project_id

  authorized_domains = [
    "localhost",
    "${local.hosting_site_id}.web.app",
    "${local.hosting_site_id}.firebaseapp.com",
  ]

  sign_in {
    allow_duplicate_emails = false

    email {
      enabled           = true
      password_required = true
    }
  }

  depends_on = [google_firebase_project.this]
}

# ---------------------------------------------------------------------------
# OPTIONAL: App Check with reCAPTCHA Enterprise (enable_app_check)
# Creates a score-based web key limited to your domains and registers it as
# the App Check provider for ember-web. Debug tokens for localhost: console.
# Enforcement is done by OUR backend (ember-api / voice-gateway verify the
# token), controlled by APP_CHECK_ENFORCE, not by Firebase service enforcement.
# ---------------------------------------------------------------------------
resource "google_recaptcha_enterprise_key" "web" {
  count        = var.enable_app_check && var.manage_firebase_web_app ? 1 : 0
  provider     = google-beta
  project      = local.project_id
  display_name = "ember-web-appcheck"

  web_settings {
    integration_type  = "SCORE"
    allow_all_domains = false
    allowed_domains = [
      "localhost",
      "${local.hosting_site_id}.web.app",
      "${local.hosting_site_id}.firebaseapp.com",
    ]
  }

  labels = local.labels

  depends_on = [time_sleep.wait_for_apis]
}

# LIVE: App Check was set up by hand (Fraud Defense key, TTL 6h, not
# enforced) and is NOT managed here. Leave enable_app_check = false, or
# Terraform would create a SECOND reCAPTCHA key and re-point App Check.
resource "google_firebase_app_check_recaptcha_enterprise_config" "web" {
  count     = var.enable_app_check && var.manage_firebase_web_app ? 1 : 0
  provider  = google-beta
  project   = local.project_id
  app_id    = google_firebase_web_app.ember_web[0].app_id
  site_key  = google_recaptcha_enterprise_key.web[0].name
  token_ttl = var.app_check_token_ttl
}

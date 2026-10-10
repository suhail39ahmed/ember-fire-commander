# ---------------------------------------------------------------------------
# Firestore (Native mode) — checklist step 6
# LOCATION IS PERMANENT. Double-check var.firestore_location before apply.
# ---------------------------------------------------------------------------
resource "google_firestore_database" "default" {
  project     = local.project_id
  name        = var.firestore_database_name # live: "ember-db" (NOT "(default)")
  location_id = var.firestore_location
  type        = "FIRESTORE_NATIVE"

  point_in_time_recovery_enablement = "POINT_IN_TIME_RECOVERY_ENABLED" # live: on

  delete_protection_state = var.firestore_delete_protection ? "DELETE_PROTECTION_ENABLED" : "DELETE_PROTECTION_DISABLED"
  # ABANDON = `terraform destroy` only forgets the DB, it does not delete it.
  # The DB was created by hand and holds real data, so this is the safe choice.
  deletion_policy = "ABANDON"

  depends_on = [time_sleep.wait_for_apis]
}

# Daily backups kept 7 days (live: created in the console, imported in imports.tf).
resource "google_firestore_backup_schedule" "daily" {
  project   = local.project_id
  database  = google_firestore_database.default.name
  retention = "604800s" # 7 days

  daily_recurrence {}
}

# Deny-all client rules: the browser never talks to Firestore.
# The backend uses the Admin SDK (IAM), which bypasses these rules.
# GATED (manage_firestore_rules, default false): the live DB already has the
# console's deny-all "production mode" rules, which are identical in effect.
# Turning this on creates a NEW ruleset and re-points the release at it
# (an intended, harmless change). For a named database the release is
# "cloud.firestore/<db>". confirm: release exists before importing it.
resource "google_firebaserules_ruleset" "firestore" {
  count   = var.manage_firestore_rules ? 1 : 0
  project = local.project_id

  source {
    files {
      name    = "firestore.rules"
      content = file("${path.module}/rules/firestore.rules")
    }
  }

  depends_on = [google_firestore_database.default]
}

resource "google_firebaserules_release" "firestore" {
  count        = var.manage_firestore_rules ? 1 : 0
  project      = local.project_id
  name         = var.firestore_database_name == "(default)" ? "cloud.firestore" : "cloud.firestore/${var.firestore_database_name}"
  ruleset_name = google_firebaserules_ruleset.firestore[0].name

  lifecycle {
    replace_triggered_by = [google_firebaserules_ruleset.firestore]
  }
}

# ---------------------------------------------------------------------------
# OPTIONAL: restricted Maps API keys (create_maps_keys, default false)
# Checklist step 14 recommends creating them in the console first. If you
# turn this on, the key STRINGS are stored in Terraform state; protect it.
# Map ID (vector, for deck.gl) is console-only either way.
# ---------------------------------------------------------------------------

# LIVE: both keys were created by hand. Default = NOT managed (create_maps_keys
# = false). To adopt them, set create_maps_keys = true AND both *_uid vars
# (the key UID, not the key string):
#   gcloud services api-keys list --project ember-fire-commander --format="table(uid,displayName)"
# Without the UIDs Terraform would CREATE two NEW keys, so the uid vars are required.

# 1) Browser key: Maps JavaScript API only, HTTP referrers = Hosting + localhost.
resource "google_apikeys_key" "maps_browser" {
  count        = var.create_maps_keys ? 1 : 0
  project      = local.project_id
  name         = var.maps_browser_key_uid
  display_name = "ember-maps-browser"

  restrictions {
    browser_key_restrictions {
      allowed_referrers = [
        "http://localhost:5173/*", # confirm: matches what was typed in the console
        "https://${local.hosting_site_id}.web.app/*",
        "https://${local.hosting_site_id}.firebaseapp.com/*",
      ]
    }
    api_targets {
      service = "maps-backend.googleapis.com" # confirm: Maps JavaScript API
    }
  }

  depends_on = [time_sleep.wait_for_apis]
}

# 2) Server key: Weather API only, used only by ember-api through
#    the MAPS_SERVER_API_KEY secret (add the value by hand, see secrets.tf).
#    No IP restriction possible (Cloud Run has no fixed egress IP without NAT).
resource "google_apikeys_key" "maps_server" {
  count        = var.create_maps_keys ? 1 : 0
  project      = local.project_id
  name         = var.maps_server_key_uid
  display_name = "ember-maps-server"

  restrictions {
    api_targets {
      service = "weather.googleapis.com" # confirm: Weather API service name
    }
  }

  depends_on = [time_sleep.wait_for_apis]
}

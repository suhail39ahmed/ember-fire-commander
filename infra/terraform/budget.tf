# ---------------------------------------------------------------------------
# OPTIONAL: billing budget with 25/50/80/100% alerts (enable_budget)
# Budgets ALERT; they do NOT stop spending.
# Credits are EXCLUDED so alerts track real usage while the $300 trial
# credit is quietly paying (otherwise net cost stays ~0 and nothing fires).
# Amount is in the billing account's own currency (USD or INR) — confirm.
# Requires: Billing Account Administrator or Billing Account Costs Manager.
# ---------------------------------------------------------------------------
resource "google_monitoring_notification_channel" "budget_email" {
  for_each = var.enable_budget ? toset(var.budget_alert_emails) : toset([])

  project      = local.project_id
  display_name = "Budget alert: ${each.value}"
  type         = "email"
  labels = {
    email_address = each.value
  }

  depends_on = [time_sleep.wait_for_apis]
}

resource "google_billing_budget" "ember" {
  count = var.enable_budget ? 1 : 0

  billing_account = var.billing_account_id
  display_name    = "EMBER ${local.project_id}"

  budget_filter {
    projects               = ["projects/${data.google_project.current.number}"]
    credit_types_treatment = "EXCLUDE_ALL_CREDITS"
    calendar_period        = "MONTH"
  }

  amount {
    specified_amount {
      # currency_code omitted = billing account currency.
      units = tostring(floor(var.budget_amount))
    }
  }

  dynamic "threshold_rules" {
    for_each = [0.25, 0.5, 0.8, 1.0]
    content {
      threshold_percent = threshold_rules.value
      spend_basis       = "CURRENT_SPEND"
    }
  }

  all_updates_rule {
    monitoring_notification_channels = [for c in google_monitoring_notification_channel.budget_email : c.id]
    # Keep the default emails to billing admins/users as well.
    disable_default_iam_recipients = false
  }

  lifecycle {
    precondition {
      condition     = var.billing_account_id != ""
      error_message = "enable_budget = true needs billing_account_id."
    }
  }

  depends_on = [time_sleep.wait_for_apis]
}

# Spend caps (Preview) and Maps daily quotas (map loads <= 400/day,
# Weather <= 300/day) are console-only: see README "Manual steps".

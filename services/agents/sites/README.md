# sites

Re-ignition watch. `POST /internal/sites/scan` (private, meant for Cloud Scheduler):

1. Remembers each `extinguished` incident as `sites/{incidentId}`, using the time from its `incident.extinguish` audit row.
2. Compares observations (`receivedAt`) and FIRMS `leads` (`firstSeenAt`) that are newer than that time against each site's radius (`EMBER_SITE_RADIUS_M`, default 500 m).
3. Adds a re-inspection alert to the site, sets `status: reinspect`, and appends a `site.reinspect` audit with `actorId: code`.

It never touches the incident or the lead. A supervisor decides what happens next. Re-running the scan does not create duplicate alerts.

## Watch window and read cost

- A site is watched for `EMBER_SITE_WATCH_DAYS` days (default 14) after it was extinguished. Each site stores `expiresAt`; once that has passed the scan sets `status: expired` and stops reading for it. Expired sites keep their record and are not remembered again.
- The scan stores `lastScannedAt` in `sites_meta/scan` and reads observations and leads only from `max(lastScannedAt - 5 min, now - watch window)`, so the read size stays about one scan interval instead of growing. A site that was just remembered is read from its own extinguish time.
- Extinguish times for newly seen incidents come from one audit query per 30 incidents.
- A site keeps its newest 50 alerts.

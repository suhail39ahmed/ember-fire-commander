# sites

Re-ignition watch. `POST /internal/sites/scan` (private, meant for Cloud Scheduler):

1. Remembers each `extinguished` incident as `sites/{incidentId}`, using the time from its `incident.extinguish` audit row.
2. Compares observations (`receivedAt`) and FIRMS `leads` (`firstSeenAt`) that are newer than that time against each site's radius (`EMBER_SITE_RADIUS_M`, default 500 m).
3. Adds a re-inspection alert to the site, sets `status: reinspect`, and appends a `site.reinspect` audit with `actorId: code`.

It never touches the incident or the lead. A supervisor decides what happens next. Re-running the scan does not create duplicate alerts.

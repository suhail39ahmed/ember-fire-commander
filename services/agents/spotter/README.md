# spotter

Advisory Gemini Flash help for supervisors. Nothing here sets incident severity, status, withdraw, or tasks. The fusion rules stay the only decider.

| Route (private) | Writes |
|---|---|
| `POST /internal/observations/{id}/triage`, optional body `{"callerId": "<uid>"}` | `photo_triage/{observationId}` |
| `POST /internal/incidents/{id}/summary` | `incident_summaries/{incidentId}` |

- **Triage:** the photo path must match `photos/<uid>/...` and belong to the reporting volunteer, and to `callerId` when one is sent. Otherwise the request returns `403`, a `rejected` record is stored, and the photo is never read. The model reply is cut down to `smokeVisible`, `flameVisible`, `burnScarVisible`, `notes` and `confidence`; any other key is dropped.
- **Failures:** a model error, timeout or non-JSON reply, or a missing or unreadable photo, stores a `photo_triage` record with `status: "error"` and a short `error` reason, and returns `502 triage_failed`. A photo over 8 MB is rejected from the object size in storage, before any download (`413 photo_too_large`, stored as `rejected`).
- **Timeouts:** the Gemini client times out after `EMBER_FLASH_TIMEOUT_SECONDS` (default 30), storage calls after 30 s, and gunicorn workers after 90 s.
- **Summary:** code builds the facts from stored fields, with no incident severity or score. Flash rewords them as `english` and `bahasa`. If the text states a severity, a danger level or an action, or if the call fails, a plain template is stored instead (`source: template`).
- **Settings:** `EMBER_FLASH_MODEL` (default `gemini-2.5-flash`), `EMBER_VERTEX_LOCATION` (default `asia-southeast1`), `EMBER_FLASH_TIMEOUT_SECONDS` (default `30`), `PHOTO_BUCKET`, `FIRESTORE_DATABASE`.
- **IAM:** `sa-ember-agents` needs `roles/aiplatform.user` and `roles/storage.objectViewer` on the photo bucket.

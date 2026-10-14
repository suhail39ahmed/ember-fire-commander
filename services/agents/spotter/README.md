# spotter

Advisory Gemini Flash help for supervisors. Nothing here sets incident severity, status, withdraw, or tasks. The fusion rules stay the only decider.

| Route (private) | Writes |
|---|---|
| `POST /internal/observations/{id}/triage`, optional body `{"callerId": "<uid>"}` | `photo_triage/{observationId}` |
| `POST /internal/incidents/{id}/summary` | `incident_summaries/{incidentId}` |

- **Triage:** the photo path must match `photos/<uid>/...` and belong to the reporting volunteer, and to `callerId` when one is sent. Otherwise the request returns `403`, a `rejected` record is stored, and the photo is never read. The model reply is cut down to `smokeVisible`, `flameVisible`, `burnScarVisible`, `notes` and `confidence`; any other key is dropped.
- **Summary:** code builds the facts from stored fields, with no incident severity or score. Flash rewords them as `english` and `bahasa`. If the text states a severity, a danger level or an action, or if the call fails, a plain template is stored instead (`source: template`).
- **Settings:** `EMBER_FLASH_MODEL` (default `gemini-2.5-flash`), `EMBER_VERTEX_LOCATION` (default `asia-southeast1`), `PHOTO_BUCKET`, `FIRESTORE_DATABASE`.
- **IAM:** `sa-ember-agents` needs `roles/aiplatform.user` and `roles/storage.objectViewer` on the photo bucket.

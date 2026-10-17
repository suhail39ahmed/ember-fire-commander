# Guide practice coach

`POST /internal/practice` is private to the backend service accounts through Cloud Run IAM. It has no incident tools or Firestore writes. The request is `{ message, lang: "en" | "id", lessonId?, index: 1..3 }`.

Set `VERTEX_SEARCH_DATASTORE` to the full resource name `projects/PROJECT/locations/LOCATION/collections/default_collection/dataStores/DATASTORE`. Import the four text files in `guidance/` into that Vertex AI Search datastore before enabling live practice. These files are the authored grounding corpus; review fire training copy with the content owner before production use. An empty datastore returns `503 practice_grounding_unconfigured` without calling Gemini.

The model uses the existing spotter Vertex client and `EMBER_FLASH_MODEL` / `EMBER_VERTEX_LOCATION` settings. The pinned google-genai 1.2.0 already includes `VertexAISearch` and `Retrieval`, so no SDK upgrade is required. Only validated, allowlisted JSON is returned. The API stores answer keys privately and grades checks; the client owns fixed safety wording.

Terraform supplies `practice_search_datastore`, enables Discovery Engine, and grants the agents service account its viewer role. These source changes require a separate infrastructure apply and service deployment; local UI mode does not use Google AI. Tests inject a fake model and do not call Google.

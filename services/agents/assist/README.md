# assist

Advisory help for supervisors, written by the same Gemini Flash client as spotter (`spotter/model.py`, so `EMBER_FLASH_MODEL`, `EMBER_VERTEX_LOCATION` and `EMBER_FLASH_TIMEOUT_SECONDS` apply). Nothing here sets incident severity, status, withdraw or tasks, and nothing is sent to a volunteer. The fusion rules stay the only decider.

| Route (private) | Writes |
|---|---|
| `POST /internal/incidents/{id}/suggestions` | `incident_suggestions/{incidentId}` |
| `POST /internal/incidents/{id}/ask`, body `{"question", "volunteerId"?}` | nothing |
| `POST /internal/observations/{id}/translate` | `observation_translations/{observationId}` |

- **Facts:** `facts.py` reads stored fields only: the incident and its evidence factors, its reports (newest 30), photo reads, tasks, volunteer names and crews, the device facts phones sent, and `weather/current`. It never includes satellite leads, phone numbers or device tokens. `gaps` is built in code (no photo, no weather, no crew, and so on) so an answer can say what is not stored.
- **Report text is data.** Volunteer words are quoted into the prompt as data, with an instruction not to follow them.
- **Suggestions:** at most 4 `{text, rationale}` items. An item that states a severity, a withdraw, an evacuation, an extinguish call, a confirmation or that someone is safe is dropped. When the model fails or nothing usable is left, a short rule-based list is stored (`source: template`).
- **Ask:** the answer is cut to 700 characters and says when the facts do not hold what the question needs (`enoughData`). A model failure is `502 model_unavailable` and nothing is stored.
- **Translate:** the model names the language and translates. The original text is never changed (observations are immutable). A stored translation is final, so a repeat call makes no model call. A model failure is `502 model_unavailable` and nothing is stored.
- **IAM:** `sa-ember-agents` needs `roles/aiplatform.user` (already granted) and Firestore access. No new setting.

Tests (the model is replaced by a fake, so none makes a real call): `pytest assist`.

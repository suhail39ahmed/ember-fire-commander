# ember-agents

**ADK agent graph for incident fusion and planning** (Cloud Run, private, asia-southeast1)

## Role

The agents service is the **private** ADK (Agent Development Kit) agent graph that:

- Ingests observations from volunteers (via `voice-gateway` and `ember-api` notifications)
- Deduplicates and clusters nearby observations into shared incidents
- Fuses reports, photos, GPS positions, and satellite leads into one incident with a transparent evidence score
- Detects and surfaces conflicts (e.g. "small flame" vs "no flame") without averaging them
- Computes an explainable 0–100 spread-risk score for each incident
- Proposes tasks for volunteers (verify, investigate, monitor)
- Pauses for human-in-the-loop approval by the supervisor before dispatch

## Architecture

- **Private service:** only `ember-api` and `voice-gateway` can invoke `ember-agents`. It has no public ingress.
- **Firestore database:** `FIRESTORE_DATABASE=ember-db` (set via Cloud Run env var).
- **Service account:** `sa-ember-agents@ember-fire-commander.iam.gserviceaccount.com` with least-privilege IAM bindings.
- **Gemini via Agent Platform:** uses service-account auth, so no Gemini API key is needed.

## Phase 1 (current)

This is a **walking skeleton** with:
- `GET /healthz` returning `200` for Cloud Run health checks

No secrets, no ADK graph, no Gemini calls yet. The deploy pipeline builds this directory and deploys to Cloud Run `ember-agents`.

## Local development

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
export PORT=8080
export FIRESTORE_DATABASE=ember-db
python app.py
```

Test the health check:

```bash
curl http://localhost:8080/healthz
```

## Docker build (local verification)

```bash
docker build -t ember-agents-test .
docker run -p 8080:8080 -e FIRESTORE_DATABASE=ember-db ember-agents-test
curl http://localhost:8080/healthz
```

## Deployment

The `.github/workflows/deploy-agents.yml` workflow builds from `services/agents` and deploys to Cloud Run. It is **manual dispatch only** and runs only from the `main` branch.

After this PR merges, a maintainer can trigger the workflow from the Actions tab.

# Project Guidelines

## Project structure and sources of truth

- `apps/web/` contains the React, Vite, and TypeScript PWA and supervisor console.
- `services/api/`, `services/voice-gateway/`, and `services/agents/` contain the backend services; `jobs/ingest/` contains the ingest job.
- `infra/terraform/` owns cloud infrastructure. Deployment workflows are in `.github/workflows/`.
- Follow [`docs/contracts/shared-contract.md`](docs/contracts/shared-contract.md) for service and client behavior, and [`docs/api/api-map.md`](docs/api/api-map.md) to find routes and their callers.
- Refer to [`docs/architecture/architecture.md`](docs/architecture/architecture.md) and the component READMEs for architecture and setup details. Do not duplicate those documents here.

## Architecture and safety

- The browser uses the backend; do not add direct Firestore or Cloud Storage access from the client. The documented signed-URL photo upload and WebSocket connection to `voice-gateway` are exceptions.
- Keep geometry, evidence scoring, conflict handling, severity changes, and safety decisions deterministic. Models may converse and call tools but must not decide incident severity or dispatch.
- Treat FIRMS hotspots as unverified leads, never as confirmed fires. Human-only actions and approval requirements are defined in the shared contract.
- Preserve the shared contract when changing a client, service, or payload. Update it when an intentional contract change requires it.

## Code and verification

- Follow the existing patterns and formatting in the component being changed. Keep changes focused and add or update tests for behavior changes.
- For web changes, run relevant checks from `apps/web/`: `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
- For Python changes, use the component's `requirements-dev.txt` and test instructions in its README. Run tests from the corresponding directory (`services/api/`, `services/voice-gateway/`, `services/agents/`, or `jobs/ingest/`).
- Run the smallest relevant checks for the change and report any checks that could not be run.

## Infrastructure and credentials

- Infrastructure changes go through the documented pull-request and deployment workflows. Do not run Terraform apply directly; see [`README.md`](README.md) and [`infra/README.md`](infra/README.md).
- Never commit, print, or copy secrets into source, documentation, logs, or chat. Server secrets belong in Secret Manager; local environment files are not to be committed.
- Do not request that the user paste credentials. If required credentials or integrations are unavailable, explain what is missing without exposing secret values.

## Figma

- Use the configured Figma integration to inspect the [EMBER design file](https://www.figma.com/design/WacSWJ9eGsdJ4vG9Q1nbyk/Google-Hackathon-2026?node-id=204-3&p=f).
- The integration token is `FIGMA_TOKEN` in the repository-root `.env.local`. Read it only through the configured integration workflow; never include its value in this file, source code, commits, logs, or chat.
- If the integration is unavailable, do not ask the user to paste the token. State that Figma access needs to be configured or reconnected.

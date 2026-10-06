# Infrastructure

Infrastructure-as-code and deployment scripts for EMBER on Google Cloud.

## Deployment Options

### Option 1: Terraform (Recommended for Reproducibility)
- Declarative infrastructure definitions
- State management for multi-environment deployments
- Modules for each service (Cloud Run, Firestore, Storage, etc.)

### Option 2: gcloud CLI Scripts
- Imperative deployment scripts
- Faster for hackathon prototyping
- Shell scripts in `scripts/` directory

## Google Cloud Resources

### Compute
- Cloud Run services: `voice-gateway`, `ember-api`, `ember-agents`
- Cloud Run job: `ember-ingest` (scheduled hourly)

### Data & Storage
- Firestore (Native mode, region: asia-southeast1)
- Cloud Storage bucket for photos (lifecycle TTL)
- BigQuery datasets: `ember_archive` (FIRMS, PSI, weather, risk scores)

### Identity & Security
- Firebase Authentication project
- Firebase Hosting site
- IAM service accounts and role bindings
- Secret Manager secrets (API keys)

### AI & ML
- Gemini 3.8 Live (Agent Platform or Gemini Developer API)
- Gemini 3.8 Flash (Vertex AI or Gemini API)
- ADK 2.0 Agent Runtime

### Networking & Monitoring
- Cloud Load Balancing (optional, for global distribution)
- Cloud Logging workspaces
- Cloud Monitoring dashboards and alerts
- Eventarc triggers (Firestore → Cloud Run)

## Setup

*Coming soon: Prerequisites, project initialization, service account creation, API enablement, deployment commands*

## Estimated Costs

At hackathon demo scale (3–4 volunteers, 2-hour session):
- **Gemini Live**: ~$0.75 (push-to-talk bursts)
- **Gemini Flash**: ~$0.05 (photo triage, summaries)
- **Cloud Run**: Free tier covers demo load
- **Firestore**: Free tier covers demo load
- **Maps APIs**: Pay-per-use (map loads, weather calls)
- **Total**: <$5 for 2-hour demo session

## Environments

- **Development**: Local emulators (Firestore, Cloud Run via Docker)
- **Staging**: Separate GCP project for testing
- **Production**: Hackathon submission deployment

*Coming soon: Environment configuration, CI/CD pipeline (Cloud Build), rollback procedures*

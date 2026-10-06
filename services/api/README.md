# ember-api

Cloud Run REST API service for authentication, approvals, and backend operations.

## Endpoints

### Authentication
- `POST /api/v1/auth/mint-token`: Mint Firebase custom token from invite code (returns `{role, opId, crewId}` claims)
- `POST /api/v1/auth/verify`: Verify Firebase ID token and return user claims

### Media Upload
- `POST /api/v1/media/signed-url`: Generate signed URL for Cloud Storage photo upload (volunteer stills)

### Approvals & Claims
- `POST /api/v1/approvals/approve`: Supervisor approves a dispatch proposal
- `POST /api/v1/approvals/edit`: Supervisor edits and approves a proposal
- `POST /api/v1/approvals/reject`: Supervisor rejects a proposal
- `POST /api/v1/incidents/verify`: Supervisor sets incident to VERIFIED
- `POST /api/v1/incidents/extinguish`: Supervisor sets incident to EXTINGUISHED
- `POST /api/v1/incidents/false-alarm`: Supervisor marks incident as FALSE_ALARM
- `POST /api/v1/conflicts/resolve`: Supervisor resolves a conflict

### Operations
- `POST /api/v1/ops/create`: Admin creates a new operation with invite codes
- `GET /api/v1/ops/:opId`: Get operation metadata
- `POST /api/v1/ops/:opId/revoke-volunteer`: Supervisor revokes volunteer access

### Audit
- `POST /api/v1/audit/log`: Append audit record (actor, action, ref, timestamp)
- `GET /api/v1/audit/:opId`: Get operation audit trail (supervisor only)

### Maps & Weather (Proxied)
- `GET /api/v1/weather/:lat/:lon`: Get current weather at location (Google Maps Weather API)
- `GET /api/v1/map-tiles/*`: Proxy map tiles for low-bandwidth mode

## Tech Stack

- **Language:** Python 3.11+ or Go
- **Framework:** FastAPI (Python) or Gin (Go)
- **Deployment:** Cloud Run (asia-southeast1)
- **Database:** Firestore (Admin SDK)
- **Storage:** Cloud Storage (signed URLs)
- **Auth:** Firebase Admin SDK for custom token minting and verification

## Security

- All endpoints verify Firebase ID token (except `/mint-token`)
- Role-based access control via custom claims (`role`, `opId`, `crewId`)
- Optional App Check token verification
- Firestore Security Rules enforce read/write permissions

## Development

*Coming soon: Local setup, API documentation, testing, deployment*

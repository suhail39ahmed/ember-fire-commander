# voice-gateway

Cloud Run service providing WebSocket relay for Gemini 3.8 Live sessions.

## Responsibilities

1. **WebSocket Server**: Accept WebSocket connections from volunteer PWAs
2. **Identity Verification**: Verify Firebase ID tokens on connection upgrade (+ optional App Check)
3. **Gemini Live Relay (Default)**: 
   - Open Gemini Live session per push-to-talk burst
   - Forward audio (~16 kHz PCM) + video frames (~1 fps JPEG) to Gemini
   - Relay audio-out + text replies back to client
   - Send `activityStart` / `activityEnd` / `audio_stream_end` markers
   - Inject shared digest from Firestore (`digest/current`) via `send_client_content(turn_complete=False)`
   - Close session ~30 seconds after reply
4. **Ephemeral Token Minting (Fallback)**: Mint single-use Gemini Live ephemeral tokens for direct client → Gemini connections (Preview, Gemini Developer API)
5. **Caps Enforcement**: Per-user and per-operation Live-minute caps
6. **Observation Writes**: Write immutable observation documents to Firestore with GPS from client
7. **Session Management**: Handle GoAway, session resumption (tokens valid 2 hours), context-window compression

## Live Path Decision

**Default:** Relay via this gateway (backend-mediated).  
**Fallback:** Direct ephemeral-token path (only if latency test in Singapore shows relay misses targets).

## Tech Stack

- **Language:** Python 3.11+ or Go
- **Framework:** FastAPI (Python) or Gin (Go) with WebSocket support
- **Deployment:** Cloud Run (asia-southeast1 or us-central1, decided by latency test)
- **Gemini:** Agent Platform Live API (relay) or Gemini Developer API v1beta `BidiGenerateContentConstrained` (fallback)
- **Firebase:** Admin SDK for token verification and Firestore writes

## Configuration

- `GEMINI_API_KEY` or service account credentials
- Firebase project ID
- Firestore collections: `ops/{opId}/observations`, `ops/{opId}/digest/current`
- Cloud Run timeout: 60 minutes (WebSocket support)
- Min instances: 0 (normally), 1 during recording window

## Cost Model

Push-to-talk burst: ~$0.012  
Volunteer-hour (8 bursts): ~$0.09  
Always-open mic: ~$4.42/hour  

Cost control is the primary design constraint.

## Development

*Coming soon: Local setup, testing, deployment*

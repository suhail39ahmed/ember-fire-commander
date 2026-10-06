# EMBER Web App

Progressive Web App (PWA) built with React, Vite, and TypeScript. Serves both the volunteer mobile interface and the supervisor console.

## Features

### Volunteer Interface
- Bahasa-first UI with language toggle (Bahasa Indonesia / English)
- Push-to-talk voice reporting via Gemini 3.8 Live
- Camera integration for fire photo reports (~100-200 KB compressed JPEG)
- Quick-action chips: *asap* (smoke), *api* (flame), *aman* (all clear), *butuh bantuan* (need help)
- Task cards with staging points and acknowledgment buttons
- WITHDRAW screen (full-screen, high-contrast alerts)
- Mini-map showing own position, incident rings, upwind arrows
- Offline outbox with IndexedDB queue for reports and photos
- Low-data mode (reduced ping frequency, smaller photos, minimal map tiles)

### Supervisor Console
- Common Operating Picture (COP) map with deck.gl overlays
- Verification queue (ranked by Risk Ranker priority)
- Incident detail drawer (photos, transcripts, evidence components, audit trail)
- Approvals inbox for dispatch proposals (Approve / Edit / Reject)
- Conflicts panel (side-by-side view, resolution tools)
- Crew roster and tasking management
- Re-ignition sites tracker
- Live minutes usage and caps monitoring

## Tech Stack

- **Framework:** React 18+
- **Build Tool:** Vite
- **Language:** TypeScript
- **Styling:** TBD (Tailwind CSS or Material-UI recommended)
- **Maps:** Google Maps JavaScript API + deck.gl
- **State Management:** TBD (Context API, Zustand, or Redux)
- **Offline:** Service Worker, IndexedDB, Firestore offline persistence
- **i18n:** i18next (default: Bahasa Indonesia)

## Setup

*Coming soon: Dependencies installation, environment variables, local development server*

## Architecture

- Firebase Hosting for deployment
- Firebase Authentication for identity (custom tokens for volunteers)
- Firestore realtime listeners for shared incident state
- WebSocket connection to `voice-gateway` service for Gemini Live
- REST API calls to `ember-api` service

## Development

*Coming soon: Build commands, testing, deployment*

## Offline Behavior

Reports queue in IndexedDB when offline and sync on reconnect. Observations carry `capturedAt` timestamp so late reports merge correctly with the aggregator's timeline.

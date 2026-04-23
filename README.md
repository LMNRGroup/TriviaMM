# TriviaMM

Trivia Battle rebuild on Next.js, React, TypeScript, Tailwind, Vercel KV, and Google Sheets.

## Current State

This repository now contains:

- the legacy prototype (`index.html`, `user.html`, `api/*.js`) kept as reference
- the new app in `src/`
- polling-based multiplayer room flow for up to two players
- host and player routes:
  - `/`
  - `/host/[roomCode]`
  - `/play/[roomCode]`

## Required Environment Variables

For full hosted testing on Vercel, set:

- `NEXT_PUBLIC_APP_URL`
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`

The app has local/test fallbacks for missing KV and Sheets config, but real live testing should use the actual Vercel KV and Google Sheets credentials.

## Local Commands

```bash
npm install
npm run dev
npm run lint
npm run build
```

## Quick Verification

- Home screen creates a host room
- Host screen shows QR and room state
- Player screen handles registration and joining
- Host can start solo or battle mode
- Questions, answers, timers, scoring, AFK warnings, leaderboard, and reset cycle are all wired

## Health Endpoint

`GET /api/health`

Returns a simple readiness payload showing:

- build status
- required environment presence
- whether KV config is present
- whether Google Sheets config is present

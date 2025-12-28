# Repertorio – Υποδομή Hosts & Paths

## Hosts & Ports

- `api.repertorio.net` → NestJS API (port 3000)
  - Upstream: `http://127.0.0.1:3000/`
  - Χρησιμοποιείται για: songs, lists, users, search, κλπ.

- `app.repertorio.net` → Next.js εφαρμογή (port 3001)
  - Upstream: `http://127.0.0.1:3001/`
  - Χρησιμοποιείται για: web frontend, Next API routes (`/api/*`).

- `dev.repertorio.net` → Next.js DEV (port 3002)
  - Upstream: `http://127.0.0.1:3002/`
  - Χρησιμοποιείται για: dev frontend.

- Rooms server (Node) → `http://127.0.0.1:4455`
  - Εκτίθεται ΜΟΝΟ μέσω:
    - `https://app.repertorio.net/rooms-api/*`
    - `https://dev.repertorio.net/rooms-api/*`
    - WebSocket: `wss://app.repertorio.net/rooms-api/ws`, `wss://dev.repertorio.net/rooms-api/ws`.

## Συμβόλαιο URLs

- Nest API:
  - Public βάση: `https://api.repertorio.net/api/v1`
  - Παράδειγμα: `GET https://api.repertorio.net/api/v1/songs/123`

- Next API (app.repertorio.net):
  - Public βάση: `https://app.repertorio.net/api`
  - Χρησιμοποιείται ΜΟΝΟ για Next routes (π.χ. `/api/rooms` αν οριστεί στο Next).

- Rooms:
  - REST: `https://app.repertorio.net/rooms-api/...`
  - WS:   `wss://app.repertorio.net/rooms-api/ws`

## Env variables (Next.js)

- `NEXT_PUBLIC_API_BASE_URL=https://api.repertorio.net/api/v1`
- `NEXT_PUBLIC_ROOMS_BASE_URL=https://app.repertorio.net/rooms-api`
- `NEXT_PUBLIC_ROOMS_WS_URL=wss://app.repertorio.net/rooms-api/ws`

## Env variables (NestJS)

- `CORS_ALLOW_ORIGINS=["https://app.repertorio.net","https://dev.repertorio.net"]`

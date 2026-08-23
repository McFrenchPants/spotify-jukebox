# Guest Jukebox

A self-hosted, Spotify-backed party jukebox: guests scan a QR code, search tracks, and queue songs from their phones; a host device plays via Spotify Connect.

See [docs/DESIGN_SPEC.md](docs/DESIGN_SPEC.md) for requirements and [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) / [PROGRESS.md](PROGRESS.md) for build status.

## Repo layout

- `backend/` — Express/TypeScript API server (Spotify auth proxy, queue, admin, SSE)
- `frontend/` — Vite + React PWA (guest and admin UI)
- `docs/` — design spec, implementation plan, progress tracker

## Running locally

> Stub — filled in as Phase 0 tasks land.

1. Copy `.env.example` to `.env` in `backend/` and fill in Spotify credentials (see P0.4).
2. `cd backend && npm install && npm run dev`
3. `cd frontend && npm install && npm run dev`

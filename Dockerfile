# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Guest Jukebox — multi-stage build
#
#   1. frontend-build : Vite/React static build (frontend/dist)
#   2. backend-build   : TypeScript -> JS compile (backend/dist), plus a full
#                         npm install (with devDeps) so `tsc` is available
#   3. backend-deps    : production-only `npm ci --omit=dev` for backend,
#                         done in its own stage (Debian slim, has the gcc/
#                         make/python3 toolchain needed to compile the
#                         better-sqlite3 native addon) so the toolchain never
#                         ends up in the final runtime image
#   4. runtime         : slim Node image with only compiled JS + prod
#                         node_modules + the built frontend static files
#
# Debian slim (not Alpine) is used for the stages that run `npm install`/
# `npm ci`, because better-sqlite3 ships prebuilt binaries for glibc targets
# but falls back to compiling from source on musl (Alpine) unless a matching
# prebuild exists, which needs python3/make/g++ and is slower/flakier to get
# right in a quick pass. Debian slim "just works" with its prebuilt binary
# and keeps this Dockerfile simple. The final runtime stage is also Debian
# slim to match glibc, avoiding a native-module ABI mismatch between build
# and runtime.
# ---------------------------------------------------------------------------

# ---- Stage 1: frontend build ----------------------------------------------
FROM node:20-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: backend build (compile TypeScript) ---------------------------
FROM node:20-slim AS backend-build
# better-sqlite3 usually installs from a prebuilt binary (via prebuild-install),
# but not every host architecture (e.g. arm64 Raspberry Pi home servers) is
# guaranteed to have one available, in which case npm falls back to compiling
# from source via node-gyp. Installing the toolchain up front makes that
# fallback work instead of failing the build.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

# ---- Stage 3: backend production dependencies only -------------------------
FROM node:20-slim AS backend-deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

# ---- Stage 4: runtime --------------------------------------------------------
FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app/backend

# Compiled backend JS
COPY --from=backend-build /app/backend/dist ./dist
# Production-only node_modules (includes the compiled better-sqlite3 addon)
COPY --from=backend-deps /app/backend/node_modules ./node_modules
COPY backend/package.json ./package.json
# Built frontend static assets, served by the backend (see backend/src/app.ts)
COPY --from=frontend-build /app/frontend/dist ./public

# Data directory for the SQLite DB (mounted as a volume in compose)
RUN mkdir -p /app/backend/data

# Deliberately runs as root (no USER directive): a prior non-root `jukebox`
# user worked fine for the standalone docker-compose deployment (that volume
# is created by Docker and chown'd above) but broke under Home Assistant OS's
# Supervisor, which mounts the add-on's /data directory with its own
# ownership we don't control -- the non-root user got EACCES reading
# /data/options.json there. Running as root avoids this whole class of
# volume-ownership mismatches across every deployment mode (add-on,
# docker-compose, and anything else), at the cost of the least-privilege
# hardening a non-root user would normally provide. Acceptable tradeoff for a
# LAN-only, single-household app with no untrusted multi-tenant exposure.

EXPOSE 8085
CMD ["node", "dist/index.js"]

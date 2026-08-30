import fs from "fs";
import { logWarn } from "../logger";

// Home Assistant OS add-on mode: the Supervisor has no `.env` file for this
// container. Instead it mounts the user's options (entered through the
// add-on's config UI, generated from config.yaml's `schema`) into
// /data/options.json at runtime. This module copies those values into
// process.env *before* dotenv.config() runs in backend/src/index.ts, so the
// rest of the app can keep reading plain process.env vars exactly as it
// always has, unaware of which deployment mode it's running under.
//
// In every other deployment mode (local `npm run dev`, the standalone
// docker-compose.yml setup) /data/options.json simply doesn't exist, so this
// is a no-op there.

const DATA_DIR = "/data";
const OPTIONS_PATH = "/data/options.json";

// Keys the add-on's config.yaml schema exposes to the user, 1:1 with
// backend/.env.example's variable names.
const KNOWN_OPTION_KEYS = [
  "SPOTIFY_CLIENT_ID",
  "SPOTIFY_CLIENT_SECRET",
  "SPOTIFY_REDIRECT_URI",
  "ADMIN_PIN",
  // Optional — see seedRefreshToken.ts for what this enables.
  "SPOTIFY_REFRESH_TOKEN",
] as const;

export function loadHomeAssistantOptions(): void {
  // Presence of /data itself (not just options.json) is the signal that
  // we're running under the Supervisor — it's always mounted for an add-on,
  // even in the rare case options.json itself can't be read (see below).
  // PORT/DB_PATH must be pinned whenever that's true, unconditionally: if
  // pinning only happened after a *successful* options.json read, any read
  // failure would silently leave the app listening on the wrong port while
  // config.yaml's `ports` mapping still forwards external traffic to 8085 —
  // a "connection refused" with no obvious cause. Pinning first, and
  // treating the actual option values as best-effort on top, avoids that
  // whole failure mode.
  if (!fs.existsSync(DATA_DIR)) {
    return;
  }

  process.env.PORT = "8085";
  process.env.DB_PATH = "/data/jukebox.db";

  if (!fs.existsSync(OPTIONS_PATH)) {
    return;
  }

  let raw: string;
  try {
    raw = fs.readFileSync(OPTIONS_PATH, "utf-8");
  } catch (err) {
    logWarn("homeAssistantOptions", `Found ${OPTIONS_PATH} but could not read it, ignoring`, err);
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    logWarn("homeAssistantOptions", `Found ${OPTIONS_PATH} but it is not valid JSON, ignoring`, err);
    return;
  }

  if (typeof parsed !== "object" || parsed === null) {
    logWarn(
      "homeAssistantOptions",
      `Found ${OPTIONS_PATH} but its contents are not a JSON object, ignoring`
    );
    return;
  }

  const options = parsed as Record<string, unknown>;

  for (const key of KNOWN_OPTION_KEYS) {
    const value = options[key];
    if (typeof value === "string" && value.length > 0 && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

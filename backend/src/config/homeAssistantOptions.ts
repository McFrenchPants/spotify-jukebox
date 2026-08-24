import fs from "fs";

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
  if (!fs.existsSync(OPTIONS_PATH)) {
    return;
  }

  let raw: string;
  try {
    raw = fs.readFileSync(OPTIONS_PATH, "utf-8");
  } catch (err) {
    console.warn(
      `[homeAssistantOptions] Found ${OPTIONS_PATH} but could not read it, ignoring:`,
      err
    );
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn(
      `[homeAssistantOptions] Found ${OPTIONS_PATH} but it is not valid JSON, ignoring:`,
      err
    );
    return;
  }

  if (typeof parsed !== "object" || parsed === null) {
    console.warn(
      `[homeAssistantOptions] Found ${OPTIONS_PATH} but its contents are not a JSON object, ignoring.`
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

  // Pinned regardless of what options.json contains, same reasoning as
  // docker-compose.yml's `environment:` block for the standalone deployment:
  // the container's internal port must always match config.yaml's `ports`
  // mapping, and the DB must always land on the Supervisor-provided
  // persistent /data directory rather than wherever DB_PATH might otherwise
  // point.
  process.env.PORT = "8085";
  process.env.DB_PATH = "/data/jukebox.db";
}

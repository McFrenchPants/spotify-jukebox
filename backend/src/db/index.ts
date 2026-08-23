import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "./data/jukebox.db";

// Ensure the containing directory exists before opening the DB file.
const dbDir = path.dirname(DB_PATH);
if (dbDir && dbDir !== ".") {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

/**
 * Creates all tables required by the app if they don't already exist.
 * Safe to call on every boot (idempotent).
 */
export function runMigrations(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS play_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      spotify_track_id TEXT NOT NULL,
      track_name TEXT NOT NULL,
      artist_name TEXT NOT NULL,
      album_art_url TEXT,
      duration_ms INTEGER NOT NULL,
      played_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      guest_session_id TEXT
    );

    CREATE TABLE IF NOT EXISTS guest_sessions (
      session_id TEXT PRIMARY KEY,
      client_ip TEXT NOT NULL,
      user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      last_request_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      total_requests INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS track_stats (
      spotify_track_id TEXT PRIMARY KEY,
      play_count INTEGER NOT NULL DEFAULT 0,
      last_played_at TEXT,
      is_blacklisted INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS rate_limit_state (
      session_id TEXT PRIMARY KEY,
      last_allowed_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_play_history_played_at ON play_history(played_at);
    CREATE INDEX IF NOT EXISTS idx_play_history_guest_session_id ON play_history(guest_session_id);
  `);
}

/**
 * Generic key/value getter for app_settings. Used for runtime config
 * (trust mode, cooldown, explicit filter, duration bounds, target device id,
 * admin PIN hash) as well as Spotify OAuth token storage
 * (spotify_access_token, spotify_refresh_token, spotify_token_expires_at).
 */
export function getSetting(key: string): string | undefined {
  const row = db
    .prepare<[string], { value: string | null }>("SELECT value FROM app_settings WHERE key = ?")
    .get(key);
  return row?.value ?? undefined;
}

/**
 * Generic key/value setter for app_settings. Inserts or updates the row and
 * stamps updated_at with the current time.
 */
export function setSetting(key: string, value: string): void {
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, value);
}

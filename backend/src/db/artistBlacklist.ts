import { getSetting, setSetting } from "./index";

/** app_settings key storing the JSON-stringified array of blacklisted artist names. */
const BLACKLISTED_ARTISTS_KEY = "blacklisted_artists";

/**
 * Returns the current list of blacklisted artist names, as stored
 * (case/whitespace as originally added — comparisons elsewhere are
 * case-insensitive). Returns [] if unset or if the stored value fails to
 * parse as a JSON string array.
 */
export function getBlacklistedArtists(): string[] {
  const raw = getSetting(BLACKLISTED_ARTISTS_KEY);
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) {
      return parsed;
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Adds an artist name to the blacklist (trimmed), if not already present
 * case-insensitively. No-op if already present.
 */
export function addBlacklistedArtist(name: string): void {
  const trimmed = name.trim();
  const current = getBlacklistedArtists();

  if (current.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) {
    return;
  }

  setSetting(BLACKLISTED_ARTISTS_KEY, JSON.stringify([...current, trimmed]));
}

/** Case-insensitive membership check against the blacklisted-artists list. */
export function isArtistBlacklisted(name: string): boolean {
  const trimmed = name.trim().toLowerCase();
  return getBlacklistedArtists().some((existing) => existing.toLowerCase() === trimmed);
}

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { getSetting, setSetting } from "../db";

/** app_settings key holding the salted/hashed admin PIN (never the raw PIN). */
export const ADMIN_PIN_HASH_KEY = "admin_pin_hash";

/** app_settings key holding the random secret used to sign admin session tokens. */
export const ADMIN_TOKEN_SECRET_KEY = "admin_token_secret";

/**
 * How long an admin session token stays valid after login. 3 hours strikes a
 * balance between "short-lived" (per the design spec) and not forcing an
 * admin to re-enter the PIN mid-event.
 */
export const ADMIN_TOKEN_TTL_MS = 3 * 60 * 60 * 1000;

function base64url(buf: Buffer): string {
  return buf.toString("base64url");
}

/**
 * Ensures `app_settings` has a hashed admin PIN. If one is already stored,
 * this is a no-op. Otherwise it hashes `process.env.ADMIN_PIN` (scrypt with a
 * random salt) and persists `salt:hash` (both hex) via setSetting — the raw
 * PIN itself is never written to the DB. Safe to call repeatedly (e.g. lazily
 * on every login attempt); does nothing useful if ADMIN_PIN isn't set.
 */
export function ensureAdminPinHash(): void {
  if (getSetting(ADMIN_PIN_HASH_KEY)) {
    return;
  }

  const pin = process.env.ADMIN_PIN;
  if (!pin) {
    return;
  }

  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 64);
  setSetting(ADMIN_PIN_HASH_KEY, `${salt.toString("hex")}:${hash.toString("hex")}`);
}

/**
 * Verifies a candidate PIN against the stored hash (lazily initializing the
 * hash from ADMIN_PIN on first call). Uses a constant-time comparison to
 * avoid leaking timing information about the hash contents. Returns false if
 * no hash is stored (e.g. ADMIN_PIN was never configured).
 */
export function verifyAdminPin(candidatePin: string): boolean {
  ensureAdminPinHash();

  const stored = getSetting(ADMIN_PIN_HASH_KEY);
  if (!stored) {
    return false;
  }

  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) {
    return false;
  }

  const salt = Buffer.from(saltHex, "hex");
  const expectedHash = Buffer.from(hashHex, "hex");
  const candidateHash = scryptSync(candidatePin, salt, expectedHash.length);

  if (candidateHash.length !== expectedHash.length) {
    return false;
  }
  return timingSafeEqual(candidateHash, expectedHash);
}

/**
 * Returns the HMAC secret used to sign/verify admin tokens, generating and
 * persisting a fresh random one on first use.
 */
function getOrCreateTokenSecret(): string {
  const existing = getSetting(ADMIN_TOKEN_SECRET_KEY);
  if (existing) {
    return existing;
  }

  const secret = randomBytes(32).toString("hex");
  setSetting(ADMIN_TOKEN_SECRET_KEY, secret);
  return secret;
}

export interface AdminTokenResult {
  token: string;
  expiresAt: string;
}

/**
 * Issues a short-lived, HMAC-signed admin session token:
 * `base64url(json payload).base64url(hmac-sha256 signature)`. The payload
 * carries only an `exp` (ms epoch). Hand-rolled rather than pulling in a JWT
 * library since the needs here (signature + expiry) are minimal.
 */
export function issueAdminToken(): AdminTokenResult {
  const secret = getOrCreateTokenSecret();
  const exp = Date.now() + ADMIN_TOKEN_TTL_MS;

  const payloadB64 = base64url(Buffer.from(JSON.stringify({ exp })));
  const signature = createHmac("sha256", secret).update(payloadB64).digest();
  const sigB64 = base64url(signature);

  return { token: `${payloadB64}.${sigB64}`, expiresAt: new Date(exp).toISOString() };
}

/**
 * Verifies an admin session token's signature and expiry. Returns false for
 * any malformed, tampered, or expired token rather than throwing.
 */
export function verifyAdminToken(token: string | undefined | null): boolean {
  if (!token) {
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return false;
  }
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) {
    return false;
  }

  const secret = getOrCreateTokenSecret();
  const expectedSignature = createHmac("sha256", secret).update(payloadB64).digest();

  let providedSignature: Buffer;
  try {
    providedSignature = Buffer.from(sigB64, "base64url");
  } catch {
    return false;
  }

  if (
    providedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(providedSignature, expectedSignature)
  ) {
    return false;
  }

  let payload: { exp?: unknown };
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return false;
  }

  if (typeof payload.exp !== "number" || Number.isNaN(payload.exp)) {
    return false;
  }

  return Date.now() <= payload.exp;
}

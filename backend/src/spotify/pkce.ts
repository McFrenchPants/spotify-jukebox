import crypto from "crypto";

/**
 * Base64url-encode a Buffer per RFC 7636 (no padding, URL-safe alphabet).
 */
function base64url(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Generates a cryptographically random PKCE code_verifier.
 * Spotify requires 43-128 characters from the unreserved URI character set;
 * base64url-encoding 32 random bytes yields a 43-character string.
 */
export function generateCodeVerifier(): string {
  return base64url(crypto.randomBytes(32));
}

/**
 * Derives the S256 code_challenge from a code_verifier per RFC 7636:
 * BASE64URL-ENCODE(SHA256(ASCII(code_verifier))).
 */
export function generateCodeChallenge(verifier: string): string {
  const hash = crypto.createHash("sha256").update(verifier).digest();
  return base64url(hash);
}

/**
 * Generates a random opaque string suitable for the OAuth `state` parameter
 * (CSRF protection for the authorization redirect).
 */
export function generateState(): string {
  return base64url(crypto.randomBytes(16));
}

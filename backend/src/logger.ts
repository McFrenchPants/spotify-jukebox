/**
 * Minimal centralized logger. Exists because a real incident (BACKLOG.md
 * item 21) was hard to diagnose from the Home Assistant add-on's log tab:
 * every line was bare console.log/console.error text with no timestamp, so
 * dozens of identical `[nowPlaying] Spotify currently-playing poll failed:
 * fetch failed` lines gave no way to tell when the failures started, how
 * long they lasted, or what the underlying cause actually was (Node's
 * `fetch failed` TypeError hides the real reason — DNS failure, connection
 * refused, timeout, etc. — in `err.cause`, which nothing was reading).
 *
 * Deliberately not a full logging framework (no levels config, no
 * transports/rotation, no structured JSON) — this is a self-hosted
 * single-process app whose only log sink is the Supervisor's plain-text log
 * viewer, so a timestamp + scope + full error detail on one line is the
 * entire requirement.
 */

function timestamp(): string {
  return new Date().toISOString();
}

/**
 * Renders an error with as much real detail as it has: message, plus
 * `err.cause` when present (that's where Node's `fetch failed` TypeError
 * hides the actual network-level reason), plus the stack when available.
 */
function formatError(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as Error & { cause?: unknown }).cause;
    const causeText = cause ? ` — cause: ${cause instanceof Error ? cause.message : String(cause)}` : "";
    return `${err.stack ?? err.message}${causeText}`;
  }
  return String(err);
}

export function logInfo(scope: string, message: string): void {
  console.log(`${timestamp()} [INFO] [${scope}] ${message}`);
}

export function logWarn(scope: string, message: string, err?: unknown): void {
  const detail = err !== undefined ? ` — ${formatError(err)}` : "";
  console.warn(`${timestamp()} [WARN] [${scope}] ${message}${detail}`);
}

export function logError(scope: string, message: string, err?: unknown): void {
  const detail = err !== undefined ? ` — ${formatError(err)}` : "";
  console.error(`${timestamp()} [ERROR] [${scope}] ${message}${detail}`);
}

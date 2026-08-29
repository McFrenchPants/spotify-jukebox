import { randomUUID } from "crypto";
import { db } from "./index";

interface GuestSessionRow {
  session_id: string;
  client_ip: string;
  user_agent: string | null;
  created_at: string;
  last_request_at: string;
  total_requests: number;
  nickname: string | null;
  avatar: string | null;
}

export interface GuestSession {
  sessionId: string;
  clientIp: string;
  userAgent: string | null;
  createdAt: string;
  lastRequestAt: string;
  totalRequests: number;
  nickname: string | null;
  avatar: string | null;
}

function mapRow(row: GuestSessionRow): GuestSession {
  return {
    sessionId: row.session_id,
    clientIp: row.client_ip,
    userAgent: row.user_agent,
    createdAt: row.created_at,
    lastRequestAt: row.last_request_at,
    totalRequests: row.total_requests,
    nickname: row.nickname,
    avatar: row.avatar,
  };
}

/** Looks up a guest session by its token/session_id. */
export function findGuestSession(sessionId: string): GuestSession | undefined {
  const row = db
    .prepare<[string], GuestSessionRow>("SELECT * FROM guest_sessions WHERE session_id = ?")
    .get(sessionId);
  return row ? mapRow(row) : undefined;
}

/**
 * Bumps last_request_at to now and increments total_requests for an existing
 * session. Returns the updated session, or undefined if no session matches
 * the given id (caller should treat that like "no valid token").
 */
export function touchGuestSession(sessionId: string): GuestSession | undefined {
  const result = db
    .prepare(
      `UPDATE guest_sessions
       SET last_request_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
           total_requests = total_requests + 1
       WHERE session_id = ?`
    )
    .run(sessionId);

  if (result.changes === 0) {
    return undefined;
  }

  return findGuestSession(sessionId);
}

/**
 * Creates a brand new guest session. The generated token doubles as the
 * session_id primary key — there's no separate token/id distinction.
 */
export function createGuestSession(clientIp: string, userAgent: string | undefined): GuestSession {
  const sessionId = randomUUID();

  db.prepare(
    `INSERT INTO guest_sessions (session_id, client_ip, user_agent, total_requests)
     VALUES (?, ?, ?, 1)`
  ).run(sessionId, clientIp, userAgent ?? null);

  return findGuestSession(sessionId)!;
}

/**
 * Partially updates a guest session's profile fields (nickname/avatar).
 * Only the keys actually present in `updates` are SET, so passing just
 * `{ nickname }` leaves `avatar` untouched and vice versa. If `updates` is
 * empty, this is a no-op read (no UPDATE is issued) that just returns the
 * current session. Returns undefined if no session matches the given id.
 */
export function updateGuestProfile(
  sessionId: string,
  updates: { nickname?: string; avatar?: string }
): GuestSession | undefined {
  const setClauses: string[] = [];
  const values: string[] = [];

  if (updates.nickname !== undefined) {
    setClauses.push("nickname = ?");
    values.push(updates.nickname);
  }
  if (updates.avatar !== undefined) {
    setClauses.push("avatar = ?");
    values.push(updates.avatar);
  }

  if (setClauses.length === 0) {
    return findGuestSession(sessionId);
  }

  db.prepare(
    `UPDATE guest_sessions SET ${setClauses.join(", ")} WHERE session_id = ?`
  ).run(...values, sessionId);

  return findGuestSession(sessionId);
}

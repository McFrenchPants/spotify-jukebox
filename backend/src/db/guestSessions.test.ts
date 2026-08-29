import { beforeEach, describe, expect, it } from "vitest";
import { db, runMigrations } from "./index";
import { createGuestSession, updateGuestProfile } from "./guestSessions";

beforeEach(() => {
  runMigrations();
  db.prepare("DELETE FROM guest_sessions").run();
});

describe("updateGuestProfile", () => {
  it("sets nickname only, leaving avatar untouched", () => {
    const session = createGuestSession("127.0.0.1", "test-agent");

    const updated = updateGuestProfile(session.sessionId, { nickname: "DJ Test" });

    expect(updated?.nickname).toBe("DJ Test");
    expect(updated?.avatar).toBeNull();
  });

  it("sets avatar only, leaving nickname untouched", () => {
    const session = createGuestSession("127.0.0.1", "test-agent");

    const updated = updateGuestProfile(session.sessionId, { avatar: "avatar-3" });

    expect(updated?.avatar).toBe("avatar-3");
    expect(updated?.nickname).toBeNull();
  });

  it("sets both nickname and avatar", () => {
    const session = createGuestSession("127.0.0.1", "test-agent");

    const updated = updateGuestProfile(session.sessionId, {
      nickname: "DJ Test",
      avatar: "avatar-3",
    });

    expect(updated?.nickname).toBe("DJ Test");
    expect(updated?.avatar).toBe("avatar-3");
  });

  it("a partial update doesn't clobber a previously-set field", () => {
    const session = createGuestSession("127.0.0.1", "test-agent");

    updateGuestProfile(session.sessionId, { nickname: "DJ Test", avatar: "avatar-3" });
    const updated = updateGuestProfile(session.sessionId, { nickname: "DJ Renamed" });

    expect(updated?.nickname).toBe("DJ Renamed");
    expect(updated?.avatar).toBe("avatar-3");
  });

  it("returns the current session unchanged when updates is empty", () => {
    const session = createGuestSession("127.0.0.1", "test-agent");

    const updated = updateGuestProfile(session.sessionId, {});

    expect(updated).toEqual(session);
  });

  it("returns undefined for a nonexistent session id", () => {
    expect(updateGuestProfile("nonexistent-session", { nickname: "DJ Test" })).toBeUndefined();
  });
});

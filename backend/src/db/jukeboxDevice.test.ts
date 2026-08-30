import { beforeEach, describe, expect, it } from "vitest";
import { db, runMigrations } from "./index";
import {
  JUKEBOX_DEVICE_CLIENT_ID_KEY,
  getRegisteredJukeboxDeviceId,
  registerJukeboxDeviceId,
} from "./jukeboxDevice";

beforeEach(() => {
  runMigrations();
  db.prepare("DELETE FROM app_settings WHERE key = ?").run(JUKEBOX_DEVICE_CLIENT_ID_KEY);
});

describe("getRegisteredJukeboxDeviceId", () => {
  it("returns null when nothing has ever been registered", () => {
    expect(getRegisteredJukeboxDeviceId()).toBeNull();
  });
});

describe("registerJukeboxDeviceId", () => {
  it("registers a clientId and it can be read back", () => {
    registerJukeboxDeviceId("device-abc");
    expect(getRegisteredJukeboxDeviceId()).toBe("device-abc");
  });

  it("registering a new clientId supersedes the previous one", () => {
    registerJukeboxDeviceId("device-abc");
    registerJukeboxDeviceId("device-xyz");
    expect(getRegisteredJukeboxDeviceId()).toBe("device-xyz");
  });
});

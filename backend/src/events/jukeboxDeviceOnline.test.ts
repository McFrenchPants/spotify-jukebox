import { beforeEach, describe, expect, it } from "vitest";
import { db, runMigrations } from "../db";
import { JUKEBOX_DEVICE_CLIENT_ID_KEY, registerJukeboxDeviceId } from "../db/jukeboxDevice";
import { subscribe } from "./bus";
import {
  clientConnected,
  clientDisconnected,
  isJukeboxDeviceOnline,
  resetJukeboxDeviceOnlineForTests,
} from "./jukeboxDeviceOnline";

beforeEach(() => {
  runMigrations();
  db.prepare("DELETE FROM app_settings WHERE key = ?").run(JUKEBOX_DEVICE_CLIENT_ID_KEY);
  resetJukeboxDeviceOnlineForTests();
});

describe("isJukeboxDeviceOnline", () => {
  it("is false when nothing is registered", () => {
    expect(isJukeboxDeviceOnline()).toBe(false);
  });

  it("is false when the registered device has no open connection", () => {
    registerJukeboxDeviceId("device-abc");
    expect(isJukeboxDeviceOnline()).toBe(false);
  });

  it("is true once the registered device's clientId connects", () => {
    registerJukeboxDeviceId("device-abc");
    clientConnected("device-abc");
    expect(isJukeboxDeviceOnline()).toBe(true);
    clientDisconnected("device-abc");
  });

  it("is false again after the registered device's clientId disconnects", () => {
    registerJukeboxDeviceId("device-abc");
    clientConnected("device-abc");
    clientDisconnected("device-abc");
    expect(isJukeboxDeviceOnline()).toBe(false);
  });

  it("ignores connections from clientIds that are not the registered device", () => {
    registerJukeboxDeviceId("device-abc");
    clientConnected("guest-tab-1");
    expect(isJukeboxDeviceOnline()).toBe(false);
    clientDisconnected("guest-tab-1");
  });
});

describe("jukebox-device-status event emission", () => {
  it("emits online: true only when the registered device transitions online", () => {
    registerJukeboxDeviceId("device-abc");
    const received: unknown[] = [];
    const unsubscribe = subscribe((event) => {
      if (event.name === "jukebox-device-status") received.push(event.data);
    });

    clientConnected("device-abc");

    expect(received).toEqual([{ online: true }]);
    clientDisconnected("device-abc");
    unsubscribe();
  });

  it("emits online: false when the registered device disconnects", () => {
    registerJukeboxDeviceId("device-abc");
    clientConnected("device-abc");

    const received: unknown[] = [];
    const unsubscribe = subscribe((event) => {
      if (event.name === "jukebox-device-status") received.push(event.data);
    });

    clientDisconnected("device-abc");

    expect(received).toEqual([{ online: false }]);
    unsubscribe();
  });

  it("does not emit for a guest tab's clientId that isn't the registered device", () => {
    registerJukeboxDeviceId("device-abc");
    const received: unknown[] = [];
    const unsubscribe = subscribe((event) => {
      if (event.name === "jukebox-device-status") received.push(event.data);
    });

    clientConnected("guest-tab-1");
    clientDisconnected("guest-tab-1");

    expect(received).toEqual([]);
    unsubscribe();
  });

  it("does not double-emit for a second connection sharing the same clientId", () => {
    registerJukeboxDeviceId("device-abc");
    clientConnected("device-abc");

    const received: unknown[] = [];
    const unsubscribe = subscribe((event) => {
      if (event.name === "jukebox-device-status") received.push(event.data);
    });

    // A second overlapping connection with the same clientId (e.g. a reload).
    clientConnected("device-abc");
    expect(received).toEqual([]);

    // Closing one of the two shouldn't mark it offline while the other holds.
    clientDisconnected("device-abc");
    expect(received).toEqual([]);
    expect(isJukeboxDeviceOnline()).toBe(true);

    clientDisconnected("device-abc");
    expect(received).toEqual([{ online: false }]);
    unsubscribe();
  });
});

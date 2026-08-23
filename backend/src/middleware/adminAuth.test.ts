import express, { Express } from "express";
import { AddressInfo } from "net";
import { Server } from "http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { issueAdminToken } from "../auth/adminToken";
import { runMigrations } from "../db";
import { ADMIN_TOKEN_HEADER, requireAdminAuth } from "./adminAuth";

let server: Server;
let baseUrl: string;

function buildTestApp(): Express {
  const app = express();
  app.get("/probe", requireAdminAuth, (req, res) => {
    res.status(200).json({ isAdmin: req.isAdmin ?? false });
  });
  return app;
}

beforeEach(async () => {
  runMigrations();
  const app = buildTestApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("requireAdminAuth middleware", () => {
  it("allows a request with a valid token and sets req.isAdmin", async () => {
    const { token } = issueAdminToken();

    const res = await fetch(`${baseUrl}/probe`, {
      headers: { [ADMIN_TOKEN_HEADER]: token },
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body.isAdmin).toBe(true);
  });

  it("returns 401 when no token header is given", async () => {
    const res = await fetch(`${baseUrl}/probe`);
    expect(res.status).toBe(401);
  });

  it("returns 401 for a malformed token", async () => {
    const res = await fetch(`${baseUrl}/probe`, {
      headers: { [ADMIN_TOKEN_HEADER]: "garbage" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 for a tampered token", async () => {
    const { token } = issueAdminToken();
    const [payloadB64, sigB64] = token.split(".");
    const tampered = `${payloadB64}.${sigB64.slice(0, -1)}x`;

    const res = await fetch(`${baseUrl}/probe`, {
      headers: { [ADMIN_TOKEN_HEADER]: tampered },
    });
    expect(res.status).toBe(401);
  });
});

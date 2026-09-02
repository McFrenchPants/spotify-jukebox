#!/usr/bin/env node
/**
 * scripts/check-stray-backend.mjs
 *
 * Detects (and, with --kill, terminates) a stray backend dev-server process
 * still listening on this project's backend port -- left running from a
 * prior local session. See BACKLOG.md item #22 (and item #20, the original
 * incident) and CLAUDE.md's "Always shut down dev servers you start"
 * section.
 *
 * WHY THIS EXISTS
 * ----------------------------------------------------------------------
 * The backend (backend/) talks to a single real Spotify account that also
 * powers the live, deployed Home Assistant add-on. Spotify's rate limit --
 * and, as of the July 2026 quota update, its Development Mode quota too --
 * is shared account/developer-wide, not per process. A forgotten local
 * `npm run dev` backend left running after a dev/testing session competes
 * with the live deployment for that same shared budget and has already
 * caused two real incidents (BACKLOG.md items #20 and #22): a leftover
 * `tsx watch` process kept polling Spotify's `currently-playing` endpoint
 * every ~4s on top of the live add-on's identical poll, tripping a real
 * 429/503 during actual use. Item #22's process was found LISTENING on
 * :8085 for over 21 hours before anyone noticed.
 *
 * The previous mitigation was entirely manual: a CLAUDE.md instruction to
 * eyeball `netstat -ano | grep <port>` before ending a session. This script
 * is a real, runnable replacement for that manual step -- see the updated
 * CLAUDE.md section for how it's meant to be used.
 *
 * WHAT IT DOES
 * ----------------------------------------------------------------------
 *   1. Determines the backend's configured port:
 *        backend/.env's PORT=  (gitignored, may not exist)
 *        -> backend/.env.example's PORT= (fallback)
 *        -> 8085 (default; this project's documented local-dev convention
 *           for matching the HA add-on's port -- see CLAUDE.md)
 *   2. Checks, cross-platform, whether anything is LISTENING on that port
 *      (Windows: `netstat -ano`; macOS/Linux: `lsof -i :<port> -sTCP:LISTEN`).
 *   3. Reports what it found: PID, how long it's been running (best effort),
 *      and the process name/command line (best effort), so it's possible to
 *      tell this is actually a stray instance of this backend and not some
 *      unrelated process that happens to be on the port.
 *   4. With --kill, terminates the PID it found (Windows: `taskkill /PID
 *      <pid> /F`; Unix: SIGKILL). Without --kill, this script never
 *      terminates anything -- report-only is the default, since killing an
 *      arbitrary process automatically is a higher-stakes action that
 *      should not happen silently.
 *
 * EXIT CODES
 * ----------------------------------------------------------------------
 *   0  nothing listening on the port, OR --kill was passed and the found
 *      process was successfully killed
 *   1  something is listening on the port and --kill was not passed
 *      (usable as a pass/fail check in a script or CI-like context)
 *   2  could not determine the answer at all -- unrecognized platform, or
 *      the underlying OS command failed/errored. Distinct from 1 so a
 *      caller can tell "found a stray process" apart from "the check
 *      itself is broken here."
 *
 * USAGE
 *   node scripts/check-stray-backend.mjs             # report only
 *   node scripts/check-stray-backend.mjs --kill       # report, then kill if found
 *   node scripts/check-stray-backend.mjs --port 3001  # override the port
 *   node scripts/check-stray-backend.mjs --help
 */

import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const DEFAULT_PORT = 8085;

function printUsage() {
  console.log(
    [
      "Usage:",
      "  node scripts/check-stray-backend.mjs [--kill] [--port <port>]",
      "",
      "Checks whether anything is LISTENING on the backend's configured port",
      "(backend/.env's PORT=, falling back to backend/.env.example's PORT=,",
      "falling back to 8085) -- a leftover local dev-server process from a",
      "prior session competes with the live Home Assistant add-on for the",
      "same account's pooled Spotify rate limit/quota (see BACKLOG.md #20,",
      "#22). Without --kill, this only reports what it finds. With --kill,",
      "it terminates the PID found listening on the port.",
      "",
      "Exit codes:",
      "  0  nothing listening (or --kill successfully killed what was found)",
      "  1  something is listening and --kill was not passed",
      "  2  could not determine the answer (unrecognized platform / command failure)",
    ].join("\n")
  );
}

function parseArgs(argv) {
  const args = { kill: false, port: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--kill") args.kill = true;
    else if (a === "--port") args.port = parseInt(argv[++i], 10);
    else if (a === "-h" || a === "--help") args.help = true;
    else {
      throw new Error(`Unrecognized argument: ${a}`);
    }
  }
  return args;
}

/**
 * Reads PORT= out of a simple .env-style file. Not a full .env parser --
 * this project's .env files are flat KEY=VALUE lines, which is all that's
 * needed here.
 */
function readPortFromEnvFile(filePath) {
  if (!existsSync(filePath)) return null;
  const contents = readFileSync(filePath, "utf8");
  const match = contents.match(/^PORT\s*=\s*(\d+)\s*$/m);
  return match ? parseInt(match[1], 10) : null;
}

function resolvePort(explicitPort) {
  if (Number.isInteger(explicitPort) && explicitPort > 0) {
    return { port: explicitPort, source: "--port" };
  }
  const dotEnv = path.join(REPO_ROOT, "backend", ".env");
  const fromDotEnv = readPortFromEnvFile(dotEnv);
  if (fromDotEnv) return { port: fromDotEnv, source: "backend/.env" };

  const dotEnvExample = path.join(REPO_ROOT, "backend", ".env.example");
  const fromExample = readPortFromEnvFile(dotEnvExample);
  if (fromExample) return { port: fromExample, source: "backend/.env.example" };

  return { port: DEFAULT_PORT, source: "default" };
}

/**
 * @returns {{ pid: string } | null} the listening PID, or null if nothing
 *   is listening on the port. Throws on platform/command failure.
 */
function findListeningPid(port) {
  const platform = process.platform;

  if (platform === "win32") {
    let output;
    try {
      output = execFileSync("netstat", ["-ano"], { encoding: "utf8" });
    } catch (err) {
      throw new Error(`netstat failed: ${err.message}`);
    }
    for (const line of output.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("TCP") && !trimmed.startsWith("UDP")) continue;
      if (!/LISTENING/.test(trimmed)) continue;
      // Columns: Proto  Local Address  Foreign Address  State  PID
      const cols = trimmed.split(/\s+/);
      const localAddr = cols[1] ?? "";
      const pid = cols[cols.length - 1];
      const portMatch = localAddr.match(/:(\d+)$/);
      if (portMatch && parseInt(portMatch[1], 10) === port) {
        return { pid };
      }
    }
    return null;
  }

  if (platform === "darwin" || platform === "linux") {
    let output;
    try {
      output = execFileSync("lsof", ["-i", `:${port}`, "-sTCP:LISTEN", "-t"], {
        encoding: "utf8",
      });
    } catch (err) {
      // lsof exits non-zero (with empty output) when nothing matches -- that's
      // "nothing listening," not a failure of the check itself.
      if (err.status === 1 && !err.stdout?.trim()) return null;
      throw new Error(`lsof failed: ${err.message}`);
    }
    const pid = output.trim().split(/\r?\n/)[0];
    return pid ? { pid } : null;
  }

  throw new Error(`Unrecognized platform: ${platform}`);
}

/** Best-effort process start time. Returns a human string or null. */
function getProcessStartTime(pid) {
  try {
    if (process.platform === "win32") {
      const out = execFileSync(
        "powershell",
        ["-NoProfile", "-Command", `(Get-Process -Id ${pid}).StartTime`],
        { encoding: "utf8" }
      ).trim();
      return out || null;
    }
    const out = execFileSync("ps", ["-o", "lstart=", "-p", String(pid)], {
      encoding: "utf8",
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

/** Best-effort process name/command line. Returns a human string or null. */
function getProcessName(pid) {
  try {
    if (process.platform === "win32") {
      const out = execFileSync(
        "powershell",
        ["-NoProfile", "-Command", `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`],
        { encoding: "utf8" }
      ).trim();
      return out || null;
    }
    const out = execFileSync("ps", ["-o", "command=", "-p", String(pid)], {
      encoding: "utf8",
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

function killPid(pid) {
  if (process.platform === "win32") {
    execFileSync("taskkill", ["/PID", String(pid), "/F"], { encoding: "utf8" });
    return;
  }
  process.kill(parseInt(pid, 10), "SIGKILL");
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    printUsage();
    process.exit(2);
  }

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  const { port, source } = resolvePort(args.port);
  console.log(`Checking port ${port} (source: ${source})...`);

  let found;
  try {
    found = findListeningPid(port);
  } catch (err) {
    console.error(`Could not determine listening state for port ${port}: ${err.message}`);
    process.exit(2);
    return;
  }

  if (!found) {
    console.log(`Nothing listening on port ${port}.`);
    process.exit(0);
    return;
  }

  const { pid } = found;
  console.log(`Something is LISTENING on port ${port}: PID ${pid}`);

  const startTime = getProcessStartTime(pid);
  console.log(startTime ? `  Started: ${startTime}` : "  Started: (could not determine)");

  const name = getProcessName(pid);
  console.log(name ? `  Process: ${name}` : "  Process: (could not determine)");

  if (!args.kill) {
    console.log("");
    console.log(`Not killing (pass --kill to terminate PID ${pid}).`);
    process.exit(1);
    return;
  }

  try {
    killPid(pid);
    console.log(`Killed PID ${pid}.`);
    process.exit(0);
  } catch (err) {
    console.error(`Failed to kill PID ${pid}: ${err.message}`);
    process.exit(2);
  }
}

main();

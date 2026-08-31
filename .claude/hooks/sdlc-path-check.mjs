#!/usr/bin/env node
/**
 * sdlc-supervisor PreToolUse path-enforcement hook (IMPLEMENTATION_PLAN.md SS3.1).
 *
 * Denies an `Edit`/`Write`-family tool call *before it executes* when the file
 * it targets falls outside the active task packet's `write_paths` (or inside
 * its `forbidden_paths`). Wired from the committed `.claude/settings.json` as a
 * `PreToolUse` matcher on `Edit|Write|NotebookEdit` (the tool names whose
 * input carries a target path -- `file_path`, or `notebook_path` for the
 * notebook case).
 *
 * This is the SECOND layer of defense, not the only one. The first is the
 * tool-level grant on the implementer agent; the third is the verifier's
 * post-hoc `git diff` review. See design-spec.md §8 / §8a.
 *
 * ---------------------------------------------------------------------------
 * 1. WHO IS ENFORCED (scoping)
 * ---------------------------------------------------------------------------
 * The PreToolUse hook input JSON carries `agent_type` (observed live in this
 * repo: `"general-purpose"`, `"implementer"`, ...) alongside `agent_id`,
 * `session_id`, `cwd`, `tool_name`, and `tool_input`. Enforcement is therefore
 * scoped to `agent_type === "implementer"` only.
 *
 * Every other caller -- the main interactive session, the orchestrator, any
 * other subagent type, and any Claude Code build that omits `agent_type` --
 * is passed through untouched. That is deliberate: this config is COMMITTED,
 * so it is live for ordinary sessions in this repo, and a path hook that can
 * brick a human's own editing is worse than no hook at all.
 *
 * ---------------------------------------------------------------------------
 * 2. WHICH PACKET IS "ACTIVE" (resolution order)
 * ---------------------------------------------------------------------------
 * There is no ambient "current task" variable, so the packet is resolved by
 * the first of these that yields exactly one answer:
 *
 *   (a) `SDLC_ACTIVE_PACKET` env var -- a task id ("SS3.1"), a repo-relative
 *       packet path, or an absolute packet path. Highest precedence; intended
 *       for a future orchestrator that can set env when spawning.
 *   (b) A pointer file `.sdlc/active-packet` -- a single line holding a task
 *       id or a packet path. Looked up FIRST in the session's own repo root
 *       (i.e. the implementer's git worktree, if it is running in one), THEN
 *       in the main repo root. The worktree-local lookup is what makes
 *       concurrent implementers separable.
 *   (c) The framework's own lease bookkeeping: `.sdlc/state.json` tasks whose
 *       `lease.assigned_agent` and `task_packet_path` are both non-null. If
 *       exactly one task is leased, that is the active packet. If zero or
 *       more than one are, this step yields nothing (ambiguous).
 *
 * WORKTREE / CONCURRENCY HONESTY: the implementer agent runs with
 * `isolation: worktree`. Path *matching* is fully worktree-correct -- the
 * target file is made relative to the session's own repo root, so a write to
 * `<worktree>/backend/src/routes/queue.ts` matches a `write_paths` entry of
 * `backend/src/routes/queue.ts`. Packet *discovery* falls back to the main
 * repo when the worktree has no pointer file of its own, because a worktree
 * is created by the harness from a committed tree and nothing gets a chance
 * to seed it first. So: N concurrent implementers are correctly separated
 * ONLY if each worktree gets its own `.sdlc/active-packet` (or its own
 * `SDLC_ACTIVE_PACKET`). Without that, they all resolve to the same
 * main-repo answer, and step (c) deliberately refuses to guess when more than
 * one task is leased. This is a real limitation, not a solved problem.
 *
 * ---------------------------------------------------------------------------
 * 3. FAIL-SAFE DIRECTION
 * ---------------------------------------------------------------------------
 * Non-implementer callers: ALLOW (see §1 -- the hook never runs for them).
 * Implementer callers with no resolvable packet: DENY, with a reason that
 * names the three ways to fix it. An implementer is by definition supposed to
 * be operating under exactly one packet; one that cannot say which packet it
 * holds has no scope contract, and "no contract" must not mean "unlimited
 * scope". The blast radius of this strictness is confined to implementer
 * subagents, so it cannot make ordinary work in this repo painful.
 * A malformed/unreadable packet file is likewise DENY (fail closed) rather
 * than silently allowing everything.
 *
 * ---------------------------------------------------------------------------
 * 4. PATTERN SYNTAX SUPPORTED IN write_paths / forbidden_paths
 * ---------------------------------------------------------------------------
 * Paths are repo-root-relative and use `/`. Windows `\` separators, drive
 * letters, and case differences are normalized before matching (this machine
 * is Windows; a check that silently no-ops on a backslash mismatch is worse
 * than no check).
 *
 *   `**`  matches any characters, including `/`      (e.g. `.sdlc/**`)
 *   `*`   matches any characters except `/`          (e.g. `backend/*.json`)
 *   `?`   matches exactly one character except `/`
 *   anything else is literal
 *
 * Additionally, a pattern containing NO wildcard is treated as "this exact
 * path, or anything beneath it if it is a directory" -- so `backend/src`
 * covers `backend/src/app.ts`, while `backend/src/app.ts` covers only itself.
 * That is the whole syntax. There is no brace expansion, no `!` negation, and
 * no `.gitignore`-style implicit-anywhere matching.
 *
 * `forbidden_paths` is checked first and wins over `write_paths` on overlap.
 *
 * ---------------------------------------------------------------------------
 * 5. KILL SWITCH
 * ---------------------------------------------------------------------------
 * `.sdlc/project.yaml`:
 *
 *     path_enforcement:
 *       enforce: false
 *
 * read here at runtime, and read BEFORE anything else that could throw, so
 * the switch keeps working even if a packet or state file is broken. The
 * switch deliberately does NOT live in `.claude/settings.json` or any file
 * this hook gates: design-spec §8a finding 2 recorded a real self-lock, where
 * the hook blocked its own author's `Edit` attempt to disable it. Flip it
 * with `Bash` (`sed`/`python`), never with `Edit`/`Write`. A missing file or
 * missing key means enforce = true (the switch can only be turned off
 * explicitly).
 *
 * ---------------------------------------------------------------------------
 * 6. KNOWN GAP: Bash-origin writes are NOT caught here
 * ---------------------------------------------------------------------------
 * This hook matches the `Edit`/`Write` tool family. A write performed through
 * `Bash` (`echo ... > file`, `cp`, a script that emits output) never produces
 * a `tool_input.file_path` and is invisible to it. The implementer needs
 * `Bash` for tests and typechecks, so this cannot be closed by narrowing its
 * tool grant. This is EXPECTED behavior, documented in design-spec §8a
 * finding 1, and NOT in scope for this hook -- deliberately so; parsing shell
 * commands for writes is a losing arms race. The backstop is the verifier
 * role (SS4.3), which checks the actual `git diff` against `forbidden_paths`
 * regardless of which tool produced the change. Path enforcement is
 * pre-execution hook PLUS post-hoc diff review, never the hook alone.
 *
 * Re-confirmed live during SS3.1 with a real worktree-isolated implementer:
 * `Edit` on an out-of-scope file and `Write` of a new out-of-scope file were
 * both denied pre-execution, an `Edit` inside write_paths succeeded, and
 * `printf 'x' > backend/src/<file>.txt` through `Bash` went through
 * unchallenged and created the file. Treat that last one as designed, and
 * rely on the verifier for it.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const IGNORE_CASE = process.platform === "win32";

/** Deny the tool call with a reason, then exit. */
function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    })
  );
  process.exit(0);
}

/** Let the tool call through (no output == no opinion). */
function allow() {
  process.exit(0);
}

function toPosix(p) {
  return String(p).replace(/\\/g, "/");
}

function normalizeAbs(p) {
  const abs = toPosix(path.resolve(p)).replace(/\/+$/, "");
  return IGNORE_CASE ? abs.toLowerCase() : abs;
}

// --- 1. Read the hook input -------------------------------------------------

let input;
try {
  input = JSON.parse(readFileSync(0, "utf-8"));
} catch {
  // Can't read the request -> can't judge it. Stay out of the way.
  allow();
}

const sessionCwd = input?.cwd || process.cwd();

// --- 2. Locate the repo roots ----------------------------------------------
// sessionRoot: the checkout this tool call is happening in (a worktree, for an
// isolated implementer). mainRoot: the primary repo, where the shared .sdlc/
// control files live.

function findRepoRoot(startDir) {
  let dir = path.resolve(startDir);
  for (;;) {
    if (existsSync(path.join(dir, ".git"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function findMainRoot(sessionRoot) {
  if (!sessionRoot) return null;
  const dotGit = path.join(sessionRoot, ".git");
  try {
    if (statSync(dotGit).isFile()) {
      // Linked worktree: ".git" is a file "gitdir: <main>/.git/worktrees/<name>"
      const m = readFileSync(dotGit, "utf-8").match(/^gitdir:\s*(.+)\s*$/m);
      if (m) {
        const gitDir = path.resolve(sessionRoot, m[1].trim());
        // <main>/.git/worktrees/<name>  -> up three levels is <main>
        const candidate = path.dirname(path.dirname(path.dirname(gitDir)));
        if (existsSync(path.join(candidate, ".git"))) return candidate;
      }
    }
  } catch {
    /* fall through */
  }
  return sessionRoot;
}

const sessionRoot =
  findRepoRoot(sessionCwd) ||
  (process.env.CLAUDE_PROJECT_DIR
    ? path.resolve(process.env.CLAUDE_PROJECT_DIR)
    : null);
const mainRoot =
  findMainRoot(sessionRoot) ||
  (process.env.CLAUDE_PROJECT_DIR
    ? path.resolve(process.env.CLAUDE_PROJECT_DIR)
    : null);

// --- 3. Kill switch (read first, so it works even if everything else is broken)

/**
 * Minimal, intentionally dumb YAML probe for exactly one key:
 *   path_enforcement:
 *     enforce: <bool>
 * Not a general YAML parser -- this hook must have zero dependencies and must
 * not fail open on a parser quirk.
 */
function readEnforceToggle(root) {
  if (!root) return true;
  const file = path.join(root, ".sdlc", "project.yaml");
  let text;
  try {
    text = readFileSync(file, "utf-8");
  } catch {
    return true; // missing policy file -> enforce
  }
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /^path_enforcement:\s*(#.*)?$/.test(l));
  if (start === -1) return true; // key absent -> enforce
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(#.*)?$/.test(line)) continue; // blank / comment
    if (!/^\s/.test(line)) break; // dedented out of the block
    const m = line.match(/^\s+enforce:\s*(true|false)\s*(#.*)?$/);
    if (m) return m[1] === "true";
  }
  return true;
}

if (!readEnforceToggle(mainRoot)) allow();

// --- 4. Scope: implementer agents only -------------------------------------

if (input?.agent_type !== "implementer") allow();

// `Edit`/`Write` carry `file_path`; `NotebookEdit` carries `notebook_path`.
const filePath = input?.tool_input?.file_path ?? input?.tool_input?.notebook_path;
if (!filePath) allow(); // nothing path-shaped to judge

// --- 5. Resolve the active packet ------------------------------------------

const HOWTO =
  "To fix: set SDLC_ACTIVE_PACKET, or write the task id into " +
  "`.sdlc/active-packet` (in this worktree, or in the main repo), or lease " +
  "exactly one task in `.sdlc/state.json` (lease.assigned_agent + " +
  "task_packet_path both set). To disable enforcement entirely, set " +
  "`path_enforcement.enforce: false` in `.sdlc/project.yaml` using Bash " +
  "(never Edit/Write -- that self-locks; see design-spec §8a).";

/** Turn a task id or packet path into an existing packet file path. */
function resolvePacketRef(ref) {
  if (!ref) return null;
  const cleaned = toPosix(ref).trim().replace(/^\.\//, "");
  if (!cleaned) return null;
  const candidates = [];
  if (path.isAbsolute(cleaned)) {
    candidates.push(cleaned);
  } else {
    for (const root of [sessionRoot, mainRoot]) {
      if (!root) continue;
      candidates.push(path.join(root, cleaned));
      if (!cleaned.includes("/")) {
        candidates.push(
          path.join(root, ".sdlc", "task-packets", `${cleaned}.packet.json`)
        );
      }
    }
  }
  for (const c of candidates) {
    try {
      if (statSync(c).isFile()) return c;
    } catch {
      /* next */
    }
  }
  return null;
}

function readPointerFile(root) {
  if (!root) return null;
  try {
    const raw = readFileSync(path.join(root, ".sdlc", "active-packet"), "utf-8");
    const line = raw
      .split(/\r?\n/)
      .map((l) => l.replace(/#.*$/, "").trim())
      .find((l) => l.length > 0);
    return line || null;
  } catch {
    return null;
  }
}

function leasedPacketFromState(root) {
  if (!root) return null;
  let state;
  try {
    state = JSON.parse(readFileSync(path.join(root, ".sdlc", "state.json"), "utf-8"));
  } catch {
    return null;
  }
  const leased = [];
  for (const wi of state?.work_items ?? []) {
    for (const t of wi?.tasks ?? []) {
      if (t?.lease?.assigned_agent && t?.task_packet_path) leased.push(t);
    }
  }
  if (leased.length !== 1) return null; // zero or ambiguous -> no answer
  return leased[0].task_packet_path;
}

const packetRef =
  process.env.SDLC_ACTIVE_PACKET ||
  readPointerFile(sessionRoot) ||
  readPointerFile(mainRoot) ||
  leasedPacketFromState(mainRoot);

const packetPath = resolvePacketRef(packetRef);

if (!packetPath) {
  deny(
    "sdlc path enforcement: this implementer has no resolvable active task " +
      "packet, so it has no scope contract and no writes are permitted " +
      (packetRef
        ? `(the active-packet reference "${packetRef}" did not resolve to an existing packet file). `
        : "(no SDLC_ACTIVE_PACKET, no `.sdlc/active-packet` pointer, and no single leased task in `.sdlc/state.json`). ") +
      HOWTO
  );
}

let packet;
try {
  packet = JSON.parse(readFileSync(packetPath, "utf-8"));
} catch (err) {
  deny(
    `sdlc path enforcement: active task packet ${toPosix(packetPath)} could ` +
      `not be parsed (${err.message}); refusing writes until it is valid. ` +
      HOWTO
  );
}

const taskId = packet?.task_id || "<unknown task>";
const writePaths = Array.isArray(packet?.write_paths) ? packet.write_paths : [];
const forbiddenPaths = Array.isArray(packet?.forbidden_paths)
  ? packet.forbidden_paths
  : [];

// --- 6. Normalize the target path and match --------------------------------

const targetAbs = normalizeAbs(filePath);
const rootAbs = sessionRoot ? normalizeAbs(sessionRoot) : null;

if (!rootAbs || !(targetAbs === rootAbs || targetAbs.startsWith(`${rootAbs}/`))) {
  deny(
    `sdlc path enforcement: ${toPosix(path.resolve(filePath))} is outside the ` +
      `repository this task is scoped to${sessionRoot ? ` (${toPosix(path.resolve(sessionRoot))})` : ""}. ` +
      `Task packet ${taskId} only permits writes to: ${writePaths.join(", ") || "(none)"}.`
  );
}

const relTarget = targetAbs.slice(rootAbs.length + 1); // already lowercased on win32

/**
 * Compile one packet pattern into a RegExp. See §4 of the header for the
 * exact syntax supported.
 */
function compilePattern(pattern) {
  let p = toPosix(pattern).trim().replace(/^\.\//, "").replace(/\/+$/, "");
  if (IGNORE_CASE) p = p.toLowerCase();
  const hasWildcard = /[*?]/.test(p);
  const escape = (s) => s.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  if (!hasWildcard) {
    // exact file, or a directory prefix
    return new RegExp(`^${escape(p)}(?:/.*)?$`);
  }
  let out = "";
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === "*") {
      if (p[i + 1] === "*") {
        i++;
        if (p[i + 1] === "/") {
          i++;
          out += "(?:.*/)?"; // `**/` may match zero directories
        } else {
          out += ".*";
        }
      } else {
        out += "[^/]*";
      }
    } else if (c === "?") {
      out += "[^/]";
    } else {
      out += escape(c);
    }
  }
  return new RegExp(`^${out}$`);
}

function matchesAny(patterns, rel) {
  return patterns.some((pat) => {
    try {
      return compilePattern(pat).test(rel);
    } catch {
      return false;
    }
  });
}

const packetLabel = `${taskId} (${toPosix(path.relative(mainRoot || rootAbs, packetPath)) || toPosix(packetPath)})`;

if (matchesAny(forbiddenPaths, relTarget)) {
  deny(
    `sdlc path enforcement: "${relTarget}" is listed in forbidden_paths for ` +
      `task packet ${packetLabel}. This write is blocked before execution. ` +
      `forbidden_paths: ${forbiddenPaths.join(", ")}. If this task genuinely ` +
      `needs this file, report status "scope_change_requested" instead of ` +
      `working around it.`
  );
}

if (!matchesAny(writePaths, relTarget)) {
  deny(
    `sdlc path enforcement: "${relTarget}" is outside write_paths for task ` +
      `packet ${packetLabel}. This write is blocked before execution. ` +
      `Permitted write_paths: ${writePaths.join(", ") || "(none)"}. If this ` +
      `task genuinely needs this file, report status ` +
      `"scope_change_requested" rather than expanding scope on your own.`
  );
}

allow();

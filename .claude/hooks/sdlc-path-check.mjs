#!/usr/bin/env node
// Proof-of-concept for docs/sdlc IMPLEMENTATION_PLAN.md SS3.1 — NOT the real
// implementation (that reads the active task packet's write_paths). This
// hardcodes one allowlist just to prove PreToolUse can deny a Write/Edit
// pre-execution based on file_path, and that it can be toggled off.
import { readFileSync } from "node:fs";
import path from "node:path";

const enforce = process.env.SDLC_ENFORCE_PATHS !== "false";
if (!enforce) process.exit(0);

const input = JSON.parse(readFileSync(0, "utf-8"));
const filePath = input?.tool_input?.file_path;
if (!filePath) process.exit(0);

const normalized = path.resolve(filePath).replace(/\\/g, "/");
const projectRoot = process.env.CLAUDE_PROJECT_DIR
  ? path.resolve(process.env.CLAUDE_PROJECT_DIR).replace(/\\/g, "/")
  : "";
const allowedPrefix = `${projectRoot}/docs/sdlc/`;

if (!normalized.startsWith(allowedPrefix)) {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: `SS3.1 proof-of-concept: ${normalized} is outside the test allowlist (${allowedPrefix})`,
    },
  }));
}
process.exit(0);

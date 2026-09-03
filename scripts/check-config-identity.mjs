#!/usr/bin/env node
/**
 * scripts/check-config-identity.mjs
 *
 * Verifies that config.yaml's HA add-on identity fields (name/slug/version/
 * port) are the PRODUCTION values before a `develop` -> `master` merge gets
 * pushed. See CLAUDE.md's "Branch strategy" section and
 * docs/SUPERVISOR_RUNBOOK.md's Stage 2.
 *
 * WHY THIS EXISTS
 * ----------------------------------------------------------------------
 * `develop`'s config.yaml deliberately differs from `master`'s -- a
 * separate slug/name/version/port so the staging add-on can be installed
 * side by side with production on the same Home Assistant server without
 * colliding. `slug` in particular is what HA Supervisor uses as the add-on's
 * actual identity (container name, data directory), so if a `develop` ->
 * `master` merge ever silently carried the staging slug into production,
 * that's not just a cosmetic mislabel -- it risks HA Supervisor treating the
 * next update as a *different* add-on, potentially orphaning the real
 * install's data.
 *
 * A plain `git merge` would not flag this as a conflict: if only `develop`'s
 * side of these lines has changed since the branches diverged (which is
 * exactly the steady state once staging identity is set once), git's 3-way
 * merge silently takes develop's value -- no conflict, no warning. Same
 * class of problem as BACKLOG.md items #20/#22 (a "remember to check"
 * instruction alone wasn't reliable) -- this is the real, runnable
 * replacement for remembering to eyeball config.yaml before every promotion.
 *
 * WHAT IT DOES
 * ----------------------------------------------------------------------
 * Reads config.yaml from the repo root, extracts the top-level `name:` and
 * `slug:` scalar values (simple line-based parsing -- these are flat,
 * single-line string fields; no need for a real YAML parser), and compares
 * them against the known-good production constants below. Exits non-zero
 * with a clear message if either doesn't match, or if config.yaml is
 * missing/unreadable/doesn't contain a recognizable `slug:`/`name:` line at
 * all (fails closed -- an unparseable file should block a promotion, not
 * silently pass).
 *
 * USAGE
 * ----------------------------------------------------------------------
 *   node scripts/check-config-identity.mjs
 *
 * Run this on `master`, after merging `develop` into it locally but BEFORE
 * pushing (see docs/SUPERVISOR_RUNBOOK.md's Stage 2). If it fails, fix
 * config.yaml by hand to restore the production values below, amend/adjust
 * the merge commit, and re-run before pushing.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "..", "config.yaml");

const PRODUCTION_NAME = "Guest Jukebox";
const PRODUCTION_SLUG = "guest_jukebox";

/**
 * Extracts a simple top-level `key: "value"` (or `key: value`) scalar from
 * config.yaml's flat structure. Deliberately naive -- config.yaml has no
 * nested keys sharing these names, so a straightforward per-line regex is
 * sufficient and avoids adding a YAML-parsing dependency for one script.
 */
function extractScalar(yamlText, key) {
  const pattern = new RegExp(`^${key}:\\s*"?([^"\\n]*?)"?\\s*$`, "m");
  const match = yamlText.match(pattern);
  return match ? match[1] : null;
}

function main() {
  let raw;
  try {
    raw = readFileSync(CONFIG_PATH, "utf8");
  } catch (err) {
    console.error(`FAIL: could not read ${CONFIG_PATH} -- ${err.message}`);
    process.exitCode = 2;
    return;
  }

  const name = extractScalar(raw, "name");
  const slug = extractScalar(raw, "slug");

  if (name === null || slug === null) {
    console.error(
      `FAIL: could not find a top-level 'name:'/'slug:' line in ${CONFIG_PATH} -- config.yaml's shape may have changed; update this script's parsing.`
    );
    process.exitCode = 2;
    return;
  }

  const problems = [];
  if (name !== PRODUCTION_NAME) {
    problems.push(`name is "${name}", expected "${PRODUCTION_NAME}"`);
  }
  if (slug !== PRODUCTION_SLUG) {
    problems.push(`slug is "${slug}", expected "${PRODUCTION_SLUG}"`);
  }

  if (problems.length > 0) {
    console.error("FAIL: config.yaml does not have production identity:");
    for (const p of problems) {
      console.error(`  - ${p}`);
    }
    console.error(
      "This looks like staging identity leaking into a master-bound merge. Fix config.yaml by hand before pushing -- see this script's header comment and docs/SUPERVISOR_RUNBOOK.md's Stage 2."
    );
    process.exitCode = 1;
    return;
  }

  console.log(`OK: config.yaml has production identity (name="${name}", slug="${slug}").`);
}

main();

# Dogfood notes (SS6.1/SS6.2)

Written after running `BACKLOG.md` #11 (task `F11.1`) end-to-end through
the rewritten `/continue-development` loop, plus an unplanned real
interruption (`BACKLOG.md` #23, task `B23.1`) that happened mid-run. This
is the first time any of SS0-SS5's machinery ran against real,
non-framework work rather than the framework editing itself — these are
the findings that only real usage surfaces, per SS6.1's own acceptance
criteria.

## 1. The task-packet generator is 0-for-7 on needing zero hand-correction

Every real task packet produced this session — `SS4.1`, `SS4.2`, `SS4.3`,
`SS4.4`, `SS5.1`, `F11.1`, `B23.1` — was hand-authored directly against
`task-packet.schema.json` rather than trusted from
`generate-task-packet.mjs`'s output. The one time the generator was
actually run this session (for `SS5.1`), its output needed full
correction: stripped leading dots on every `.claude/`-prefixed path, an
overly broad `.sdlc/**`/`docs/**` `write_paths` that directly contradicted
entries it also listed under `forbidden_paths`, and empty
`acceptance_criteria`. `SS4.x` and `F11.1`/`B23.1` didn't even bother
running it, given that track record.

**Real signal for the plugin-extraction design**: either the heuristic
needs to get meaningfully better before it's worth invoking at all (right
now it costs a review pass and adds no value over writing the packet
directly), or the generator's actual job should be reframed as "produce a
structurally-valid skeleton with `NEEDS_MANUAL_REVIEW` placeholders in
every field" rather than attempting real path inference — the current
middle ground (confidently wrong inference that still needs a full
rewrite) is worse than either extreme.

## 2. The implementer correctly refusing to fake verification is the design working, not a gap

`F11.1`'s implementer self-reported `status: blocked` because it has no
browser/computer-use tooling and the packet required live-viewport
verification. This is *exactly* the intended division of labor
(design-spec §2's fixed tool grant), not a bug — but it's worth recording
as confirmed-by-real-use rather than theoretical: a differently-designed
implementer with a looser mandate could easily have rationalized "the code
looks right, I'll mark it done" instead of honestly reporting what it
couldn't check. The fixed, narrow tool grant plus the instruction to
report `scope_change_requested`/`blocked` rather than overclaim did what
it was supposed to do under real (not synthetic) pressure — this same
task had a live user waiting on a real bug fix at the same time, which is
exactly the kind of pressure that makes overclaiming tempting.

## 3. An unplanned priority interruption was handled cleanly by the framework, not around it

Mid-`F11.1`, the user reported a live production incident (`BACKLOG.md`
#23 — an unguarded `artist.genres` field crashing the whole app to a
black screen). This was never anticipated in any plan — SS6.1's own task
text only asked to dogfood *one* chosen backlog item. Rather than
awkwardly folding the fix into `F11.1`'s existing task packet or
abandoning the sdlc-tracked mechanism for it, it became its own work_item
(`artist-genres-crash-fix`) and task (`B23.1`), with `F11.1` explicitly
marked "paused, not abandoned" in its own notes and picked back up
afterward. **This is real validation that per-work-item task graphs in
`state.json` (rather than one flat task list) were the right shape** — an
unrelated, higher-priority task could jump the queue without corrupting
the original item's own tracking.

## 4. `.sdlc/` branch-locality is a real, recurring friction point — not hypothetical

Flagged as a design implication back during the real `supervisor` push
session (see `PROGRESS.md`'s session log for that day), and confirmed
again here: `.sdlc/` only exists on the unmerged `feature/sdlc-supervisor`
branch, so *any* new dogfood/real work item needs an explicit branching
decision before it can be sdlc-tracked at all (this session: branch
`feature/favorites-two-column-layout` off `feature/sdlc-supervisor`, not
`master`, and surface that choice to the user rather than picking
unilaterally). This will hit **every** future sdlc-tracked work item until
`sdlc-supervisor` itself merges to `master` — worth treating "merge
`sdlc-supervisor` to `master`" as a real unblocking milestone for the
framework's own usefulness, not just a paperwork step at the end.

## 5. Verification-tier routing didn't over- or under-trigger, for real tasks

Neither `F11.1` (a layout reflow) nor `B23.1` (a data-shaping bug fix in
Spotify-adjacent code, but not auth/token/credential logic specifically)
qualified for SS4.3's strong-verification floor/widen tier. Both stayed on
the default orchestrator-spot-check path, and that path caught what it
needed to catch — `F11.1`'s implementer diff was reviewed and its live
behavior independently checked via the Browser pane before acceptance,
`B23.1`'s diff and test run were independently rereversed
(`git diff --stat`, `tsc`, `vitest`) rather than trusted from the
implementer's own report. First confirmation this session that the
tier-routing judgment call doesn't reflexively over-trigger the verifier
agent just because a task touches "the Spotify layer" broadly — it
correctly distinguished credential/token logic (which would trigger it)
from adjacent data-shaping code (which didn't).

## 6. Real-world conditions are messier than any synthetic test, on purpose

This run also surfaced, organically and not as a designed test: a stray
local backend already rate-limited for real (`BACKLOG.md` #22, the second
occurrence found in this session alone — a third stray instance turned up
again minutes later when resuming verification). The orchestrator's
"stop, investigate, don't compound it" response (kill the stray process,
don't immediately start a replacement, surface it to the user, get
explicit confirmation before proceeding) is exactly the unconditional
"genuine blocker" stop condition from design-spec §7 working as intended
under a real, not simulated, incident — including correctly *not*
auto-resuming once the immediate crisis (a black screen) made the user
comfortable proceeding despite uncertainty, since that was the user's own
call to make, not the orchestrator's to assume.

## Net assessment

The mechanics scoped in SS0-SS5 hold up under real use: task packets as
the scope contract, the implementer's narrow tool grant and honest
`blocked`/`scope_change_requested` reporting, per-work-item task graphs
tolerating an unplanned interruption, and tier-routing not over-firing.
The one piece that clearly needs rethinking before the plugin-extraction
proposal is the packet generator's actual value — it has not once
produced a packet worth using as-is, across seven real attempts.

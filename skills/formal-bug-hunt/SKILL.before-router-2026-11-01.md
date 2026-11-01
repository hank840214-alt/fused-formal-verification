---
name: formal-bug-hunt
description: "Find concurrency or state-machine defects using bounded TLA+/Lean models and real-code repros. Use for explicit formal verification or unresolved interleavings; ordinary debugging stays lightweight."
---

# Formal bug hunt

Find bugs that tests miss by checking invariants over all interleavings, then prove each one on the real code.
Report shape and patterns: [REFERENCE.md](REFERENCE.md). Scaffold: `scripts/new-hunt.sh <project> <repo-path>`.

## Hard rules

- Both modes: never open real data or production; a bug counts only when a repro on the real code shows it.
- Full hunt: work in `~/formal-verification/<project>/`, never inside the target repo. Other sessions may have uncommitted work there.
- Never open real data or production. Repros use throwaway DBs built from migrations, ephemeral localhost ports, and read-only copies.
- A finding is CONFIRMED only when a repro on the **real code** shows it. A model violation alone is PLAUSIBLE.
- The main session re-runs every CONFIRMED repro itself before reporting. Agent output is evidence to check, not a verdict.
- Full-hunt fixes use an isolated worktree when concurrent work or the requested scope requires it. Make one reviewable change per finding; commit, push, deploy and merge require the applicable user authorization. Quick-debug fixes follow the active repo scope.

## Quick debug (default when the user just says "debug")

1. Restate the symptom in one line and pin the target (path, HEAD, uncommitted files).
2. Reproduce it on the real code with the smallest script or test; print one decisive line. No reproduction → report what was tried; do not guess-fix.
3. Find the cause (file:line) and make the minimal fix in the repo, following its rules; add a regression test that fails before and passes after. If other sessions have uncommitted work in the same files, fix in an isolated copy and apply a patch.
4. Escalate to formal modeling when explicitly requested, or when a specific unresolved invariant/interleaving justifies a bounded model. Timers, retries, money, or failure to reproduce alone do not require TLA+/Lean; first collect the next discriminating runtime evidence.

## Workflow (full formal hunt)

1. **Pin the target.** Record path, HEAD, and which files are uncommitted. Cite lines from what you actually read.
2. **Pick the smallest relevant area; add areas only within the requested hunt scope.** Good targets: room/lobby lifecycle, join/leave/reconnect, snapshot or sync ordering, turn/host authority, timers, money totals, import/re-import, retries.
3. **Write one invariant per area in plain words first** (e.g. "no item on a control station", "clients agree after the channel drains", "Σ balances = Σ opening").
4. **Model it small in TLA+.** 2–3 players, 2–3 items, bounded counters. Add a `FIX_*` constant so the same spec shows *violated* (current code) and *holds* (fixed code). Run `tlc` with one `.cfg` per case; keep the logs in `runs/`.
   - Atomic step = the synchronous block between two awaits (or one DB transaction) in the code. Never coarser: a coarse step hides the race you hunt. Comment each action with `\* path:line function`.
   - A run cut off by state limits is inconclusive, not a proof. Shrink bounds (or use symmetry sets) until it finishes.
5. **Prove arithmetic in Lean 4** when the rule is about sums, splits or rounding. Core Lean only, no `sorry`; run `#print axioms` and keep the log.
6. **Reproduce on real code.** For each violation, write `repro/rN-<name>` that starts the real server/module and prints one key line (e.g. `lever.item = {...} still there`). Fixtures may only create states reachable in normal play.
7. **Classify and report** in `REPORT.md`: findings table, "Modeled and holds", "Not confirmed / not modeled". Severity reflects player/user impact, not model size.
8. **Fix (when asked).** Minimal fix per finding on the fix branch; rerun the original repro against the fixed code, rerun the model with `FIX_*=TRUE`, run the repo's tests; record commits and results under "Fix status".
   - A finding stays a finding: never weaken a property or the model to make a check pass.

## Lock-in (after the sweep, when the user wants a lasting check)

Fused from pstack's create-formal-verification-skill (2026-11-01). A sweep without lock-in rots; do this after fixes land, so the model matches fixed code.

1. Keep 1–3 properties whose break costs most; one plain sentence each plus the harm.
2. **Mutation:** for each property, remove the matching guard (lock, re-read, transaction) in the model and confirm the checker finds a violation. A check never seen failing proves nothing. Report a table: mutant → property → result.
3. Make the gate config fast (< 1 min) and confirm it still finds every known finding under the fault config.
4. Commit the model into the target repo on a branch (isolated copy), with a repo-local verify skill: covered functions + model commit, one pinned command (downloads the jar if missing), bug vs modeling error (reproduce on real code first), how to update the model, what is not covered.
5. **Drift guard:** a test that hashes the covered function bodies (not whole files) and fails when they change without the model changing.
6. Prove it works: make a scratch change in real code that breaks the property, see the check fail, revert, see it pass. PR only, never merge.

## Tools

- TLA+: `~/.local/bin/tlc Spec.tla -config Spec_CASE.cfg` (uses brew `openjdk@21`; `/usr/bin/java` is a stub).
- Lean 4: `lean File.lean` via brew `elan` shims; toolchain linked with `elan toolchain link`.
- Real-code harness: `node --experimental-strip-types repro/<file>.ts` for TS projects; headless Chromium for browser-only logic.

## Delegation

Spec writing and repro drafting can go to an Opus agent with this skill's rules pasted in. The main session keeps: target pinning, re-running repros, severity, and the final report.

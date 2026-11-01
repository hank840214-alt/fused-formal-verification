---
name: "fused-formal-verification"
description: "Find race, state-machine and data-flow bugs with TLA+/Lean (Boris-style sweep), lock the key property in as a repo check that can fail, keep it in sync with the code, and show bugs as statecharts (pstack-style). Use for formal verification, model checking, races, locks, sessions, retries, or when tests cannot reach an interleaving."
---

# Fused formal verification (sweep + lock-in + maintain + statechart)

Four modes. Pick by the request:
- **Create** (Phase 0–2): no verification exists yet, or a new area needs one. Phase 1 casts a wide net for bugs (the Boris Cherny-style Lean/TLA+ pass over real code). Phase 2 keeps the 1–3 properties that matter most as a checked regression (pstack create-formal-verification-skill).
- **Maintain**: a verification exists and the code changed since (merges, refactors, edits that skipped the verify skill). pstack maintain-formal-verification-skill.
- **Statechart**: show a model, or a bug path, to someone who decides the behavior (PM, designer, owner). pstack statechart.
- **Handoff**: always last.

Phase 1 without Phase 2 rots; Phase 2 without Phase 1 verifies the easy thing; neither survives without Maintain.

The user does not need to know TLA+ or Lean. Every report must be readable without them.

## Hard rules (all modes)

- Pin the target first: repo path, HEAD, and which files are uncommitted. Cite lines from what you actually read.
- Work in a verification directory outside the target repo (for example `~/formal-verification/<project>/`), or in an exported read-only snapshot (`git archive <ref> | tar -x`). Other sessions may have uncommitted work in the live tree; never run or edit inside it.
- Never open real data or production. Repros use throwaway DBs built from migrations, ephemeral localhost ports, and read-only copies.
- Never deploy, merge, or flip feature flags. Product code changes only when the user asks, on a separate branch from the verification.
- A finding stays a finding. Never weaken a property or the model to make a check pass.
- Status words: **CONFIRMED** = a repro on the real code shows it and the main session reran it. **CONFIRMED (agent)** = agent evidence only. **PLAUSIBLE** = model violation or partial repro. Severity follows user impact, not model size.

## Phase 0 — Scope from the code

1. Read the repo's agent rules (AGENTS.md, CLAUDE.md, REVIEW.md) and obey them: branches, approvals, required pre-handoff commands.
2. Find what changed since the last verification: `git log --since`, existing `formal/` dirs, verify skills, earlier reports, regression tests named after earlier hunts. If a verification already covers the area, switch to **Maintain** first. New, unverified, concurrent code ranks first. Reuse earlier models if reachable, but re-align them to today's code.
3. List candidate promises ("a seat is never given to two people", "account deletion never leaves a live token behind", "our revoke never kills a binding someone still uses"). Code comments that explain a guard are often the promise stated outright. Good targets: room/lobby lifecycle, join/leave/reconnect, snapshot or sync ordering, turn/host authority, timers, money totals, import/re-import, retries. Pick the strongest: a break harms users and tests rarely reach the interleaving.
4. Ask the user only what the code cannot answer.

## Phase 1 — Sweep (breadth)

5. Map every actor and every await/yield. Each await is a place another actor can interleave. A synchronous block between awaits, or one DB transaction, is ONE atomic step. The model must use exactly those steps:
   - coarser hides real races;
   - finer invents races that cannot happen. Classic trap: a branch with no await (e.g. a loop that only awaits for some item kinds) is atomic as a whole. Check which paths actually await.
6. Choose the tool by the question:
   - Bad orderings / interleavings → TLA+ model of the design (default).
   - Every input to one function → verifier on the code, or Lean; property-based tests on the real code when no verifier exists.
   - Must hold at every size (sums, splits, rounding) → Lean 4 proof. Core Lean only, no `sorry`; run `#print axioms` and keep the log.
   - Mixed data-flow + concurrency → TLA+ for the protocol, Lean or property tests for the pure parts.
   Tell the user which tool and why. Prefer tools the repo's developers can install and run.
7. Name everything after the repo. Each action gets a comment `\* path/file.ts:~L123 functionName`. Model external systems (payment provider, OAuth, Apple/Google) by their real semantics, written in the module header.
8. Inject faults as bounded budgets (network error, lost response, session ended mid-request), so one run explores them without exploding.
9. Keep the model small: 2–3 actors, 2–3 items, bounded counters, states in the thousands. If TLC runs for minutes, the model is too big, not too thorough; shrink bounds or add symmetry sets. TLC tips:
   - Sentinels (Null/NoRow) must be records with the same fields as real values, or TLC cannot compare them.
   - Operators must be defined before use.
   - Pass a primed value as a parameter instead of reading `x'` before it is set.
   - Write `Next` as a disjunction of named actions, so traces name the step.
   - Pipe output to a log and print traces compactly (action + changed variables only).
10. One counterexample at a time: when TLC finds one, add a model switch for the proposed fix (`FixX = FALSE` means today's code), set it TRUE, and rerun to find the next. Today's-code configs keep every switch FALSE. Ship both configs: the FALSE one must show the violation, the TRUE one must pass.
11. Reproduce every counterexample against the real code: a test that drives the real functions in the trace's order, using gates/promises to hold an await open, and prints one decisive line. Confirm it fails on the FINAL safety assertion, not on a setup assertion. Fixtures may only create states reachable in normal play. Only a reproduced counterexample is a bug; anything else is a modeling error. Fix the model, never the property.
12. Note simplifications seen while modeling (dead branches, locks that never contend) separately from bugs.

## Phase 2 — Lock-in (depth)

13. Keep 1–3 properties. State each in one plain sentence plus the harm in one sentence.
14. Keep two kinds of config:
    - guard: today's code, faults the code is expected to survive. Must pass. Target under 1 minute, using small bounds and symmetry sets; run it on every change to covered code.
    - findings: fault injection that shows each open finding; flip the fix switches as fixes land.
15. Mutation run: for each guard property, make a mutant that removes one real guard (a lock check, a re-read inside a transaction, a bind check, a reordered step) and confirm the guard config now fails. Record mutant → property → result in a table. A check never seen failing proves nothing.
16. Findings stay findings. Never weaken a property to pass. Do not change product code unless the user asks. Reproduction tests go in as `todo` (node:test `{todo}`, pytest xfail, etc.) so the suite stays green; remove the marker when fixing.
17. Write a project-local verify skill with frontmatter (without it, the skill never registers). Check .gitignore first: if `.claude/` is ignored, ask the user whether to force-add it or keep the skill under `formal/`. From the skill alone, a cold agent mid-change must be able to:
    - tell whether a change touches verified code (list covered functions/files and the state they guard);
    - run the check with one command (pinned tool version, downloads the jar if missing), short enough to run on every relevant change;
    - tell a real bug from a modeling error (replay in real code first);
    - update the verification when a change is intended;
    - know the bounds, assumptions and what is NOT covered (abstracted flows, time-based expiry, multi-instance).
    Record the **sync commit**: the commit where each check was last confirmed to describe the code. Use real commands, paths and nouns; no placeholders.
18. Drift guard: a test that hashes the covered function bodies (not whole files) and fails when they change without the model changing too. It tells the next agent to run **Maintain**. (`scripts/drift-guard.mjs` in this repo does this from a `formal/coverage.json` manifest.)
19. Prove the skill works before handing off: follow it once, as the next agent would, on a scratch change that breaks the property in the real code. It must catch the break. Drop the scratch change and confirm the check is back where it started (passing, or failing only on reported findings). If the skill misses the break, fix the skill or the verification, not the scratch change.

## Maintain — keep the verification true to the code

A check that keeps passing on code that no longer exists is the dangerous case: it looks like a proof.

Edit only the verification (models, harnesses, properties, the verify skill). Never edit product code unless asked. Never weaken a property to make it pass.

Give each check exactly one outcome (or updated + bug):
- **in sync**: nothing since the sync commit alters what it describes, and it passes.
- **updated**: the code changed, the verification now describes the new code, and it passes.
- **bug**: the verification describes the current code and the code breaks the property.
- **blocked**: could not be brought in line or could not run; say exactly why (including "not reached within budget").

Steps:
1. **Find the checks.** A verify skill has no fixed name; find any project skill that runs a model checker/prover/verifier against named code. For each check collect property, covered code, bounds, assumptions, command, sync commit. No sync commit recorded → use the last commit that touched the verification files, and say so. No verify skill → go to Create.
2. **Run as is**, once, before changing anything. A pass only means the old description still holds; a failure may be drift or a bug. Do not judge yet.
3. **Read every change to covered code** from the sync commit to HEAD, diffs and commit messages. Follow covered functions that were renamed, split or moved (`git log --follow`, `git log -L`). Look for NEW code that writes the guarded state. Classify each change:
   - no effect (check this against the model, not the commit message);
   - the verification no longer describes the code (an atomic step split in two, a branch added/removed, a check moved, a new path reaches the guarded state, a value range changed) → the model must change;
   - the promise changed on purpose, with evidence (doc comment, tests, changelog, commit message) → the property changes; cite the evidence;
   - the promise may be broken (code changed, no evidence of intent) → a later failure is a bug candidate.
4. **Update from the code, not from the result.** Each changed part again points to code a reviewer can open; one atomic step in code stays one step in the model. Write the update before rerunning. Change a property only for an intended promise change: record old wording, new wording, evidence. Keep bounds unless the change makes them wrong; if you reduce one, say so.
5. **Rerun and judge.**
   - Pass: break the new code the way the property guards against (remove a new check, reorder a new step) and confirm the check catches it; then drop the break.
   - Fail: replay the counterexample step by step in the real code. A step that cannot happen → the verification is wrong; fix it and say what was wrong. Every step can happen → bug: name the commit that introduced it, tell the steps in the code's words, state the harm in one sentence, add a cheap reproduction as evidence (not as a product commit).
6. **Update the verify skill**: covered code, commands, bounds, assumptions, sync commit (= the commit you checked; do not move it for a blocked check). Then follow the skill once as the next agent would.

Report per check: outcome and commits read; what changed in the verification and why (shape change, or intended promise change with evidence); rerun result and the break used to show it can still fail; each bug in plain words with the introducing commit; what is still not covered, including new code that should be. Say outright which failures were drift and which were bugs. A check that passed before the update and fails after was passing on a stale description — say so. Put verification updates in a change of their own, separate from any product fix.

Schedule Maintain: after merges to covered code, before each release, and as a recurring task when the user wants it. A large drift (hundreds of commits) is normal after a gap; budget it, work check by check, and mark the rest blocked rather than skimming.

## Statechart — show it in the reader's words

The reader (PM, designer, owner) decides whether the behavior is right. A counterexample in model terms convinces engineers; the chart convinces the reader.

1. Work in a scratch folder outside the repo, or reuse the TLA+ model when it already describes the flow.
2. Write each rule the reader agrees to as an INVARIANT, in their words ("you never see Synced while offline"). If no variable expresses a rule, add one. Never weaken a rule to make it hold.
3. `Next` is a disjunction of named actions. A correct end state with no step out breaks deadlock checking: add a `Done` action true only in end states that changes nothing.
4. Map model states to the reader's labels (what they see or care about, e.g. "Paying", "Lease held, write pending"); no variable names. Label arrows as the user sees them happen ("you press play", "the connect fails"); conditions in brackets in the reader's words. Two actions that end the same share one label/arrow.
5. Keep it readable: about 20 arrows or fewer. Merge labels that act the same before hiding steps. Never merge two states that break different rules. If you hide steps: keep every state reachable, keep at least one arrow out of each state that has a step out, hide all of an arrow's steps or none, and say in the handoff which steps are hidden.
6. Mark each state that breaks a rule (class `breaks`; `mayBreak` when only some model states behind it break) and give the shortest path to each, numbered, in the reader's words. TLC goes past a broken state, so states after a bug can appear; keep constants small or add a CONSTRAINT.
7. Tooling: if pstack is installed, use its `statechart` script (`scripts/statechart SPEC.tla --view view.ts --out DIR`; the view exports `state(vars)`, optional `step(action, from, to)`, `group`, `colors`, `title`). Otherwise dump TLC's state graph (`-dump dot,actionlabels states.dot`) and run `scripts/tlc-dot-to-mermaid.mjs states.dot --view view.mjs --out chart.mmd` from this repo; it applies the same label mapping and emits Mermaid `stateDiagram-v2`.
8. Before handing a bug path to the reader, replay it against the real code, one step per action. If it does not occur, assume the model is wrong until shown otherwise.
9. Hand off: the chart as a mermaid block, one line per bug (rule, the reader's sentence, the numbered path), what the model leaves out, and the command that regenerates it.

## Long runs

- Run big state spaces in the background with a time limit. A run stopped by the limit is INCONCLUSIVE: never report it as a pass.
- Quote the state count, depth and time for every pass.

## Delegation

Spec writing, repro drafting and Maintain diff-reading can go to a subagent with this skill pasted in. The main session keeps: target pinning, re-running every CONFIRMED repro, severity, the mutation table, and the final report. Agent output is evidence to check, not a verdict.

## Handoff

- What was verified, which tool and why, the bounds, what it found (plain words; counterexample as numbered steps in the code's terms, with file:line), how to run it, what it does not cover.
- Bugs: each with its reproducing test, marked new or pre-existing, with the introducing commit when known.
- Evidence rung for each claim (adapted from pstack blast-radius): 1 said so · 2 pointed at file:line · 3 walked the failure step by step · 4 ran a script/test on the real code · 5 reproduced in the running app. CONFIRMED needs rung 4 or 5.
- The mutation table; for Maintain, each check's outcome.
- Statecharts for the reader, when the behavior's owner is not an engineer.
- The repo's required pre-handoff commands with result lines; say plainly what was not run.
- Push to a branch with upstream set (`git push -u`; in a shallow clone add a fetch refspec for the branch so the remote-tracking ref exists); open a PR only if asked; never merge. Verification changes go in their own change, separate from product fixes.
- Suggest a second target only if you found a close one.
- If another agent continues, write a self-contained handoff prompt: the branch, the files, the findings, the open steps in order, and the repo rules.

## Anti-patterns

- Model steps that don't match the code's real atomic blocks.
- "Verified" with no mutation run, or after a run that hit a time limit.
- Reporting a model counterexample as a bug before reproducing it.
- A check that has passed for months with no sync commit and no drift guard.
- Shaping a model update by what makes the check pass.
- A thousand theorems no one reruns. One property checked on every change beats that.

## Sources

- Sweep: Boris Cherny's public Lean/TLA+ bug-hunting pass over the Claude Agent SDK (primary sources and what could not be verified: `research/pstack-vs-boris-2026-11-01.md`).
- Lock-in, Maintain, Statechart: pstack by Lauren Tan (MIT, https://github.com/cursor/plugins/tree/main/pstack), rewritten and merged here; see `NOTICE`.

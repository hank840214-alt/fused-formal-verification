---
name: formal-bug-hunt
description: "Find concurrency or state-machine defects using bounded TLA+/Lean models and real-code repros. Use for explicit formal verification, 'debug', or unresolved interleavings; ordinary debugging stays lightweight, deep work routes to fused-formal-verification."
---

# Formal bug hunt (router)

Entry point for "debug" and for formal verification. Quick debug stays here. Anything deeper runs the `fused-formal-verification` skill (same repo, `skills/fused-formal-verification/SKILL.md`); this file only decides which mode and keeps the machine-specific tool notes.

## Quick debug (default when the user just says "debug")

1. Restate the symptom in one line and pin the target (path, HEAD, uncommitted files).
2. Reproduce it on the real code with the smallest script or test; print one decisive line. No reproduction → report what was tried; do not guess-fix.
3. Find the cause (file:line) and make the minimal fix in the repo, following its rules; add a regression test that fails before and passes after. If other sessions have uncommitted work in the same files, fix in an isolated copy and apply a patch.
4. Escalate only when a specific unresolved invariant or interleaving justifies a bounded model, or when the user asks for formal verification. Timers, retries, money, or failure to reproduce alone do not require TLA+/Lean; first collect the next discriminating runtime evidence.

## Routing to fused-formal-verification

| Situation | Mode |
|---|---|
| No model exists for this area; concurrency, state machine, money, sessions, retries | **Create** (Phase 0 → 1 → 2) |
| A model or verify skill exists and the code moved since its sync commit | **Maintain** first, then Create for new areas |
| Someone who is not an engineer must decide whether the behavior is right | **Statechart** |
| Any of the above, at the end | **Handoff** |

Report shape, status words and TLA+/Lean patterns: [REFERENCE.md](REFERENCE.md). Scaffold a hunt directory: `scripts/new-hunt.sh <project> <repo-path>`.

## Tools (this machine)

- TLA+: `~/.local/bin/tlc Spec.tla -config Spec_CASE.cfg` (wrapper uses brew `openjdk@21`; `/usr/bin/java` is a stub). Run long jobs with `timeout` in the background; a run cut off is INCONCLUSIVE.
- Lean 4: `lean File.lean` via brew `elan` shims; toolchain linked with `elan toolchain link`.
- Real-code harness: `node --experimental-strip-types repro/<file>.ts` for TS projects; headless Chromium for browser-only logic.
- Drift guard and statechart fallback: `scripts/drift-guard.mjs`, `scripts/tlc-dot-to-mermaid.mjs` in the fused repo.

# Formal bug hunt — reference

## REPORT.md template

```md
# <Project> — Formal Verification Report (<date>)

Target: `<repo path>` at `<HEAD>` (uncommitted: <files or "none">).
Method: TLA+ (<specs>), Lean 4 (<file>, N theorems, no `sorry`, axioms: <list>), repros (<how the real code is started>).
Main-session re-verification: <which findings were rerun, log paths>.

## Findings

| id | status | severity | where | invariant | what happens | repro → key output | minimal fix |
|---|---|---|---|---|---|---|---|
| F1 | CONFIRMED | High | `server/index.ts:333` | NoItemOnControl | <one or two plain sentences> | `node repro/r1-x.ts 78` → `lever.item = {...} still there` | <smallest change> |

## Modeled and holds
- <spec / config>: <invariants>, <state count>, no error.

## Not confirmed / not modeled
- <what was not reproduced or not examined, and why>

## Fix status
Branch `formal/<project>-fixes` in `~/formal-verification/worktrees/<project>` (base `<sha>`): F1 `<sha>`, …
Verification: <tests>, <repros against fixed code>, <models with FIX=TRUE>. Not pushed, not deployed.
```

Status values: **CONFIRMED** (repro on real code shows it), **CONFIRMED (agent)** (agent evidence only, main session did not rerun), **PLAUSIBLE** (model violation or partial repro). Severity: High = blocks a mode/level or loses money/data; Medium = wrong result with a workaround; Low = cosmetic or rare.

## TLA+ patterns

- Header comment maps each action to real code lines (`Tick` ↔ `server/index.ts:591`).
- Abstract the payload: a single counter `ver` that increments on any public-state change is enough to check sync.
- Put the bug and the fix in one spec: `CONSTANTS FIX_SEQ` and `Bump == IF FIX_SEQ THEN seq + 1 ELSE seq`. Ship `Spec_FALSE.cfg` (expect violation + trace) and `Spec_TRUE.cfg` (expect "No error").
- Liveness (turns always complete, absent players get skipped) needs `PROPERTIES` plus fairness in `Spec`.
- Keep bounds tiny (states in the thousands). If TLC runs for minutes, the model is too big, not too thorough.
- Race questions: model the check and the write as separate actions (check-then-act), then an `atomic` variant.

## Lean patterns

- One `def` per real function, with a comment citing file:line; integers for money (units or cents).
- Prove the good law (`conservation`) and a counterexample theorem for the bug (`deleted_account_breaks_conservation`).
- `AxiomCheck.lean`: `#print axioms` for every theorem; accept only `propext`, `Quot.sound` (or none).

## Repro patterns

- Server code: import the real `startBrowserServer` / app factory, bind `port: 0`, drive with real WebSocket/HTTP clients.
- Databases: build a throwaway DB from the repo's migrations under `~/formal-verification/<project>/`; refuse to run if `DATABASE_URL` points anywhere else.
- Browser-only logic: serve repo files read-only to headless Chromium; run the repo's own relay/signaling on 127.0.0.1.
- Print one decisive line per repro, e.g. `after depart: route-lever.item = …` or `DECK before reload = 30, after = 0`.
- Timing claims: measure ratios (game time ÷ wall time) over repeated runs and report the range, not one number.

## Finding ideas that paid off before

- Items or players placed where the normal action cannot reach them (control stations, inside moving obstacles).
- State mutated outside the tick without bumping the sequence → clients drop the update.
- Fixed-step timers that never catch up → game clock slower than wall clock.
- Host reload / reconnect that rebuilds from a public copy and loses secret state or keys.
- Soft delete that hides rows in one view but still counts them in another.
- Import/re-import that resurrects deleted rows; de-dup keys that ignore direction or count.
- Retries without an idempotency key.

## Tool setup gotchas

- TLA+: install `tla2tools.jar` with `gh release download` (curl to GitHub may be blocked); wrap with brew `openjdk@21`.
- Lean: `brew install elan-init`; the official download can crawl, so fetch the toolchain asset with `gh release download --repo leanprover/lean4` and `elan toolchain link`.
- Use `/bin/rm` in scripts if `rm` is wrapped in the shell.

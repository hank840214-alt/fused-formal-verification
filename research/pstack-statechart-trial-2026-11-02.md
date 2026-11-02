# pstack `statechart` trial (2026-11-02)

Tool: pstack v0.15.36 (cursor/plugins commit ae5650f, the latest that day), skill `statechart`, run on macOS with Node 25.9, TLC 1.7.4 (`tla2tools.jar`) and Temurin/OpenJDK 21 already on the machine.

Model: Night Market Rush `formal/account-binding/AccountBinding.tla` (Apple/Google account binding, 14 variables, 13 actions, 3 invariants). Its TLC report of 2026-11-01 had found four bugs F1–F4 and confirmed the fixed code.

## What was run

| Config | What it turns off | Result | Time (1 worker) |
|---|---|---|---|
| `MC_small_f1` | fix F1 (queue a failed cleanup revoke) | `NoOrphanAuthorization` breaks, 5-step path | 6.5 s |
| `MC_small_f2` | fix F2 (drop revoked rows on AUTH) | `NoRevokeOfLiveBinding` breaks, 7-step path | ~7 s |
| `MC_fixed` | nothing (F1–F4 on) | all three rules hold, 5,502,431 distinct states, no chart (budget 500) | 1 min 54 s |

The same `MC_fixed` run with plain multi-worker TLC takes about 30 s on this machine. Both bug paths match the 2026-11-01 counterexamples step for step.

Command (no mise install when both env vars are set):

```sh
TLA2TOOLS=~/.local/share/tlaplus/tla2tools.jar JAVA=/opt/homebrew/opt/openjdk@21/bin/java \
  <pstack>/skills/statechart/scripts/statechart AccountBinding.tla --config MC_small_f1.cfg --view view.mjs --out out-f1
```

View module: `examples/statechart-view-account-binding.mjs`.

## What the tool does well

- The view layer: `state(vars)`, `step(action, from, to)`, `group`, `colors`, `title`. The chart reads in the owner's words, not variable names.
- Marks: `breaks` / `mayBreak` on states, `bugPath` on the shortest path, a Legend block naming the rule.
- Per-rule reruns: when a rule breaks it removes that rule and runs again, so one run can show several bugs when the model is small.
- Reads a TLC config as written (CONSTRAINT, CHECK_DEADLOCK FALSE, symmetry notes) and explains the effect of each in the report.

## Limits found

- One TLC worker, fixed. About 4x slower than a plain multi-worker run on a 5.5M-state model.
- After the first break, each rerun stops at 100,000 distinct states and the report lists the other rules as "not checked". On a real-size model this means one config shows one rule; the sweep must come from a separate TLC run.
- Above 500 states only the bug paths are drawn. A full chart of a production model is out of reach; that is fine for the hand-off, which needs the path, not the graph.
- A step whose two ends get the same label is not drawn, and hiding a step on a bug path is an error. The view must put every change along the path into the label (here: "this device's session was removed"), even when the stored data did not change.
- Full-width punctuation becomes `#65306;` in `.mmd` and the title becomes `ﬂ°°65306¶ß`. Both are Mermaid's own entity encodings and render correctly.
- Pele (`npm i pele@1.9.0`) was blocked by the agent's permission classifier here; headless Chrome + Mermaid 11 rendered the same `.mmd` with the group colors restored through CSS.

## Decision (owner, 2026-11-02): A

- Sweep and lock-in stay with this skill's own TLC runs (multi-worker, drift guard, repo check).
- Drawing a bug path for a non-engineer uses pstack's `statechart` script, one config per rule.
- `scripts/tlc-dot-to-mermaid.mjs` stays as the fallback when pstack is not installed.

Values the view receives: a TLA+ function is a JS object keyed by its domain (`v.bound.a1`), a set is an array (`v.pending`), a record is an object (`v.pc.p1.op`), sentinels keep their record shape (`{s:"-", ...}`).

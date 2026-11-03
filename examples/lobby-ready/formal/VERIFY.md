---
name: verify-lobby-ready
description: Run and maintain the formal check of the toy lobby in examples/lobby-ready (ready flags vs config changes). Use before changing server.mjs or lobby.config.json, when gate.sh fails, or to re-sync the model after an intended change.
---

# Verify: lobby ready flags

## 1. Does my change touch verified code?

Covered (hashed in `coverage.json`; the gate fails when they change without this file moving):

| Where | Model step | What it guards |
|---|---|---|
| `server.mjs` `handleReady` | `ReadyBegin` (before the await), `ReadyCommit` (after it) | the flag lands only for the config the player read |
| `server.mjs` `handleConfig` | `HostChange` | a new version clears every flag |
| `server.mjs` `handleStart` | `Start` | the game starts only when every player is ready |
| `lobby.config.json` `maxPlayers` | size of `Players` | the model checks 2 players; the constant is a model bound, not a body |

Not covered: `handleJoin`, the HTTP layer, the store's durability, time-outs (the model has no clock), more than one lobby process.

## 2. Run the check (one command, under a minute)

```sh
examples/lobby-ready/formal/gate.sh
```

Four rows, each with a number only a real run can print. Expected:

```
OK   drift      4 entries unchanged
OK   repros     2 tests pass
OK   MC_guard   none, 55 distinct states          Fix on (the code as it is)
OK   MC_mutant  ReadyMatchesConfig, 44 distinct states   Fix off: the mutation run
== gate PASS in 4s
```

Tools: Node >= 20; Java 11+ (`JAVA=` to override; the macOS `/usr/bin/java` stub does not count); `tla2tools.jar` v1.7.4 (TLC 2.19) at `~/.local/share/tlaplus/` or `TLA2TOOLS=`; the gate downloads it when missing.

## 3. A row failed. Bug or modeling error?

- `drift` FAIL: a covered body or `maxPlayers` changed. Go to step 4. Do not re-hash first.
- `repros` FAIL on the "fixed code" test: the real code lost the re-check. That is a bug in the code, not the model.
- `repros` FAIL on the "mutant" test: the trace no longer reproduces with `fix: false`. The code's await structure moved; re-read `handleReady` and bring `ReadyBegin`/`ReadyCommit` in line.
- `MC_guard` violated: replay the TLC trace in `lobby.test.mjs` first (hold the await open with the gate store). Only a reproduced trace is a bug. Otherwise fix the model, never the property.
- `MC_mutant` not violated: the bounds no longer reach the bug, or the property was weakened. The guard proves nothing until this row is red again.
- Any row with `?` or `no-result`: the tool did not run. That is a FAIL, not a pass.

## 4. The change was intended: re-sync

1. Edit `Lobby.tla` so each action is again the code between awaits of the function it names.
2. Run `gate.sh`. `MC_guard` must pass and `MC_mutant` must still break.
3. `node scripts/drift-guard.mjs update --manifest formal/coverage.json --root examples/lobby-ready` (from the repo root). This writes the new hashes and the sync commit.
4. Update the table in step 1 if a function was added or renamed.
5. `formal/statechart.sh` to redraw `statechart.mmd`.

## Bounds and assumptions

- `Players = {p1, p2}` with symmetry; `MaxVersion = 3`. A larger run (3 players, 5 versions, Fix on) found nothing new: 2,739 distinct states, no error, 1 s (2026-11-03). It is not part of the gate.
- One await per `handleReady`; the store write never fails. A failing write is outside the model.
- `Done` is the only step from a started game; `CHECK_DEADLOCK` stays on so a stuck lobby would show.

## Sync commit

See `coverage.json` `syncCommit` (written by `drift-guard update`). Last confirmed by hand: 2026-11-03.

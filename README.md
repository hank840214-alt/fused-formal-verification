# fused-formal-verification

One skill for coding agents (Claude Code, Codex, any harness that reads `SKILL.md`) that finds the bugs tests cannot reach, then keeps them from coming back:

1. **Sweep** (Boris Cherny-style): model the race-prone part of the code in TLA+ or Lean, find counterexamples, reproduce each one on the real code.
2. **Lock-in** (pstack-style): keep 1–3 properties as a repo check that runs in under a minute, prove it can fail (mutation table), add a drift guard, write a project-local verify skill.
3. **Maintain**: after the code moves, bring the model back in line and say which failures are drift and which are bugs.
4. **Statechart**: show the bug path as a Mermaid chart in the words of the person who owns the behavior.

The person asking does not need to know TLA+ or Lean. Every report is readable without them.

## Layout

| Path | What |
|---|---|
| `skills/fused-formal-verification/SKILL.md` | the skill (canonical) |
| `skills/formal-bug-hunt/` | thin router for "debug": quick debug stays light, deep work loads the fused skill; `REFERENCE.md` has the report template and TLA+/Lean patterns |
| `scripts/drift-guard.mjs` | hashes covered function bodies; fails when they change without the model |
| `scripts/tlc-dot-to-mermaid.mjs` | fallback statechart generator from TLC's `-dump dot` output |
| `prompts/run-verification.md` | a ready-to-paste task prompt that runs the skill on a project |
| `docs/index.html` | an interactive explainer for non-engineers |
| `research/` | source comparison (pstack vs Boris) and what could not be verified |

## Install (Claude Code)

```sh
git clone https://github.com/<you>/fused-formal-verification ~/fused-formal-verification
ln -s ~/fused-formal-verification/skills/fused-formal-verification ~/.claude/skills/fused-formal-verification
ln -s ~/fused-formal-verification/skills/formal-bug-hunt ~/.claude/skills/formal-bug-hunt
```

Tools: TLA+ (`tla2tools.jar` + Java 21) and Lean 4 (`elan`). The skill says which one a question needs.

## License

MIT. See `NOTICE` for the pstack attribution.

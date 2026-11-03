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
| `scripts/drift-guard.mjs` | hashes covered function bodies, plus the lockfile entries and config values the model assumes; fails when they change without the model |
| `scripts/tlc-dot-to-mermaid.mjs` | fallback statechart generator from TLC's `-dump dot` output |
| `examples/statechart-view-account-binding.mjs` | a real `--view` module for pstack `statechart` (labels in the reader's words, groups, step labels) |
| `prompts/run-verification.md` | a ready-to-paste task prompt that runs the skill on a project |
| `docs/index.html` | an interactive explainer for non-engineers |
| `research/` | source comparison (pstack vs Boris), the pstack `statechart` trial (2026-11-02), and what could not be verified |

## Install (Claude Code)

```sh
git clone https://github.com/hank840214-alt/fused-formal-verification ~/fused-formal-verification
ln -s ~/fused-formal-verification/skills/fused-formal-verification ~/.claude/skills/fused-formal-verification
ln -s ~/fused-formal-verification/skills/formal-bug-hunt ~/.claude/skills/formal-bug-hunt
```

Then, in Claude Code, say `debug` for the light path or `/fused-formal-verification` for the full one. Codex and other harnesses: point them at the two `SKILL.md` files.

Tools: TLA+ (`tla2tools.jar` + Java 21) and Lean 4 (`elan`). The skill says which one a question needs.

Non-engineer explainer (Traditional Chinese): https://hank840214-alt.github.io/fused-formal-verification/

## License

MIT. See `NOTICE` for the pstack attribution.

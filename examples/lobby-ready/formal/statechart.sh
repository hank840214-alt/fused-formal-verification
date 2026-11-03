#!/bin/bash
# statechart.sh - draw the mutant's state graph as a Mermaid statechart (formal/statechart.mmd) with the
# fallback renderer, scripts/tlc-dot-to-mermaid.mjs. Labels come from view.mjs; states that break
# ReadyMatchesConfig get the `breaks` class. With pstack installed, the same view.mjs works with its
# `statechart` script, which draws only the bug path on big models.
set -eu
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../../.." && pwd)"
pick_java() { for j in "${JAVA:-}" /opt/homebrew/opt/openjdk@21/bin/java /opt/homebrew/opt/openjdk/bin/java /usr/local/opt/openjdk@21/bin/java /usr/local/opt/openjdk/bin/java "$(command -v java)"; do [ -n "$j" ] && "$j" -version >/dev/null 2>&1 && { echo "$j"; return; }; done; }
java="$(pick_java)"; [ -n "$java" ] || { echo 'no working java' >&2; exit 1; }
jar="${TLA2TOOLS:-$HOME/.local/share/tlaplus/tla2tools.jar}"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
cfg="${1:-MC_mutant}"

(cd "$here" && "$java" -cp "$jar" tlc2.TLC -workers 1 -metadir "$work/meta" -config "$cfg.cfg" -dump dot,actionlabels,colorize "$work/states.dot" MC.tla > "$work/tlc.log" 2>&1) || true
grep -q 'distinct states found' "$work/tlc.log" || { echo 'TLC produced no state count; nothing drawn' >&2; tail -5 "$work/tlc.log" >&2; exit 1; }

node --input-type=module -e "
import { readFileSync, writeFileSync } from 'node:fs';
import { parseDot, parseState } from '$repo/scripts/tlc-dot-to-mermaid.mjs';
import { breaks } from '$here/view.mjs';
const dot = parseDot(readFileSync('$work/states.dot', 'utf8'));
const bad = dot.nodes.filter((n) => breaks(parseState(n.label))).map((n) => n.id);
writeFileSync('$work/bad.json', JSON.stringify(bad));
console.log(dot.nodes.length + ' states, ' + bad.length + ' break ReadyMatchesConfig');
"
node "$repo/scripts/tlc-dot-to-mermaid.mjs" "$work/states.dot" --view "$here/view.mjs" --breaks "$work/bad.json" --out "$here/statechart.mmd"
echo "wrote $here/statechart.mmd"

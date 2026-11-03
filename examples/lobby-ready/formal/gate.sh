#!/bin/bash
# Lobby gate (VERIFY.md step 2), under a minute: drift check, the real-code repros, then TLC at the small bounds.
# MC_guard (the code as it is) must finish with no error; MC_mutant (re-check removed) must break ReadyMatchesConfig,
# which proves the bounds still reach the bug. Every row prints something only a real run can produce (a state
# count, a test count); a row with no result is FAIL. Exit 0 only when every row matches its expected result.
#
# Needs Node >= 20, Java 11+ and tla2tools.jar. Override with JAVA / TLA2TOOLS. When the jar is missing it is
# downloaded once, pinned to the release this gate was last confirmed with.
set -u
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
repo="$(cd "$root/../.." && pwd)"
# macOS ships a /usr/bin/java stub that only prints "Unable to locate a Java Runtime"; a path is not enough, it must run.
pick_java() { for j in "${JAVA:-}" /opt/homebrew/opt/openjdk@21/bin/java /opt/homebrew/opt/openjdk/bin/java "$(command -v java)"; do [ -n "$j" ] && "$j" -version >/dev/null 2>&1 && { echo "$j"; return; }; done; }
java="$(pick_java)"
jar="${TLA2TOOLS:-$HOME/.local/share/tlaplus/tla2tools.jar}"
jar_url='https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar'
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
bad=0
row() { printf '%-4s %-10s %-40s %s\n' "$1" "$2" "$3" "$4"; [ "$1" = OK ] || bad=1; }
start=$(date +%s)

# 1. drift: the covered bodies and the config value the model assumes are still what the model saw.
if node "$repo/scripts/drift-guard.mjs" check --manifest formal/coverage.json --root "$root" > "$work/drift.out" 2>&1; then
  row OK drift "$(grep -c '^OK ' "$work/drift.out") entries unchanged" "synced at $(node -e "console.log(require('$here/coverage.json').syncCommit?.slice(0,7)??'?')")"
else
  row FAIL drift "$(grep -c -E '^(DRIFT|MISSING) ' "$work/drift.out") entries drifted" 'run Maintain (VERIFY.md step 4)'
fi

# 2. repros: the fixed code survives the trace; the mutant reproduces it.
(cd "$root" && node --test --test-reporter=tap lobby.test.mjs > "$work/tests.out" 2>&1)
pass=$(grep -c '^ok ' "$work/tests.out"); fails=$(grep -c '^not ok' "$work/tests.out")
if [ "$fails" = 0 ] && [ "$pass" -gt 0 ]; then row OK repros "$pass tests pass" ''; else row FAIL repros "$fails failing, $pass passing" "$(grep '^not ok' "$work/tests.out" | head -2 | tr '\n' ' ')"; fi

# 3. TLC.
if [ ! -f "$jar" ]; then
  mkdir -p "$(dirname "$jar")" && curl -fsSL "$jar_url" -o "$jar" || { row FAIL tlc 'tla2tools.jar missing and download failed' "$jar_url"; echo "== gate FAIL"; exit 1; }
fi
if [ -z "$java" ]; then row FAIL tlc 'no working java (Java 11+)' "set JAVA=/path/to/java"; echo "== gate FAIL"; exit 1; fi
tlc() {
  (cd "$here" && "$java" -XX:+UseParallelGC -cp "$jar" tlc2.TLC -workers auto -metadir "$work/meta-$1" -config "$1.cfg" MC.tla > "$work/$1.log" 2>&1)
  states=$(grep -o -m1 '[0-9]* distinct states found' "$work/$1.log" | awk '{print $1}')
  if grep -q 'No error has been found' "$work/$1.log"; then echo "none ${states:-?}"
  else echo "$(grep -m1 -o 'Invariant [A-Za-z]* is violated' "$work/$1.log" | awk '{print $2}' | grep . || echo 'no-result') ${states:-?}"; fi
}
expect() {
  local got; got=$(tlc "$1")
  if [ "${got% *}" = "$2" ] && [ "${got#* }" != "?" ]; then row OK "$1" "$2, ${got#* } distinct states" "$3"
  else row FAIL "$1" "got ${got% *}, want $2" "log kept: $here/gate-$1.log"; cp "$work/$1.log" "$here/gate-$1.log"; fi
}
expect MC_guard none 'Fix on (the code as it is)'
expect MC_mutant ReadyMatchesConfig 'Fix off: the mutation run'

echo "== gate $([ $bad = 0 ] && echo PASS || echo FAIL) in $(( $(date +%s) - start ))s"
exit $bad

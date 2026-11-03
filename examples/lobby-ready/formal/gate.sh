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
pick_java() { for j in "${JAVA:-}" /opt/homebrew/opt/openjdk@21/bin/java /opt/homebrew/opt/openjdk/bin/java /usr/local/opt/openjdk@21/bin/java /usr/local/opt/openjdk/bin/java "$(command -v java)"; do [ -n "$j" ] && "$j" -version >/dev/null 2>&1 && { echo "$j"; return; }; done; }
java="$(pick_java)"
jar="${TLA2TOOLS:-$HOME/.local/share/tlaplus/tla2tools.jar}"
jar_url='https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar'
jar_sha256='936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88'   # the v1.7.4 jar this gate was confirmed with
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
bad=0
row() { printf '%-4s %-10s %-40s %s\n' "$1" "$2" "$3" "$4"; [ "$1" = OK ] || bad=1; }
start=$(date +%s)

# Expected counts. A row is OK only when it reports exactly this many results; 0 of anything is FAIL.
want_entries=$(node -e "console.log(require('$here/coverage.json').covered.length)")   # drift entries in the manifest
want_tests=$(grep -c '^test(' "$root/lobby.test.mjs")                                   # tests that must run (not skip)

# 1. drift: the covered bodies and the config value the model assumes are still what the model saw.
node "$repo/scripts/drift-guard.mjs" check --manifest formal/coverage.json --root "$root" > "$work/drift.out" 2>&1; rc=$?
oks=$(grep -c '^OK ' "$work/drift.out" || true)
if [ "$rc" = 0 ] && [ "$oks" -gt 0 ] && [ "$oks" = "$want_entries" ]; then
  row OK drift "$oks/$want_entries entries unchanged" "synced at $(node -e "console.log(require('$here/coverage.json').syncCommit?.slice(0,7)??'?')")"
else
  row FAIL drift "$(grep -c -E '^(DRIFT|MISSING) ' "$work/drift.out" || true) drifted, $oks/$want_entries ok, exit $rc" 'run Maintain (VERIFY.md step 4)'
fi

# 2. repros: the fixed code survives the trace; the mutant reproduces it. Skipped or todo tests do not count.
(cd "$root" && node --test --test-reporter=tap lobby.test.mjs > "$work/tests.out" 2>&1); rc=$?
pass=$(grep '^ok ' "$work/tests.out" | grep -vc -E '# (SKIP|TODO)' || true); fails=$(grep -c '^not ok' "$work/tests.out" || true)
if [ "$rc" = 0 ] && [ "$fails" = 0 ] && [ "$pass" = "$want_tests" ]; then row OK repros "$pass/$want_tests tests ran and passed" ''
else row FAIL repros "$fails failing, $pass/$want_tests passed, exit $rc" "$(grep '^not ok' "$work/tests.out" | head -2 | tr '\n' ' ')"; fi

# 3. TLC.
if [ ! -f "$jar" ]; then
  mkdir -p "$(dirname "$jar")" && curl -fsSL "$jar_url" -o "$work/tla2tools.jar" || { row FAIL tlc 'tla2tools.jar missing and download failed' "$jar_url"; echo "== gate FAIL"; exit 1; }
  got_sha=$(shasum -a 256 "$work/tla2tools.jar" | cut -c1-64)
  [ "$got_sha" = "$jar_sha256" ] || { row FAIL tlc 'downloaded jar has an unexpected sha256' "$got_sha"; echo "== gate FAIL"; exit 1; }
  mv "$work/tla2tools.jar" "$jar"
fi
if [ -z "$java" ]; then row FAIL tlc 'no working java (Java 11+)' "set JAVA=/path/to/java"; echo "== gate FAIL"; exit 1; fi
# TLC exit codes: 0 = no error, 12 = an invariant was violated, anything else = it did not finish (parse error: 255).
# A row needs the text, the state count AND the matching exit code.
tlc() {
  (cd "$here" && "$java" -XX:+UseParallelGC -cp "$jar" tlc2.TLC -workers auto -metadir "$work/meta-$1" -config "$1.cfg" MC.tla > "$work/$1.log" 2>&1); local rc=$?
  local states; states=$(grep -o -m1 '[0-9]* distinct states found' "$work/$1.log" | awk '{print $1}')
  local what
  if [ "$rc" = 0 ] && grep -q 'No error has been found' "$work/$1.log"; then what=none
  elif [ "$rc" = 12 ]; then what=$(grep -m1 -o 'Invariant [A-Za-z0-9_]* is violated' "$work/$1.log" | awk '{print $2}' | grep . || echo 'no-result')
  else what="exit-$rc"; fi
  echo "$what ${states:-?}"
}
expect() {
  local got; got=$(tlc "$1")
  if [ "${got% *}" = "$2" ] && [ "${got#* }" != "?" ] && [ "${got#* }" -gt 0 ] 2>/dev/null; then row OK "$1" "$2, ${got#* } distinct states" "$3"
  else row FAIL "$1" "got ${got% *} (${got#* } states), want $2" "log kept: $here/gate-$1.log"; cp "$work/$1.log" "$here/gate-$1.log"; fi
}
expect MC_guard none 'Fix on (the code as it is)'
expect MC_mutant ReadyMatchesConfig 'Fix off: the mutation run'

echo "== gate $([ $bad = 0 ] && echo PASS || echo FAIL) in $(( $(date +%s) - start ))s"
exit $bad

#!/usr/bin/env bash
# Scaffold ~/formal-verification/<project>/ for a formal bug hunt and pin the target.
# Usage: new-hunt.sh <project> <repo-path>
set -euo pipefail
[ $# -eq 2 ] || { echo "usage: $0 <project> <repo-path>" >&2; exit 2; }
project=$1 repo=$(cd "$2" && pwd)
[[ "$project" =~ ^[a-z0-9-]+$ ]] || { echo "project must be lowercase letters, digits, dashes" >&2; exit 2; }
root="$HOME/formal-verification/$project"
[ -e "$root/REPORT.md" ] && { echo "$root/REPORT.md already exists; continue that hunt instead" >&2; exit 1; }
mkdir -p "$root"/{tla,lean,repro,runs}

head=unknown dirty="not a git repo"
if git -C "$repo" rev-parse --git-dir >/dev/null 2>&1; then
  head=$(git -C "$repo" rev-parse --short HEAD 2>/dev/null || echo none)
  count=$(git -C "$repo" status --porcelain | wc -l | tr -d ' ')
  dirty=none
  [ "$count" -eq 0 ] || dirty="$count files, e.g. $(git -C "$repo" status --porcelain | awk '{print $2}' | head -5 | paste -sd, -)"

fi

cat > "$root/REPORT.md" <<EOF
# $project — Formal Verification Report ($(date +%F))

Target: \`$repo\` at \`$head\` (uncommitted: $dirty).
Method: TLA+ (tla/), Lean 4 (lean/), repros (repro/).
Main-session re-verification: pending.

## Findings

| id | status | severity | where | invariant | what happens | repro → key output | minimal fix |
|---|---|---|---|---|---|---|---|

## Modeled and holds

## Not confirmed / not modeled

## Fix status
Not started.
EOF

command -v tlc >/dev/null || [ -x "$HOME/.local/bin/tlc" ] || echo "warning: tlc not found (see REFERENCE.md tool setup)" >&2
command -v lean >/dev/null || echo "warning: lean not found (see REFERENCE.md tool setup)" >&2
echo "$root"

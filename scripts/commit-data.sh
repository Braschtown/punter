#!/usr/bin/env bash
# Commit whatever changed in the data checkout and push it to the data branch.
# Retries with a rebase if another job pushed first. Usage: scripts/commit-data.sh <dir> <message>
set -euo pipefail
dir="$1"; msg="$2"
cd "$dir"
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add -A
if git diff --cached --quiet; then
  echo "No data changes."
  exit 0
fi
git commit -q -m "$msg"
for attempt in 1 2 3 4 5; do
  if git push -q origin HEAD:data; then
    echo "Pushed data on attempt $attempt."
    exit 0
  fi
  echo "Push rejected, rebasing (attempt $attempt)."
  git pull -q --rebase origin data
  sleep $((attempt * 3))
done
echo "Could not push data after 5 attempts." >&2
exit 1

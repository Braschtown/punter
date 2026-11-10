#!/usr/bin/env bash
# Runs the collection jobs on a timer inside one long Actions job, because GitHub drops most
# runs of frequent cron schedules (on 8 to 10 Nov 2026 a 5-minute schedule fired 11 times in 2 days).
#
# Snapshot: every 5 minutes from 00:00 to 13:59 UTC (10:00 to 23:59 Brisbane), every 30 minutes overnight.
# Results and analysis: every 15 minutes from 00:00 to 15:59 UTC, hourly overnight.
# Each pass commits and pushes to the data branch. Failures are logged and the loop carries on.
#
# Usage: scripts/collect-loop.sh <minutes to run>
set -uo pipefail
budget_mins="${1:-340}"
end=$(( $(date +%s) + budget_mins * 60 ))
last_results=0

while :; do
  now=$(date +%s)
  [ "$now" -ge "$end" ] && break
  hour=$(date -u +%-H)

  # Pick up anything committed by hand (ledger entries, progress.json) since the last pass.
  git -C data pull -q --rebase origin data || echo "Pull failed, carrying on with the local copy."

  node scripts/snapshot.mjs || echo "Snapshot pass failed (logged in status.json)."

  if [ "$hour" -lt 16 ]; then results_every=900; else results_every=3600; fi
  if [ $(( now - last_results )) -ge "$results_every" ]; then
    node scripts/results.mjs || echo "Results pass failed (logged in status.json)."
    node scripts/analysis.mjs || echo "Analysis pass failed (logged in status.json)."
    last_results=$now
  fi

  bash scripts/commit-data.sh data "collect $(date -u +%Y-%m-%dT%H:%MZ)" || echo "Commit failed, will retry next pass."

  # Sleep to the next 5-minute (or 30-minute overnight) boundary, but not past the end of the budget.
  if [ "$hour" -lt 14 ]; then every=300; else every=1800; fi
  next=$(( ($(date +%s) / every + 1) * every ))
  [ "$next" -ge "$end" ] && break
  sleep $(( next - $(date +%s) ))
done
echo "Budget used, stopping."

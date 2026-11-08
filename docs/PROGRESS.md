# Progress

Where Punter Lab actually is against [METHOD.md](METHOD.md). Every status below comes from what is in the repo. [`progress.json`](https://github.com/Braschtown/punter/blob/data/progress.json) on the `data` branch mirrors this file for the app. Change both together.

Last checked: 8 Nov 2026, 11:40 UTC (9:40 pm Brisbane).

## Goal

A repeatable, measurable edge on Australian thoroughbred win betting and Q1 Lakeside / Q2 Parklands greyhound win betting, staked with fractional Kelly inside a $100 per week cap. Paper trading only. "No edge found" is a valid result.

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | Feasibility | done |
| 2 | Collection | in progress |
| 3 | Market diagnostics | in progress |
| 4 | Market baseline | not started |
| 5 | Benchmark | blocked |
| 6 | Feature store | not started |
| 7 | Fundamental model | not started |
| 8 | Combination and calibration | not started |
| 9 | Staking | not started |
| 10 | Paper trading | not started |

### 1. Feasibility: done

What can be read reliably from a GitHub Actions runner.

- **Evidence:** [FEASIBILITY.md](../FEASIBILITY.md) records probe runs from a Brisbane Mac and from an `ubuntu-latest` runner (run 42461232386). The Ladbrokes Affiliate API works from the runner. Betfair BSP files and the Exchange API do not.

### 2. Collection: in progress

Price snapshots, results, timestamps in UTC and Australia/Brisbane.

- **Built:** [`scripts/snapshot.mjs`](../scripts/snapshot.mjs) and [`scripts/results.mjs`](../scripts/results.mjs), run by `snapshot.yml` and `results.yml`. Every capture stores `utc` and `bne`.
- **Evidence:** manual runs on 8 Nov 2026 committed 31 settled thoroughbred races and 3 settled greyhound races to the `data` branch.
- **Not yet true:** no scheduled run has fired since the workflows were added at 08:16 UTC on 8 Nov 2026, so far only manual runs. No runner yet has an early price (30 minutes or more before the jump) or a late price.
- **Gate:** scheduled snapshot and results runs firing on every racing day, with early and late prices captured for most runners.

### 3. Market diagnostics: in progress

Overround, favourite-longshot bias and price lag per track.

- **Built:** [`scripts/analysis.mjs`](../scripts/analysis.mjs) computes all three tests per code, with baselines and a 70/30 date split. Overround is also broken down per track.
- **Not yet true:** every test shows "Insufficient data" (31 of 300 thoroughbred races, 3 of 300 greyhound). Favourite-longshot bias and price lag are reported per code, not yet per track.
- **Gate:** 300 settled races per code, a verdict on each test, and per-track results for all three tests.

### 4. Market baseline: not started

Devigging (power, then Shin) producing a calibrated `p_mkt`.

- **Current state:** [`scripts/lib/maths.mjs`](../scripts/lib/maths.mjs) only has raw implied probability (`1 / O`) and overround. There is no power or Shin method.
- **Gate:** power and Shin devigging implemented and tested, with a reliability check of `p_mkt` against results.

### 5. Benchmark: blocked

Betfair SP capture. Any app key and login go in GitHub Secrets, never in the repo.

- **Evidence of the block:** FEASIBILITY.md shows the BSP daily CSV files return 403 to GitHub runners, and Betfair refuses logins from US addresses. Storing a login in Secrets would not fix this from a GitHub-hosted runner.
- **Possible way through:** a self-hosted runner on an Australian machine, which FEASIBILITY.md lists as an option. Not set up.
- **Gate:** BSP captured for every race in scope, joined to our races by track, date and runner.

### 6. Feature store: not started

Per-runner features per Part 4 of METHOD.md.

- **Current state:** we capture only barrier or box number, distance, track condition and prices. There is no form, ratings, weight or sectional data, and no form source has been identified.
- **Gate:** a documented, permitted form source, and per-runner features stored for every settled race.

### 7. Fundamental model: not started

Conditional logit or GBM producing `p_fund`.

- **Gate:** `p_fund` fitted on form features only, normalised within race, with no market data.

### 8. Combination and calibration: not started

Stage 2 fit, reliability and log loss versus the baseline.

- **Gate:** out-of-sample log loss better than de-vigged Betfair SP on a locked holdout, with reliability recorded alongside.

### 9. Staking: not started

Fractional Kelly with the four rules in Part 6 of METHOD.md.

- **Current state:** the ledger uses flat $1 paper stakes and enforces the $100 weekly cap. There is no Kelly sizing.
- **Gate:** quarter Kelly off a $2,000 notional bank, joint sizing within a race, 2 percent per-bet cap and the weekly cap, all covered by tests.

### 10. Paper trading: not started

6 to 8 weeks, then a go / no-go decision.

- **Current state:** the paper ledger and settlement work, and 3 manual picks were logged on 8 Nov 2026. They were not model picks, so the 6 to 8 week clock has not started.
- **Gate:** 6 to 8 weeks of model-sized paper bets, then a recorded go / no-go decision against the backtest.

## Current blockers

- **No Betfair SP capture,** so there is no benchmark to measure any model against. Betfair blocks GitHub-hosted runners.
- **Racing Queensland form pages.** Racing Queensland appears to render fields and start times via JavaScript, which an Actions runner may not be able to read. Fields and start times currently come from Ladbrokes, so this mainly blocks form data for the feature store.
- **Scheduled collection runs have not fired yet,** so no early or late prices have been captured and the price lag test has no data.

## Rules

- No live bets.
- No credentials in the repo.
- No invented or placeholder numbers anywhere in the app or the docs.
- No verdict on any test below 300 races.

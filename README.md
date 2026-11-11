# Punter Lab

Punter Lab is a small research tool that asks one question: is there a repeatable betting edge in Australian racing? The default answer is "no edge found", and that is a valid result.

It covers thoroughbreds at all Australian meetings, plus greyhounds at The Q (Q1 Lakeside, Q2 Parklands and Q Straight). Win bets only, using Ladbrokes fixed prices.

**Paper trading only.** Punter Lab never places bets, never stores logins and never asks for credentials.

## How it works

- **Collection (GitHub Actions, on `main`)**
  - `collect.yml` runs one long job (about 5 hours 40 minutes) that loops on a timer, then starts its own replacement. GitHub dropped most runs of frequent cron schedules, so the timing lives in [`scripts/collect-loop.sh`](scripts/collect-loop.sh) instead. An hourly cron restarts the chain if it ever breaks.
  - Every 5 minutes during racing hours it takes a price snapshot: each runner's early price (first sighting) and late price (closest to 10 minutes before the jump).
  - Every 15 minutes it records results (winners, placings, final prices and scratchings), settles open paper bets and recomputes the analysis.
  - About 10 minutes before each jump it locks the forward-test picks (see below), with every runner's price and form at that moment.
  - `snapshot.yml`, `results.yml` and `analysis.yml` run one pass each, by hand only.
- **Data (the `data` branch)**
  - The jobs commit JSON to a separate branch so `main` stays readable.
  - It also avoids GitHub Pages rebuilding on every data commit, because Pages has a soft limit of 10 builds an hour.
  - The branch's [README](https://github.com/Braschtown/punter/blob/data/README.md) explains each file.
- **Sources**
  - All source access goes through [`scripts/adapters/`](scripts/adapters/index.mjs) (`fetchMeetings`, `fetchPrices`, `fetchResults`).
  - The only source in v1 is the Ladbrokes Affiliate API. See [FEASIBILITY.md](FEASIBILITY.md) for why.

## Setup

1. **Keep the repo public.** That gives free Pages and free Actions minutes.
2. **Enable Actions:** Settings > Actions > General, allow actions. The workflows ask for `contents: write` themselves, so they can push to `data`. If a push is still refused, set "Workflow permissions" to "Read and write permissions" on the same page.
3. **Identify yourself to Ladbrokes:** Settings > Secrets and variables > Actions, add `LADBROKES_FROM` with a contact email address. Add it as a secret, so it is masked in the public Actions logs (a variable also works). Only Ladbrokes receives it, in the `From` request header.
4. **Enable Pages:** Settings > Pages > Deploy from a branch > `main` / `/docs`. The app is then at https://braschtown.github.io/punter/. It reads data straight from the `data` branch, so it updates without a Pages rebuild. Expect up to 5 minutes of caching.
5. **No other secrets are needed in v1.** Betfair is blocked from GitHub runners, so there is no Betfair login to store.

### Running locally

Node 20 or later, no npm install needed.

```bash
git worktree add data data
```

```bash
node scripts/snapshot.mjs
```

```bash
node scripts/results.mjs
```

```bash
node --test test/*.test.mjs
```

The first command checks out the `data` branch into `./data`, which the jobs read and write. Commit inside `./data` to save changes.

To preview the app locally against `./data`, serve the repo root and open http://localhost:8411/docs/:

```bash
python3 -m http.server 8411
```

## Saving picks and notes from the app

The app cannot write to GitHub, and it never holds a token. Picks logged with "Log pick" and replay notes are kept in that browser's local storage and marked "This browser only". Clearing site data deletes them. To keep them:

1. Ledger > Export JSON downloads `punterlab-picks-YYYY-MM-DD.json` (Notes has its own export for replays).
2. In `./data` (the `data` branch), copy each entry from its `bets` array into the `bets` array of `ledger.json`. Replays go into `replays` in `notes.json`.
3. Commit and push:

```bash
git -C data commit -am "Add paper picks" && git -C data push
```

From then on the results job settles those bets. Until they are committed, the app settles browser picks itself from the committed results.

The app blocks any pick that would take the week (Monday to Sunday, Brisbane) over the weekly cap in `ledger.json` (`weeklyCap`, $100).

## How to read the results

The analysis pass (in `collect.yml` after every results pass, or `analysis.yml` by hand) writes `analysis.json` on the `data` branch. Thoroughbreds and greyhounds are always reported separately.

### Words used

- **Implied probability:** 1 divided by the price. $4.00 means 25%.
- **Overround:** the implied probabilities of every runner in a race, added up, minus 100%. A book of 125% (overround 25%) means backing every runner loses about 20c per $1 (1 / 1.25 = 0.80).
- **ROI:** (returned minus staked) divided by staked, at flat $1 stakes. -0.25 means you lose 25c per $1.
- **Close price:** the final Ladbrokes fixed win price shown after the race. `dataQuality.closeVsLastSnapshot` checks that this matches our last capture just before the jump.
- **Early price:** the first price Punter Lab saw. It only counts if it was captured at least 30 minutes before the jump (`settings.earlyMinMins`). It is not the bookmaker's opening price.
- **95% interval (`ci`):** the range the true value plausibly sits in.
  - ROI intervals come from resampling whole races 1,000 times. Runners in the same race are not independent, because only one can win.
  - Win-rate intervals are Wilson intervals.
  - If the interval includes 0, the result could easily be luck.
- **n:** the number of races behind a number. Always look at n first.

### The tests

1. **Price lag:** does the early price beat the close?
   - `meanDrift` is implied probability at the close minus at the early price. Positive means prices shorten after we first see them.
   - `pctEarlyLonger` is the share of runners whose early price was longer than the close.
   - The strategy "back everything at the early price" (`roiEarly`) is compared with the same runners at the close (`roiClose`).
2. **Favourite-longshot bias:** runners are grouped into closing price bands.
   - Each band compares how often runners win (`actualPct`) with how often their price says they should (`impliedPct`).
   - The strategy is "back the band with the best in-sample ROI", judged out of sample.
3. **Overround:** the average margin per race and per track, at the close and at the late price.

### Forward tests

Fixed rules, defined in [`scripts/lib/forward.mjs`](scripts/lib/forward.mjs), that each log a $1 paper bet about 10 minutes before every jump, on every race they apply to. They ignore the weekly cap: they are a measurement ledger, not a betting plan. Because the pick is locked before the race, nothing can be fitted to the result afterwards.

- **Tests:** favourite; every runner in metro races, in country and provincial races, and in all races combined; first, second and third up; biggest firmer and biggest drifter since we first saw the price; every runner under $3; box 1 at Q1 and Q2; speed map leaders.
- **Stored:** `forward/DATE.json` holds each race's locked record: race details, every runner's price, early price and Ladbrokes form (recent starts, weight, claim, jockey, trainer, speed map, form flags), plus Ladbrokes "big bets" data when it is published. `forward-report/` holds the summary and the monthly datasets the app reads.
- **Price beaten:** for every bet, whether the price taken was longer than the closing price. A test that keeps beating the close is the earliest sign of an edge.
- **Verdicts:** judged exactly like the market tests (300 races, out of sample, against the favourite and random baselines). The dashboard (Tests > Forward tests) lets you filter and break any test down by track, condition, distance, class, jockey and more, but filtered views never get a verdict.
- **Changing a test:** never edit a test's rule once it has data. Add a new test with a new id and date instead.

### Baselines

Every strategy is measured against two baselines:

- **Back the favourite:** $1 on the closing favourite in every race.
- **Random selection:** $1 on a random runner, calculated as the exact expected return, so luck plays no part.

### Out of sample

Race dates are split in time:

- **In-sample:** the first 70% of dates. Strategies may be chosen here.
- **Out-of-sample:** the last 30% of dates. Strategies are judged only here.

Choosing and judging on the same data finds "edges" that are only noise.

### Verdicts

| Verdict | Meaning |
|---|---|
| Insufficient data | Fewer than 300 races for this test and code. No number is trustworthy yet. |
| Edge | The out-of-sample ROI interval is wholly above zero, and the ROI beats both baselines. |
| No edge | The out-of-sample interval is wholly below zero, or the ROI does not beat the better baseline. |
| Inconclusive | Anything else, usually an interval that straddles zero. |

"No edge" is the expected outcome and a valid result. One good week proves nothing.

---

Paper trading and research only. Not financial advice. Gambling Help Online: 1800 858 858.

# Punter Lab

Punter Lab is a small research tool that asks one question: is there a repeatable betting edge in Australian racing? The default answer is "no edge found", and that is a valid result.

It covers thoroughbreds at all Australian meetings, plus greyhounds at The Q (Q1 Lakeside, Q2 Parklands and Q Straight). Win bets only, using Ladbrokes fixed prices.

**Paper trading only.** Punter Lab never places bets, never stores logins and never asks for credentials.

## How it works

- **Collection (GitHub Actions, on `main`)**
  - `snapshot.yml` runs every 5 minutes during racing hours. It records each runner's early price (first sighting) and late price (closest to 10 minutes before the jump).
  - `results.yml` runs every 15 minutes. It records winners, placings, final prices and scratchings, and settles open paper bets.
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
4. **Enable Pages:** Settings > Pages > Deploy from a branch > `main` / `/docs`. (The app arrives in Phase 3.)
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

## How to read the results

The analysis job (`analysis.yml`, after every results run and nightly) writes `analysis.json` on the `data` branch. Thoroughbreds and greyhounds are always reported separately.

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

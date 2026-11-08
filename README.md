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

(Filled in with the tests in Phase 2.)

- Every number comes with its sample size, n.
- A test says "Insufficient data" until it has at least 300 races for that code.
- A strategy only counts if it beats both "back the favourite" and "random selection" out of sample.
- "Early price" means the first price Punter Lab saw, not the bookmaker's opening price. Check `minsToJump` on each capture.

---

Paper trading and research only. Not financial advice. Gambling Help Online: 1800 858 858.

# Phase 0: feasibility

Checked on Sun 8 Nov 2026 (Brisbane time). Two runs of [`scripts/probe.mjs`](scripts/probe.mjs):

- **Local:** a Mac in Brisbane (Cloudflare reports `loc=AU`).
- **GitHub-hosted runner:** `ubuntu-latest` (Cloudflare reports `loc=US`, `colo=MSP`), [run 42461232386](https://github.com/Braschtown/punter/actions/runs/42461232386).

Every request was read-only, used the User-Agent `PunterLab/0.1 (paper-trading research; +https://github.com/Braschtown/punter)` and waited 1.5 s between calls. No logins were attempted.

## Summary

| Need | Recommended source | Works from runner? |
|---|---|---|
| (a) Early price | Ladbrokes Affiliate API, first snapshot that shows a fixed win price | Yes |
| (b) Close price | Ladbrokes Affiliate API: the last snapshot before the jump, plus the fixed win price still shown on the event after it settles | Yes |
| (c) Results | Ladbrokes Affiliate API event endpoint: placings, margins, scratchings, tote dividends | Yes |
| Independent close (optional) | Betfair BSP daily CSV files | **No** (403 from runner). Works from an Australian IP |

The automated plan is workable. Ladbrokes alone covers prices, scratchings and results for both codes. Betfair is a useful cross-check, but only from an Australian machine.

## Source by source

### Ladbrokes Affiliate API: works

- **Endpoints used:**
  - `GET https://api.ladbrokes.com.au/affiliates/v1/racing/meetings?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&category=T|G&country=AUS&limit=200`
  - `GET https://api.ladbrokes.com.au/affiliates/v1/racing/events/{race id}`
- **Documentation:** published by the Entain platform team (Neds and Ladbrokes AU) at [nedscode.github.io/affiliate-feeds](https://nedscode.github.io/affiliate-feeds). It asks callers to identify themselves with a `From` header (a contact email) and an `X-Partner` header (organisation name). Callers that don't identify themselves "may end up being rate limited, or blocked".
- **Rate limit:** no number is published. Requests that come too fast get HTTP 429. Responses carry `cache-control: public, max-age=30`, so polling any one URL more often than every 30 s gains nothing.
- **Robots:** `www.ladbrokes.com.au/robots.txt` only disallows search URLs. The API host has no robots.txt (it returns 500).
- **Terms:** the Ladbrokes website terms page renders in JavaScript, so I could not read it automatically. The affiliate docs contain no separate usage terms. **I have not confirmed that Ladbrokes permits this use.** We should identify ourselves properly, keep the request rate low, and stop if they ask us to.
- **What the data contains:**
  - **Meetings:** name, state, track condition, and races with id, number, distance, start time and status (`Open`, `Final`, ...). Category `T` is thoroughbred only, because harness is a separate category (`H`), so excluding harness is free.
  - **Event:** every runner with barrier or box, `odds.fixed_win`, `odds.fixed_place`, `is_scratched` and `scratch_time`. It also gives the favourite and the market mover. After the race: `results` (position, margin) and tote `dividends`.
  - **Settled races:** the runners keep their last fixed win price. Example, The Q Straight R2: Vienna Belle $4.00, Unapologetically $2.45. This looks like the final fixed price. Phase 1 will check it against our last pre-jump snapshot before we trust it as "close".
- **From the US runner:** identical responses to the Brisbane run, about 1 s per call. No geo-block seen.

### Betfair: blocked from the runner

- **BSP daily files**, for example `https://promo.betfair.com/betfairsp/prices/dwbfpricesauswinDDMMYYYY.csv` and `dwbfgreyhoundwinDDMMYYYY.csv`:
  - From Brisbane they download fine, with no login. Each runner row has BSP, pre-play weighted average price, morning WAP and `win_lose`.
  - From the runner both files return **HTTP 403**.
  - The thoroughbred file mixes in harness races (for example "Pace M" at Albion Park), so it needs filtering.
- **Exchange API** (`api.betfair.com.au`):
  - From the runner it returns a **Cloudflare challenge (403)** before any login.
  - Betfair also blocks logins from the USA. Developers on other cloud hosts report a `BETTING_RESTRICTED_LOCATION` error.
  - A delayed app key is free. Per Betfair's developer docs, a live key costs a one-off £299 (Australian customers are told to contact api@betfair.com.au) and needs a funded, verified account.
  - **Conclusion:** Betfair is not usable from GitHub-hosted runners. Putting a login in GitHub Secrets would not help.

### Racing Queensland, Racing NSW, Racing Victoria: not needed

- The HTML pages load from the runner: the RQ calendar, Racing NSW and racing.com all return 200. None offers a documented, machine-readable results feed, and the pages are large script-driven documents (the RQ calendar is about 1 MB). Scraping them would be brittle and adds nothing that Ladbrokes results don't already give.
- **QRIC** (Queensland stewards) sits behind a Cloudflare challenge (403), both locally and from the runner.
- **Racing Australia's** robots.txt disallows all other crawlers (`User-agent: * Disallow: /`).
- **The Greyhound Recorder's** robots.txt forbids automated collection without written permission.
- **Plan:** stewards' reports and official results stay as plain external links in the app, with no automated reading.

## Constraints that affect the build

1. **The repo is private.** GitHub Pages on a private repo needs a paid plan, and the free Actions allowance is 2,000 minutes a month. A 5-minute snapshot cron bills at least 1 minute per run. That is about 4,300 minutes a month even when limited to racing hours, so a private repo would run out within about two weeks. **A public repo gets free Pages and free Actions minutes.** Everything stored is paper data and public prices.
2. **Cron timing is loose.** The snapshot job will run every 5 minutes during Australian racing hours (about 10:00 to 23:30 Brisbane). Each run captures any race jumping in the next 5 to 15 minutes as "late". Runs can start late or be skipped under load, so every row stores the real capture time (UTC and Brisbane) and its minutes-to-jump. Analysis uses those values and never assumes the schedule.
3. **"Early price" means our first sighting,** not Ladbrokes' opening price. A separate hourly "early" pass records prices as soon as a race first appears with fixed odds. The capture time shows how early that really was.
4. **Load estimate:**
   - 2 meeting calls per run, plus one event call per race in the late window (usually 2 to 8).
   - The hourly early pass adds one call per newly priced race.
   - That totals well under 1,000 requests a day, spaced at least 1 s apart.

## Fallbacks if Ladbrokes stops answering

- **Self-hosted runner on your Mac.** Same workflows, Australian IP, no minute limits, and it can also fetch the Betfair BSP files. It only runs while the Mac is awake.
- **Local script** (`node scripts/collect.mjs`) that you run by hand, which commits to `/data`.
- **Manual entry** in the app: log early and late prices for your own picks into localStorage, then export JSON and commit it.

## Proposed repo structure

```
punter/
  README.md               setup, how to read the results
  FEASIBILITY.md          this file
  .github/workflows/
    feasibility-probe.yml manual source check (exists)
    snapshot.yml          cron, every 5 min in racing hours: early + late prices
    results.yml           cron, every 30 min: results, scratchings, settles paper bets
    analysis.yml          after results, and nightly: recomputes /data/analysis.json
  scripts/
    probe.mjs             Phase 0 probe (exists)
    adapters/
      index.mjs           adapter interface: fetchMeetings, fetchPrices, fetchResults
      ladbrokes.mjs       Ladbrokes Affiliate API adapter
    snapshot.mjs          writes data/snapshots/YYYY-MM-DD.json
    results.mjs           writes data/results/YYYY-MM-DD.json, settles data/ledger.json
    analysis.mjs          overround, price lag, favourite-longshot, baselines
    lib/
      maths.mjs           implied prob, overround, ROI, Wilson CI, bootstrap
      time.mjs            UTC and Australia/Brisbane helpers
      store.mjs           idempotent JSON read/merge/write, gap log
  test/
    maths.test.mjs        node:test, worked examples
  data/
    races/                race metadata by date
    snapshots/            price captures by date
    results/              outcomes by date
    ledger.json           paper bets (seeded with the three 8 Nov picks)
    notes.json            notes (seeded with Point Barrow)
    analysis.json         latest computed stats and verdicts
    status.json           last run times, gap and error log
  docs/                   GitHub Pages site (no build step)
    index.html
    css/app.css           M3 tokens and components
    js/app.js             hash router and shell
    js/screens/today.js, ledger.js, tests.js, notes.js, status.js
    js/lib/format.js, data.js, icons.js
```

The scripts use Node 20 with no npm dependencies: built-in `fetch` and `node:test`.

## Things I noticed in the seed data

- **Track:** the three seeded picks are at **The Q Straight**, which Ladbrokes lists as its own meeting. It is not Q1 Lakeside or Q2 Parklands, the greyhound tracks in scope.
- **R2 has already run.** Primer Pearl won, Unapologetically ran 4th and Vienna Belle missed the placings. Vienna Belle's final Ladbrokes fixed price was $4.00 (logged at $3.60), and Unapologetically's was $2.45.
- **R8 and R12 are still open.** Dream Dash is in box 8 at $9.50 and Sand Land is at $2.45.

## Decisions (8 Nov 2026)

1. **Repo is public:** free Pages and Actions.
2. **Ladbrokes `From` header:** read from the `LADBROKES_FROM` repo secret (or variable). Until it is set, the fallback names the project.
3. **Q Straight is in scope** alongside Q1 Lakeside and Q2 Parklands, because the seeded picks are there.
4. **Betfair is skipped for v1.**
5. **Data lives on a separate `data` branch,** so data commits do not trigger Pages builds on `main`.

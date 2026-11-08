// Analysis job: recomputes every test from the stored data and writes data/analysis.json.
// Deterministic: the same data always gives the same numbers (bootstrap uses a fixed seed).

import { readdir } from 'node:fs/promises';
import path from 'node:path';
import {
  MIN_RACES, impliedProb, mean, meanWithCI, overround, overroundVerdict, roiWithCI, strategyVerdict, wilson,
} from './lib/maths.mjs';
import { DATA_DIR, readJson, RunLog, writeJson } from './lib/store.mjs';
import { stamp } from './lib/time.mjs';

export const EARLY_MIN_MINS = 30; // an "early" price must be captured at least this long before the jump
export const IN_SAMPLE_SHARE = 0.7; // first 70% of race dates are in-sample, the rest out-of-sample
export const BANDS = [
  [1, 2], [2, 3], [3, 5], [5, 8], [8, 13], [13, 21], [21, 51], [51, Infinity],
];
const CODES = ['thoroughbred', 'greyhound'];

const bandLabel = ([lo, hi]) => (hi === Infinity ? `$${lo}+` : `$${lo}-${hi}`);
const r4 = (x) => (x === null || x === undefined ? null : Math.round(x * 10000) / 10000);
const ci4 = (ci) => (ci ? ci.map(r4) : null);
const pack = (x) => (x ? { roi: r4(x.roi), ci: ci4(x.ci), races: x.races, staked: r4(x.staked) } : null);

/** Load every settled race with its runners, prices and outcome. */
export async function loadRaces(dir = DATA_DIR) {
  let files = [];
  try {
    files = (await readdir(path.join(dir, 'results'))).filter((f) => f.endsWith('.json'));
  } catch { /* no results yet */ }
  const out = [];
  for (const f of files.sort()) {
    const date = f.replace('.json', '');
    const results = (await readJson(`results/${f}`, { races: {} })).races;
    const races = (await readJson(`races/${f}`, { races: {} })).races;
    const snaps = (await readJson(`snapshots/${f}`, { races: {} })).races;
    for (const [raceId, res] of Object.entries(results)) {
      if (!res.final || res.abandoned) continue;
      const meta = races[raceId];
      if (!meta) continue;
      const winners = new Set((res.winner || []).map((w) => w.runnerId));
      const runners = [];
      for (const [runnerId, close] of Object.entries(res.closePrices || {})) {
        if (!(close > 1)) continue;
        const s = snaps[raceId]?.runners?.[runnerId];
        if (s?.scratched) continue;
        runners.push({
          runnerId,
          close,
          early: s?.early?.price ?? null,
          earlyMins: s?.early?.minsToJump ?? null,
          late: s?.late?.price ?? null,
          lastMins: s?.last?.minsToJump ?? null,
          last: s?.last?.price ?? null,
          winShare: winners.has(runnerId) ? 1 / winners.size : 0,
        });
      }
      if (runners.length < 2) continue;
      out.push({ raceId, date, code: meta.code, track: meta.track, raceNumber: meta.raceNumber, runners });
    }
  }
  return out;
}

/** Flat $1 on each selected runner at the chosen price. Returns per-race totals. */
function backEach(races, pick, priceOf) {
  const rows = [];
  for (const race of races) {
    const sel = race.runners.filter(pick);
    if (!sel.length) continue;
    rows.push({
      date: race.date,
      staked: sel.length,
      returned: sel.reduce((s, r) => s + r.winShare * priceOf(r), 0),
    });
  }
  return rows;
}

/** Baseline 1: $1 on the closing favourite (split evenly if favourites are tied). */
function favouriteRows(races) {
  return races.map((race) => {
    const minPrice = Math.min(...race.runners.map((r) => r.close));
    const favs = race.runners.filter((r) => r.close === minPrice);
    return { date: race.date, staked: 1, returned: favs.reduce((s, r) => s + (r.winShare * r.close) / favs.length, 0) };
  });
}

/** Baseline 2: $1 on a random runner. Uses the exact expected return, so there is no luck in it. */
function randomRows(races) {
  return races.map((race) => ({
    date: race.date,
    staked: 1,
    returned: mean(race.runners.map((r) => r.winShare * r.close)),
  }));
}

/** Split race dates into in-sample (first 70%) and out-of-sample (the rest). */
export function splitDates(races) {
  const dates = [...new Set(races.map((r) => r.date))].sort();
  if (dates.length < 2) return { cutoff: null, isIn: () => true };
  const cutoff = dates[Math.max(1, Math.floor(dates.length * IN_SAMPLE_SHARE))];
  return { cutoff, isIn: (d) => d < cutoff };
}

function evaluate(rows, split) {
  return {
    all: roiWithCI(rows),
    inSample: roiWithCI(rows.filter((r) => split.isIn(r.date))),
    outOfSample: split.cutoff ? roiWithCI(rows.filter((r) => !split.isIn(r.date))) : null,
  };
}

const packEval = (e) => ({ all: pack(e.all), inSample: pack(e.inSample), outOfSample: pack(e.outOfSample) });

export function analyse(allRaces) {
  const split = splitDates(allRaces);
  const out = {
    generated: stamp(),
    minRaces: MIN_RACES,
    settings: { earlyMinMins: EARLY_MIN_MINS, inSampleShare: IN_SAMPLE_SHARE, bootstrapIters: 1000, closePrice: 'Ladbrokes final fixed win price' },
    split: { cutoff: split.cutoff, note: split.cutoff ? `In-sample: race dates before ${split.cutoff}. Out-of-sample: ${split.cutoff} onwards.` : 'Only one race date so far, so there is no out-of-sample period yet.' },
    counts: {},
    dataQuality: {},
    baselines: {},
    tests: [],
  };

  const overroundTest = { id: 'overround', name: 'Overround', description: 'How much the bookmaker\'s win market adds up to over 100%. Higher means a bigger margin against the punter.', byCode: {} };
  const lagTest = { id: 'price-lag', name: 'Price lag', description: 'Does the early price beat the closing price on average? Backing everything early is compared with backing everything at the close.', byCode: {} };
  const flbTest = { id: 'favourite-longshot', name: 'Favourite-longshot bias', description: 'Do runners in each price band win as often as their price implies? Longshots are usually overbet.', byCode: {} };

  for (const code of CODES) {
    const races = allRaces.filter((r) => r.code === code);
    const runners = races.flatMap((r) => r.runners);
    out.counts[code] = {
      races: races.length,
      runners: runners.length,
      runnersWithEarly: runners.filter((r) => r.early && r.earlyMins >= EARLY_MIN_MINS).length,
      runnersWithLate: runners.filter((r) => r.late).length,
      dates: [...new Set(races.map((r) => r.date))].length,
    };

    // Data quality: is the post-race "close" really the last price before the jump?
    const nearJump = runners.filter((r) => r.last && r.lastMins !== null && r.lastMins <= 3);
    out.dataQuality[code] = {
      closeVsLastSnapshot: {
        n: nearJump.length,
        samePct: nearJump.length ? r4(nearJump.filter((r) => r.last === r.close).length / nearJump.length) : null,
        note: 'Share of runners whose final fixed price equals our last capture within 3 minutes of the jump.',
      },
    };

    // Baselines.
    const fav = evaluate(favouriteRows(races), split);
    const rnd = evaluate(randomRows(races), split);
    out.baselines[code] = { favourite: packEval(fav), random: packEval(rnd) };
    const baseOos = [fav.outOfSample, rnd.outOfSample];

    // Test 1: overround per race and per track, at the close (and at the late price where we have it).
    const orClose = races.map((r) => overround(r.runners.map((x) => x.close))).filter((x) => x !== null);
    const lateRaces = races.filter((r) => r.runners.every((x) => x.late));
    const orLate = lateRaces.map((r) => overround(r.runners.map((x) => x.late)));
    const closeStats = meanWithCI(orClose);
    const byTrack = {};
    for (const r of races) (byTrack[r.track] ||= []).push(overround(r.runners.map((x) => x.close)));
    overroundTest.byCode[code] = {
      n: races.length,
      close: { mean: r4(closeStats.mean), ci: ci4(closeStats.ci), races: orClose.length },
      late: { mean: r4(mean(orLate)), races: orLate.length },
      byTrack: Object.entries(byTrack)
        .map(([track, xs]) => ({ track, races: xs.length, mean: r4(mean(xs)) }))
        .sort((a, b) => b.races - a.races),
      ...overroundVerdict({ races: races.length, mean: closeStats.mean, ci: closeStats.ci }),
    };

    // Test 2: price lag. Only runners with a genuinely early capture.
    const hasEarly = (r) => r.early && r.earlyMins >= EARLY_MIN_MINS;
    const lagRunners = runners.filter(hasEarly);
    const lagRaces = races.filter((r) => r.runners.some(hasEarly));
    const drift = lagRunners.map((r) => impliedProb(r.close) - impliedProb(r.early));
    const early = evaluate(backEach(races, hasEarly, (r) => r.early), split);
    const atClose = evaluate(backEach(races, hasEarly, (r) => r.close), split);
    const withLate = lagRunners.filter((r) => r.late);
    lagTest.byCode[code] = {
      n: lagRaces.length,
      runners: lagRunners.length,
      meanDrift: r4(mean(drift)),
      driftNote: 'Implied probability at the close minus at the early price. Positive means the price shortened after we first saw it.',
      pctEarlyLonger: lagRunners.length ? r4(lagRunners.filter((r) => r.early > r.close).length / lagRunners.length) : null,
      pctEarlyShorter: lagRunners.length ? r4(lagRunners.filter((r) => r.early < r.close).length / lagRunners.length) : null,
      earlyVsLate: { runners: withLate.length, pctEarlyLonger: withLate.length ? r4(withLate.filter((r) => r.early > r.late).length / withLate.length) : null },
      roiEarly: packEval(early),
      roiClose: packEval(atClose),
      ...strategyVerdict({ races: lagRaces.length, oos: early.outOfSample, baselines: baseOos }),
    };

    // Test 3: favourite-longshot bias by closing price band.
    const bands = BANDS.map((b) => {
      const inBand = (r) => r.close >= b[0] && r.close < b[1];
      const rs = runners.filter(inBand);
      const wins = rs.reduce((s, r) => s + r.winShare, 0);
      const e = evaluate(backEach(races, inBand, (r) => r.close), split);
      return {
        band: bandLabel(b), lo: b[0], hi: b[1] === Infinity ? null : b[1], runners: rs.length, wins: r4(wins),
        impliedPct: r4(mean(rs.map((r) => impliedProb(r.close)))),
        actualPct: rs.length ? r4(wins / rs.length) : null,
        actualCi: ci4(wilson(Math.round(wins), rs.length)),
        roi: pack(e.all),
        _eval: e,
      };
    });
    // Strategy: pick the best band in-sample (at least 30 races), then judge it out of sample.
    const candidates = bands.filter((b) => b._eval.inSample.races >= 30 && b._eval.inSample.roi !== null);
    const best = candidates.sort((a, b) => b._eval.inSample.roi - a._eval.inSample.roi)[0] || null;
    flbTest.byCode[code] = {
      n: races.length,
      bands: bands.map(({ _eval, ...rest }) => rest),
      bestBandInSample: best ? { band: best.band, inSample: pack(best._eval.inSample), outOfSample: pack(best._eval.outOfSample) } : null,
      ...strategyVerdict({ races: races.length, oos: best?._eval.outOfSample, baselines: baseOos }),
    };
  }

  out.tests = [lagTest, flbTest, overroundTest];
  return out;
}

// Run as a job (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  const log = new RunLog('analysis');
  try {
    const races = await loadRaces();
    const result = analyse(races);
    const prev = await readJson('analysis.json', {});
    const strip = (x) => JSON.stringify({ ...x, generated: null });
    if (strip(prev) !== strip(result)) {
      await writeJson('analysis.json', result);
      log.count('updated');
    } else log.count('unchanged');
    for (const c of CODES) log.count(`${c}Races`, result.counts[c].races);
  } catch (e) {
    log.error(`Analysis failed: ${e.message}`);
    process.exitCode = 1;
  }
  await log.save();
}

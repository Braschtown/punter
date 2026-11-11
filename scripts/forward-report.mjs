// Forward-test report: joins the locked pre-jump picks (forward/DATE.json) with results, then writes
// - forward-report/summary.json: per test and code, bets, ROI with a 95% interval, price beaten, baselines, verdict
// - forward-report/runners-YYYY-MM.json: every picked runner with its race, form, prices and outcome, for the dashboard
// Safe to re-run. Settlement is recomputed from scratch every time.

import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { settlePick, TESTS } from './lib/forward.mjs';
import { MIN_RACES, roiWithCI, strategyVerdict } from './lib/maths.mjs';
import { splitDates } from './analysis.mjs';
import { DATA_DIR, readJson, RunLog, writeJson } from './lib/store.mjs';
import { stamp } from './lib/time.mjs';

const CODES = ['thoroughbred', 'greyhound'];
const r4 = (x) => (x === null || x === undefined ? null : Math.round(x * 10000) / 10000);

/** Load every forward day with its results. */
export async function loadForward(dir = DATA_DIR) {
  let files = [];
  try { files = (await fs.readdir(path.join(dir, 'forward'))).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort(); } catch { /* none yet */ }
  const days = [];
  for (const f of files) {
    const date = f.slice(0, 10);
    const fwd = JSON.parse(await fs.readFile(path.join(dir, 'forward', f), 'utf8'));
    let results = { races: {} };
    try { results = JSON.parse(await fs.readFile(path.join(dir, 'results', f), 'utf8')); } catch { /* not settled yet */ }
    days.push({ date, races: fwd.races, results: results.races });
  }
  return days;
}

/** One row per (race, test) with stake, return and price beaten, for settled bets that count. */
export function settleAll(days) {
  const bets = [];
  for (const { date, races, results } of days) {
    for (const [raceId, rec] of Object.entries(races)) {
      const res = results[raceId];
      const byId = Object.fromEntries(rec.runners.map((r) => [r.runnerId, r]));
      for (const p of rec.picks) {
        const runner = byId[p.runnerId];
        if (!runner) continue;
        const s = settlePick(p, runner.price, res);
        const close = res?.closePrices?.[p.runnerId] ?? null;
        bets.push({ date, raceId, code: rec.race.code, test: p.test, runnerId: p.runnerId, stake: p.stake, price: runner.price, close, ...s });
      }
    }
  }
  return bets;
}

/** Baselines on the same races: $1 on the favourite, and the exact expected return of $1 on a random runner. */
function baselineRows(raceIds, raceIndex) {
  const fav = [];
  const rnd = [];
  for (const id of raceIds) {
    const { rec, res, date } = raceIndex.get(id);
    if (!res?.final || res.abandoned) continue;
    const live = rec.runners.filter((r) => !(res.runners || []).find((x) => x.runnerId === r.runnerId && x.scratched));
    if (!live.length) continue;
    const winners = (res.placings || []).filter((p) => p.position === 1).map((p) => p.runnerId);
    const ret = (r) => (winners.includes(r.runnerId) ? r.price / winners.length : 0);
    const min = Math.min(...live.map((r) => r.price));
    const favs = live.filter((r) => r.price === min);
    fav.push({ date, staked: 1, returned: favs.reduce((s, r) => s + ret(r) / favs.length, 0) });
    rnd.push({ date, staked: 1, returned: live.reduce((s, r) => s + ret(r), 0) / live.length });
  }
  return { fav, rnd };
}

const pack = (x) => (x ? { roi: r4(x.roi), ci: x.ci ? x.ci.map(r4) : null, races: x.races, staked: r4(x.staked) } : null);

export function summarise(days) {
  const bets = settleAll(days);
  const raceIndex = new Map();
  for (const d of days) for (const [id, rec] of Object.entries(d.races)) raceIndex.set(id, { rec, res: d.results[id], date: d.date });

  const out = { generated: stamp(), minRaces: MIN_RACES, stake: 1, split: {}, tests: [], months: [] };
  out.months = [...new Set(days.map((d) => d.date.slice(0, 7)))].sort();

  const splits = {};
  for (const code of CODES) {
    const dates = days.filter((d) => Object.values(d.races).some((r) => r.race.code === code)).map((d) => ({ date: d.date }));
    splits[code] = splitDates(dates);
    out.split[code] = splits[code].cutoff;
  }

  for (const t of TESTS) {
    const entry = { id: t.id, name: t.name, added: t.added, description: t.description, byCode: {} };
    for (const code of CODES) {
      const mine = bets.filter((b) => b.test === t.id && b.code === code);
      if (!mine.length) continue;
      const counted = mine.filter((b) => b.status === 'Won' || b.status === 'Lost');
      const byRace = new Map();
      for (const b of counted) {
        const row = byRace.get(b.raceId) || { date: b.date, staked: 0, returned: 0 };
        row.staked += b.stake;
        row.returned += b.returned;
        byRace.set(b.raceId, row);
      }
      const races = [...byRace.values()];
      const split = splits[code];
      const oosRows = split.cutoff ? races.filter((r) => !split.isIn(r.date)) : [];
      const all = roiWithCI(races);
      const oos = split.cutoff ? roiWithCI(oosRows) : null;
      const base = baselineRows([...byRace.keys()], raceIndex);
      const favOos = split.cutoff ? roiWithCI(base.fav.filter((r) => !split.isIn(r.date))) : null;
      const rndOos = split.cutoff ? roiWithCI(base.rnd.filter((r) => !split.isIn(r.date))) : null;
      const withClose = counted.filter((b) => b.close);
      const wins = counted.filter((b) => b.status === 'Won').length;
      const staked = counted.reduce((s, b) => s + b.stake, 0);
      const returned = counted.reduce((s, b) => s + b.returned, 0);
      entry.byCode[code] = {
        bets: counted.length,
        open: mine.filter((b) => b.status === 'Open').length,
        races: races.length,
        wins,
        staked: r4(staked),
        returned: r4(returned),
        profit: r4(returned - staked),
        roi: pack(all),
        outOfSample: pack(oos),
        baselines: { favourite: pack(roiWithCI(base.fav)), random: pack(roiWithCI(base.rnd)), favouriteOos: pack(favOos), randomOos: pack(rndOos) },
        beatClose: withClose.length ? {
          n: withClose.length,
          pct: r4(withClose.filter((b) => b.price > b.close).length / withClose.length),
          meanEdge: r4(withClose.reduce((s, b) => s + (b.price / b.close - 1), 0) / withClose.length),
        } : null,
        firstDate: races.length ? races.map((r) => r.date).sort()[0] : null,
        ...strategyVerdict({ races: races.length, oos, baselines: [favOos, rndOos] }),
      };
    }
    out.tests.push(entry);
  }
  return out;
}

/**
 * Compact monthly dataset for the dashboard. Races and runners are arrays of arrays with a column list,
 * so a month of picks stays small. Only runners picked by at least one test are included.
 */
export function monthDatasets(days) {
  const testIdx = Object.fromEntries(TESTS.map((t, i) => [t.id, i]));
  const months = {};
  for (const { date, races, results } of days) {
    const m = date.slice(0, 7);
    const ds = (months[m] ||= {
      month: m,
      tests: TESTS.map((t) => t.id),
      raceColumns: ['raceId', 'date', 'jumpUtc', 'code', 'track', 'state', 'raceNumber', 'name', 'class', 'distance', 'trackCondition', 'metro', 'fieldSize', 'status', 'minsToJump'],
      runnerColumns: ['race', 'name', 'number', 'barrier', 'price', 'early', 'close', 'won', 'winners', 'scratched', 'jockey', 'trainer', 'lastStarts', 'weight', 'claim', 'speedmap', 'indicators', 'mover', 'picks'],
      races: [],
      runners: [],
    });
    for (const [raceId, rec] of Object.entries(races).sort((a, b) => a[1].race.jumpUtc.localeCompare(b[1].race.jumpUtc))) {
      const res = results[raceId];
      const status = !res?.final ? 'open' : res.abandoned ? 'void' : 'final';
      const ri = ds.races.length;
      const r = rec.race;
      ds.races.push([raceId, date, r.jumpUtc, r.code, r.track, r.state, r.raceNumber, r.name, r.class, r.distance, r.trackCondition, r.metro ? 1 : 0, rec.fieldSize, status, rec.minsToJump]);
      const winners = (res?.placings || []).filter((p) => p.position === 1).map((p) => p.runnerId);
      const picksBy = {};
      for (const p of rec.picks) (picksBy[p.runnerId] ||= []).push([testIdx[p.test], p.stake]);
      for (const x of rec.runners) {
        if (!picksBy[x.runnerId]) continue;
        const f = x.form || {};
        const scr = (res?.runners || []).some((y) => y.runnerId === x.runnerId && y.scratched);
        ds.runners.push([
          ri, x.name, x.number, x.barrier, x.price, x.earlyMins >= 30 ? x.early : null, res?.closePrices?.[x.runnerId] ?? null,
          status === 'final' ? (winners.includes(x.runnerId) ? 1 : 0) : null, winners.length || null, scr ? 1 : 0,
          f.jockey ?? null, f.trainer ?? null, f.lastStarts ?? null, f.weight ?? null, f.claim ?? null, f.speedmap ?? null,
          (f.indicators || []).join('|') || null, f.mover ? 1 : 0, picksBy[x.runnerId],
        ]);
      }
    }
  }
  return months;
}

async function main() {
  const log = new RunLog('forward');
  try {
    const days = await loadForward();
    const summary = summarise(days);
    const prev = await readJson('forward-report/summary.json', null);
    const same = prev && JSON.stringify({ ...prev, generated: null }) === JSON.stringify({ ...summary, generated: null });
    if (!same) await writeJson('forward-report/summary.json', summary);
    for (const [m, ds] of Object.entries(monthDatasets(days))) await writeJson(`forward-report/runners-${m}.json`, ds, { compact: true });
    log.count(same ? 'unchanged' : 'updated');
    log.count('days', days.length);
    log.count('settledBets', summary.tests.reduce((s, t) => s + Object.values(t.byCode).reduce((a, x) => a + x.bets, 0), 0));
  } catch (e) {
    log.error(`Forward report failed: ${e.message}`);
    process.exitCode = 1;
  }
  await log.save();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();

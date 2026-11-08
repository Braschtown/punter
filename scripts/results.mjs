// Results job: records winner, placings, final fixed prices, tote win dividend and scratchings
// for races that have jumped, then settles open paper bets. Safe to re-run.

import { getAdapter } from './adapters/index.mjs';
import { RESULTS } from './config.mjs';
import { isLateScratching, missingLate } from './lib/capture.mjs';
import { settleBet } from './lib/ledger.mjs';
import { readJson, RunLog, writeJson } from './lib/store.mjs';
import { addDays, bneDate, minsBetween, stamp } from './lib/time.mjs';

const adapter = getAdapter();
const log = new RunLog('results');
const start = new Date();
let sourceState = { state: 'OK', lastError: null };

const dates = [bneDate(addDays(start, -1)), bneDate(start)];
const ledger = await readJson('ledger.json', { bets: [] });
const openBetRaces = new Set(ledger.bets.filter((b) => b.status === 'Open').map((b) => b.raceId));

const resultFiles = {};
const raceFiles = {};
let fetched = 0;

for (const date of dates) {
  const races = await readJson(`races/${date}.json`, { date, races: {} });
  const snaps = await readJson(`snapshots/${date}.json`, { date, races: {} });
  const results = await readJson(`results/${date}.json`, { date, races: {} });
  raceFiles[date] = races;
  resultFiles[date] = results;

  const due = Object.values(races.races)
    .filter((r) => !results.races[r.raceId]?.final)
    .filter((r) => minsBetween(r.jumpUtc, start) >= RESULTS.minMinsAfterJump)
    .sort((a, b) => a.jumpUtc.localeCompare(b.jumpUtc));

  for (const race of due) {
    if (fetched >= RESULTS.capPerRun) { log.count('deferred'); continue; }
    const where = `${race.track} R${race.raceNumber} ${date}`;
    try {
      fetched++;
      const res = await adapter.fetchResults(race.raceId);
      race.status = res.status;
      if (!res.final) {
        if (minsBetween(race.jumpUtc, start) > RESULTS.giveUpHours * 60) {
          log.gap(`${where} still not final ${RESULTS.giveUpHours}h after the jump (status ${res.status})`, { raceId: race.raceId, key: `notfinal:${race.raceId}` });
        }
        log.count('pending');
        continue;
      }
      const scratchings = res.runners.filter((r) => r.scratched).map((r) => ({
        runnerId: r.runnerId,
        name: r.name,
        number: r.number,
        scratchedUtc: r.scratchedUtc,
        late: isLateScratching(r.scratchedUtc, race.jumpUtc, bneDate),
      }));
      const closePrices = Object.fromEntries(res.runners.filter((r) => !r.scratched).map((r) => [r.runnerId, r.winPrice]));
      const winners = res.placings.filter((p) => p.position === 1);
      results.races[race.raceId] = {
        raceId: race.raceId,
        final: true,
        status: res.status,
        abandoned: res.abandoned,
        settled: stamp(start),
        actualStartUtc: res.actualStartUtc,
        winner: winners.map((w) => ({ runnerId: w.runnerId, name: w.name, number: w.number })),
        placings: res.placings,
        // Final Ladbrokes fixed win price shown after the race. Used as the closing price.
        closePrices,
        closePriceSource: `${adapter.name} final fixed win`,
        toteWin: res.toteWin,
        scratchings,
        runners: res.runners.map(({ runnerId, scratched }) => ({ runnerId, scratched })),
      };
      log.count(res.abandoned ? 'abandoned' : 'settled');

      const miss = missingLate(snaps.races[race.raceId]);
      if (race.firstSeenUtc > race.jumpUtc) log.count('firstSeenAfterJump'); // collection started late; not a gap
      else if (miss === null) log.gap(`${where}: no price snapshots at all`, { raceId: race.raceId, key: `nosnap:${race.raceId}` });
      else if (miss.length) log.gap(`${where}: no late price for ${miss.length} runner(s)`, { raceId: race.raceId, key: `nolate:${race.raceId}` });
    } catch (e) {
      log.error(`Result fetch failed for ${where}: ${e.message}`, { raceId: race.raceId });
      sourceState = { state: 'Error', lastError: e.message };
    }
  }
}

// Settle open paper bets. A bet may be on a race the snapshot job never saw (for example a manual pick),
// so fetch those directly.
const allResults = Object.assign({}, ...Object.values(resultFiles).map((f) => f.races));
for (const bet of ledger.bets.filter((b) => b.status === 'Open')) {
  let res = allResults[bet.raceId];
  if (!res && openBetRaces.has(bet.raceId)) {
    try {
      const r = await adapter.fetchResults(bet.raceId);
      if (r.final) res = r;
    } catch (e) {
      log.error(`Could not check result for paper bet ${bet.id}: ${e.message}`);
    }
  }
  const outcome = settleBet(bet, res);
  if (!outcome) continue;
  Object.assign(bet, outcome, { settled: stamp() });
  const close = res.closePrices?.[bet.runnerId] ?? res.runners?.find((r) => r.runnerId === bet.runnerId)?.winPrice ?? null;
  bet.closePrice = close;
  log.add('info', `Settled paper bet ${bet.runner}: ${outcome.status}`);
  log.count('betsSettled');
}

for (const [date, f] of Object.entries(raceFiles)) if (Object.keys(f.races).length) await writeJson(`races/${date}.json`, f);
for (const [date, f] of Object.entries(resultFiles)) if (Object.keys(f.races).length) await writeJson(`results/${date}.json`, f);
await writeJson('ledger.json', ledger);
await log.save({ sourceStates: { [adapter.name]: sourceState, 'racing-results': sourceState } });

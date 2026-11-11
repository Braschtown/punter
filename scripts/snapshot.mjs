// Snapshot job: records race metadata, the early price (first sighting) and the late price
// (about 10 minutes before the jump) for every runner in scope.
// Safe to run as often as you like: it only adds information and never overwrites an early price.

import { getAdapter } from './adapters/index.mjs';
import { SNAPSHOT } from './config.mjs';
import { hasEarlyForAll, inLateWindow, isSettledStatus, mergePrices } from './lib/capture.mjs';
import { buildPickRecord, inPickWindow } from './lib/forward.mjs';
import { readJson, RunLog, writeJson } from './lib/store.mjs';
import { addDays, bneDate, bneIso, minsBetween, utcIso } from './lib/time.mjs';

const adapter = getAdapter();
const log = new RunLog('snapshot');
const now = () => new Date();
const start = now();
let sourceState = { state: 'OK', lastError: null };

// 1. Meetings for today and tomorrow (Brisbane), so early prices for tomorrow are seen as soon as they appear.
let meetings = [];
try {
  meetings = await adapter.fetchMeetings(bneDate(start), bneDate(addDays(start, 1)));
} catch (e) {
  log.error(`Could not fetch meetings: ${e.message}`);
  sourceState = { state: 'Error', lastError: e.message };
}

// 2. Upsert race metadata, one file per Brisbane race date.
const racesByDate = new Map();
async function racesFile(date) {
  if (!racesByDate.has(date)) racesByDate.set(date, await readJson(`races/${date}.json`, { date, races: {} }));
  return racesByDate.get(date);
}
const allRaces = [];
for (const m of meetings) {
  for (const r of m.races) {
    const date = bneDate(r.jumpUtc);
    const file = await racesFile(date);
    const prev = file.races[r.raceId];
    file.races[r.raceId] = {
      raceId: r.raceId,
      meetingId: m.meetingId,
      meeting: `${m.name} ${m.date}`,
      track: m.name,
      state: m.state,
      code: m.code,
      raceNumber: r.raceNumber,
      name: r.name,
      distance: r.distance,
      jumpUtc: r.jumpUtc,
      jumpBne: bneIso(r.jumpUtc),
      status: r.status,
      trackCondition: m.trackCondition,
      firstSeenUtc: prev?.firstSeenUtc || utcIso(start),
    };
    if (!prev) log.count('newRaces');
    allRaces.push({ date, race: file.races[r.raceId] });
  }
}

// 3. Decide what to fetch: every open race in the late window, then races still missing early prices.
const snapsByDate = new Map();
async function snapsFile(date) {
  if (!snapsByDate.has(date)) snapsByDate.set(date, await readJson(`snapshots/${date}.json`, { date, races: {} }));
  return snapsByDate.get(date);
}

const late = [];
const early = [];
for (const { date, race } of allRaces) {
  if (isSettledStatus(race.status)) continue;
  const mins = minsBetween(start, race.jumpUtc);
  if (mins < 0) continue;
  const rec = (await snapsFile(date)).races[race.raceId];
  if (inLateWindow(mins)) late.push({ date, race });
  else if (mins > SNAPSHOT.lateWindowMins[1] && !hasEarlyForAll(rec)) {
    const checked = rec?.lastCheckedUtc ? minsBetween(rec.lastCheckedUtc, start) : Infinity;
    if (checked >= SNAPSHOT.earlyRecheckMins) early.push({ date, race });
  }
}
early.sort((a, b) => a.race.jumpUtc.localeCompare(b.race.jumpUtc));
const queue = [...late.map((x) => ({ ...x, kind: 'late' })), ...early.slice(0, SNAPSHOT.earlyCapPerRun).map((x) => ({ ...x, kind: 'early' }))];
if (early.length > SNAPSHOT.earlyCapPerRun) log.count('earlyDeferred', early.length - SNAPSHOT.earlyCapPerRun);

// Forward-test records, one file per Brisbane race date. Written once per race and never changed.
const fwdByDate = new Map();
async function fwdFile(date) {
  if (!fwdByDate.has(date)) fwdByDate.set(date, await readJson(`forward/${date}.json`, { date, races: {} }));
  return fwdByDate.get(date);
}

// 4. Fetch and merge.
for (const { date, race, kind } of queue) {
  try {
    const prices = await adapter.fetchPrices(race.raceId);
    const file = await snapsFile(date);
    const t = now();
    file.races[race.raceId] = mergePrices(file.races[race.raceId], prices, t, prices.jumpUtc || race.jumpUtc);
    if (prices.jumpUtc && prices.jumpUtc !== race.jumpUtc) {
      log.add('info', `Jump time moved ${race.jumpUtc} -> ${prices.jumpUtc}`, { raceId: race.raceId });
      race.jumpUtc = prices.jumpUtc;
      race.jumpBne = bneIso(prices.jumpUtc);
    }
    race.status = prices.status;
    log.count(kind === 'late' ? 'lateCaptures' : 'earlyChecks');

    // Lock the forward-test picks on the first pass inside the pick window.
    const fwd = await fwdFile(date);
    if (!fwd.races[race.raceId] && inPickWindow(minsBetween(t, prices.jumpUtc || race.jumpUtc))) {
      const rec = buildPickRecord(race, prices, file.races[race.raceId], t);
      if (rec) {
        fwd.races[race.raceId] = rec;
        log.count('racesPicked');
        log.count('picks', rec.picks.length);
      }
    }
  } catch (e) {
    const where = `${race.track} R${race.raceNumber}`;
    if (kind === 'late') log.gap(`No late price for ${where}: ${e.message}`, { raceId: race.raceId });
    else log.error(`Early price fetch failed for ${where}: ${e.message}`, { raceId: race.raceId });
    sourceState = { state: 'Error', lastError: e.message };
  }
}

// 5. Save.
for (const [date, f] of racesByDate) await writeJson(`races/${date}.json`, f);
for (const [date, f] of snapsByDate) if (Object.keys(f.races).length) await writeJson(`snapshots/${date}.json`, f);
for (const [date, f] of fwdByDate) if (Object.keys(f.races).length) await writeJson(`forward/${date}.json`, f);
log.count('races', allRaces.length);
await log.save({ sourceStates: { [adapter.name]: sourceState } });

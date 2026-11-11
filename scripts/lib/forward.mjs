// Forward tests: fixed rules that log a $1 paper bet before each jump, so results cannot be fitted afterwards.
// Pure functions, no I/O, unit tested.
//
// Rules for changing this file:
// - Never edit a test's rule once it has data. A changed rule is a new test with a new id and a new `added` date.
// - Every test is judged the same way as the market tests: 300 races, out of sample, against the baselines.
// - Stakes are $1 flat and ignore the weekly cap. This is a measurement ledger, not a betting plan.

import { minsBetween } from './time.mjs';

/** Picks are locked on the first snapshot pass that lands this many minutes before the jump. */
export const PICK_WINDOW_MINS = [2, 12];
/** An early price only counts for firmers and drifters if it was captured at least this long before the jump. */
export const EARLY_MIN_MINS = 30;
/** Firmers and drifters must have moved at least this much (relative change in implied probability). */
export const MOVE_MIN = 0.1;

/** Metropolitan thoroughbred tracks, matched on the start of the Ladbrokes meeting name. */
export const METRO_TRACKS = [
  'Randwick', 'Rosehill', 'Canterbury', 'Warwick Farm', // NSW
  'Flemington', 'Caulfield', 'Moonee Valley', 'The Valley', 'Sandown', // VIC
  'Eagle Farm', 'Doomben', // QLD
  'Morphettville', // SA
  'Ascot', 'Belmont', // WA
];
export const isMetro = (track) => METRO_TRACKS.some((t) => (track || '').startsWith(t));

/**
 * Runs since the last spell, from the Ladbrokes form string (most recent start on the right, `x` = spell).
 * 1 = first up, 2 = second up and so on. 0 = debut (no starts). null = form not published.
 */
export function upNumber(lastStarts) {
  if (lastStarts === null || lastStarts === undefined) return null;
  const s = String(lastStarts).trim();
  if (!s) return 0;
  const i = s.toLowerCase().lastIndexOf('x');
  return s.length - i; // no spell: i = -1, so this is starts + 1
}

/** Finishing position at the last start: '1' to '9', '0' for 10th or worse, 'x' after a spell, null if none. */
export function lastStart(lastStarts) {
  const s = String(lastStarts || '').trim();
  return s ? s.slice(-1).toLowerCase() : null;
}

/** A coarse class label read from the race name. 'Other' when nothing matches. */
export function raceClass(name, group) {
  const g = `${group || ''} ${name || ''}`;
  let m;
  if ((m = g.match(/\b(?:Group|Grp|G)\s?([123])\b/i))) return `Group ${m[1]}`;
  if (/\b(Listed|LR)\b/i.test(g)) return 'Listed';
  if (/\b(Mdn|Maiden)\b/i.test(g)) return 'Maiden';
  if ((m = g.match(/\b(?:BM|Benchmark)\s?(\d{2,3})\b/i))) return `BM${m[1]}`;
  if ((m = g.match(/\bC(?:lass|L)?\s?([1-6])\b/i))) return `Class ${m[1]}`;
  if (/\bRestricted\b|\bRst\b/i.test(g)) return 'Restricted';
  if (/\b(Hcp|Handicap)\b/i.test(g)) return 'Handicap';
  return 'Other';
}

const ip = (p) => 1 / p;
const each = (runners) => runners.map((r) => ({ runnerId: r.runnerId, stake: 1 }));
const isThoroughbred = (race) => race.code === 'thoroughbred';

/** Biggest relative move in implied probability from the early price to the pick price. dir 1 = firmer, -1 = drifter. */
function biggestMove(runners, dir) {
  let best = null;
  for (const r of runners) {
    if (!r.early || r.earlyMins < EARLY_MIN_MINS) continue;
    const move = dir * (ip(r.price) / ip(r.early) - 1);
    if (move >= MOVE_MIN && (!best || move > best.move)) best = { r, move };
  }
  return best ? [{ runnerId: best.r.runnerId, stake: 1 }] : [];
}

/**
 * The registered tests. `pick(race, runners)` gets the race details and every unscratched runner with a price
 * at pick time, and returns [{runnerId, stake}]. Order matters only for display.
 */
export const TESTS = [
  {
    id: 'favourite', name: 'Favourite', added: '2026-11-11',
    description: '$1 on the favourite at the pick price. Tied favourites share the $1.',
    pick: (race, rs) => {
      if (!rs.length) return [];
      const min = Math.min(...rs.map((r) => r.price));
      const favs = rs.filter((r) => r.price === min);
      return favs.map((r) => ({ runnerId: r.runnerId, stake: 1 / favs.length }));
    },
  },
  {
    id: 'metro-all', name: 'Every runner, metro', added: '2026-11-11',
    description: '$1 on every runner in thoroughbred races at metropolitan tracks. Mostly a control: it measures the bookmaker\'s margin.',
    pick: (race, rs) => (isThoroughbred(race) && isMetro(race.track) ? each(rs) : []),
  },
  {
    id: 'nonmetro-all', name: 'Every runner, country and provincial', added: '2026-11-11',
    description: '$1 on every runner in thoroughbred races away from the metropolitan tracks. Compare its margin with the metro control.',
    pick: (race, rs) => (isThoroughbred(race) && !isMetro(race.track) ? each(rs) : []),
  },
  {
    id: 'all-runners', name: 'Every runner, all tracks', added: '2026-11-11',
    description: '$1 on every runner in every race, metro and country combined. Greyhounds are read separately. The overall control for the bookmaker\'s margin.',
    pick: (race, rs) => each(rs),
  },
  {
    id: 'first-up', name: 'First up', added: '2026-11-11',
    description: '$1 on every thoroughbred having its first run back from a spell.',
    pick: (race, rs) => (isThoroughbred(race) ? each(rs.filter((r) => upNumber(r.form?.lastStarts) === 1)) : []),
  },
  {
    id: 'second-up', name: 'Second up', added: '2026-11-11',
    description: '$1 on every thoroughbred having its second run back from a spell.',
    pick: (race, rs) => (isThoroughbred(race) ? each(rs.filter((r) => upNumber(r.form?.lastStarts) === 2 && r.form.lastStarts.toLowerCase().includes('x'))) : []),
  },
  {
    id: 'third-up', name: 'Third up', added: '2026-11-11',
    description: '$1 on every thoroughbred having its third run back from a spell.',
    pick: (race, rs) => (isThoroughbred(race) ? each(rs.filter((r) => upNumber(r.form?.lastStarts) === 3 && r.form.lastStarts.toLowerCase().includes('x'))) : []),
  },
  {
    id: 'firmer', name: 'Biggest firmer', added: '2026-11-11',
    description: '$1 on the runner whose price shortened most since we first saw it (at least 30 minutes out), if it firmed by 10% or more in implied probability.',
    pick: (race, rs) => biggestMove(rs, 1),
  },
  {
    id: 'drifter', name: 'Biggest drifter', added: '2026-11-11',
    description: '$1 on the runner whose price lengthened most since we first saw it (at least 30 minutes out), if it drifted by 10% or more in implied probability.',
    pick: (race, rs) => biggestMove(rs, -1),
  },
  {
    id: 'under-3', name: 'Under $3', added: '2026-11-11',
    description: '$1 on every runner priced under $3.00 at pick time. Tests the favourite-longshot bias directly.',
    pick: (race, rs) => each(rs.filter((r) => r.price < 3)),
  },
  {
    id: 'box-1', name: 'Box 1, Q1 and Q2', added: '2026-11-11',
    description: '$1 on the box 1 greyhound at Q1 Lakeside and Q2 Parklands. Box bias is track specific, so read it per track.',
    pick: (race, rs) => (race.code === 'greyhound' && ['Q1 Lakeside', 'Q2 Parklands'].includes(race.track)
      ? each(rs.filter((r) => (r.barrier ?? r.number) === 1)) : []),
  },
  {
    id: 'leader', name: 'Speed map leader', added: '2026-11-11',
    description: '$1 on every thoroughbred the Ladbrokes speed map has leading.',
    pick: (race, rs) => (isThoroughbred(race) ? each(rs.filter((r) => /lead/i.test(r.form?.speedmap || ''))) : []),
  },
];

/** Should this pass lock the picks for a race? */
export const inPickWindow = (mins) => mins >= PICK_WINDOW_MINS[0] && mins <= PICK_WINDOW_MINS[1];

/**
 * Build the locked pre-jump record for one race: race details, every runner's price and form at pick time,
 * and each test's picks. Returns null if there are no priced runners.
 * @param race   stored race metadata (code, track, raceNumber, name, distance, trackCondition, jumpUtc)
 * @param prices adapter fetchPrices() result from this pass
 * @param snap   the race's snapshot record after merging this pass (for early prices)
 * @param now    pick time
 */
export function buildPickRecord(race, prices, snap, now) {
  const jumpUtc = prices.jumpUtc || race.jumpUtc;
  const minsToJump = minsBetween(now, jumpUtc);
  const runners = prices.runners
    .filter((r) => !r.scratched && r.winPrice)
    .map((r) => {
      const s = snap?.runners?.[r.runnerId];
      return {
        runnerId: r.runnerId,
        name: r.name,
        number: r.number,
        barrier: r.barrier,
        price: r.winPrice,
        early: s?.early?.price ?? null,
        earlyMins: s?.early?.minsToJump ?? null,
        form: r.form || null,
      };
    });
  if (!runners.length) return null;
  const meta = {
    code: race.code,
    track: race.track,
    state: race.state,
    raceNumber: race.raceNumber,
    name: prices.race?.description || race.name,
    distance: prices.race?.distance ?? race.distance,
    trackCondition: prices.race?.trackCondition || race.trackCondition,
    group: prices.race?.group || null,
    rail: prices.race?.rail || null,
    jumpUtc,
  };
  meta.class = raceClass(meta.name, meta.group);
  meta.metro = race.code === 'thoroughbred' && isMetro(race.track);
  const picks = [];
  for (const t of TESTS) {
    for (const p of t.pick(meta, runners)) picks.push({ test: t.id, runnerId: p.runnerId, stake: Math.round(p.stake * 10000) / 10000 });
  }
  return {
    pickedUtc: new Date(now).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    minsToJump: Math.round(minsToJump * 10) / 10,
    race: meta,
    fieldSize: runners.length,
    runners,
    picks,
    money: prices.money || null,
  };
}

/**
 * Settle a test's bet on one runner. Mirrors ledger.settleBet but returns null for bets that do not count
 * (race abandoned, or runner scratched after the pick).
 */
export function settlePick(pick, price, result) {
  if (!result || !result.final) return { status: 'Open' };
  if (result.abandoned) return { status: 'Void' };
  const r = (result.runners || []).find((x) => x.runnerId === pick.runnerId);
  if (r?.scratched) return { status: 'Scratched' };
  const winners = (result.placings || []).filter((p) => p.position === 1);
  const won = winners.some((w) => w.runnerId === pick.runnerId);
  return { status: won ? 'Won' : 'Lost', returned: won ? (pick.stake * price) / winners.length : 0 };
}

// Pure functions that merge new observations into stored data. No I/O, so they are unit tested.

import { SNAPSHOT } from '../config.mjs';
import { bneIso, minsBetween } from './time.mjs';

export const isSettledStatus = (s) => /^(final|abandoned)/i.test(s || '');

/** Is a capture taken `mins` before the jump inside the late window? */
export function inLateWindow(mins) {
  const [lo, hi] = SNAPSHOT.lateWindowMins;
  return mins >= lo && mins <= hi;
}

/**
 * Merge one price fetch into a race's snapshot record.
 * - early: first time we ever saw a price for that runner. Never overwritten.
 * - late:  the capture inside the late window closest to the target (about 10 min out).
 * - last:  the most recent capture before the jump.
 * Returns the updated record (input is not mutated).
 */
export function mergePrices(record, prices, now, jumpUtc) {
  const rec = structuredClone(record || { runners: {} });
  const minsToJump = minsBetween(now, jumpUtc);
  const capturedUtc = new Date(now).toISOString().replace(/\.\d{3}Z$/, 'Z');
  rec.lastCheckedUtc = capturedUtc;
  rec.captures = (rec.captures || 0) + 1;
  let priced = 0;

  for (const r of prices.runners) {
    const cur = rec.runners[r.runnerId] || { early: null, late: null, last: null };
    cur.name = r.name;
    cur.number = r.number;
    cur.barrier = r.barrier;
    cur.scratched = r.scratched;
    cur.scratchedUtc = r.scratchedUtc;

    if (r.winPrice && minsToJump >= 0) {
      priced++;
      const row = { price: r.winPrice, utc: capturedUtc, bne: bneIso(now), minsToJump };
      if (!cur.early) cur.early = row;
      cur.last = row;
      if (inLateWindow(minsToJump)) {
        const target = SNAPSHOT.lateTargetMins;
        if (!cur.late || Math.abs(minsToJump - target) < Math.abs(cur.late.minsToJump - target)) cur.late = row;
      }
    }
    rec.runners[r.runnerId] = cur;
  }
  rec.pricedRunners = priced;
  return rec;
}

/** True when every unscratched runner already has an early price. */
export function hasEarlyForAll(record) {
  if (!record) return false;
  const live = Object.values(record.runners).filter((r) => !r.scratched);
  return live.length > 0 && live.every((r) => r.early);
}

/** Runners that were never seen with a late price (scratched runners excluded). */
export function missingLate(record) {
  if (!record) return null;
  return Object.values(record.runners).filter((r) => !r.scratched && !r.late).map((r) => r.name);
}

/** A scratching counts as late when it happened on race day (Brisbane date of the jump). */
export function isLateScratching(scratchedUtc, jumpUtc, bneDateFn) {
  if (!scratchedUtc) return false;
  return bneDateFn(scratchedUtc) === bneDateFn(jumpUtc);
}

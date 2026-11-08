import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasEarlyForAll, isLateScratching, mergePrices, missingLate } from '../scripts/lib/capture.mjs';
import { settleBet } from '../scripts/lib/ledger.mjs';
import { bneDate, bneIso, minsBetween } from '../scripts/lib/time.mjs';

const JUMP = '2026-11-08T09:29:00Z';
const at = (minsBefore) => new Date(Date.parse(JUMP) - minsBefore * 60000);
const prices = (a, b, scratchedB = false) => ({
  runners: [
    { runnerId: 'a', name: 'Alpha', number: 1, barrier: 1, winPrice: a, scratched: false, scratchedUtc: null },
    { runnerId: 'b', name: 'Bravo', number: 2, barrier: 2, winPrice: scratchedB ? null : b, scratched: scratchedB, scratchedUtc: scratchedB ? '2026-11-08T01:00:00Z' : null },
  ],
});

test('Brisbane time helpers', () => {
  assert.equal(bneIso('2026-11-08T07:26:00Z'), '2026-11-08T17:26:00+10:00');
  assert.equal(bneDate('2026-11-08T14:30:00Z'), '2026-11-09'); // 00:30 next day in Brisbane
  assert.equal(minsBetween('2026-11-08T09:19:00Z', JUMP), 10);
});

test('early price is the first sighting and is never overwritten', () => {
  let rec = mergePrices(null, prices(8.5, 3), at(240), JUMP);
  rec = mergePrices(rec, prices(12, 2.8), at(60), JUMP);
  assert.equal(rec.runners.a.early.price, 8.5);
  assert.equal(rec.runners.a.early.minsToJump, 240);
  assert.equal(rec.runners.a.last.price, 12);
  assert.equal(rec.runners.a.late, null, '60 minutes out is not a late price');
});

test('late price keeps the capture closest to 10 minutes out', () => {
  let rec = mergePrices(null, prices(5, 3), at(14), JUMP);
  rec = mergePrices(rec, prices(6, 3), at(9), JUMP);
  rec = mergePrices(rec, prices(7, 3), at(3), JUMP);
  assert.equal(rec.runners.a.late.price, 6);
  assert.equal(rec.runners.a.late.minsToJump, 9);
  assert.equal(rec.runners.a.last.price, 7);
});

test('captures after the jump are ignored, and merging is repeatable', () => {
  const rec = mergePrices(null, prices(5, 3), at(10), JUMP);
  const after = mergePrices(rec, prices(1.5, 9), at(-2), JUMP);
  assert.equal(after.runners.a.last.price, 5);
  assert.deepEqual(rec.runners, mergePrices(rec, prices(5, 3), at(10), JUMP).runners);
});

test('scratched runners do not need prices', () => {
  const rec = mergePrices(null, prices(5, 3, true), at(10), JUMP);
  assert.equal(hasEarlyForAll(rec), true);
  assert.deepEqual(missingLate(rec), []);
  assert.equal(isLateScratching('2026-11-08T01:00:00Z', JUMP, bneDate), true);
  assert.equal(isLateScratching('2026-11-06T01:00:00Z', JUMP, bneDate), false);
});

test('settling paper bets', () => {
  const bet = { runnerId: 'a', stake: 1, price: 12 };
  const result = (placings, extra = {}) => ({ final: true, placings, runners: [{ runnerId: 'a', scratched: false }], ...extra });
  assert.equal(settleBet(bet, { final: false }), null);
  assert.deepEqual(settleBet(bet, result([{ position: 1, runnerId: 'a' }])), { status: 'Won', returns: 12 });
  assert.deepEqual(settleBet(bet, result([{ position: 1, runnerId: 'b' }])), { status: 'Lost', returns: 0 });
  // Dead heat for first: half the stake at full odds, so $1 at $12 returns $6.
  assert.deepEqual(settleBet(bet, result([{ position: 1, runnerId: 'a' }, { position: 1, runnerId: 'b' }])), { status: 'Won', returns: 6 });
  assert.deepEqual(settleBet(bet, { final: true, placings: [], runners: [{ runnerId: 'a', scratched: true }] }), { status: 'Scratched', returns: 1 });
  assert.deepEqual(settleBet(bet, { final: true, abandoned: true }), { status: 'Void', returns: 1 });
});

// End-to-end check of the analysis on synthetic races with known answers.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyse, splitDates } from '../scripts/analysis.mjs';

// Each race: a $2 favourite that always wins and a $4 outsider. Early prices are 10% longer, captured 60 min out.
function makeRaces(nDates, perDate, code = 'greyhound') {
  const races = [];
  for (let d = 0; d < nDates; d++) {
    const date = `2026-12-${String(d + 1).padStart(2, '0')}`;
    for (let i = 0; i < perDate; i++) {
      races.push({
        raceId: `${date}-${i}`, date, code, track: 'Q1 Lakeside', raceNumber: i + 1,
        runners: [
          { runnerId: 'fav', close: 2, early: 2.2, earlyMins: 60, late: 2, last: 2, lastMins: 1, winShare: 1 },
          { runnerId: 'out', close: 4, early: 4.4, earlyMins: 60, late: 4, last: 4, lastMins: 1, winShare: 0 },
        ],
      });
    }
  }
  return races;
}

test('dates split 70/30 into in-sample and out-of-sample', () => {
  const s = splitDates(makeRaces(10, 1));
  assert.equal(s.cutoff, '2026-12-08');
  assert.equal(s.isIn('2026-12-07'), true);
  assert.equal(s.isIn('2026-12-08'), false);
});

test('known answers on synthetic data', () => {
  const a = analyse(makeRaces(10, 40)); // 400 greyhound races
  const g = (id) => a.tests.find((t) => t.id === id).byCode.greyhound;

  // Overround: 1/2 + 1/4 - 1 = -0.25 in every race (a book under 100%), so an "Edge" for backers.
  assert.equal(g('overround').close.mean, -0.25);
  assert.equal(g('overround').verdict, 'Edge');

  // Favourite at $2 always wins: ROI +100%. Random pick: half the time $2, so expected ROI 0%.
  assert.equal(a.baselines.greyhound.favourite.all.roi, 1);
  assert.equal(a.baselines.greyhound.random.all.roi, 0);

  // Price lag: every early price is 10% longer than the close, so early is longer 100% of the time.
  assert.equal(g('price-lag').pctEarlyLonger, 1);
  // Backing both runners early returns 2.2 per 2 staked (+10%); at the close it returns 2 per 2 (0%).
  assert.equal(g('price-lag').roiEarly.all.roi, 0.1);
  assert.equal(g('price-lag').roiClose.all.roi, 0);
  // +10% beats zero but not the +100% favourite baseline, so the strategy does not count.
  assert.equal(g('price-lag').verdict, 'No edge');

  // Thoroughbreds have no races at all: never invent a number.
  const t = a.tests.find((x) => x.id === 'price-lag').byCode.thoroughbred;
  assert.equal(t.verdict, 'Insufficient data');
  assert.equal(t.meanDrift, null);
});

test('below 300 races the verdict is always "Insufficient data"', () => {
  const a = analyse(makeRaces(10, 29)); // 290 races
  for (const t of a.tests) assert.equal(t.byCode.greyhound.verdict, 'Insufficient data', t.id);
});

// Worked examples for the maths. Each one is small enough to check by hand.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  impliedProb, meanWithCI, overround, overroundVerdict, roi, roiWithCI, strategyVerdict, wilson,
} from '../scripts/lib/maths.mjs';

const close = (a, b, eps = 1e-4) => assert.ok(Math.abs(a - b) < eps, `${a} is not within ${eps} of ${b}`);

test('implied probability', () => {
  // $4.00 means the market thinks 1 in 4.
  close(impliedProb(4), 0.25);
  // $2.30 (Unapologetically, R2): 1 / 2.3 = 0.4348, about 43%.
  close(impliedProb(2.3), 0.4348);
  assert.throws(() => impliedProb(1));
  assert.throws(() => impliedProb(0));
});

test('overround', () => {
  // A fair three-runner book: 1/2 + 1/4 + 1/4 = 1.00, so no margin.
  close(overround([2, 4, 4]), 0);
  // 1/1.8 + 1/3.2 + 1/4.5 = 0.5556 + 0.3125 + 0.2222 = 1.0903, a 9.03% margin.
  close(overround([1.8, 3.2, 4.5]), 0.0903);
  // Eight greyhounds all at $5.50: 8 / 5.5 = 1.4545, a 45% margin. Backing all eight returns
  // $5.50 for $8 staked, which loses 31c per $1 (1 / 1.4545 - 1 = -0.3125).
  close(overround(Array(8).fill(5.5)), 0.4545);
  // Scratched runners (no price) are ignored.
  close(overround([2, 4, 4, null, 0]), 0);
  assert.equal(overround([]), null);
});

test('ROI', () => {
  // 10 bets of $1, one winner at $8: (8 - 10) / 10 = -20%.
  close(roi(10, 8), -0.2);
  // 3 bets of $1, one winner at $3.60: (3.6 - 3) / 3 = +20%.
  close(roi(3, 3.6), 0.2);
  assert.equal(roi(0, 0), null);
});

test('Wilson interval', () => {
  // 5 wins from 10: 50%, interval 23.7% to 76.3%.
  const [lo, hi] = wilson(5, 10);
  close(lo, 0.2366);
  close(hi, 0.7634);
  // 0 wins from 10 is not proof of 0%: the interval runs up to 27.8%.
  const [lo0, hi0] = wilson(0, 10);
  close(lo0, 0);
  close(hi0, 0.2775);
  // More data, narrower interval: 50 from 100 is 40.4% to 59.6%.
  const [lo1, hi1] = wilson(50, 100);
  close(lo1, 0.4038);
  close(hi1, 0.5962);
  assert.equal(wilson(0, 0), null);
});

test('bootstrap ROI interval resamples races and is reproducible', () => {
  // 20 races, $1 on one runner each, 4 winners at $4: returns 16 for 20 staked, ROI -20%.
  const races = Array.from({ length: 20 }, (_, i) => ({ staked: 1, returned: i % 5 === 0 ? 4 : 0 }));
  const a = roiWithCI(races);
  close(a.roi, -0.2);
  assert.ok(a.ci[0] < a.roi && a.roi < a.ci[1], 'interval contains the point estimate');
  assert.ok(a.ci[0] < 0 && a.ci[1] > 0, 'with only 20 races, -20% is not distinguishable from 0');
  assert.deepEqual(roiWithCI(races), a, 'same seed, same interval');
  // One race is not enough for an interval.
  assert.equal(roiWithCI([{ staked: 1, returned: 0 }]).ci, null);
});

test('mean with interval', () => {
  const m = meanWithCI([0.3, 0.32, 0.34, 0.36]);
  close(m.mean, 0.33);
  assert.ok(m.ci[0] >= 0.3 && m.ci[1] <= 0.36);
});

test('verdicts never overstate small samples', () => {
  const strong = { roi: 0.5, ci: [0.2, 0.8], races: 200 };
  // Even a huge ROI says "Insufficient data" below 300 races.
  assert.equal(strategyVerdict({ races: 299, oos: strong }).verdict, 'Insufficient data');
  assert.equal(strategyVerdict({ races: 300, oos: strong, baselines: [{ roi: -0.2 }, { roi: -0.3 }] }).verdict, 'Edge');
  // Positive but not better than the favourite baseline: no edge.
  assert.equal(strategyVerdict({ races: 300, oos: { roi: 0.05, ci: [0.01, 0.09], races: 200 }, baselines: [{ roi: 0.06 }] }).verdict, 'No edge');
  assert.equal(strategyVerdict({ races: 300, oos: { roi: -0.2, ci: [-0.3, -0.1], races: 200 } }).verdict, 'No edge');
  assert.equal(strategyVerdict({ races: 300, oos: { roi: 0.02, ci: [-0.1, 0.14], races: 200 }, baselines: [{ roi: -0.2 }] }).verdict, 'Inconclusive');

  assert.equal(overroundVerdict({ races: 10, mean: 0.3, ci: [0.28, 0.32] }).verdict, 'Insufficient data');
  assert.equal(overroundVerdict({ races: 300, mean: 0.3, ci: [0.28, 0.32] }).verdict, 'No edge');
});

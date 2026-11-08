// The maths behind every test. Pure functions with worked examples in test/maths.test.mjs.
// Prices are decimal odds (stake included), so $4.00 returns $4 for every $1 staked.

/** Implied probability of a decimal price: 1 / price. $4.00 -> 0.25. */
export function impliedProb(price) {
  if (!(price > 1)) throw new RangeError(`Price must be greater than 1, got ${price}`);
  return 1 / price;
}

/**
 * Overround (bookmaker margin) of a win market, as a fraction: sum of implied probabilities minus 1.
 * [$2.00, $4.00, $4.00] -> 0 (a fair book). 0.31 means the book adds up to 131%.
 */
export function overround(prices) {
  const p = prices.filter((x) => x > 1);
  if (!p.length) return null;
  return p.reduce((s, x) => s + 1 / x, 0) - 1;
}

/**
 * Return on investment as a fraction: (total returned - total staked) / total staked.
 * 10 bets of $1 with one winner at $8: (8 - 10) / 10 = -0.2, i.e. lose 20c per $1.
 */
export function roi(staked, returned) {
  if (!(staked > 0)) return null;
  return (returned - staked) / staked;
}

/**
 * Wilson score interval for a proportion k/n (95% by default).
 * Better than the normal approximation for small n and rates near 0 or 1, which matters for longshots.
 */
export function wilson(k, n, z = 1.96) {
  if (!(n > 0)) return null;
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

export const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/** Small fast seeded RNG (mulberry32), so bootstrap intervals are reproducible run to run. */
export function rng(seed = 42) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function quantile(sorted, q) {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

/**
 * ROI with a 95% bootstrap interval, resampling whole races.
 * Runners in the same race are not independent (only one wins), so resampling races, not bets,
 * gives an honest interval.
 * @param {Array<{staked:number, returned:number}>} races one entry per race
 */
export function roiWithCI(races, { iters = 1000, seed = 42 } = {}) {
  const n = races.length;
  const staked = races.reduce((s, r) => s + r.staked, 0);
  const returned = races.reduce((s, r) => s + r.returned, 0);
  const point = roi(staked, returned);
  if (point === null) return { roi: null, ci: null, races: n, staked: 0 };
  if (n < 2) return { roi: point, ci: null, races: n, staked };
  const rand = rng(seed);
  const samples = [];
  for (let b = 0; b < iters; b++) {
    let s = 0;
    let r = 0;
    for (let i = 0; i < n; i++) {
      const pick = races[Math.floor(rand() * n)];
      s += pick.staked;
      r += pick.returned;
    }
    samples.push(s > 0 ? (r - s) / s : 0);
  }
  samples.sort((x, y) => x - y);
  return { roi: point, ci: [quantile(samples, 0.025), quantile(samples, 0.975)], races: n, staked };
}

/** Mean with a 95% bootstrap interval (used for average overround per race). */
export function meanWithCI(xs, { iters = 1000, seed = 42 } = {}) {
  const n = xs.length;
  const m = mean(xs);
  if (n < 2) return { mean: m, ci: null, n };
  const rand = rng(seed);
  const samples = [];
  for (let b = 0; b < iters; b++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += xs[Math.floor(rand() * n)];
    samples.push(s / n);
  }
  samples.sort((x, y) => x - y);
  return { mean: m, ci: [quantile(samples, 0.025), quantile(samples, 0.975)], n };
}

export const MIN_RACES = 300;
export const MIN_OOS_RACES = 30;

/**
 * Verdict for a betting strategy, judged out of sample.
 * - Insufficient data: fewer than MIN_RACES races for this test and code.
 * - Edge: the out-of-sample ROI interval sits wholly above zero AND the ROI beats both baselines.
 * - No edge: the interval sits wholly below zero, or the ROI does not beat the better baseline.
 * - Inconclusive: anything else (for example the interval straddles zero).
 */
export function strategyVerdict({ races, oos, baselines = [] }) {
  if (races < MIN_RACES) return { verdict: 'Insufficient data', reason: `${races} of ${MIN_RACES} races` };
  if (!oos || oos.roi === null || oos.races < MIN_OOS_RACES || !oos.ci) {
    return { verdict: 'Inconclusive', reason: 'Too few out-of-sample races' };
  }
  const known = baselines.filter((b) => b && b.roi !== null);
  const best = known.length ? Math.max(...known.map((b) => b.roi)) : -Infinity;
  if (oos.ci[0] > 0 && oos.roi > best) return { verdict: 'Edge', reason: 'Out-of-sample ROI above zero and above both baselines' };
  if (oos.ci[1] < 0) return { verdict: 'No edge', reason: 'Out-of-sample ROI below zero' };
  if (oos.roi <= best) return { verdict: 'No edge', reason: 'Does not beat the baselines out of sample' };
  return { verdict: 'Inconclusive', reason: 'Out-of-sample interval includes zero' };
}

/** Verdict for the overround test: is the average book below 100% (an edge for backers) or above it? */
export function overroundVerdict({ races, mean: m, ci }) {
  if (races < MIN_RACES) return { verdict: 'Insufficient data', reason: `${races} of ${MIN_RACES} races` };
  if (!ci) return { verdict: 'Inconclusive', reason: 'No interval' };
  if (ci[0] > 0) return { verdict: 'No edge', reason: 'Books add up to more than 100%' };
  if (ci[1] < 0) return { verdict: 'Edge', reason: 'Books add up to less than 100%' };
  return { verdict: 'Inconclusive', reason: 'Interval includes a fair book' };
}

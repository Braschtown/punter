// Sums for the real bets in my-bets.json. Pure functions, no browser APIs, unit tested.
// Same rules as the "Ladbrokes Win Bets" sheet it came from:
// - Refunded bets are left out of the bet count and the stake.
// - Cash staked counts cash bets only. A bonus bet costs no cash, so its profit is its return.
// - Profit is the sum of each bet's recorded profit, ROI is profit over cash staked.

/** Totals for a list of real bets. */
export function summarise(bets) {
  const counted = bets.filter((b) => b.result !== 'Refunded');
  const winners = counted.filter((b) => b.result === 'Won').length;
  const cashStaked = round2(counted.filter((b) => b.funding === 'cash').reduce((s, b) => s + b.stake, 0));
  const returned = round2(counted.filter((b) => b.result === 'Won').reduce((s, b) => s + b.returns, 0));
  const profit = round2(bets.reduce((s, b) => s + b.profit, 0));
  return {
    bets: counted.length,
    winners,
    strikeRate: counted.length ? winners / counted.length : null,
    cashStaked,
    returned,
    profit,
    roi: cashStaked ? profit / cashStaked : null,
  };
}

/** Totals grouped by key(bet), sorted by key, newest or largest first when `desc`. */
export function summariseBy(bets, key, { desc = false } = {}) {
  const groups = new Map();
  for (const b of bets) {
    const k = key(b);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(b);
  }
  const rows = [...groups].map(([k, list]) => ({ key: k, ...summarise(list) }));
  rows.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) * (desc ? -1 : 1));
  return rows;
}

const round2 = (n) => Math.round(n * 100) / 100;

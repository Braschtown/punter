// Joins committed paper bets (ledger.json) with picks logged in this browser, settles the browser
// picks from committed results, and works out the weekly cap.

import { getJson } from './data.js';
import { getPicks } from './local.js';
import { bneDate, weekStart } from './format.js';

export const WEEKLY_CAP_DEFAULT = 100;

/** Same rules as scripts/lib/ledger.mjs. */
export function settleBet(bet, result) {
  if (!result || !result.final) return null;
  if (result.abandoned) return { status: 'Void', returns: bet.stake };
  const runner = (result.runners || []).find((r) => r.runnerId === bet.runnerId);
  if (runner?.scratched) return { status: 'Scratched', returns: bet.stake };
  const winners = result.winner || [];
  if (winners.some((w) => w.runnerId === bet.runnerId)) {
    return { status: 'Won', returns: Math.round((bet.stake * bet.price * 100) / winners.length) / 100 };
  }
  return { status: 'Lost', returns: 0 };
}

const betDate = (b) => b.placed?.date || (b.placed?.utc ? bneDate(new Date(b.placed.utc)) : null);

export async function loadLedger() {
  const ledger = await getJson('ledger.json', { optional: true, fallback: { bets: [] } });
  const committedIds = new Set(ledger.bets.map((b) => b.id));
  const local = getPicks().filter((p) => !committedIds.has(p.id)).map((p) => ({ ...p, local: true }));

  // Settle browser picks from committed results files.
  const dates = [...new Set(local.filter((p) => p.status === 'Open').map((p) => bneDate(new Date(p.jumpUtc))))];
  const results = {};
  await Promise.all(dates.map(async (d) => {
    const f = await getJson(`results/${d}.json`, { optional: true, fallback: { races: {} } });
    Object.assign(results, f.races);
  }));
  for (const p of local) {
    if (p.status !== 'Open') continue;
    const o = settleBet(p, results[p.raceId]);
    if (o) Object.assign(p, o, { settledInBrowser: true });
  }

  const bets = [...ledger.bets, ...local];
  const cap = ledger.weeklyCap || WEEKLY_CAP_DEFAULT;
  const wk = weekStart();
  const thisWeek = bets.filter((b) => (betDate(b) || '') >= wk);
  const stakedThisWeek = thisWeek.reduce((s, b) => s + (b.stake || 0), 0);
  return {
    bets,
    cap,
    weekStart: wk,
    stakedThisWeek,
    capLeft: Math.max(0, cap - stakedThisWeek),
    open: bets.filter((b) => b.status === 'Open'),
    settled: bets.filter((b) => b.status !== 'Open'),
    localCount: local.length,
  };
}

/** Profit and loss of settled bets (returns minus stakes). Void and scratched bets net to zero. */
export function settledPnl(settled) {
  return settled.reduce((s, b) => s + (b.returns || 0) - b.stake, 0);
}

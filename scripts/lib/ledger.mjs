// Settling paper bets against results. Pure function, unit tested.

/**
 * Settle one open win bet.
 * Rules:
 * - Abandoned race: Void, stake returned.
 * - Runner scratched: Scratched, stake returned (no deductions modelled in v1).
 * - Runner placed first: Won, returns = stake x price, split evenly on a dead heat.
 * - Otherwise: Lost, returns = 0.
 * Returns null when the result is not final yet.
 */
export function settleBet(bet, result) {
  if (!result || !result.final) return null;
  if (result.abandoned) return { status: 'Void', returns: bet.stake };
  const runner = (result.runners || []).find((r) => r.runnerId === bet.runnerId);
  if (runner?.scratched) return { status: 'Scratched', returns: bet.stake };
  const winners = (result.placings || []).filter((p) => p.position === 1);
  if (winners.some((w) => w.runnerId === bet.runnerId)) {
    return { status: 'Won', returns: round2((bet.stake * bet.price) / winners.length) };
  }
  return { status: 'Lost', returns: 0 };
}

export const round2 = (n) => Math.round(n * 100) / 100;

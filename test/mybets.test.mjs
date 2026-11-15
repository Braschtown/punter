// Worked examples for the real-bet sums. Each one is small enough to check by hand.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarise, summariseBy } from '../docs/js/lib/mybets.js';

const bet = (o) => ({ date: '2026-11-14', code: 'thoroughbred', funding: 'cash', result: 'Lost', stake: 10, returns: 0, profit: -10, ...o });

test('cash win, cash loss, bonus win and a refund', () => {
  const bets = [
    bet({ result: 'Won', stake: 10, returns: 35, profit: 25 }), // $10 at $3.50
    bet({}), // $10 lost
    bet({ funding: 'bonus', result: 'Won', stake: 10, returns: 18, profit: 18 }), // bonus pays the return only
    bet({ result: 'Refunded', stake: 20, returns: 20, profit: 0 }),
  ];
  const s = summarise(bets);
  assert.equal(s.bets, 3); // refund left out
  assert.equal(s.winners, 2);
  assert.equal(s.cashStaked, 20); // bonus and refund cost no cash
  assert.equal(s.returned, 53);
  assert.equal(s.profit, 33);
  assert.equal(s.roi, 33 / 20);
});

test('empty list has no strike rate or ROI', () => {
  const s = summarise([]);
  assert.equal(s.bets, 0);
  assert.equal(s.strikeRate, null);
  assert.equal(s.roi, null);
});

test('grouped by year, newest first', () => {
  const rows = summariseBy([bet({ date: '2025-01-03' }), bet({ date: '2026-11-14', result: 'Won', returns: 40, profit: 30 })], (b) => b.date.slice(0, 4), { desc: true });
  assert.deepEqual(rows.map((r) => [r.key, r.profit]), [['2026', 30], ['2025', -10]]);
});

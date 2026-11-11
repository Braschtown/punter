import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPickRecord, inPickWindow, isMetro, lastStart, raceClass, settlePick, TESTS, upNumber } from '../scripts/lib/forward.mjs';
import { settleAll, summarise } from '../scripts/forward-report.mjs';

const pick = (id, race, rs) => TESTS.find((t) => t.id === id).pick(race, rs);
const runner = (id, price, extra = {}) => ({ runnerId: id, name: id, number: Number(id.slice(1)) || 1, barrier: null, price, early: null, earlyMins: null, form: null, ...extra });

test('upNumber reads runs since the last spell, most recent start on the right', () => {
  assert.equal(upNumber('53x100x'), 1); // spell just ended: first up
  assert.equal(upNumber('53x100x6'), 2);
  assert.equal(upNumber('53x100x63'), 3);
  assert.equal(upNumber('34231'), 6); // no spell: sixth start of its career
  assert.equal(upNumber(''), 0); // debut
  assert.equal(upNumber(null), null);
  assert.equal(lastStart('53x1'), '1');
  assert.equal(lastStart('53x'), 'x');
});

test('raceClass reads the class from the race name', () => {
  assert.equal(raceClass('Kia Ora Plate (C1)'), 'Class 1');
  assert.equal(raceClass('Select Events Mdn Hcp'), 'Maiden');
  assert.equal(raceClass('Sportsbet BM64 Hcp'), 'BM64');
  assert.equal(raceClass('Golden Slipper', 'Group 1'), 'Group 1');
  assert.equal(raceClass('Some Plate'), 'Other');
});

test('metro tracks match on the start of the meeting name', () => {
  assert.ok(isMetro('Randwick-Kensington'));
  assert.ok(isMetro('Eagle Farm'));
  assert.ok(!isMetro('Scone'));
});

test('pick window is 2 to 12 minutes before the jump', () => {
  assert.ok(inPickWindow(10) && inPickWindow(2) && inPickWindow(12));
  assert.ok(!inPickWindow(13) && !inPickWindow(1.5));
});

test('favourite splits the stake on a tie', () => {
  const race = { code: 'thoroughbred', track: 'Scone' };
  assert.deepEqual(pick('favourite', race, [runner('r1', 2.5), runner('r2', 4)]), [{ runnerId: 'r1', stake: 1 }]);
  assert.deepEqual(pick('favourite', race, [runner('r1', 3), runner('r2', 3), runner('r3', 5)]).map((p) => p.stake), [0.5, 0.5]);
});

test('up tests only pick runs back from a spell, thoroughbreds only', () => {
  const race = { code: 'thoroughbred', track: 'Scone' };
  const rs = [
    runner('r1', 5, { form: { lastStarts: '12x' } }), // first up
    runner('r2', 5, { form: { lastStarts: '12x3' } }), // second up
    runner('r3', 5, { form: { lastStarts: '3' } }), // second start from debut, not second up
    runner('r4', 5, { form: { lastStarts: '' } }), // debut
  ];
  assert.deepEqual(pick('first-up', race, rs).map((p) => p.runnerId), ['r1']);
  assert.deepEqual(pick('second-up', race, rs).map((p) => p.runnerId), ['r2']);
  assert.deepEqual(pick('first-up', { ...race, code: 'greyhound' }, rs), []);
});

test('firmer and drifter need an early price 30+ minutes out and a 10% move', () => {
  const race = { code: 'thoroughbred', track: 'Scone' };
  const rs = [
    runner('r1', 4, { early: 5, earlyMins: 60 }), // 20% firmer
    runner('r2', 6, { early: 6.2, earlyMins: 60 }), // 3% firmer, too small
    runner('r3', 10, { early: 7, earlyMins: 60 }), // 30% drifter
    runner('r4', 2, { early: 4, earlyMins: 20 }), // big firmer but early price too late
  ];
  assert.deepEqual(pick('firmer', race, rs).map((p) => p.runnerId), ['r1']);
  assert.deepEqual(pick('drifter', race, rs).map((p) => p.runnerId), ['r3']);
});

test('box 1 only at Q1 and Q2', () => {
  const rs = [runner('r1', 3, { barrier: 1 }), runner('r2', 4, { barrier: 2 })];
  assert.deepEqual(pick('box-1', { code: 'greyhound', track: 'Q1 Lakeside' }, rs).map((p) => p.runnerId), ['r1']);
  assert.deepEqual(pick('box-1', { code: 'greyhound', track: 'Q Straight' }, rs), []);
});

test('buildPickRecord locks prices, early prices, form and picks', () => {
  const race = { code: 'thoroughbred', track: 'Randwick', state: 'NSW', raceNumber: 3, name: 'BM72 Hcp', distance: 1200, trackCondition: 'Good 4', jumpUtc: '2026-11-11T04:00:00Z' };
  const prices = {
    jumpUtc: '2026-11-11T04:00:00Z',
    race: { description: 'Sydney BM72 Hcp', distance: 1200, trackCondition: 'Good 4' },
    runners: [
      { runnerId: 'a', name: 'A', number: 1, barrier: 4, winPrice: 2.8, scratched: false, form: { lastStarts: '21x', speedmap: 'Leader' } },
      { runnerId: 'b', name: 'B', number: 2, barrier: 1, winPrice: 6, scratched: false, form: { lastStarts: '4455' } },
      { runnerId: 'c', name: 'C', number: 3, barrier: 2, winPrice: null, scratched: true, form: null },
    ],
  };
  const snap = { runners: { a: { early: { price: 3.5, minsToJump: 90 } } } };
  const rec = buildPickRecord(race, prices, snap, new Date('2026-11-11T03:50:00Z'));
  assert.equal(rec.minsToJump, 10);
  assert.equal(rec.fieldSize, 2);
  assert.equal(rec.race.class, 'BM72');
  assert.equal(rec.race.metro, true);
  assert.equal(rec.runners[0].early, 3.5);
  const tests = (id) => rec.picks.filter((p) => p.runnerId === id).map((p) => p.test).sort();
  assert.deepEqual(tests('a'), ['favourite', 'firmer', 'first-up', 'leader', 'metro-all', 'under-3']);
  assert.deepEqual(tests('b'), ['metro-all']);
});

test('settlePick handles wins, dead heats, scratchings and abandonments', () => {
  const p = { runnerId: 'a', stake: 1 };
  const res = { final: true, placings: [{ position: 1, runnerId: 'a' }], runners: [{ runnerId: 'a', scratched: false }] };
  assert.deepEqual(settlePick(p, 4, res), { status: 'Won', returned: 4 });
  assert.deepEqual(settlePick(p, 4, { ...res, placings: [{ position: 1, runnerId: 'a' }, { position: 1, runnerId: 'b' }] }), { status: 'Won', returned: 2 });
  assert.equal(settlePick(p, 4, { ...res, runners: [{ runnerId: 'a', scratched: true }] }).status, 'Scratched');
  assert.equal(settlePick(p, 4, { final: true, abandoned: true }).status, 'Void');
  assert.equal(settlePick(p, 4, null).status, 'Open');
});

test('summarise counts only won and lost bets and reports price beaten', () => {
  const rec = (winner) => ({
    race: { code: 'thoroughbred', jumpUtc: '2026-11-11T04:00:00Z' },
    runners: [{ runnerId: 'a', price: 2 }, { runnerId: 'b', price: 3 }],
    picks: [{ test: 'favourite', runnerId: 'a', stake: 1 }],
    winner,
  });
  const result = (winner) => ({ final: true, placings: [{ position: 1, runnerId: winner }], runners: [], closePrices: { a: 1.8, b: 3.5 } });
  const days = [{ date: '2026-11-11', races: { r1: rec('a'), r2: rec('b'), r3: rec('a') }, results: { r1: result('a'), r2: result('b') } }];
  const bets = settleAll(days);
  assert.deepEqual(bets.map((b) => b.status), ['Won', 'Lost', 'Open']);
  const fav = summarise(days).tests.find((t) => t.id === 'favourite').byCode.thoroughbred;
  assert.equal(fav.bets, 2);
  assert.equal(fav.open, 1);
  assert.equal(fav.profit, 0); // won $2 back on one, lost $1 on the other: staked 2, returned 2
  assert.equal(fav.beatClose.pct, 1); // took $2, closed $1.80
  assert.equal(fav.verdict, 'Insufficient data');
});

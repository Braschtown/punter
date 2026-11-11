// Forward tests dashboard: every $1 paper bet the registered tests locked before the jump,
// sliced and filtered in the browser. Reads forward-report/summary.json and the monthly runner files.
// Verdicts only come from the job (whole test, out of sample). Any filtered slice is exploratory.

import { getJson } from '../lib/data.js';
import { bindLineHover, hBarChart, lineChart } from '../lib/chart.js';
import { icon } from '../lib/icons.js';
import { esc, fmtDate, fmtMoney, fmtPct, fmtPrice, fmtSigned, fmtSignedPct } from '../lib/format.js';

const MIN_RACES = 300;
const FEW = 30; // groups with fewer bets than this are drawn as outlines
const CODES = [['thoroughbred', 'Thoroughbred'], ['greyhound', 'Greyhound']];
const PERIODS = [['all', 'All dates'], ['30', 'Last 30 days'], ['7', 'Last 7 days']];
const VERDICT_BADGE = { 'Insufficient data': 'warning', Edge: 'primary', 'No edge': 'secondary', Inconclusive: 'outlined' };
const PRICE_BANDS = [[1, 2], [2, 3], [3, 5], [5, 8], [8, 13], [13, 21], [21, 51], [51, Infinity]];

const band = (v, edges, fmt) => {
  if (v === null || v === undefined) return null;
  for (let i = 0; i < edges.length; i++) if (v < edges[i]) return [i, fmt(i === 0 ? null : edges[i - 1], edges[i])];
  return [edges.length, fmt(edges[edges.length - 1], null)];
};
const rangeLabel = (unit) => (lo, hi) => (lo === null ? `Under ${hi}${unit}` : hi === null ? `${lo}${unit}+` : `${lo} to ${hi - (unit === 'm' ? 1 : 0)}${unit}`);

/**
 * Dimensions you can break down and filter by. get(bet) returns [sortKey, label], an array of them
 * (a bet can sit in several groups, such as form flags), or null.
 */
const DIMS = {
  track: { label: 'Track', get: (b) => [b.track, b.track] },
  state: { label: 'State', get: (b) => [b.state, b.state] },
  going: { label: 'Track condition', get: (b) => { const g = (b.trackCondition || '').split(/\s+/)[0]; return g ? [g, g] : null; } },
  condition: { label: 'Track rating', get: (b) => (b.trackCondition ? [b.trackCondition, b.trackCondition] : null) },
  distance: {
    label: 'Distance',
    get: (b) => (b.code === 'greyhound'
      ? band(b.distance, [400, 500, 600], rangeLabel('m'))
      : band(b.distance, [1100, 1400, 1800, 2200], rangeLabel('m'))),
  },
  class: { label: 'Class', get: (b) => (b.class ? [b.class, b.class] : null) },
  metro: { label: 'Metro or country', get: (b) => (b.code === 'thoroughbred' ? (b.metro ? [0, 'Metro'] : [1, 'Country and provincial']) : null) },
  price: {
    label: 'Price band',
    get: (b) => {
      const i = PRICE_BANDS.findIndex(([lo, hi]) => b.price >= lo && b.price < hi);
      if (i < 0) return null;
      const [lo, hi] = PRICE_BANDS[i];
      return [i, hi === Infinity ? `$${lo}+` : `$${lo} to $${hi}`];
    },
  },
  field: { label: 'Field size', get: (b) => band(b.fieldSize, [9, 13], (lo, hi) => (lo === null ? '8 or fewer' : hi === null ? `${lo} or more` : `${lo} to ${hi - 1}`)) },
  up: {
    label: 'Runs from a spell',
    get: (b) => {
      if (b.lastStarts === null) return null;
      const s = b.lastStarts.trim();
      if (!s) return [0, 'Debut'];
      const i = s.toLowerCase().lastIndexOf('x');
      if (i < 0) return [9, 'No spell yet'];
      const n = s.length - i;
      return n >= 4 ? [4, '4th up or later'] : [n, ['', '1st up', '2nd up', '3rd up'][n]];
    },
  },
  last: {
    label: 'Last start',
    get: (b) => {
      const c = (b.lastStarts || '').trim().slice(-1).toLowerCase();
      if (!c) return null;
      if (c === 'x') return [4, 'Spell'];
      if (c === '1') return [0, 'Won'];
      if (c === '2' || c === '3') return [1, '2nd or 3rd'];
      if (c === '0') return [3, '10th or worse'];
      return [2, '4th to 9th'];
    },
  },
  barrier: {
    label: 'Barrier or box',
    get: (b) => {
      const v = b.barrier ?? b.number;
      if (v === null || v === undefined) return null;
      return b.code === 'greyhound' ? [v, `Box ${v}`] : band(v, [5, 9, 13], (lo, hi) => (lo === null ? 'Barrier 1 to 4' : hi === null ? `Barrier ${lo}+` : `Barrier ${lo} to ${hi - 1}`));
    },
  },
  weight: { label: 'Weight', get: (b) => (b.weight ? band(b.weight, [54.5, 56.5, 58.5], (lo, hi) => (lo === null ? `Under ${hi}kg` : hi === null ? `${lo}kg+` : `${lo} to ${hi - 0.5}kg`)) : null) },
  claim: { label: 'Apprentice claim', get: (b) => (b.code === 'thoroughbred' ? (b.claim ? [0, 'Claiming'] : [1, 'No claim']) : null) },
  speedmap: { label: 'Speed map', get: (b) => (b.speedmap ? [b.speedmap, b.speedmap] : null) },
  flag: { label: 'Form flag', get: (b) => (b.indicators ? b.indicators.split('|').map((x) => [x, x]) : [['~', 'No flag']]) },
  mover: { label: 'Ladbrokes mover', get: (b) => (b.mover ? [0, 'Mover'] : [1, 'Not a mover']) },
  jockey: { label: 'Jockey', get: (b) => (b.jockey ? [b.jockey, b.jockey] : null) },
  trainer: { label: 'Trainer', get: (b) => (b.trainer ? [b.trainer, b.trainer] : null) },
  weekday: { label: 'Day of week', get: (b) => { const d = new Date(`${b.date}T12:00:00Z`).getUTCDay(); return [(d + 6) % 7, ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]]; } },
  week: { label: 'Week', get: (b) => { const d = new Date(`${b.date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); const k = d.toISOString().slice(0, 10); return [k, `Week of ${fmtDate(`${k}T02:00:00Z`)}`]; } },
};
const groupsOf = (dim, b) => { const g = DIMS[dim].get(b); if (!g) return []; return Array.isArray(g[0]) ? g : [g]; };

// ---- state in the URL, so a view can be bookmarked or shared ----

function readState() {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const filters = {};
  for (const [k, v] of q) if (k.startsWith('f.') && DIMS[k.slice(2)]) filters[k.slice(2)] = v;
  return {
    test: q.get('test') || 'all',
    code: CODES.some(([c]) => c === q.get('code')) ? q.get('code') : 'thoroughbred',
    period: PERIODS.some(([p]) => p === q.get('period')) ? q.get('period') : 'all',
    by: DIMS[q.get('by')] ? q.get('by') : '',
    sort: q.get('sort') || 'bets',
    filters,
  };
}
function writeState(s) {
  const q = new URLSearchParams();
  if (s.test !== 'all') q.set('test', s.test);
  if (s.code !== 'thoroughbred') q.set('code', s.code);
  if (s.period !== 'all') q.set('period', s.period);
  if (s.by) q.set('by', s.by);
  if (s.sort !== 'bets') q.set('sort', s.sort);
  for (const [k, v] of Object.entries(s.filters)) q.set(`f.${k}`, v);
  const qs = q.toString();
  history.replaceState(null, '', `#/forward${qs ? `?${qs}` : ''}`);
}

// ---- data ----

/** Turn the compact monthly files into one bet per (runner, test). */
function flatten(months) {
  const bets = [];
  for (const m of months) {
    const rc = Object.fromEntries(m.raceColumns.map((c, i) => [c, i]));
    const uc = Object.fromEntries(m.runnerColumns.map((c, i) => [c, i]));
    const races = m.races.map((r) => Object.fromEntries(Object.entries(rc).map(([k, i]) => [k, r[i]])));
    for (const u of m.runners) {
      const race = races[u[uc.race]];
      const base = { ...race };
      for (const [k, i] of Object.entries(uc)) if (k !== 'race' && k !== 'picks') base[k] = u[i];
      base.metro = !!race.metro;
      for (const [ti, stake] of u[uc.picks]) {
        const b = { ...base, test: m.tests[ti], stake };
        if (race.status === 'void') b.status = 'Void';
        else if (b.scratched) b.status = 'Scratched';
        else if (b.won === null || b.won === undefined) b.status = 'Open';
        else b.status = b.won ? 'Won' : 'Lost';
        b.returned = b.status === 'Won' ? (stake * b.price) / (b.winners || 1) : 0;
        b.profit = b.status === 'Won' || b.status === 'Lost' ? b.returned - stake : 0;
        bets.push(b);
      }
    }
  }
  bets.sort((a, b) => a.jumpUtc.localeCompare(b.jumpUtc));
  return bets;
}

// ---- maths (descriptive only; verdicts come from the job) ----

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** ROI with a 95% interval from resampling whole races (300 resamples). */
function roiCI(bets) {
  const byRace = new Map();
  for (const b of bets) { const r = byRace.get(b.raceId) || { s: 0, r: 0 }; r.s += b.stake; r.r += b.returned; byRace.set(b.raceId, r); }
  const races = [...byRace.values()];
  const S = races.reduce((s, x) => s + x.s, 0);
  const R = races.reduce((s, x) => s + x.r, 0);
  if (!S) return { roi: null, ci: null, races: 0 };
  if (races.length < 2) return { roi: (R - S) / S, ci: null, races: races.length };
  const rand = mulberry32(42);
  const n = races.length;
  const xs = [];
  for (let k = 0; k < 300; k++) {
    let s = 0; let r = 0;
    for (let i = 0; i < n; i++) { const p = races[Math.floor(rand() * n)]; s += p.s; r += p.r; }
    xs.push(s ? (r - s) / s : 0);
  }
  xs.sort((a, b) => a - b);
  return { roi: (R - S) / S, ci: [xs[Math.floor(0.025 * 299)], xs[Math.ceil(0.975 * 299)]], races: n };
}
function wilson(k, n) {
  if (!n) return null;
  const z = 1.96; const p = k / n; const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d; const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [c - h, c + h];
}
function stats(bets) {
  const settled = bets.filter((b) => b.status === 'Won' || b.status === 'Lost');
  const wins = settled.filter((b) => b.status === 'Won').length;
  const staked = settled.reduce((s, b) => s + b.stake, 0);
  const profit = settled.reduce((s, b) => s + b.profit, 0);
  const withClose = settled.filter((b) => b.close);
  return {
    bets: settled.length,
    open: bets.filter((b) => b.status === 'Open').length,
    races: new Set(settled.map((b) => b.raceId)).size,
    wins,
    strike: settled.length ? wins / settled.length : null,
    strikeCi: wilson(wins, settled.length),
    staked,
    profit,
    ...roiCI(settled),
    avgPrice: settled.length ? settled.reduce((s, b) => s + b.price, 0) / settled.length : null,
    beat: withClose.length ? withClose.filter((b) => b.price > b.close).length / withClose.length : null,
    beatEdge: withClose.length ? withClose.reduce((s, b) => s + (b.price / b.close - 1), 0) / withClose.length : null,
    closeN: withClose.length,
  };
}

// ---- formatting helpers ----

const money = (v) => (v === null ? '-' : fmtSigned(v));
const pctOrDash = (v, d = 1) => (v === null || v === undefined ? '-' : fmtPct(v, d));
const roiText = (s) => (s.roi === null ? '-' : fmtSignedPct(s.roi, 1));
const ciText = (ci) => (ci ? `${fmtSignedPct(ci[0], 0)} to ${fmtSignedPct(ci[1], 0)}` : 'no interval yet');
/** ROI with its interval underneath, for table cells. */
const roiCell = (s) => `${esc(roiText(s))}${s.ci ? `<br><span class="hint">${esc(ciText(s.ci))}</span>` : ''}`;
const verdictBadge = (v) => `<span class="badge ${VERDICT_BADGE[v] || 'outlined'}">${esc(v || 'Insufficient data')}</span>`;
/** Multi-line tooltip text for one group's bar. */
const barTip = (label, st) => [
  label,
  `ROI ${roiText(st)}${st.ci ? ` (95%: ${ciText(st.ci)})` : ''}`,
  `${plural(st.bets, 'bet')}, ${plural(st.wins, 'win')}${st.strike !== null ? ` (${fmtPct(st.strike, 1)} strike)` : ''}`,
  st.beat !== null ? `Beat the close ${fmtPct(st.beat, 0)} of the time` : 'No closing prices yet',
  `Profit ${money(st.bets ? st.profit : null)} on ${fmtMoney(st.staked)}`,
  ...(st.bets < FEW ? [`Fewer than ${FEW} bets: treat as noise`] : []),
].join('\n');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const tile = (label, value, hint) => `<div class="tile"><p class="t-label">${esc(label)}</p><span class="v">${value}</span><span class="hint">${hint}</span></div>`;

function select(id, label, options, value) {
  return `<div class="field"><label for="${id}">${esc(label)}</label><select id="${id}">${options.map(([v, l]) => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
}

export function segmented(current) {
  return `<nav class="segmented" aria-label="Test type">
    <a href="#/tests"${current === 'tests' ? ' aria-current="page"' : ''}>Market tests</a>
    <a href="#/forward"${current === 'forward' ? ' aria-current="page"' : ''}>Forward tests</a>
  </nav>`;
}

// ---- render ----

let cache = null; // { key, summary, bets }

export async function render(root, ui) {
  root.innerHTML = `${segmented('forward')}${ui.skeleton(1, 'tall')}<div class="dash-tiles">${ui.skeleton(4, 'short')}</div>${ui.skeleton(1, 'tall')}`;
  const summary = await getJson('forward-report/summary.json', { optional: true, fallback: null });
  if (!ui.isCurrent()) return;
  if (!summary) {
    root.innerHTML = `${segmented('forward')}<section class="card"><h2 class="t-card">No forward picks yet</h2>
      <p class="t-body muted" style="margin:0">Each test locks its $1 paper picks about 10 minutes before every jump. The first results appear here once those races have run.</p></section>`;
    return;
  }
  const key = `${summary.generated?.utc}|${summary.months.join(',')}`;
  if (cache?.key !== key) {
    const months = await Promise.all(summary.months.map((m) => getJson(`forward-report/runners-${m}.json`, { optional: true, fallback: null, fresh: true })));
    if (!ui.isCurrent()) return;
    cache = { key, summary, bets: flatten(months.filter(Boolean)) };
  }
  const state = readState();
  draw(root, ui, state);
}

function draw(root, ui, state) {
  const { summary, bets: all } = cache;
  const tests = summary.tests;
  const t = tests.find((x) => x.id === state.test);
  if (state.test !== 'all' && !t) state.test = 'all';

  let bets = all.filter((b) => b.code === state.code);
  if (state.period !== 'all') {
    const since = new Date(Date.now() - Number(state.period) * 86400000).toISOString().slice(0, 10);
    bets = bets.filter((b) => b.date >= since);
  }
  const update = (patch) => { Object.assign(state, patch); writeState(state); draw(root, ui, state); };

  const controls = `
    ${segmented('forward')}
    <div class="dash-controls">
      ${select('fw-test', 'Test', [['all', 'All tests'], ...tests.map((x) => [x.id, x.name])], state.test)}
      ${select('fw-code', 'Code', CODES, state.code)}
      ${select('fw-period', 'Dates', PERIODS, state.period)}
      ${state.test === 'all' ? '' : select('fw-by', 'Break down by', [['', 'Nothing'], ...Object.entries(DIMS).map(([k, d]) => [k, d.label])], state.by)}
    </div>`;

  root.innerHTML = controls + (state.test === 'all' ? overview(tests, bets, state) : testView(t, bets, state));

  root.querySelector('#fw-test').addEventListener('change', (e) => update({ test: e.target.value, filters: {} }));
  root.querySelector('#fw-code').addEventListener('change', (e) => update({ code: e.target.value, filters: {} }));
  root.querySelector('#fw-period').addEventListener('change', (e) => update({ period: e.target.value }));
  root.querySelector('#fw-by')?.addEventListener('change', (e) => update({ by: e.target.value }));
  root.querySelectorAll('[data-test]').forEach((el) => {
    const go = () => update({ test: el.dataset.test, filters: {} });
    el.addEventListener('click', go);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
  root.querySelectorAll('[data-sort]').forEach((el) => el.addEventListener('click', () => update({ sort: el.dataset.sort })));
  root.querySelectorAll('[data-unfilter]').forEach((el) => el.addEventListener('click', () => {
    const f = { ...state.filters }; delete f[el.dataset.unfilter]; update({ filters: f });
  }));
  root.querySelectorAll('[data-filter]').forEach((el) => {
    const go = () => update({ filters: { ...state.filters, [state.by]: el.dataset.filter }, by: '' });
    el.addEventListener('click', go);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  });
  const addDim = root.querySelector('#fw-fdim');
  if (addDim) {
    addDim.addEventListener('change', () => {
      const dim = addDim.value;
      const vals = root.querySelector('#fw-fval');
      const seen = new Map();
      for (const b of root._scope || []) for (const [k, l] of dim ? groupsOf(dim, b) : []) seen.set(l, k);
      vals.innerHTML = `<option value="">Choose</option>${[...seen].sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0)).map(([l]) => `<option>${esc(l)}</option>`).join('')}`;
      vals.disabled = !dim;
    });
    root.querySelector('#fw-fval').addEventListener('change', (e) => {
      if (e.target.value) update({ filters: { ...state.filters, [addDim.value]: e.target.value } });
    });
  }
  const more = root.querySelector('#fw-more');
  if (more) more.addEventListener('click', () => { state.limit = (state.limit || 25) + 50; draw(root, ui, state); });
  root.querySelector('#fw-csv')?.addEventListener('click', () => downloadCsv(root._scope || [], state));
  const pnl = root.querySelector('#fw-pnl');
  if (pnl) bindLineHover(pnl, root._points, (p) => `<strong>${esc(fmtSigned(p.y))}</strong> after ${plural(p.i, 'bet')}<br>${esc(fmtDate(p.b.jumpUtc))} · ${esc(p.b.track)} R${esc(p.b.raceNumber)}<br>${esc(p.b.name)} at ${esc(fmtPrice(p.b.price))}, ${esc(p.b.status.toLowerCase())}`);
  ui.setFab(null);
}

function overview(tests, bets, state) {
  const rows = tests.map((t) => {
    const mine = bets.filter((b) => b.test === t.id);
    return { t, s: stats(mine), j: t.byCode[state.code] };
  }).filter((r) => r.s.bets || r.s.open);
  if (!rows.length) return '<section class="card"><p class="empty-state" style="margin:0">No bets for this code and period yet.</p></section>';
  const chart = hBarChart(rows.map((r) => ({
    label: r.t.name, value: r.s.roi, n: r.s.bets, solid: r.s.bets >= FEW,
    tip: barTip(r.t.name, r.s),
  })), { format: (v) => fmtSignedPct(v, 0), title: 'Return on $1 bets by test' });
  return `
    <section class="card" aria-labelledby="ov-h">
      <h2 class="t-card" id="ov-h">Return by test</h2>
      <p class="hint" style="margin:0">Return on turnover, ${state.period === 'all' ? 'all dates' : PERIODS.find(([p]) => p === state.period)[1].toLowerCase()}. Outlined bars have fewer than ${FEW} bets. Select a test to explore it.</p>
      ${chart}
      <div class="table-wrap"><table class="dtable">
        <thead><tr><th scope="col">Test</th><th scope="col">Bets</th><th scope="col">ROI (95%)</th><th scope="col">Beat close</th><th scope="col">Races</th><th scope="col">Verdict</th></tr></thead>
        <tbody>${rows.map(({ t, s, j }) => `<tr class="link${s.bets < FEW ? ' few' : ''}" data-test="${esc(t.id)}" tabindex="0" aria-label="Explore ${esc(t.name)}">
          <td>${esc(t.name)}</td><td class="num">${s.bets}${s.open ? ` <span class="hint">+${s.open}</span>` : ''}</td>
          <td class="num">${roiCell(s)}</td><td class="num">${pctOrDash(s.beat, 0)}</td>
          <td class="num">${j?.races ?? 0} / ${MIN_RACES}</td><td>${verdictBadge(j?.verdict)}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="hint" style="margin:0">Verdicts use all dates and are judged on the latest 30% of race dates only. "+n" is bets still waiting on a result.</p>
    </section>`;
}

function testView(t, bets, state) {
  let mine = bets.filter((b) => b.test === t.id);
  const filters = Object.entries(state.filters);
  for (const [dim, val] of filters) mine = mine.filter((b) => groupsOf(dim, b).some(([, l]) => l === val));
  const s = stats(mine);
  const j = t.byCode[state.code];
  const sliced = filters.length || state.period !== 'all';
  const settled = mine.filter((b) => b.status === 'Won' || b.status === 'Lost');

  // Running profit, in time order.
  let run = 0;
  const points = settled.map((b, i) => { run += b.profit; return { y: Math.round(run * 100) / 100, i: i + 1, b }; });
  const root = document.getElementById('main');
  root._points = points;
  root._scope = mine;

  const verdict = sliced
    ? '<span class="badge outlined">Exploratory slice</span>'
    : verdictBadge(j?.verdict);
  const filterDims = Object.entries(DIMS).filter(([k]) => !state.filters[k]);

  return `
    <section class="card" aria-labelledby="t-h">
      <div class="card-head"><h2 class="t-card" id="t-h">${esc(t.name)}</h2>${verdict}</div>
      <p class="t-body muted" style="margin:0">${esc(t.description)}</p>
      ${sliced ? `<p class="hint" style="margin:0">Filtered views never get a verdict. Slicing many ways will always turn up something that looks good by chance; treat a promising slice as an idea for a new test, not a result.</p>`
        : `<div class="row between"><span class="t-label">Races logged</span><span class="mono">${j?.races ?? 0} / ${MIN_RACES}</span></div>
           <div class="progress" role="progressbar" aria-label="Races logged" aria-valuemin="0" aria-valuemax="${MIN_RACES}" aria-valuenow="${Math.min(MIN_RACES, j?.races ?? 0)}"><span style="width:${Math.min(100, ((j?.races ?? 0) / MIN_RACES) * 100)}%"></span></div>
           ${j?.baselines?.favourite?.roi !== undefined && j.baselines.favourite ? `<p class="hint" style="margin:0">Baselines on the same races: favourite ${esc(fmtSignedPct(j.baselines.favourite.roi, 1))}, random runner ${esc(fmtSignedPct(j.baselines.random?.roi ?? null, 1))}.</p>` : ''}`}
      <div class="filter-chips">
        ${filters.map(([k, v]) => `<button class="chip input" type="button" data-unfilter="${esc(k)}" aria-label="Remove filter ${esc(DIMS[k].label)}: ${esc(v)}">${esc(DIMS[k].label)}: ${esc(v)}<span class="x">${icon('close', 'icon-sm')}</span></button>`).join('')}
      </div>
      <div class="dash-controls" style="grid-template-columns:1fr 1fr">
        ${select('fw-fdim', 'Filter by', [['', 'Choose'], ...filterDims.map(([k, d]) => [k, d.label])], '')}
        <div class="field"><label for="fw-fval">Value</label><select id="fw-fval" disabled><option value="">Choose a filter first</option></select></div>
      </div>
    </section>

    <div class="dash-tiles">
      ${tile('Bets', String(s.bets), `${plural(s.races, 'race')}${s.open ? `, ${s.open} open` : ''}`)}
      ${tile('Profit', esc(money(s.bets ? s.profit : null)), `on ${esc(fmtMoney(s.staked))} staked`)}
      ${tile('ROI', esc(roiText(s)), esc(s.ci ? `95%: ${ciText(s.ci)}` : 'interval needs 2+ races'))}
      ${tile('Strike rate', esc(pctOrDash(s.strike)), esc(s.strikeCi ? `${fmtPct(s.strikeCi[0], 0)} to ${fmtPct(s.strikeCi[1], 0)}` : `${s.wins} wins`))}
      ${tile('Beat the close', esc(pctOrDash(s.beat, 0)), esc(s.closeN ? `avg ${fmtSignedPct(s.beatEdge, 1)} on price` : 'no closing prices'))}
      ${tile('Average price', esc(s.avgPrice ? fmtPrice(s.avgPrice) : '-'), plural(s.wins, 'win'))}
    </div>

    <section class="card" aria-labelledby="pnl-h">
      <h2 class="t-card" id="pnl-h">Running profit</h2>
      <p class="hint" style="margin:0">$1 per bet, settled bets in jump order. Hover or touch for each bet.</p>
      <div id="fw-pnl">${lineChart(points, { format: (v) => fmtSigned(v), title: `Running profit for ${t.name}`, width: Math.min(document.getElementById('main').clientWidth, 1100) - 64 })}</div>
    </section>

    ${state.by ? breakdown(mine, state) : `<section class="card"><p class="hint" style="margin:0">Pick a "Break down by" option above to compare groups such as track condition, distance or jockey. Select a group to filter to it.</p></section>`}

    ${betList(mine, state)}`;
}

function breakdown(bets, state) {
  const dim = DIMS[state.by];
  const groups = new Map();
  for (const b of bets) for (const [k, l] of groupsOf(state.by, b)) {
    const g = groups.get(l) || { key: k, label: l, bets: [] };
    g.bets.push(b);
    groups.set(l, g);
  }
  let rows = [...groups.values()].map((g) => ({ ...g, s: stats(g.bets) })).filter((g) => g.s.bets || g.s.open);
  const sorters = {
    bets: (a, b) => b.s.bets - a.s.bets,
    group: (a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
    roi: (a, b) => (b.s.roi ?? -9) - (a.s.roi ?? -9),
    strike: (a, b) => (b.s.strike ?? -1) - (a.s.strike ?? -1),
    beat: (a, b) => (b.s.beat ?? -1) - (a.s.beat ?? -1),
    profit: (a, b) => b.s.profit - a.s.profit,
  };
  rows.sort(sorters[state.sort] || sorters.bets);
  const total = rows.length;
  rows = rows.slice(0, 40);
  const head = (id, label) => `<th scope="col" aria-sort="${state.sort === id ? 'descending' : 'none'}"><button type="button" data-sort="${id}">${esc(label)}${state.sort === id ? ' ▾' : ''}</button></th>`;
  const chartRows = rows.slice(0, 15).map((g) => ({
    label: g.label, value: g.s.roi, n: g.s.bets, solid: g.s.bets >= FEW,
    tip: barTip(g.label, g.s),
  }));
  return `<section class="card" aria-labelledby="bd-h">
    <h2 class="t-card" id="bd-h">By ${esc(dim.label.toLowerCase())}</h2>
    <p class="hint" style="margin:0">Return on $1 bets. Outlined bars have fewer than ${FEW} bets, so treat them as noise.${total > 40 ? ` Showing 40 of ${total} groups.` : ''}</p>
    ${hBarChart(chartRows, { format: (v) => fmtSignedPct(v, 0), title: `Return by ${dim.label.toLowerCase()}` })}
    <div class="table-wrap"><table class="dtable">
      <thead><tr>${head('group', dim.label)}${head('bets', 'Bets')}${head('strike', 'Strike')}${head('roi', 'ROI (95%)')}${head('beat', 'Beat close')}${head('profit', 'Profit')}</tr></thead>
      <tbody>${rows.map((g) => `<tr class="link${g.s.bets < FEW ? ' few' : ''}" data-filter="${esc(g.label)}" tabindex="0" aria-label="Filter to ${esc(g.label)}">
        <td>${esc(g.label)}</td><td class="num">${g.s.bets}</td><td class="num">${pctOrDash(g.s.strike)}</td><td class="num">${roiCell(g.s)}</td><td class="num">${pctOrDash(g.s.beat, 0)}</td><td class="num">${esc(money(g.s.bets ? g.s.profit : null))}</td></tr>`).join('')}</tbody>
    </table></div>
  </section>`;
}

function betList(bets, state) {
  const limit = state.limit || 25;
  const latest = [...bets].reverse().slice(0, limit);
  if (!latest.length) return '';
  const statusBadge = { Won: 'primary', Lost: '', Open: 'secondary', Scratched: 'outlined', Void: 'outlined' };
  return `<section class="card" aria-labelledby="bl-h">
    <div class="card-head"><h2 class="t-card" id="bl-h">Bets</h2>
      <button class="btn text" type="button" id="fw-csv">${icon('download', 'icon-sm')}CSV</button></div>
    <div class="table-wrap"><table class="dtable">
      <thead><tr><th scope="col">Runner</th><th scope="col">Race</th><th scope="col">Taken</th><th scope="col">Close</th><th scope="col">Result</th></tr></thead>
      <tbody>${latest.map((b) => `<tr><td>${esc(b.name)}<br><span class="hint">${esc(fmtDate(b.jumpUtc))}</span></td>
        <td>${esc(b.track)} R${esc(b.raceNumber)}</td><td class="num">${esc(fmtPrice(b.price))}</td><td class="num">${b.close ? esc(fmtPrice(b.close)) : '-'}</td>
        <td><span class="badge ${statusBadge[b.status] ?? ''}">${esc(b.status)}</span></td></tr>`).join('')}</tbody>
    </table></div>
    ${bets.length > limit ? `<div><button class="btn outlined" type="button" id="fw-more">Show more (${bets.length - limit} left)</button></div>` : ''}
  </section>`;
}

function downloadCsv(bets, state) {
  const cols = ['date', 'jumpUtc', 'code', 'track', 'state', 'raceNumber', 'class', 'distance', 'trackCondition', 'fieldSize', 'name', 'number', 'barrier',
    'jockey', 'trainer', 'weight', 'claim', 'lastStarts', 'speedmap', 'indicators', 'mover', 'test', 'stake', 'price', 'early', 'close', 'status', 'returned', 'profit'];
  const cell = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [cols.join(','), ...bets.map((b) => cols.map((c) => cell(b[c])).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `punterlab-forward-${state.test}-${state.code}.csv`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

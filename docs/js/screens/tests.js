// Tests: one card per test with its verdict, chart and progress towards 300 races.

import { getJson } from '../lib/data.js';
import { barChart } from '../lib/chart.js';
import { icon } from '../lib/icons.js';
import { esc, fmtPct, fmtSignedPct } from '../lib/format.js';

const CODES = [['thoroughbred', 'Thoroughbred'], ['greyhound', 'Greyhound']];
let code = 'thoroughbred';
try { code = localStorage.getItem('punterlab.testsCode') || 'thoroughbred'; } catch { /* ignore */ }

const VERDICT_BADGE = { 'Insufficient data': 'warning', Edge: 'primary', 'No edge': 'secondary', Inconclusive: 'outlined' };

function verdictBadge(v) {
  return `<span class="badge ${VERDICT_BADGE[v] || 'outlined'}">${esc(v || 'Insufficient data')}</span>`;
}

function progress(n, min) {
  const pct = Math.min(100, (n / min) * 100);
  return `<div class="row between"><span class="t-label">Races logged</span><span class="mono">${n} / ${min}</span></div>
    <div class="progress" role="progressbar" aria-label="Races logged" aria-valuemin="0" aria-valuemax="${min}" aria-valuenow="${n}"><span style="width:${pct}%"></span></div>`;
}

const roiOf = (x) => x?.all?.roi ?? null;
const roiN = (x) => x?.all?.races ?? 0;
const ciText = (ci) => (ci ? ` (95% interval ${fmtSignedPct(ci[0], 0)} to ${fmtSignedPct(ci[1], 0)})` : '');

function lagCard(t, d, base, min) {
  const chart = barChart([
    { label: 'Early', values: [{ v: roiOf(d?.roiEarly) }] },
    { label: 'Close', values: [{ v: roiOf(d?.roiClose), cls: 'alt' }] },
    { label: 'Fav', values: [{ v: roiOf(base?.favourite), cls: 'alt' }] },
    { label: 'Random', values: [{ v: roiOf(base?.random), cls: 'alt' }] },
  ], { format: (v) => fmtSignedPct(v, 0), title: 'Flat-stake ROI: early price, close price and baselines', emptyGroups: 4 });
  const facts = d?.runners ? `<p class="hint" style="margin:0">${d.runners} runners in ${d.n} races. Early price longer than the close for ${esc(fmtPct(d.pctEarlyLonger, 0))}. Mean drift in implied probability ${esc(fmtSignedPct(d.meanDrift, 2))}.</p>
    <p class="hint" style="margin:0">ROI at early price ${esc(fmtSignedPct(roiOf(d.roiEarly)))}${esc(ciText(d.roiEarly?.all?.ci))}.</p>` : '<p class="hint" style="margin:0">No runners with a price captured at least 30 minutes before the jump yet.</p>';
  return card(t, d, chart, facts, min, '<div class="legend"><span><i style="background:var(--primary)"></i>Back all at early price</span><span><i style="background:var(--on-surface-variant)"></i>Close and baselines</span></div>');
}

function flbCard(t, d, min) {
  const bands = d?.bands?.filter((b) => b.runners > 0) || [];
  const chart = barChart(bands.map((b) => ({
    label: b.band.replace('$', ''),
    values: [{ v: b.impliedPct, cls: 'alt', name: 'implied' }, { v: b.actualPct, name: 'actual' }],
  })), { format: (v) => fmtPct(v, 0), title: 'Implied versus actual win rate by price band', emptyGroups: 6 });
  const best = d?.bestBandInSample;
  const facts = bands.length
    ? `<p class="hint" style="margin:0">${bands.reduce((s, b) => s + b.runners, 0)} runners across ${bands.length} price bands. ${best ? `Best band in-sample: ${esc(best.band)}.` : 'No band has 30 in-sample races yet.'}</p>`
    : '<p class="hint" style="margin:0">No settled races yet.</p>';
  return card(t, d, chart, facts, min, '<div class="legend"><span><i style="background:var(--on-surface-variant)"></i>Implied by price</span><span><i style="background:var(--primary)"></i>Actual win rate</span></div>');
}

function overroundCard(t, d, min) {
  const tracks = (d?.byTrack || []).slice(0, 6);
  const chart = barChart(tracks.map((x) => ({ label: x.track.length > 9 ? `${x.track.slice(0, 8)}.` : x.track, values: [{ v: x.mean }] })),
    { format: (v) => fmtPct(v, 0), title: 'Average overround by track at the close', emptyGroups: 5 });
  const facts = d?.close?.races
    ? `<p class="hint" style="margin:0">Average book at the close ${esc(fmtPct(1 + d.close.mean, 1))} (overround ${esc(fmtPct(d.close.mean, 1))})${esc(ciText(d.close.ci))}, ${d.close.races} races.${d.late?.races ? ` At the late price ${esc(fmtPct(d.late.mean, 1))}, ${d.late.races} races.` : ''}</p>`
    : '<p class="hint" style="margin:0">No settled races yet.</p>';
  return card(t, d, chart, facts, min, '');
}

function card(t, d, chart, facts, min, legend) {
  return `<section class="card" aria-labelledby="t-${t.id}">
    <div class="card-head"><h2 class="t-card" id="t-${t.id}">${esc(t.name)}</h2>${verdictBadge(d?.verdict)}</div>
    <p class="t-body muted" style="margin:0">${esc(t.description)}</p>
    ${chart}${legend}
    ${facts}
    ${progress(d?.n ?? 0, min)}
  </section>`;
}

const FALLBACK_TESTS = [
  { id: 'price-lag', name: 'Price lag', description: 'Does the early price beat the closing price on average?' },
  { id: 'favourite-longshot', name: 'Favourite-longshot bias', description: 'Do runners in each price band win as often as their price implies?' },
  { id: 'overround', name: 'Overround', description: 'How much the bookmaker\'s win market adds up to over 100%.' },
];

export async function render(root, ui) {
  root.innerHTML = `<div style="height:20px"></div><div style="height:58px"></div>${ui.skeleton(3, 'tall')}`;
  const a = await getJson('analysis.json', { optional: true, fallback: { tests: [] } });
  if (!ui.isCurrent()) return;
  const min = a.minRaces || 300;

  const draw = () => {
    const tests = a.tests?.length ? a.tests : FALLBACK_TESTS;
    const base = a.baselines?.[code];
    const byId = Object.fromEntries(tests.map((t) => [t.id, t]));
    const get = (id) => byId[id]?.byCode?.[code];
    root.innerHTML = `
      <p class="t-body muted" style="margin:0">No verdict until each test has ${min} races.</p>
      <div class="chips" role="group" aria-label="Racing code">
        ${CODES.map(([id, label]) => `<button class="chip" type="button" data-code="${id}" aria-pressed="${code === id}">${code === id ? icon('check') : ''}${label}</button>`).join('')}
      </div>
      ${lagCard(byId['price-lag'] || FALLBACK_TESTS[0], get('price-lag'), base, min)}
      ${flbCard(byId['favourite-longshot'] || FALLBACK_TESTS[1], get('favourite-longshot'), min)}
      ${overroundCard(byId.overround || FALLBACK_TESTS[2], get('overround'), min)}
      <section class="card" aria-labelledby="base-h">
        <h2 class="t-card" id="base-h">Baselines</h2>
        <p class="t-body muted" style="margin:0">A strategy only counts if it beats both of these out of sample.</p>
        <ul class="list" style="padding:0;margin:0;list-style:none">
          ${[['Back the favourite', base?.favourite], ['Random selection', base?.random]].map(([name, x]) => `
          <li class="row between" style="min-height:48px">
            <span>${name}</span>
            <span class="money">${roiN(x) ? `${esc(fmtSignedPct(roiOf(x)))} <span class="hint">n=${roiN(x)}</span>` : '<span class="muted">No data yet</span>'}</span>
          </li>`).join('')}
        </ul>
      </section>
      <p class="hint" style="margin:0">${a.generated?.utc ? `Computed ${esc(new Date(a.generated.utc).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane', dateStyle: 'medium', timeStyle: 'short' }))} Brisbane. ${esc(a.split?.note || '')}` : 'Not computed yet.'}</p>
    `;
    root.querySelectorAll('[data-code]').forEach((b) => b.addEventListener('click', () => {
      code = b.dataset.code;
      try { localStorage.setItem('punterlab.testsCode', code); } catch { /* ignore */ }
      draw();
      root.querySelector(`[data-code="${code}"]`)?.focus();
    }));
  };
  draw();
}

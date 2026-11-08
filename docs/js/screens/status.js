// Status: one card per data source, job run times, and the gap and error log.

import { getJson } from '../lib/data.js';
import { icon } from '../lib/icons.js';
import { esc, fmtDateTime, fmtUtc } from '../lib/format.js';

const SOURCES = [
  ['ladbrokes', 'Ladbrokes prices', 'snapshot'],
  ['racing-results', 'Racing results', 'results'],
  ['betfair', 'Betfair Exchange', null],
];
const STATE_BADGE = { OK: 'primary', Error: 'error', 'Not connected': 'warning' };

const when = (s) => (s?.utc ? `${esc(fmtDateTime(s.utc))} Brisbane<br><span class="mono hint">${esc(fmtUtc(s.utc))}</span>` : '<span class="muted">No runs yet</span>');

// Expected gaps between runs during racing hours (10:00 to 23:59 Brisbane), with slack for late cron.
const EXPECTED_MINS = { snapshot: 20, results: 45 };

function stale(job, lastRun) {
  if (!job || !lastRun?.utc) return '';
  const hour = Number(new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Brisbane', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  const mins = Math.round((Date.now() - new Date(lastRun.utc).getTime()) / 60000);
  if (hour < 10 || mins <= EXPECTED_MINS[job]) return '';
  return `<p class="msg-warn" style="margin:0">Last run ${mins} min ago. GitHub can delay or skip scheduled runs, so some prices may be missing.</p>`;
}

export async function render(root, ui) {
  root.innerHTML = ui.skeleton(3) + ui.skeleton(1, 'tall');
  const s = await getJson('status.json', { optional: true, fallback: { jobs: {}, sources: {}, log: [] } });
  if (!ui.isCurrent()) return;

  const sourceCards = SOURCES.map(([id, label, job]) => {
    const src = s.sources?.[id] || {};
    const state = src.state || 'Not connected';
    const j = job ? s.jobs?.[job] : null;
    return `<section class="card" aria-labelledby="src-${id}">
      <div class="card-head"><h2 class="t-card" id="src-${id}">${esc(src.label || label)}</h2>
        <span class="badge ${STATE_BADGE[state] || 'outlined'}">${state === 'Error' ? icon('alert', 'icon-sm') : ''}${esc(state)}</span></div>
      ${job ? `<div class="row between" style="align-items:flex-start"><span class="t-label">Last ${job} run</span><span style="text-align:right">${when(j?.lastRun)}</span></div>` : ''}
      ${stale(job, j?.lastRun)}
      ${j?.counts ? `<p class="hint" style="margin:0">${esc(Object.entries(j.counts).map(([k, v]) => `${k.replace(/([A-Z])/g, ' $1').toLowerCase()} ${v}`).join(', '))}</p>` : ''}
      ${src.lastError ? `<p class="msg-error" style="margin:0">${esc(src.lastError)}</p>` : ''}
      ${src.note ? `<p class="hint" style="margin:0">${esc(src.note)}</p>` : ''}
    </section>`;
  }).join('');

  const log = (s.log || []).filter((e) => e.level === 'gap' || e.level === 'error').slice(0, 30);
  const a = s.jobs?.analysis;

  root.innerHTML = `
    ${sourceCards}
    <section class="card" aria-labelledby="ana-h">
      <div class="row between" style="align-items:flex-start"><h2 class="t-card" id="ana-h">Analysis</h2><span style="text-align:right">${when(a?.lastRun)}</span></div>
    </section>
    <section class="card" aria-labelledby="log-h">
      <h2 class="t-card" id="log-h">Errors and gaps</h2>
      <p class="hint" style="margin:0">Gaps are logged, not fatal. A run that misses a price records it here and carries on.</p>
      ${log.length ? `<ul class="log" style="padding:0;margin:0;list-style:none">${log.map((e) => `<li class="log-item">
          <span class="badge ${e.level === 'error' ? 'error' : 'warning'}">${e.level === 'error' ? 'Error' : 'Gap'}</span>
          <span class="t-body">${esc(e.message)}</span>
          <span class="when">${esc(fmtDateTime(e.utc))} Brisbane · ${esc(fmtUtc(e.utc))}</span>
        </li>`).join('')}</ul>` : '<p class="empty-state" style="margin:0">No errors or gaps logged.</p>'}
    </section>
    <p class="footer">Paper trading and research only. Not financial advice. Gambling Help Online: <a href="tel:1800858858">1800 858 858</a>.</p>
  `;
}

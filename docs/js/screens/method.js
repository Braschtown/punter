// Method: where the project stands against docs/METHOD.md, read from progress.json on the data branch.
// No fallback phase data: if progress.json cannot be read, the router shows the error card.

import { getJson } from '../lib/data.js';
import { icon } from '../lib/icons.js';
import { esc, fmtDateTime, fmtUtc } from '../lib/format.js';

const METHOD_URL = 'https://github.com/Braschtown/punter/blob/main/docs/METHOD.md';
const PROGRESS_URL = 'https://github.com/Braschtown/punter/blob/main/docs/PROGRESS.md';
const STATUS = {
  done: ['Done', 'primary'],
  'in progress': ['In progress', 'secondary'],
  blocked: ['Blocked', 'warning'],
  'not started': ['Not started', 'outlined'],
};

function chip(status) {
  const [label, cls] = STATUS[status] || [status || 'Unknown', 'outlined'];
  return `<span class="badge ${cls}">${status === 'blocked' ? icon('alert', 'icon-sm') : ''}${esc(label)}</span>`;
}

export async function render(root, ui) {
  root.innerHTML = ui.skeleton(1, 'tall') + ui.skeleton(4, 'short');
  const p = await getJson('progress.json');
  if (!ui.isCurrent()) return;
  if (!Array.isArray(p?.phases) || !p.phases.length) throw new Error('progress.json has no phases.');

  const phases = [...p.phases].sort((a, b) => a.id - b.id);
  const current = phases.find((x) => x.status !== 'done');
  const done = phases.filter((x) => x.status === 'done').length;
  const blockers = Array.isArray(p.blockers) ? p.blockers : [];

  root.innerHTML = `
    <section class="card" aria-labelledby="cur-h">
      ${current ? `
        <p class="t-label">Current phase ${esc(current.id)} of ${phases.length}</p>
        <div class="card-head"><h2 class="t-card" id="cur-h">${esc(current.name)}</h2>${chip(current.status)}</div>
        ${current.note ? `<p class="t-body muted" style="margin:0">${esc(current.note)}</p>` : ''}
        <div><p class="t-label">Next gate</p><p class="t-body" style="margin:4px 0 0">${esc(current.gate || 'Not recorded.')}</p></div>
      ` : '<h2 class="t-card" id="cur-h">All phases done</h2>'}
      <div class="row between"><span class="t-label">Phases done</span><span class="mono">${done} / ${phases.length}</span></div>
      <div class="progress" role="progressbar" aria-label="Phases done" aria-valuemin="0" aria-valuemax="${phases.length}" aria-valuenow="${done}"><span style="width:${(done / phases.length) * 100}%"></span></div>
      ${p.updated ? `<p class="hint" style="margin:0">Updated ${esc(fmtDateTime(p.updated))} Brisbane · <span class="mono">${esc(fmtUtc(p.updated))}</span></p>` : ''}
    </section>

    ${blockers.length ? `<section class="card" aria-labelledby="blk-h">
      <h2 class="t-card" id="blk-h">Blockers</h2>
      <ul class="log" style="padding:0;margin:0;list-style:none">${blockers.map((b) => `<li class="log-item">
        <span class="badge warning">${icon('alert', 'icon-sm')}Blocker</span><span class="t-body">${esc(b)}</span></li>`).join('')}</ul>
    </section>` : ''}

    <section class="card" aria-labelledby="gate-h">
      <h2 class="t-card" id="gate-h">The go / no-go gate</h2>
      <p class="t-body" style="margin:0">No stake is sized from a model until it beats the de-vigged Betfair Starting Price on log loss, measured on races the model was not fitted on.</p>
      <p class="t-body muted" style="margin:0">If it cannot, there is no edge, and no staking fraction fixes that. "No edge found" is a valid result.</p>
    </section>

    <h2 class="t-card section-title">Phases</h2>
    <ol class="list" style="padding:0;margin:0;list-style:none">${phases.map((x) => `<li class="list-card" style="align-items:flex-start"${x === current ? ' aria-current="step"' : ''}>
        <span class="mono muted" style="min-width:20px">${esc(x.id)}</span>
        <div class="grow" style="min-width:0;display:flex;flex-direction:column;gap:4px">
          <div class="card-head"><p class="t-card" style="margin:0">${esc(x.name)}</p>${chip(x.status)}</div>
          ${x.note ? `<p class="hint" style="margin:0">${esc(x.note)}</p>` : ''}
          ${x.gate ? `<p class="hint" style="margin:0"><strong>Gate:</strong> ${esc(x.gate)}</p>` : ''}
        </div>
      </li>`).join('')}</ol>

    <section class="card" aria-labelledby="docs-h">
      <h2 class="t-card" id="docs-h">Read more</h2>
      <nav aria-label="Method documents">
        <a class="link-row" href="${METHOD_URL}" target="_blank" rel="noopener noreferrer"><span>Full method (METHOD.md)</span>${icon('external')}<span class="sr-only">(opens in a new tab)</span></a>
        <a class="link-row" href="${PROGRESS_URL}" target="_blank" rel="noopener noreferrer"><span>Progress with evidence (PROGRESS.md)</span>${icon('external')}<span class="sr-only">(opens in a new tab)</span></a>
      </nav>
    </section>
  `;
}

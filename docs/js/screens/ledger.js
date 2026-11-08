// Ledger: settled paper P&L, stats, open and settled bets, and export of browser-only picks.

import { downloadJson, getPicks, removePick } from '../lib/local.js';
import { loadLedger, settledPnl } from '../lib/ledger.js';
import { icon } from '../lib/icons.js';
import { esc, fmtDate, fmtMoney, fmtPct, fmtPrice, fmtSigned } from '../lib/format.js';

const BADGE = {
  Open: 'secondary', Won: 'primary', Lost: '', Scratched: 'outlined', Void: 'outlined',
};

function betRow(b) {
  const when = b.jumpUtc ? fmtDate(b.jumpUtc) : b.placed?.date || '';
  const result = b.status === 'Open' ? '' : `<span class="hint">Returned ${esc(fmtMoney(b.returns ?? 0))}</span>`;
  return `<li class="list-card">
    <div class="grow">
      <p class="t-card ellipsis" style="margin:0">${esc(b.runner)}</p>
      <p class="hint ellipsis" style="margin:0">${esc(b.track)} R${esc(b.raceNumber)} · ${esc(when)}</p>
      <p class="hint ellipsis" style="margin:0">Taken at ${esc(fmtPrice(b.price))}${b.closePrice ? ` · closed ${esc(fmtPrice(b.closePrice))}` : ''}</p>
      <div class="row wrap" style="margin-top:4px">
        <span class="badge ${BADGE[b.status] ?? ''}">${esc(b.status)}</span>
        ${b.local ? '<span class="badge outlined">This browser only</span>' : ''}
        ${b.local ? `<button class="btn text" type="button" data-remove="${esc(b.id)}" aria-label="Delete pick on ${esc(b.runner)}">${icon('trash', 'icon-sm')}Delete</button>` : ''}
      </div>
    </div>
    <div class="money" style="display:flex;flex-direction:column;align-items:flex-end">
      <span>${esc(fmtMoney(b.stake))}</span>${result}
    </div>
  </li>`;
}

export async function render(root, ui) {
  root.innerHTML = `${ui.skeleton(1, 'tall')}<div class="tiles">${ui.skeleton(3, 'short')}</div>${ui.skeleton(3, 'short')}`;
  const l = await loadLedger();
  if (!ui.isCurrent()) return;

  const settled = l.settled;
  const graded = settled.filter((b) => b.status === 'Won' || b.status === 'Lost');
  const wins = graded.filter((b) => b.status === 'Won').length;
  const pnl = settledPnl(settled);
  const staked = settled.reduce((s, b) => s + b.stake, 0);

  root.innerHTML = `
    <section class="card" aria-labelledby="pnl-h">
      <p class="t-label" id="pnl-h">Settled paper P&amp;L</p>
      <p class="t-hero" style="margin:0;color:${pnl > 0 ? 'var(--primary)' : 'var(--on-surface)'}">${esc(settled.length ? fmtSigned(pnl) : fmtMoney(0))}</p>
      <p class="hint" style="margin:0">${settled.length ? `${settled.length} settled, ${esc(fmtMoney(staked))} staked. Paper money only.` : 'No settled bets yet.'}</p>
    </section>
    <div class="tiles">
      <div class="tile"><p class="t-label">Strike rate</p><span class="v">${graded.length ? esc(fmtPct(wins / graded.length, 0)) : '-'}</span><span class="hint">${wins} of ${graded.length}</span></div>
      <div class="tile"><p class="t-label">Bets</p><span class="v">${l.bets.length}</span><span class="hint">${l.open.length} open</span></div>
      <div class="tile"><p class="t-label">Cap left</p><span class="v">${esc(fmtMoney(l.capLeft))}</span><span class="hint">this week</span></div>
    </div>
    ${l.capLeft <= 0 ? '<p class="msg-warn" role="status">Weekly cap reached. New paper picks are blocked until Monday.</p>' : ''}

    <h2 class="t-card section-title">Open</h2>
    ${l.open.length ? `<ul class="list" style="padding:0;margin:0;list-style:none">${l.open.map(betRow).join('')}</ul>` : '<p class="card empty-state" style="margin:0">No open paper bets.</p>'}

    <h2 class="t-card section-title">Settled</h2>
    ${settled.length ? `<ul class="list" style="padding:0;margin:0;list-style:none">${settled.map(betRow).join('')}</ul>` : '<p class="card empty-state" style="margin:0">No settled bets yet.</p>'}

    <section class="card low" aria-labelledby="export-h">
      <h2 class="t-card" id="export-h">Save picks to the repo</h2>
      <p class="t-body muted" style="margin:0">Picks logged here live in this browser only (${getPicks().length} saved). The app cannot write to GitHub. Export them, then add the entries to <code>ledger.json</code> on the <code>data</code> branch (see the README). The results job settles them from then on.</p>
      <div><button class="btn tonal" type="button" id="export" ${getPicks().length ? '' : 'disabled'}>${icon('download', 'icon-sm')}Export JSON</button></div>
    </section>
  `;

  root.querySelector('#export')?.addEventListener('click', () => {
    const picks = getPicks().map(({ local, settledInBrowser, ...p }) => ({ ...p, status: 'Open', returns: null }));
    downloadJson(`punterlab-picks-${new Date().toISOString().slice(0, 10)}.json`, { bets: picks });
  });
  root.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => {
    if (confirm('Delete this paper pick from this browser? This cannot be undone.')) {
      removePick(b.dataset.remove);
      ui.rerender();
    }
  }));
}

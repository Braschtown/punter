// My bets: real bets placed by hand on Ladbrokes, read from my-bets.json on the data branch.
// Kept apart from the paper ledger so they never mix into any test or the weekly cap.

import { getJson } from '../lib/data.js';
import { summarise, summariseBy } from '../lib/mybets.js';
import { esc, fmtMoney, fmtPct, fmtPrice, fmtSigned, fmtSignedPct } from '../lib/format.js';

const CODE = { thoroughbred: 'Thoroughbred', greyhound: 'Greyhound' };
const BADGE = { Won: 'primary', Lost: '', Refunded: 'outlined' };
const PAGE = 30;

export function ledgerTabs(current) {
  return `<nav class="segmented" aria-label="Ledger type">
    <a href="#/ledger"${current === 'ledger' ? ' aria-current="page"' : ''}>Paper bets</a>
    <a href="#/mybets"${current === 'mybets' ? ' aria-current="page"' : ''}>My bets</a>
  </nav>`;
}

// Dates in the file are Brisbane calendar dates, so format them without a time zone shift.
const dayFmt = new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const fmtDay = (ymd) => dayFmt.format(new Date(`${ymd}T00:00:00Z`));

function table(rows, label) {
  return `<div class="table-wrap"><table class="dtable">
    <thead><tr><th scope="col">${esc(label)}</th><th scope="col">Bets</th><th scope="col">Strike</th><th scope="col">Staked</th><th scope="col">Profit</th><th scope="col">ROI</th></tr></thead>
    <tbody>${rows.map((r) => `<tr>
      <td>${esc(r.label)}</td>
      <td class="num">${r.bets}</td>
      <td class="num">${esc(fmtPct(r.strikeRate, 0))}</td>
      <td class="num">${esc(fmtMoney(r.cashStaked))}</td>
      <td class="num">${esc(fmtSigned(r.profit))}</td>
      <td class="num">${esc(fmtSignedPct(r.roi, 0))}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function betRow(b) {
  const boost = b.priceBeforeBoost ? ` · boosted from ${esc(fmtPrice(b.priceBeforeBoost))}` : '';
  return `<li class="list-card">
    <div class="grow">
      <p class="t-card ellipsis" style="margin:0">${esc(b.runnerNumber)}. ${esc(b.runner)}</p>
      <p class="hint ellipsis" style="margin:0">${esc(b.track)} R${esc(b.raceNumber)} · ${esc(fmtDay(b.date))} ${esc(b.time)}</p>
      <p class="hint ellipsis" style="margin:0">${esc(CODE[b.code] || b.code)} · ${esc(fmtPrice(b.price))}${boost}</p>
      <div class="row wrap" style="margin-top:4px">
        <span class="badge ${BADGE[b.result] ?? ''}">${esc(b.result)}</span>
        ${b.funding === 'bonus' ? '<span class="badge outlined">Bonus bet</span>' : ''}
      </div>
    </div>
    <div class="money" style="display:flex;flex-direction:column;align-items:flex-end">
      <span>${esc(fmtMoney(b.stake))}</span><span class="hint">${esc(fmtSigned(b.profit))}</span>
    </div>
  </li>`;
}

export async function render(root, ui) {
  root.innerHTML = `${ledgerTabs('mybets')}${ui.skeleton(1, 'tall')}<div class="tiles">${ui.skeleton(3, 'short')}</div>${ui.skeleton(3, 'short')}`;
  const file = await getJson('my-bets.json', { optional: true, fallback: null });
  if (!ui.isCurrent()) return;
  if (!file?.bets?.length) {
    root.innerHTML = `${ledgerTabs('mybets')}<section class="card"><h2 class="t-card">No real bets recorded</h2>
      <p class="t-body muted" style="margin:0">Add them to <code>my-bets.json</code> on the <code>data</code> branch.</p></section>`;
    return;
  }

  const bets = [...file.bets].sort((a, b) => (`${b.date}${b.time}`).localeCompare(`${a.date}${a.time}`));
  const all = summarise(bets);
  const byYear = summariseBy(bets, (b) => b.date.slice(0, 4), { desc: true }).map((r) => ({ ...r, label: r.key }));
  const byCode = summariseBy(bets, (b) => b.code).map((r) => ({ ...r, label: CODE[r.key] || r.key }));
  let shown = PAGE;

  const draw = () => {
    root.innerHTML = `
      ${ledgerTabs('mybets')}
      <section class="card" aria-labelledby="real-h">
        <p class="t-label" id="real-h">Real profit, all time</p>
        <p class="t-hero" style="margin:0;color:${all.profit > 0 ? 'var(--primary)' : 'var(--on-surface)'}">${esc(fmtSigned(all.profit))}</p>
        <p class="hint" style="margin:0">${all.bets} bets, ${esc(fmtMoney(all.cashStaked))} cash staked on Ladbrokes. Real money, kept apart from the paper trial.</p>
      </section>
      <div class="tiles">
        <div class="tile"><p class="t-label">Strike rate</p><span class="v">${esc(fmtPct(all.strikeRate, 0))}</span><span class="hint">${all.winners} of ${all.bets}</span></div>
        <div class="tile"><p class="t-label">ROI</p><span class="v">${esc(fmtSignedPct(all.roi, 0))}</span><span class="hint">on cash staked</span></div>
        <div class="tile"><p class="t-label">Returned</p><span class="v">${esc(fmtMoney(all.returned))}</span><span class="hint">from winners</span></div>
      </div>
      <p class="hint" style="margin:0">Hand-picked bets are not a test of any method: too few, and chosen after the fact. Refunds are left out. Bonus bets count their return as profit and no cash stake.</p>

      <h2 class="t-card section-title">By year</h2>
      <section class="card">${table(byYear, 'Year')}</section>

      <h2 class="t-card section-title">By code</h2>
      <section class="card">${table(byCode, 'Code')}</section>

      <h2 class="t-card section-title">Bets</h2>
      <ul class="list" style="padding:0;margin:0;list-style:none">${bets.slice(0, shown).map(betRow).join('')}</ul>
      ${shown < bets.length ? `<div><button class="btn outlined" type="button" id="more">Show more (${bets.length - shown} left)</button></div>` : ''}
    `;
    root.querySelector('#more')?.addEventListener('click', () => { shown += PAGE; draw(); });
  };
  draw();
}

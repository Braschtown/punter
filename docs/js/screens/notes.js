// Notes: the real-bet record, a replay log kept in this browser, and stewards' report links.

import { getJson } from '../lib/data.js';
import { addReplay, downloadJson, getReplays, removeReplay, storageAvailable, uid } from '../lib/local.js';
import { icon } from '../lib/icons.js';
import { bneDate, esc, fmtDateTime, fmtPrice } from '../lib/format.js';

const TAGS = ['Held up', 'Raced wide', 'No cover'];
const STEWARDS = [
  ['Racing Queensland (QRIC)', 'https://qric.qld.gov.au/stewards-reports'],
  ['Racing NSW', 'https://racing.racingnsw.com.au/FreeFields/Race_Diary_Stewards.aspx'],
  ['Racing Victoria', 'https://www.racingvictoria.com.au/integrity/stewards/stewards-reports'],
];

function realBetCard(n) {
  return `<section class="card" aria-labelledby="note-${esc(n.id)}">
    <div class="card-head">
      <div>
        <h2 class="t-card" id="note-${esc(n.id)}">${esc(n.runner)}</h2>
        <p class="t-label">${esc(n.race)} · ${esc(n.track)}</p>
      </div>
      <span class="badge tertiary">Real bet</span>
    </div>
    <div class="row between">
      <span>${esc(n.bet)}</span>
      <span class="money">${esc(fmtPrice(n.price))}</span>
    </div>
    <div><span class="badge primary">${esc(n.outcome)}</span></div>
    <p class="t-body muted" style="margin:0">Hypothesis: ${esc(n.hypothesis)}</p>
  </section>`;
}

function replayItem(r) {
  return `<li class="log-item" style="grid-template-columns:1fr auto">
    <div>
      <p class="t-body" style="margin:0"><strong>${esc(r.runner)}</strong>${r.race ? ` · ${esc(r.race)}` : ''}</p>
      ${r.tags.length ? `<div class="row wrap" style="margin:4px 0">${r.tags.map((t) => `<span class="badge secondary">${esc(t)}</span>`).join('')}</div>` : ''}
      ${r.text ? `<p class="t-body muted" style="margin:0">${esc(r.text)}</p>` : ''}
      <p class="hint" style="margin:4px 0 0">${esc(fmtDateTime(r.createdUtc))}</p>
    </div>
    <button class="btn text" type="button" data-remove="${esc(r.id)}" aria-label="Delete replay note on ${esc(r.runner)}">${icon('trash', 'icon-sm')}</button>
  </li>`;
}

export async function render(root, ui) {
  root.innerHTML = ui.skeleton(1, 'tall') + ui.skeleton(1, 'tall') + ui.skeleton(1);
  const notes = await getJson('notes.json', { optional: true, fallback: { notes: [], replays: [] } });
  if (!ui.isCurrent()) return;

  const selected = new Set();
  const draw = () => {
    const replays = getReplays();
    root.innerHTML = `
      ${notes.notes.filter((n) => n.kind === 'real-bet').map(realBetCard).join('') || ''}

      <section class="card" aria-labelledby="replay-h">
        <h2 class="t-card" id="replay-h">Replay log</h2>
        <p class="hint" style="margin:0">Runners the replay suggests the market may underrate. Saved in this browser only.</p>
        ${!storageAvailable ? '<p class="msg-error" role="alert">This browser is blocking local storage, so replay notes cannot be saved here.</p>' : ''}
        <form id="replay-form" novalidate style="display:flex;flex-direction:column;gap:12px">
          <div class="row" style="gap:12px;align-items:flex-start">
            <div class="field grow"><label for="rp-runner">Runner</label><input id="rp-runner" type="text" maxlength="60" required></div>
            <div class="field grow"><label for="rp-race">Race</label><input id="rp-race" type="text" maxlength="60" placeholder="Q1 Lakeside R4"></div>
          </div>
          <div class="chips" role="group" aria-label="Quick tags">
            ${TAGS.map((t) => `<button class="chip" type="button" data-tag="${esc(t)}" aria-pressed="${selected.has(t)}">${selected.has(t) ? icon('check') : ''}${esc(t)}</button>`).join('')}
          </div>
          <div class="field"><label for="rp-text">What you saw</label><textarea id="rp-text" maxlength="500"></textarea></div>
          <div id="rp-msg" role="alert"></div>
          <div class="row wrap"><button class="btn filled" type="submit">Save note</button>
            <button class="btn text" type="button" id="rp-export" ${replays.length ? '' : 'disabled'}>${icon('download', 'icon-sm')}Export JSON</button></div>
        </form>
        ${replays.length ? `<ul class="log" style="padding:0;margin:0;list-style:none">${replays.map(replayItem).join('')}</ul>` : '<p class="empty-state" style="margin:0">No replay notes yet.</p>'}
      </section>

      <section class="card" aria-labelledby="stew-h">
        <h2 class="t-card" id="stew-h">Stewards' reports</h2>
        <nav aria-label="Stewards' reports">
          ${STEWARDS.map(([name, url]) => `<a class="link-row" href="${esc(url)}" target="_blank" rel="noopener noreferrer">
            <span>${esc(name)}</span>${icon('external')}<span class="sr-only">(opens in a new tab)</span></a>`).join('')}
        </nav>
      </section>
    `;

    root.querySelectorAll('[data-tag]').forEach((b) => b.addEventListener('click', () => {
      const t = b.dataset.tag;
      if (selected.has(t)) selected.delete(t); else selected.add(t);
      b.setAttribute('aria-pressed', String(selected.has(t)));
      b.innerHTML = `${selected.has(t) ? icon('check') : ''}${esc(t)}`;
    }));
    root.querySelector('#replay-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const runner = root.querySelector('#rp-runner').value.trim();
      const msg = root.querySelector('#rp-msg');
      if (!runner) { msg.className = 'msg-error'; msg.textContent = 'Enter the runner\'s name.'; root.querySelector('#rp-runner').focus(); return; }
      const ok = addReplay({
        id: uid('replay'),
        createdUtc: new Date().toISOString(),
        date: bneDate(),
        runner,
        race: root.querySelector('#rp-race').value.trim(),
        tags: [...selected],
        text: root.querySelector('#rp-text').value.trim(),
      });
      if (!ok) { msg.className = 'msg-error'; msg.textContent = 'Could not save: this browser is blocking local storage.'; return; }
      selected.clear();
      draw();
    });
    root.querySelector('#rp-export')?.addEventListener('click', () => {
      downloadJson(`punterlab-replays-${bneDate()}.json`, { replays: getReplays() });
    });
    root.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => {
      if (confirm('Delete this replay note from this browser? This cannot be undone.')) { removeReplay(b.dataset.remove); draw(); }
    }));
  };
  draw();

  ui.setFab({
    icon: 'plus',
    ariaLabel: 'Add note',
    onClick: () => {
      const el = root.querySelector('#rp-runner');
      el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
      el.focus({ preventScroll: true });
    },
  });
}

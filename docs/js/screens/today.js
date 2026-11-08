// Today: weekly paper stake, code filter, and the next races to jump.

import { getDay } from '../lib/data.js';
import { addPick, storageAvailable, uid } from '../lib/local.js';
import { loadLedger } from '../lib/ledger.js';
import { icon } from '../lib/icons.js';
import { bneDate, countdown, esc, fmtMoney, fmtMoneyShort, fmtPrice, fmtTime } from '../lib/format.js';

const FILTERS = [['all', 'All'], ['thoroughbred', 'Thoroughbred'], ['greyhound', 'Greyhound']];
const MAX_CARDS = 12;
let filter = 'all';
try { filter = localStorage.getItem('punterlab.filter') || 'all'; } catch { /* ignore */ }
let timer = null;

export function unmount() { clearInterval(timer); timer = null; }

function liveRunners(race) {
  return Object.entries(race.snap?.runners || {})
    .map(([runnerId, r]) => ({ runnerId, ...r }))
    .filter((r) => !r.scratched);
}

function favourite(race) {
  const priced = liveRunners(race).filter((r) => r.last?.price);
  return priced.sort((a, b) => a.last.price - b.last.price)[0] || null;
}

function priceBlock(r) {
  const now = r.last?.price;
  const early = r.early?.price;
  if (!now) return '<span class="muted">No price yet</span>';
  let move = '';
  let cls = 'price';
  if (early && early !== now) {
    const drifting = now > early;
    if (drifting) cls += ' drift';
    move = `<span class="price-was" aria-label="Early price ${fmtPrice(early)}">${fmtPrice(early)}</span>
      <span class="badge ${drifting ? 'warning' : 'secondary'}">${drifting ? 'Drifting' : 'Firming'}</span>`;
  }
  return `<span class="row wrap">${move}<span class="${cls}" aria-label="Price now ${fmtPrice(now)}">${fmtPrice(now)}</span></span>
    <span class="hint">Price at ${esc(fmtTime(r.last.utc))}</span>`;
}

function raceCard(race, pick) {
  const runners = liveRunners(race);
  const scratched = Object.values(race.snap?.runners || {}).filter((r) => r.scratched).length;
  const shown = pick ? runners.find((r) => r.runnerId === pick.runnerId) || { name: pick.runner } : favourite(race);
  const role = pick ? 'Your paper pick' : 'Market favourite';
  const context = pick?.context || pick?.rationale
    || [race.distance ? `${race.distance} m` : null, runners.length ? `${runners.length} runners` : null, scratched ? `${scratched} scratched` : null].filter(Boolean).join(', ');
  const box = shown?.barrier ? `${race.code === 'greyhound' ? 'Box' : 'Barrier'} ${shown.barrier}` : '';
  return `<article class="card" aria-label="${esc(race.track)} race ${race.raceNumber}">
    <div class="card-head">
      <div>
        <h3 class="t-card ellipsis">${esc(race.track)} R${race.raceNumber}</h3>
        <p class="t-label">${race.code === 'greyhound' ? 'Greyhound' : 'Thoroughbred'} · ${esc(fmtTime(race.jumpUtc))}</p>
      </div>
      <span class="badge secondary" data-countdown="${esc(race.jumpUtc)}">${icon('clock', 'icon-sm')}<span>${esc(countdown(race.jumpUtc))}</span></span>
    </div>
    ${shown ? `<div class="row between" style="align-items:flex-end">
      <div class="grow">
        <p class="t-label">${role}${box ? ` · ${esc(box)}` : ''}</p>
        <p class="t-card ellipsis" style="margin:0">${esc(shown.name)}</p>
      </div>
      <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end">${priceBlock(shown)}</div>
    </div>` : '<p class="muted" style="margin:0">No prices captured yet.</p>'}
    <div class="row between">
      <span class="hint ellipsis">${esc(context)}</span>
      ${pick ? '<span class="badge primary">Logged</span>' : ''}
    </div>
  </article>`;
}

export async function render(root, ui) {
  root.innerHTML = `<div class="skeleton short" aria-hidden="true"></div><div style="height:58px"></div>${ui.skeleton(3)}`;
  const now = new Date();
  const [todayRaces, tomorrowRaces, ledger] = await Promise.all([
    getDay(bneDate(now)),
    getDay(bneDate(new Date(now.getTime() + 86400000))),
    loadLedger(),
  ]);
  if (!ui.isCurrent()) return;

  const upcoming = [...todayRaces, ...tomorrowRaces]
    .filter((r) => !r.result?.final && new Date(r.jumpUtc).getTime() > Date.now() - 2 * 60000)
    .sort((a, b) => a.jumpUtc.localeCompare(b.jumpUtc));
  const picksByRace = new Map(ledger.open.map((b) => [b.raceId, b]));

  const draw = () => {
    const pct = Math.min(100, (ledger.stakedThisWeek / ledger.cap) * 100);
    const shown = upcoming.filter((r) => filter === 'all' || r.code === filter).slice(0, MAX_CARDS);
    root.innerHTML = `
      <section class="card" aria-labelledby="stake-h">
        <p class="t-label" id="stake-h">Weekly paper stake</p>
        <p style="margin:0"><span class="t-big">${esc(fmtMoneyShort(ledger.stakedThisWeek))}</span>
          <span class="muted"> of ${esc(fmtMoneyShort(ledger.cap))} weekly cap</span></p>
        <div class="progress${pct >= 100 ? ' warn' : ''}" role="progressbar" aria-label="Weekly cap used" aria-valuemin="0" aria-valuemax="${ledger.cap}" aria-valuenow="${ledger.stakedThisWeek}"><span style="width:${pct}%"></span></div>
        <p class="hint" style="margin:0">${ledger.open.length} open paper pick${ledger.open.length === 1 ? '' : 's'} · ${esc(fmtMoney(ledger.capLeft))} left this week</p>
      </section>
      <div class="chips" role="group" aria-label="Filter by code">
        ${FILTERS.map(([id, label]) => `<button class="chip" type="button" data-filter="${id}" aria-pressed="${filter === id}">
          ${filter === id ? icon('check') : ''}${label}</button>`).join('')}
      </div>
      <h2 class="t-card section-title">Next to jump</h2>
      ${shown.length ? shown.map((r) => raceCard(r, picksByRace.get(r.raceId))).join('')
        : `<section class="card empty-state"><p style="margin:0">${upcoming.length ? 'No upcoming races for this code in the data yet.' : 'No upcoming races in the data yet. The snapshot job adds races during the day.'}</p></section>`}
    `;
    root.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => {
      filter = b.dataset.filter;
      try { localStorage.setItem('punterlab.filter', filter); } catch { /* ignore */ }
      draw();
      root.querySelector(`[data-filter="${filter}"]`)?.focus();
    }));
  };
  draw();

  clearInterval(timer);
  timer = setInterval(() => {
    root.querySelectorAll('[data-countdown]').forEach((el) => {
      el.querySelector('span').textContent = countdown(el.dataset.countdown);
    });
  }, 30000);

  ui.setFab({ icon: 'plus', label: 'Log pick', onClick: () => openLogPick(ui, upcoming, ledger) });
}

function openLogPick(ui, races, ledger) {
  const d = ui.dialog;
  const pickable = races.filter((r) => liveRunners(r).length && new Date(r.jumpUtc) > new Date());
  d.innerHTML = `<form method="dialog" novalidate>
    <h2 class="t-title" id="dialog-title">Log paper pick</h2>
    ${!storageAvailable ? '<p class="msg-error" role="alert">This browser is blocking local storage, so picks cannot be saved here.</p>' : ''}
    ${pickable.length ? `
    <div class="field"><label for="lp-race">Race</label>
      <select id="lp-race" required>${pickable.map((r) => `<option value="${esc(r.raceId)}">${esc(fmtTime(r.jumpUtc))} · ${esc(r.track)} R${r.raceNumber}</option>`).join('')}</select></div>
    <div class="field"><label for="lp-runner">Runner</label><select id="lp-runner" required></select></div>
    <div class="row" style="gap:12px">
      <div class="field grow"><label for="lp-price">Win price ($)</label><input id="lp-price" type="number" inputmode="decimal" step="0.01" min="1.01" required></div>
      <div class="field grow"><label for="lp-stake">Stake ($)</label><input id="lp-stake" type="number" inputmode="decimal" step="0.5" min="0.5" value="1" required></div>
    </div>
    <div class="field"><label for="lp-why">Why (one line)</label>
      <input id="lp-why" type="text" maxlength="140" placeholder="Market vs form disagreement, not proven overlay"></div>
    <p class="hint">${esc(fmtMoney(ledger.capLeft))} of the ${esc(fmtMoneyShort(ledger.cap))} weekly cap left. Saved in this browser only until you export it from the Ledger.</p>
    <div id="lp-msg" role="alert"></div>` : '<p class="muted">No upcoming races with prices yet. Try again once the snapshot job has run.</p>'}
    <div class="dialog-actions">
      <button class="btn text" type="button" value="cancel" data-close>Cancel</button>
      ${pickable.length ? '<button class="btn filled" type="submit" value="save">Save pick</button>' : ''}
    </div>
  </form>`;
  d.querySelector('[data-close]').addEventListener('click', () => d.close());

  if (pickable.length) {
    const raceSel = d.querySelector('#lp-race');
    const runnerSel = d.querySelector('#lp-runner');
    const priceIn = d.querySelector('#lp-price');
    const fillRunners = () => {
      const race = pickable.find((r) => r.raceId === raceSel.value);
      runnerSel.innerHTML = liveRunners(race)
        .sort((a, b) => (a.barrier || 99) - (b.barrier || 99))
        .map((r) => `<option value="${esc(r.runnerId)}" data-price="${r.last?.price || ''}">${r.barrier ? `${r.barrier}. ` : ''}${esc(r.name)}${r.last?.price ? ` · ${fmtPrice(r.last.price)}` : ''}</option>`).join('');
      priceIn.value = runnerSel.selectedOptions[0]?.dataset.price || '';
    };
    raceSel.addEventListener('change', fillRunners);
    runnerSel.addEventListener('change', () => { priceIn.value = runnerSel.selectedOptions[0]?.dataset.price || ''; });
    fillRunners();

    d.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const msg = d.querySelector('#lp-msg');
      const price = Number(priceIn.value);
      const stake = Number(d.querySelector('#lp-stake').value);
      if (!(price > 1)) { msg.className = 'msg-error'; msg.textContent = 'Enter a win price above $1.00.'; return; }
      if (!(stake > 0)) { msg.className = 'msg-error'; msg.textContent = 'Enter a stake above $0.'; return; }
      if (ledger.stakedThisWeek + stake > ledger.cap) {
        msg.className = 'msg-error';
        msg.textContent = `Blocked: this pick would take the week to ${fmtMoney(ledger.stakedThisWeek + stake)}, over the ${fmtMoneyShort(ledger.cap)} weekly cap. ${fmtMoney(ledger.capLeft)} left.`;
        return;
      }
      const race = pickable.find((r) => r.raceId === raceSel.value);
      const runner = liveRunners(race).find((r) => r.runnerId === runnerSel.value);
      const now = new Date();
      const ok = addPick({
        id: uid('pick'),
        placed: { utc: now.toISOString().replace(/\.\d{3}Z$/, 'Z'), bne: null, date: bneDate(now) },
        source: 'app',
        code: race.code,
        track: race.track,
        raceNumber: race.raceNumber,
        raceId: race.raceId,
        jumpUtc: race.jumpUtc,
        runner: runner.name,
        runnerId: runner.runnerId,
        box: runner.barrier,
        betType: 'Win',
        stake,
        price,
        priceSource: runner.last?.price === price ? `Ladbrokes fixed win captured ${runner.last.utc}` : 'Entered by owner',
        rationale: d.querySelector('#lp-why').value.trim() || 'Market vs form disagreement, not proven overlay',
        status: 'Open',
        returns: null,
      });
      if (!ok) { msg.className = 'msg-error'; msg.textContent = 'Could not save: this browser is blocking local storage.'; return; }
      d.close();
      ui.rerender();
    });
  }
  d.showModal();
}

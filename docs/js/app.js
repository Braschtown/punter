// App shell: hash router, bottom navigation, FAB and shared UI helpers.

import { icon } from './lib/icons.js';
import { esc } from './lib/format.js';
import * as today from './screens/today.js';
import * as ledger from './screens/ledger.js';
import * as tests from './screens/tests.js';
import * as notes from './screens/notes.js';
import * as status from './screens/status.js';
import * as method from './screens/method.js';
import * as forward from './screens/forward.js';

const ROUTES = {
  today: { title: 'Today', label: 'Today', icon: 'today', screen: today },
  ledger: { title: 'Ledger', label: 'Ledger', icon: 'ledger', screen: ledger },
  tests: { title: 'Tests', label: 'Tests', icon: 'tests', screen: tests },
  notes: { title: 'Notes', label: 'Notes', icon: 'notes', screen: notes },
  status: { title: 'Status', label: 'Status', icon: 'status', screen: status },
  method: { title: 'Method', label: 'Method', icon: 'method', screen: method },
  // Reached from the Tests screen, not the bottom bar.
  forward: { title: 'Forward tests', label: 'Forward', icon: 'tests', screen: forward, nav: 'tests', hidden: true, wide: true },
};

const main = document.getElementById('main');
const nav = document.getElementById('nav');
const fab = document.getElementById('fab');
const titleEl = document.getElementById('page-title');
let current = null;
let renderToken = 0;

nav.innerHTML = Object.entries(ROUTES).filter(([, r]) => !r.hidden).map(([id, r]) => `
  <a href="#/${id}" data-route="${id}">
    <span class="ind">${icon(r.icon)}</span>
    <span>${r.label}</span>
  </a>`).join('');

/** Shared helpers handed to every screen. */
export const ui = {
  skeleton(n = 3, cls = '') {
    return Array.from({ length: n }, () => `<div class="skeleton ${cls}" aria-hidden="true"></div>`).join('');
  },
  errorCard(err) {
    return `<section class="card error-card" role="alert">
      <h2 class="t-card">Could not load data</h2>
      <p class="t-body" style="margin:0">${esc(err?.message || err)}</p>
      <div><button class="btn outlined" type="button" data-action="retry">Try again</button></div>
    </section>`;
  },
  setFab(opts) {
    if (!opts) { fab.hidden = true; fab.onclick = null; return; }
    fab.hidden = false;
    fab.className = `fab${opts.label ? '' : ' icon-only'}`;
    fab.innerHTML = `${icon(opts.icon)}${opts.label ? `<span>${esc(opts.label)}</span>` : ''}`;
    if (opts.label) fab.removeAttribute('aria-label');
    else fab.setAttribute('aria-label', opts.ariaLabel);
    fab.onclick = opts.onClick;
  },
  dialog: document.getElementById('dialog'),
  rerender: () => render(),
};

async function render() {
  const id = (location.hash.match(/^#\/(\w+)/) || [])[1];
  const routeId = ROUTES[id] ? id : 'today';
  if (!ROUTES[id] && location.hash !== '#/today') history.replaceState(null, '', '#/today');
  const route = ROUTES[routeId];
  const token = ++renderToken;

  if (current?.screen.unmount) current.screen.unmount();
  current = route;
  titleEl.textContent = route.title;
  document.title = route.title === 'Today' ? 'Punter Lab' : `${route.title} · Punter Lab`;
  document.body.classList.toggle('wide-route', !!route.wide);
  for (const a of nav.querySelectorAll('a')) {
    if (a.dataset.route === (route.nav || routeId)) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  ui.setFab(null);

  try {
    await route.screen.render(main, { ...ui, isCurrent: () => token === renderToken });
  } catch (e) {
    if (token !== renderToken) return;
    console.error(e);
    main.innerHTML = ui.errorCard(e);
  }
}

main.addEventListener('click', (e) => {
  if (e.target.closest('[data-action="retry"]')) render();
});

window.addEventListener('hashchange', () => {
  render();
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
});
render();

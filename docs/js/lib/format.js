// Formatting in Australian English. Money is en-AU dollars with two decimals; times are Australia/Brisbane.

const TZ = 'Australia/Brisbane';
const money = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', currencyDisplay: 'narrowSymbol', minimumFractionDigits: 2 });
const moneyShort = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 });
const timeFmt = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true });
const dateFmt = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });
const dateTimeFmt = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
const utcFmt = new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });

export const fmtMoney = (n) => (n === null || n === undefined || Number.isNaN(n) ? '-' : money.format(n));
export const fmtMoneyShort = (n) => moneyShort.format(n);
export const fmtSigned = (n) => (n === null || n === undefined ? '-' : `${n > 0 ? '+' : n < 0 ? '-' : ''}${money.format(Math.abs(n))}`);
export const fmtPrice = (p) => (p > 1 ? `$${p.toFixed(2)}` : '-');
export const fmtPct = (x, dp = 1) => (x === null || x === undefined ? '-' : `${(x * 100).toFixed(dp)}%`);
export const fmtSignedPct = (x, dp = 1) => (x === null || x === undefined ? '-' : `${x > 0 ? '+' : ''}${(x * 100).toFixed(dp)}%`);
export const fmtTime = (iso) => (iso ? timeFmt.format(new Date(iso)) : '-');
export const fmtDate = (iso) => (iso ? dateFmt.format(new Date(iso)) : '-');
export const fmtDateTime = (iso) => (iso ? dateTimeFmt.format(new Date(iso)) : '-');
export const fmtUtc = (iso) => (iso ? `${utcFmt.format(new Date(iso))} UTC` : '-');
export const bneDate = (d = new Date()) => ymd.format(d);

/** Brisbane date of the Monday that starts the week containing `d`. */
export function weekStart(d = new Date()) {
  const date = bneDate(d);
  const [y, m, day] = date.split('-').map(Number);
  const noon = new Date(Date.UTC(y, m - 1, day, 2)); // noon Brisbane = 02:00 UTC
  const dow = (noon.getUTCDay() + 6) % 7; // Monday = 0
  return bneDate(new Date(noon.getTime() - dow * 86400000));
}

/** "in 12 min", "in 1 h 5 min", "Jumped", for countdown chips. */
export function countdown(iso, now = Date.now()) {
  const mins = Math.round((new Date(iso).getTime() - now) / 60000);
  if (mins <= 0) return mins > -3 ? 'Jumping' : 'Jumped';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return `${h} h ${mins % 60} min`;
}

const escMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => escMap[c]);

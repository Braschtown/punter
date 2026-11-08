// Time helpers. Everything is stored as UTC ISO strings plus an Australia/Brisbane copy.
// Brisbane has no daylight saving, but we still go through Intl rather than hard-coding +10.

const TZ = 'Australia/Brisbane';

const partsFmt = new Intl.DateTimeFormat('en-AU', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function parts(d) {
  const p = {};
  for (const { type, value } of partsFmt.formatToParts(d)) p[type] = value;
  return p;
}

const toDate = (v) => (v instanceof Date ? v : new Date(v));

/** UTC ISO string without milliseconds, e.g. 2026-11-08T07:26:00Z */
export function utcIso(v = new Date()) {
  return toDate(v).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Brisbane wall-clock time with offset, e.g. 2026-11-08T17:26:00+10:00 */
export function bneIso(v = new Date()) {
  const d = toDate(v);
  const p = parts(d);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const offMin = Math.round((asUtc - Math.floor(d.getTime() / 1000) * 1000) / 60000);
  const sign = offMin >= 0 ? '+' : '-';
  const hh = String(Math.floor(Math.abs(offMin) / 60)).padStart(2, '0');
  const mm = String(Math.abs(offMin) % 60).padStart(2, '0');
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${sign}${hh}:${mm}`;
}

/** Brisbane calendar date, e.g. 2026-11-08 */
export function bneDate(v = new Date()) {
  const p = parts(toDate(v));
  return `${p.year}-${p.month}-${p.day}`;
}

/** Both stamps for a capture row. */
export function stamp(v = new Date()) {
  return { utc: utcIso(v), bne: bneIso(v) };
}

export function addDays(v, n) {
  return new Date(toDate(v).getTime() + n * 86400000);
}

/** Minutes from `now` until `then` (negative once `then` has passed), one decimal place. */
export function minsBetween(now, then) {
  return Math.round((toDate(then) - toDate(now)) / 6000) / 10;
}

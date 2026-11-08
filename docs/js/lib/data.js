// Reads the committed JSON from the `data` branch. The app never writes to the repo.
// On GitHub Pages it reads raw.githubusercontent.com; locally (served from the repo root) it reads ../data/.
// Override with ?data=<base url> if needed.

const RAW = 'https://raw.githubusercontent.com/Braschtown/punter/data/';
const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
export const DATA_BASE = new URLSearchParams(location.search).get('data') || (local ? '../data/' : RAW);

const cache = new Map();

/** Fetch one JSON file. `optional` files that do not exist yet resolve to `fallback` instead of failing. */
export async function getJson(path, { optional = false, fallback = null, fresh = false } = {}) {
  if (!fresh && cache.has(path)) return cache.get(path);
  const p = (async () => {
    let res;
    try {
      res = await fetch(DATA_BASE + path, { cache: 'no-cache' });
    } catch (e) {
      throw new Error(`Could not reach the data (${path}). Check your connection.`);
    }
    if (res.status === 404 && optional) return fallback;
    if (!res.ok) throw new Error(`Could not load ${path} (HTTP ${res.status}).`);
    return res.json();
  })();
  cache.set(path, p);
  p.catch(() => cache.delete(path));
  return p;
}

export function clearCache() { cache.clear(); }

/** Races, snapshots and results for one Brisbane date, joined by race id. */
export async function getDay(date) {
  const [races, snaps, results] = await Promise.all([
    getJson(`races/${date}.json`, { optional: true, fallback: { races: {} } }),
    getJson(`snapshots/${date}.json`, { optional: true, fallback: { races: {} } }),
    getJson(`results/${date}.json`, { optional: true, fallback: { races: {} } }),
  ]);
  return Object.values(races.races).map((r) => ({ ...r, snap: snaps.races[r.raceId] || null, result: results.races[r.raceId] || null }));
}

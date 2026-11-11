// Ladbrokes Affiliate API adapter. Docs: https://nedscode.github.io/affiliate-feeds
// Read-only, public endpoints. No login, no account, no bets.

import { SCOPE, USER_AGENT } from '../config.mjs';
import { utcIso } from '../lib/time.mjs';

const BASE = 'https://api.ladbrokes.com.au/affiliates/v1/racing';
const GAP_MS = 1000; // at least this long between requests
const CODES = { T: 'thoroughbred', G: 'greyhound' };

const headers = {
  'User-Agent': USER_AGENT,
  // The API asks callers to identify themselves. Set the LADBROKES_FROM repo variable to a contact address.
  From: process.env.LADBROKES_FROM || 'punterlab (github.com/Braschtown/punter)',
  'X-Partner': 'PunterLab',
  Accept: 'application/json',
};

let lastRequest = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(pathAndQuery) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const wait = lastRequest + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    let res;
    try {
      res = await fetch(`${BASE}${pathAndQuery}`, { headers, signal: AbortSignal.timeout(20000) });
    } catch (e) {
      if (attempt === 3) throw new Error(`Ladbrokes request failed: ${e.message}`);
      await sleep(2000 * attempt);
      continue;
    }
    if (res.ok) return (await res.json()).data;
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await sleep(5000 * attempt); // back off; 429 means we are going too fast
      continue;
    }
    throw new Error(`Ladbrokes HTTP ${res.status} for ${pathAndQuery}`);
  }
}

const inScope = (code, name, country) => {
  if (country !== SCOPE.country) return false;
  const tracks = SCOPE[code]?.tracks;
  return tracks === null || (tracks || []).includes(name);
};

const priceOrNull = (v) => (typeof v === 'number' && v > 1 ? v : null);
const epochToIso = (s) => (s ? utcIso(new Date(s * 1000)) : null);

/**
 * Meetings and races in scope between two Brisbane dates (inclusive).
 * @returns {Promise<Array<{meetingId,name,state,code,date,trackCondition,races:Array}>>}
 */
export async function fetchMeetings(dateFrom, dateTo = dateFrom) {
  const out = [];
  for (const [cat, code] of Object.entries(CODES)) {
    for (let offset = 0; ; offset += 200) {
      const data = await get(`/meetings?date_from=${dateFrom}&date_to=${dateTo}&category=${cat}&country=${SCOPE.country}&limit=200&offset=${offset}`);
      const meetings = data?.meetings || [];
      for (const m of meetings) {
        if (!inScope(code, m.name, m.country)) continue;
        out.push({
          meetingId: m.meeting,
          name: m.name,
          state: m.state,
          code,
          date: (m.date || '').slice(0, 10),
          trackCondition: m.track_condition || null,
          races: (m.races || []).map((r) => ({
            raceId: r.id,
            raceNumber: r.race_number,
            name: r.name,
            distance: r.distance ?? null,
            jumpUtc: utcIso(r.start_time),
            status: r.status,
          })),
        });
      }
      if (meetings.length < 200) break;
    }
  }
  return out;
}

function normaliseRunner(x) {
  return {
    runnerId: x.entrant_id,
    name: x.name,
    number: x.runner_number ?? null,
    barrier: x.barrier ?? null,
    winPrice: x.is_scratched ? null : priceOrNull(x.odds?.fixed_win),
    scratched: !!x.is_scratched,
    scratchedUtc: x.is_scratched ? epochToIso(x.scratch_time) : null,
  };
}

const numOrNull = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
const textOrNull = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Form fields Ladbrokes publishes before the race. Used by the forward tests; never used to settle anything. */
function runnerForm(x) {
  return {
    lastStarts: typeof x.last_twenty_starts === 'string' ? x.last_twenty_starts : null,
    weight: numOrNull(x.weight?.total),
    weightAllocated: numOrNull(x.weight?.allocated),
    claim: textOrNull(x.allowance_weight),
    jockey: textOrNull(x.jockey),
    trainer: textOrNull(x.trainer_name),
    age: numOrNull(x.age),
    sex: textOrNull(x.sex),
    gear: textOrNull(x.gear),
    speedmap: textOrNull(x.speedmap?.label),
    speedScore: numOrNull(x.speedmap?.settling_lengths), // higher = further forward (Leader 8 to 9, Backmarker 1)
    indicators: (x.form_indicators || []).map((i) => i.name).filter(Boolean),
    mover: !!x.mover,
  };
}

/** Current fixed win prices for one race, plus the race details and form shown before the jump. */
export async function fetchPrices(raceId) {
  const d = await get(`/events/${raceId}`);
  const money = Object.fromEntries(['big_bets', 'biggest_bet', 'money_tracker', 'live_bets']
    .filter((k) => d[k] !== null && d[k] !== undefined).map((k) => [k, d[k]]));
  return {
    raceId,
    status: d.race.status,
    jumpUtc: epochToIso(d.race.advertised_start),
    race: {
      description: textOrNull(d.race.description),
      group: textOrNull(d.race.group),
      distance: numOrNull(d.race.distance),
      trackCondition: textOrNull(d.race.track_condition),
      rail: textOrNull(d.race.rail_position),
      weather: textOrNull(d.race.weather),
    },
    // Ladbrokes' "big bets" and money tracker. Often empty, so captured raw until we know how often they fill in.
    money: Object.keys(money).length ? money : null,
    runners: (d.runners || []).map((x) => ({ ...normaliseRunner(x), form: runnerForm(x) })),
  };
}

/** Outcome of one race, or { final: false } if it has not been declared yet. */
export async function fetchResults(raceId) {
  const d = await get(`/events/${raceId}`);
  const status = d.race.status;
  const runners = (d.runners || []).map(normaliseRunner);
  const abandoned = /abandon/i.test(status);
  const placings = (d.results || []).map((p) => ({
    position: p.position,
    runnerId: p.entrant_id,
    name: p.name,
    number: p.runner_number ?? null,
    barrier: p.barrier ?? null,
    margin: p.margin_length ?? null,
  }));
  const final = abandoned || (status === 'Final' && placings.length > 0);
  const toteWin = (d.dividends || [])
    .filter((x) => x.product_name === 'Tote Win' &&x.status === 'Final')
    .map((x) => ({ tote: x.tote, dividend: x.dividend, runnerNumbers: (x.positions || []).map((p) => p.runner_number) }));
  return {
    raceId,
    status,
    final,
    abandoned,
    actualStartUtc: epochToIso(d.race.actual_start),
    placings,
    runners,
    toteWin,
  };
}

export const name = 'ladbrokes';

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

/** Current fixed win prices for one race. */
export async function fetchPrices(raceId) {
  const d = await get(`/events/${raceId}`);
  return {
    raceId,
    status: d.race.status,
    jumpUtc: epochToIso(d.race.advertised_start),
    runners: (d.runners || []).map(normaliseRunner),
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

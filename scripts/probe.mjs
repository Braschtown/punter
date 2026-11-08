// Phase 0 feasibility probe.
// Makes a handful of polite, read-only requests to each candidate data source and
// reports status, size and whether the body looks usable. No logins, no credentials.
// Run locally with `node scripts/probe.mjs` or from the "Feasibility probe" workflow.

const UA = 'PunterLab/0.1 (paper-trading research; +https://github.com/Braschtown/punter)';
const LADBROKES_HEADERS = {
  'User-Agent': UA,
  From: process.env.LADBROKES_FROM || 'punterlab (github.com/Braschtown/punter)',
  'X-Partner': 'PunterLab',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function brisbaneDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Brisbane' }).format(d);
}

async function probe(name, url, headers = { 'User-Agent': UA }, check = () => '') {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    const body = await res.text();
    let note = '';
    if (/Just a moment|challenge-platform|cf-chl/i.test(body)) note = 'Cloudflare challenge page';
    else if (res.ok) {
      try { note = check(body) || ''; } catch (e) { note = `parse failed: ${e.message}`; }
    }
    return { name, url, status: res.status, bytes: body.length, ms: Date.now() - t0, note, body };
  } catch (e) {
    return { name, url, status: 'ERR', bytes: 0, ms: Date.now() - t0, note: e.message };
  } finally {
    await sleep(1500); // polite gap between requests
  }
}

const today = brisbaneDate(0);
const results = [];

results.push(await probe('Runner location (Cloudflare trace)', 'https://www.cloudflare.com/cdn-cgi/trace', undefined,
  (b) => b.split('\n').filter((l) => /^(loc|colo)=/.test(l)).join(' ')));

let eventId = null;
for (const cat of ['T', 'G']) {
  const r = await probe(`Ladbrokes meetings ${cat}`,
    `https://api.ladbrokes.com.au/affiliates/v1/racing/meetings?date_from=${today}&date_to=${today}&category=${cat}&country=AUS&limit=200`,
    LADBROKES_HEADERS,
    (b) => {
      const m = JSON.parse(b).data.meetings;
      if (!eventId && m[0]?.races?.length) eventId = m[0].races.at(-1).id;
      return `${m.length} AUS meetings: ${m.map((x) => x.name).slice(0, 12).join(', ')}`;
    });
  results.push(r);
}
if (eventId) {
  results.push(await probe('Ladbrokes event (prices)', `https://api.ladbrokes.com.au/affiliates/v1/racing/events/${eventId}`,
    LADBROKES_HEADERS,
    (b) => {
      const d = JSON.parse(b).data;
      const priced = d.runners.filter((x) => x.odds?.fixed_win > 0).length;
      return `${d.race.meeting_name} R${d.race.race_number} ${d.race.status}, ${priced}/${d.runners.length} runners priced`;
    }));
}
results.push(await probe('Ladbrokes next to go', 'https://api.ladbrokes.com.au/rest/v1/racing/?method=nextraces&count=3',
  LADBROKES_HEADERS, (b) => `${JSON.parse(b).data.next_to_go_ids.length} ids`));

// Betfair BSP daily files: published the day after racing, dated in the file name (ddmmyyyy).
const y = brisbaneDate(-2).split('-');
const stamp = `${y[2]}${y[1]}${y[0]}`;
for (const f of [`dwbfpricesauswin${stamp}.csv`, `dwbfgreyhoundwin${stamp}.csv`]) {
  results.push(await probe(`Betfair BSP ${f}`, `https://promo.betfair.com/betfairsp/prices/${f}`, undefined,
    (b) => `${b.trim().split('\n').length - 1} rows, ${(b.match(/\(AUS\)/g) || []).length} AUS rows`));
}
results.push(await probe('Betfair Exchange API host (no login)', 'https://api.betfair.com.au/exchange/betting/json-rpc/v1'));

results.push(await probe('Racing Queensland calendar', 'https://www.racingqueensland.com.au/racing/full-calendar'));
results.push(await probe('Racing NSW home', 'https://www.racingnsw.com.au/'));
results.push(await probe('racing.com (Racing Victoria)', 'https://www.racing.com/'));
results.push(await probe('QRIC stewards', 'https://www.qric.qld.gov.au/'));

const lines = ['| Source | HTTP | Bytes | ms | Note |', '|---|---|---|---|---|'];
for (const r of results) lines.push(`| ${r.name} | ${r.status} | ${r.bytes} | ${r.ms} | ${(r.note || '').replace(/\|/g, '/')} |`);
const table = lines.join('\n');
console.log(table);
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import('node:fs');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Feasibility probe ${new Date().toISOString()}\n\n${table}\n`);
}

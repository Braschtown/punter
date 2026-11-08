// Every job talks to data sources through this interface, so a source can be swapped
// by adding a file here and changing PRICE_SOURCE, without touching the jobs.
//
//   fetchMeetings(dateFrom, dateTo) -> [{ meetingId, name, state, code, date, trackCondition,
//                                         races: [{ raceId, raceNumber, name, distance, jumpUtc, status }] }]
//   fetchPrices(raceId)             -> { raceId, status, jumpUtc,
//                                         runners: [{ runnerId, name, number, barrier, winPrice, scratched, scratchedUtc }] }
//   fetchResults(raceId)            -> { raceId, status, final, abandoned, actualStartUtc,
//                                         placings: [{ position, runnerId, name, number, barrier, margin }],
//                                         runners (as above, with final prices), toteWin: [{ tote, dividend, runnerNumbers }] }
//
// Dates are Brisbane calendar dates (YYYY-MM-DD). Times are UTC ISO strings. Prices are decimal, or null.

import * as ladbrokes from './ladbrokes.mjs';

const ADAPTERS = { ladbrokes };

export function getAdapter(name = process.env.PRICE_SOURCE || 'ladbrokes') {
  const a = ADAPTERS[name];
  if (!a) throw new Error(`Unknown data source "${name}". Known: ${Object.keys(ADAPTERS).join(', ')}`);
  return a;
}

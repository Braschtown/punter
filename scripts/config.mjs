// What Punter Lab collects. Change scope here, not in the jobs.

export const USER_AGENT = 'PunterLab/0.1 (paper-trading research; +https://github.com/Braschtown/punter)';

// Thoroughbreds: every Australian meeting. Harness is a separate Ladbrokes category and is never fetched.
// Greyhounds: The Q (Purga, Ipswich) only. Ladbrokes lists its three tracks as separate meetings.
export const SCOPE = {
  country: 'AUS',
  thoroughbred: { tracks: null }, // null = all tracks
  greyhound: { tracks: ['Q1 Lakeside', 'Q2 Parklands', 'Q Straight'] },
};

export const SNAPSHOT = {
  lateTargetMins: 10, // aim for the price about 10 minutes before the jump
  lateWindowMins: [2, 16], // any capture inside this window counts as "late"; closest to target wins
  earlyRecheckMins: 30, // how often to re-check a race that has no prices yet
  earlyCapPerRun: 60, // most "early" event fetches in a single run
};

export const RESULTS = {
  minMinsAfterJump: 2, // do not ask for a result before this
  capPerRun: 80,
  giveUpHours: 6, // log a gap if a race is still not final this long after the jump
};

export const LOG_LIMIT = 300; // entries kept in data/status.json

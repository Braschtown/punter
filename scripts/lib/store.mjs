// Small JSON store over the data directory, plus the run log that feeds the Status screen.
// Writes are atomic (temp file then rename) and skipped when nothing changed, so jobs are idempotent.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { LOG_LIMIT } from '../config.mjs';
import { stamp } from './time.mjs';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');

export async function readJson(rel, fallback) {
  try {
    return JSON.parse(await readFile(path.join(DATA_DIR, rel), 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return structuredClone(fallback);
    throw new Error(`Could not read ${rel}: ${e.message}`);
  }
}

/** Returns true when the file changed. */
export async function writeJson(rel, data) {
  const file = path.join(DATA_DIR, rel);
  const text = JSON.stringify(data, null, 2) + '\n';
  try {
    if ((await readFile(file, 'utf8')) === text) return false;
  } catch { /* new file */ }
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile(tmp, text);
  await rename(tmp, file);
  return true;
}

const EMPTY_STATUS = { jobs: {}, sources: {}, log: [] };

/**
 * Collects log entries during a run and saves them with the job summary at the end.
 * Gap entries with a `key` are only logged once, so a missing price is not repeated every 5 minutes.
 */
export class RunLog {
  constructor(job) {
    this.job = job;
    this.started = stamp();
    this.entries = [];
    this.counts = {};
  }

  add(level, message, extra = {}) {
    this.entries.push({ ...stamp(), job: this.job, level, message, ...extra });
    console.log(`[${level}] ${message}${extra.raceId ? ` (${extra.raceId})` : ''}`);
  }
  gap(message, extra) { this.add('gap', message, extra); }
  error(message, extra) { this.add('error', message, extra); }
  count(name, n = 1) { this.counts[name] = (this.counts[name] || 0) + n; }

  async save({ sourceStates = {} } = {}) {
    const status = await readJson('status.json', EMPTY_STATUS);
    const seenKeys = new Set(status.log.filter((e) => e.key).map((e) => e.key));
    const fresh = this.entries.filter((e) => !e.key || !seenKeys.has(e.key));
    status.log = [...fresh.reverse(), ...status.log].slice(0, LOG_LIMIT);
    const errors = this.entries.filter((e) => e.level === 'error').length;
    status.jobs[this.job] = {
      lastRun: this.started,
      finished: stamp(),
      ok: errors === 0,
      errors,
      gaps: this.entries.filter((e) => e.level === 'gap').length,
      counts: this.counts,
    };
    for (const [name, s] of Object.entries(sourceStates)) {
      const prev = status.sources[name] || {};
      status.sources[name] = {
        ...prev,
        ...s,
        lastRun: this.started,
        ...(s.state === 'OK' ? { lastOk: this.started } : {}),
      };
    }
    await writeJson('status.json', status);
    console.log(`${this.job}: ${JSON.stringify(this.counts)}, ${errors} errors`);
  }
}

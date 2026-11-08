# Punter Lab data

This branch holds data only. The collection jobs on `main` write here, and the app reads these files over raw.githubusercontent.com.

| Path | Written by | Contents |
|---|---|---|
| `races/YYYY-MM-DD.json` | snapshot | Race metadata by Brisbane race date |
| `snapshots/YYYY-MM-DD.json` | snapshot | Per runner: `early` (first sighting), `late` (closest to 10 min before the jump), `last`, scratching flag |
| `results/YYYY-MM-DD.json` | results | Winner, placings, final fixed prices (used as close), tote win dividend, scratchings |
| `ledger.json` | seed, results, manual commits | Paper bets |
| `notes.json` | seed, manual commits | Notes and replay log |
| `analysis.json` | analysis | Test results and verdicts |
| `status.json` | every job | Last run times (UTC and Brisbane), source states, gap and error log |

Every price capture stores `utc`, `bne` and `minsToJump`, because Actions cron runs are not on time.

# Punter Lab: notes for Claude Code

- **Before touching any model or staking code,** read [docs/METHOD.md](docs/METHOD.md). Do not re-derive the method or change it without saying so.
- **When a phase status changes,** update both [docs/PROGRESS.md](docs/PROGRESS.md) on `main` and `progress.json` on the `data` branch (the `./data` worktree). Statuses must come from what is in the repo, with evidence. Never mark a phase done on intent.
- **Paper trading only.** Never place bets, store logins or ask for credentials. No tokens in the frontend. Any Betfair app key or login goes in GitHub Secrets, never in the repo.
- **No invented or placeholder numbers** in the app or the docs. No verdict on any test below 300 races. "No edge found" is a valid result.
- **Keep it simple:** no framework, no build step, no databases, no auth, no paid services.
- **Australian English** in all UI text, comments and docs. No em dashes anywhere.
- **Small, reviewable commits.** Run `node --test test/*.test.mjs` before committing.
- **Commit as a linked GitHub identity.** This repo's git email is the `users.noreply.github.com` address. Scheduled workflows never fire if the last commit to the workflow file came from an unlinked email.
- **Forward tests are fixed once they have data.** Never edit a rule in `scripts/lib/forward.mjs` after it has logged bets. A changed rule is a new test with a new id and `added` date.

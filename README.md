# GoalCast

Elo + Poisson + Monte Carlo predictions for the World Cup 2026 knockout
stage, with a Beat-the-AI picks mode. Built for the Philips IT MatchMind
Challenge 2026. Runs entirely in the browser — no backend, no keys.

## Quick start
```
npm install
npm run dev        # local dev server
npm run build      # production build -> dist/
node test.mjs      # engine numbers in the terminal (seeded, reproducible)
```

## After each match (2 minutes)
Edit `src/data.json`, set the fixture's result:
```json
"result": { "homeGoals": 2, "awayGoals": 0 }
```
If level after 90', name the winner — and add whichever of these
actually decided it, so the card shows the real score instead of just
"(after ET/pens)":
```json
"result": { "homeGoals": 1, "awayGoals": 1, "winner": "SUI", "aet": { "home": 2, "away": 1 } }
"result": { "homeGoals": 1, "awayGoals": 1, "winner": "SUI", "pens": { "home": 4, "away": 2 } }
```
(`aet` = won by a goal in extra time; `pens` = won on the shootout — use one, not both.)
Optionally refresh `elo` values from eloratings.net. Everything —
bracket, simulation, Beat-the-AI scoring — recomputes on reload.
Recorded results are locked in; only unplayed matches are simulated.

Most fixtures derive their participants from the **winners** of earlier
fixtures via `homeFrom`/`awayFrom`. A third-place playoff instead needs
the **losers** — use `homeFromLoser`/`awayFromLoser` (fixture id) the
same way, e.g. a Bronze Final between the two semifinal losers:
```json
{ "id": "BRONZE", "round": "TP", "homeFromLoser": "SF1", "awayFromLoser": "SF2",
  "kickoffIST": "2026-07-18 20:00", "result": null }
```
It resolves automatically once both feeder results land — same rules,
scheduled CI, and Beat-the-AI flow as any other fixture.

## Data & privacy
Draft picks live in the visitor's browser. Joining the leaderboard
stores nickname + picks in Netlify Blobs (removable via the app). No
emails, accounts or personal data are collected. Official challenge
submissions close 14 Jul 2026, 17:00 IST.

## Share links
The WhatsApp share text picks up the live URL automatically from
wherever the app is deployed — nothing to configure.

## Deploy (Netlify, free)
Option A — drag and drop: `npm run build`, then drop the `dist/`
folder onto https://app.netlify.com/drop
Option B — connect the GitHub repo; build command `npm run build`,
publish directory `dist`. Every push redeploys.

## Structure
```
src/engine.js      pure model: Elo, Poisson, Monte Carlo (no deps)
src/data.json      teams, Elo ratings, fixtures, results — the only file you edit
src/logic.js       bracket resolution, model picks, scoring, share text
src/App.jsx        shell + tabs
src/components/    MatchCard, SimulationView, BeatTheAI, HowItWorks
test.mjs           CLI check — same numbers as the site
```

## Live results (optional, recommended once deployed)
The app stays fully static; results update via **scheduled CI**, not
runtime API calls. `scripts/update-results.mjs` pulls finished
knockout results from football-data.org and rewrites `src/data.json`;
`.github/workflows/update-results.yml` runs it every 30 minutes during
match windows, validates the engine, and commits — Netlify redeploys.

One-time setup:
1. Register free at football-data.org → copy your API token.
2. GitHub repo → Settings → Secrets and variables → Actions →
   new secret `FOOTBALL_DATA_TOKEN`.
3. Netlify must be **connected to the repo** (auto-deploy on push) —
   drag-and-drop deploys won't pick up bot commits.

Manual editing keeps working regardless; if the token is missing the
script exits quietly and touches nothing. Test offline:
`node scripts/update-results.mjs --mock scripts/mock-api.json`

## Situational adjustments (team news)
Add to any team in `src/data.json`:
```json
"FRA": { "name": "France", "flag": "🇫🇷", "elo": 2143,
         "eloAdjust": -35, "adjustReason": "key striker suspended" }
```
Applied everywhere in the engine and disclosed automatically on the
How-it-works page. Rule of thumb: a side's best player ≈ 30–50 points.

## Model notes
Elo win expectation (scale 400) → expected goals from the rating gap
(base 1.30/team, scale 1000) → Poisson scoreline matrix → 20,000
seeded Monte Carlo runs. ET/pens resolved on a softer Elo curve
(scale 800). Disclosed limitation: the engine relies on team-strength ratings and
a goal-distribution model; tactical matchups and late team news are
covered only via published, reasoned adjustments.

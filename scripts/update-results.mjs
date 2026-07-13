// Build-time results updater for GoalCast.
// Pulls FINISHED knockout results from football-data.org (free tier)
// and writes them into src/data.json. The app itself stays fully static.
//
// Usage:
//   FOOTBALL_DATA_TOKEN=xxx node scripts/update-results.mjs
//   node scripts/update-results.mjs --mock scripts/mock-api.json   (offline test)
//
// Exit codes: 0 = ran fine (changed or not), 1 = hard failure.
// Prints "CHANGED" on stdout when data.json was modified — the CI
// workflow uses that to decide whether to commit.

import { readFileSync, writeFileSync } from "node:fs";
import { modelPick, resolveBracket } from "../src/logic.js";

const DATA_PATH = new URL("../src/data.json", import.meta.url);
const API_URL =
  "https://api.football-data.org/v4/competitions/WC/matches?stage=QUARTER_FINALS,SEMI_FINALS,FINAL";

const mockIdx = process.argv.indexOf("--mock");
const MOCK_PATH = mockIdx > -1 ? process.argv[mockIdx + 1] : null;

async function fetchMatches() {
  if (MOCK_PATH) {
    console.log(`(mock mode: ${MOCK_PATH})`);
    return JSON.parse(readFileSync(MOCK_PATH, "utf8")).matches;
  }
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) {
    console.error("FOOTBALL_DATA_TOKEN not set — skipping update.");
    process.exit(0); // not a failure; manual editing still works
  }
  const res = await fetch(API_URL, { headers: { "X-Auth-Token": token } });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return (await res.json()).matches;
}

/** 90-minute goals, handling matches that went to extra time defensively. */
function goals90(score) {
  // v4 usually reports regularTime for ET matches; fullTime includes ET goals.
  if (score.duration === "REGULAR") return score.fullTime;
  if (score.regularTime && score.regularTime.home != null) return score.regularTime;
  if (
    score.fullTime?.home != null &&
    score.extraTime?.home != null &&
    score.extraTime.home <= score.fullTime.home
  ) {
    return {
      home: score.fullTime.home - score.extraTime.home,
      away: score.fullTime.away - score.extraTime.away,
    };
  }
  console.warn("  ! could not derive 90' score, using fullTime as-is");
  return score.fullTime;
}

function main(apiMatches, data) {
  const finished = apiMatches
    .filter((m) => m.status === "FINISHED")
    .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));

  // Resolve current bracket participants from already-recorded results,
  // mirroring src/logic.js, so SF/FINAL fixtures can be matched by teams.
  const winners = {};
  const participants = {};
  for (const f of data.fixtures) {
    const home = f.home ?? winners[f.homeFrom] ?? null;
    const away = f.away ?? winners[f.awayFrom] ?? null;
    participants[f.id] = { home, away };
    if (f.result && home && away) {
      const { homeGoals, awayGoals, winner } = f.result;
      winners[f.id] =
        winner ?? (homeGoals > awayGoals ? home : awayGoals > homeGoals ? away : null);
    }
  }

  const stageOf = { QF: "QUARTER_FINALS", SF: "SEMI_FINALS", F: "FINAL" };
  let changed = false;

  // Freeze the engine's pick for any known, unplayed fixture that doesn't
  // have one yet — committed to git, the timestamp is the pre-kickoff proof.
  data.benchmarks ??= { players: [], picks: {} };
  data.benchmarks.picks.engine ??= {};

  for (const fx of data.fixtures) {
    if (fx.result) continue;
    const { home, away } = participants[fx.id];
    if (!home || !away) continue; // participants not known yet

    const match = finished.find(
      (m) =>
        m.stage === stageOf[fx.round] &&
        new Set([m.homeTeam.tla, m.awayTeam.tla]).has(home) &&
        new Set([m.homeTeam.tla, m.awayTeam.tla]).has(away)
    );
    if (!match) continue;

    const flip = match.homeTeam.tla !== home; // API orientation vs ours
    const g = goals90(match.score);
    const result = {
      homeGoals: flip ? g.away : g.home,
      awayGoals: flip ? g.home : g.away,
    };
    if (result.homeGoals === result.awayGoals) {
      const apiWinnerTla =
        match.score.winner === "HOME_TEAM" ? match.homeTeam.tla : match.awayTeam.tla;
      result.winner = apiWinnerTla;
    }
    fx.result = result;
    // Also record the winner for downstream participant resolution this run.
    winners[fx.id] =
      result.winner ??
      (result.homeGoals > result.awayGoals ? home : away);
    // Refresh participants for later fixtures in this same pass.
    for (const later of data.fixtures) {
      participants[later.id] = {
        home: later.home ?? winners[later.homeFrom] ?? null,
        away: later.away ?? winners[later.awayFrom] ?? null,
      };
    }
    changed = true;
    console.log(
      `  + ${fx.id}: ${home} ${result.homeGoals}-${result.awayGoals} ${away}` +
        (result.winner ? ` (winner ${result.winner})` : "")
    );
  }

  // Lock the engine's pick for every known, unplayed fixture that lacks one.
  for (const fx of resolveBracket(data)) {
    if (fx.known && !fx.result && !data.benchmarks.picks.engine[fx.id]) {
      const m = modelPick(fx);
      if (m) {
        data.benchmarks.picks.engine[fx.id] = {
          winner: m.winner, h: m.h, a: m.a,
          lockedAt: new Date().toISOString().slice(0, 10),
        };
        changed = true;
        console.log(`  * locked engine pick ${fx.id}: ${m.winner} ${m.h}-${m.a}`);
      }
    }
  }
  return changed;
}

const data = JSON.parse(readFileSync(DATA_PATH, "utf8"));
const matches = await fetchMatches();
const changed = main(matches, data);
if (changed) {
  data.meta.updated = new Date().toISOString().slice(0, 10);
  writeFileSync(DATA_PATH, JSON.stringify(data, null, 2) + "\n");
  console.log("CHANGED");
} else {
  console.log("no new finished results");
}

import { readFileSync } from "node:fs";
import { analyzeMatch, effElo, simulateTournament } from "./src/engine.js";
import {
  buildShareText, deriveWinner, getBenchmarkPicks, parseKickoffIST,
  redactPlayers, resolveBracket, scorePicks, validateSubmission,
} from "./src/logic.js";
import { cascadeInvalidate, effectiveLock, projectParticipants } from "./src/projection.js";

const data = JSON.parse(readFileSync(new URL("./src/data.json", import.meta.url), "utf8"));
const pct = (x) => (100 * x).toFixed(1) + "%";
let failures = 0;
const assert = (cond, name) => { console.log((cond ? "PASS" : "FAIL") + "  " + name); if (!cond) failures++; };

const resolved = resolveBracket(data);
const finished = resolved.filter((r) => r.result).map((r) => r.id).sort().join(",");
const baseline = finished === "QF1,QF2";
const NOW = parseKickoffIST("2026-07-11 12:00"); // fixed clock: pre-QF3

console.log(`=== GoalCast — data ${data.meta.updated} · results in: [${finished}] ===`);
for (const fx of resolved.filter((f) => f.known && !f.result)) {
  const m = analyzeMatch(effElo(data.teams[fx.homeId]), effElo(data.teams[fx.awayId]), data.config);
  console.log(`  ${fx.id} ${fx.homeId} v ${fx.awayId}: advance ${pct(m.advanceHome)} / ${pct(m.advanceAway)}`);
}
const sim = simulateTournament(data);
console.log("Champion: " + sim.teams.slice(0, 4).map((t) => `${t.id} ${pct(t.champion)}`).join(" · "));
const fr = sim.finalResults[0];
console.log(`Top final result: ${fr.winner} ${fr.wg}-${fr.lg} ${fr.loser}${fr.pens ? " (pens)" : ""} ${pct(fr.p)}`);

console.log("\n--- timeless checks ---");
const known = resolved.filter((f) => f.known).map((f) => f.id);
assert(known.length >= 5 && known.includes("SF1"), "bracket resolves at least through SF1");
assert(fr && fr.winner !== fr.loser && fr.wg >= fr.lg && fr.p > 0, "joint final results sane");

let crashed = false;
try { buildShareText({ QF3: { h: 2, a: 0, winner: null } }, resolved, data.teams); } catch { crashed = true; }
assert(!crashed, "share text tolerates winner-less pick");

const qf3 = resolved.find((f) => f.id === "QF3");
assert(deriveWinner(qf3, 0, 2) === "ENG", "derive: 0-2 means England");
assert(deriveWinner(qf3, 3, 1) === "NOR", "derive: 3-1 means Norway");
assert(deriveWinner(qf3, 1, 1) === null, "derive: level stays undecided");
assert(deriveWinner(qf3, 1, 1, "NOR") === "NOR", "derive: level keeps chosen advancer");
assert(deriveWinner(qf3, 2, 1, "ENG") === "NOR", "derive: score change overrides stale winner");

assert(
  analyzeMatch(effElo({ elo: 2143, eloAdjust: -100 }), 1972, data.config).advanceHome <
    analyzeMatch(2143, 1972, data.config).advanceHome,
  "eloAdjust shifts probability"
);

assert(validateSubmission(data, { id: "p-12345678", name: "a@b.com", picks: {} }, NOW).ok === false, "email-like nickname refused");
assert(validateSubmission(data, { id: "p-12345678", name: "☺☺", picks: {} }, NOW).ok === false, "symbol-only nickname refused");
assert(validateSubmission(data, { id: "p-12345678", name: "  ", picks: {} }, NOW).ok === false, "blank nickname refused");
assert(validateSubmission(data, { id: "short", name: "Atul", picks: {} }, NOW).ok === false, "short player id refused");
assert(validateSubmission(data, { id: "p-12345678", name: " Atul ", picks: {} }, NOW).name === "Atul", "nickname trimmed");

const v1 = validateSubmission(data, {
  id: "p-12345678", name: "Atul",
  picks: {
    QF2: { winner: "ESP", h: 2, a: 0 },   // time-locked at NOW
    QF3: { winner: "ENG", h: 1, a: 2 },
    QF4: { winner: "SUI", h: 99, a: 1 },  // absurd score -> winner-only
    SF1: { winner: "ARG" },               // not a participant -> dropped
  },
}, NOW);
assert(Object.keys(v1.allowed).sort().join(",") === "QF3,QF4", "only open, valid picks kept");
assert(v1.allowed.QF4.h === undefined, "absurd scoreline stripped to winner-only");
assert(v1.rejectedLocked === 1, "kicked-off pick counted and refused");

const red = redactPlayers(data, [{ name: "T", picks: { QF1: { winner: "FRA" }, QF3: { winner: "ENG" } }, updatedAt: "x" }], NOW);
assert(Object.keys(red[0].visiblePicks).join(",") === "QF1", "pre-lock pick hidden from board");
assert(red[0].submittedFixtureIds.length === 2 && !("picks" in red[0]) , "submission visible as locked chip, raw picks not exposed");

const synth = (pair) => scorePicks(
  { F: { winner: "ARG", h: 2, a: 1, pair } },
  [{ id: "F", homeId: "ARG", awayId: "FRA", result: { homeGoals: 2, awayGoals: 1 } }]
).points;
assert(synth(["ARG", "ESP"]) === 3, "projected final: right champion, wrong pairing = 3");
assert(synth(["ARG", "FRA"]) === 5, "projected final: pairing + winner-first score = 5");
assert(scorePicks(
  { F: { winner: "ARG", h: 1, a: 2, pair: ["FRA", "ARG"] } },
  [{ id: "F", homeId: "ARG", awayId: "FRA", result: { homeGoals: 2, awayGoals: 1 } }]
).points === 5, "projected final: orientation-independent exact score");

assert(effectiveLock(data, "SF1", {}) === parseKickoffIST("2026-07-15 00:30"), "real matchup locks at own kickoff");

// Third-place-style playoff: participants come from the LOSERS of two
// earlier fixtures via "homeFromLoser"/"awayFromLoser", not winners.
const loserProbe = {
  ...data,
  fixtures: [
    { id: "X1", round: "SF", home: "FRA", away: "ESP", kickoffIST: "2026-07-15 00:30", result: { homeGoals: 0, awayGoals: 2 } },
    { id: "X2", round: "SF", home: "ENG", away: "ARG", kickoffIST: "2026-07-16 00:30", result: { homeGoals: 1, awayGoals: 2 } },
    { id: "X3", round: "TP", homeFromLoser: "X1", awayFromLoser: "X2", kickoffIST: "2026-07-18 20:00", result: null },
  ],
};
const x3resolved = resolveBracket(loserProbe).find((f) => f.id === "X3");
assert(x3resolved.known && x3resolved.homeId === "FRA" && x3resolved.awayId === "ENG", "loser-derived fixture resolves once both feeders finish");
const x3parts = projectParticipants(loserProbe, {}).X3;
assert(x3parts.real && x3parts.homeId === "FRA" && x3parts.awayId === "ENG", "projection also resolves loser-derived fixture");
assert(effectiveLock(loserProbe, "X3", {}) === parseKickoffIST("2026-07-18 20:00"), "loser-derived fixture locks at its own kickoff once real");

const loserProbeEarly = { ...loserProbe, fixtures: loserProbe.fixtures.map((f) => (f.id === "X2" ? { ...f, result: null } : f)) };
const x3early = resolveBracket(loserProbeEarly).find((f) => f.id === "X3");
assert(!x3early.known, "loser-derived fixture stays unknown until both feeders are done");
assert(
  effectiveLock(loserProbeEarly, "X3", {}) === Math.min(parseKickoffIST("2026-07-15 00:30"), parseKickoffIST("2026-07-16 00:30")),
  "unresolved loser-derived fixture locks at earliest feeder kickoff"
);

if (baseline) {
  console.log("\n--- baseline-state checks (QF1+QF2 only) ---");
  assert(known.length === 5, "exactly SF1 resolved");
  const bp = getBenchmarkPicks(data, resolved);
  assert(Object.keys(bp.engine).length === 5 && bp.engine.SF1?.live === true, "engine: 4 frozen + live SF1");
  assert(scorePicks(bp.engine, resolved).points === 8, "engine on 8 pts");
  assert(scorePicks(bp.ni1, resolved).points === 6, "human benchmark on 6 pts");
  assert(effectiveLock(data, "SF2", {}) === parseKickoffIST("2026-07-12 02:30"), "projected SF2 locks at QF3 kickoff");
  assert(effectiveLock(data, "FINAL", {}) === parseKickoffIST("2026-07-15 00:30"), "projected final locks at SF1 kickoff");

  const chain = validateSubmission(data, {
    id: "p-12345678", name: "Atul",
    picks: {
      SF1: { winner: "ESP", h: 0, a: 1 },
      QF3: { winner: "ENG", h: 1, a: 2 },
      QF4: { winner: "ARG", h: 2, a: 0 },
      SF2: { winner: "ARG", h: 1, a: 2 },
      FINAL: { winner: "ARG", h: 2, a: 1 },
    },
  }, NOW);
  assert(Object.keys(chain.allowed).length === 5, "full bracket chain accepted in one submission");
  assert((chain.allowed.SF2.pair ?? []).join(",") === "ENG,ARG", "SF2 pairing projected from QF picks");
  assert((chain.allowed.FINAL.pair ?? []).join(",") === "ESP,ARG", "final pairing projected from SF picks");
  assert(chain.allowed.SF1.pair === undefined, "real matchup carries no pair snapshot");

  const parts = projectParticipants(data, { SF1: { winner: "ESP" }, QF3: { winner: "ENG" }, QF4: { winner: "ARG" }, SF2: { winner: "ARG" } });
  assert(parts.FINAL.homeId === "ESP" && parts.FINAL.awayId === "ARG", "user picks project the final pairing");

  const after = cascadeInvalidate(data, {
    SF1: { winner: "FRA" },
    QF3: { winner: "ENG" }, QF4: { winner: "ARG" }, SF2: { winner: "ARG" },
    FINAL: { winner: "ESP", h: 1, a: 0, pair: ["ESP", "ARG"] },
  });
  assert(!("FINAL" in after) && "SF2" in after, "flipping a semifinal drops the stale final pick only");
} else {
  console.log(`\n(skipped baseline-state checks — bracket has advanced: [${finished}])`);
}

if (failures > 0) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log("\nall checks green");

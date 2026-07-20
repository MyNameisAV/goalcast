// Bracket resolution, model picks, sharing and scoring.
// Pure functions on top of engine.js — no state, no network.

import { analyzeMatch, effElo } from "./engine.js";
import { effectiveLock, projectParticipants } from "./projection.js";

// The live URL is derived at runtime from wherever the app is deployed,
// so there is no constant to forget. Fallback is only for CLI tests.
export const FALLBACK_SITE_URL = "https://goalcast-2026.netlify.app";
export const siteUrl = () =>
  typeof window !== "undefined" && window.location?.origin?.startsWith("http")
    ? window.location.origin
    : FALLBACK_SITE_URL;

export const pct = (x) => `${(100 * x).toFixed(1)}%`;

/**
 * Walk the fixture list, propagate winners of recorded results into
 * later rounds (and losers into "homeFromLoser"/"awayFromLoser" slots —
 * e.g. a third-place playoff), and attach a full model analysis wherever
 * both participants are known.
 */
export function resolveBracket(data) {
  const winners = {};
  const losers = {};
  const out = [];
  for (const f of data.fixtures) {
    const homeId = f.home ?? winners[f.homeFrom] ?? losers[f.homeFromLoser] ?? null;
    const awayId = f.away ?? winners[f.awayFrom] ?? losers[f.awayFromLoser] ?? null;
    const known = Boolean(homeId && awayId);

    if (f.result && known) {
      const { homeGoals, awayGoals, winner } = f.result;
      const w =
        winner ?? (homeGoals > awayGoals ? homeId : awayGoals > homeGoals ? awayId : null);
      winners[f.id] = w;
      losers[f.id] = w === homeId ? awayId : homeId;
    }

    out.push({
      ...f,
      homeId,
      awayId,
      known,
      analysis: known
        ? analyzeMatch(effElo(data.teams[homeId]), effElo(data.teams[awayId]), data.config)
        : null,
    });
  }
  return out;
}

/**
 * The engine's own pick for a fixture: the side with the higher
 * advance probability, and the most likely scoreline in which that
 * side wins in 90 minutes.
 */
export function modelPick(fx) {
  if (!fx.known || !fx.analysis) return null;
  const homeWins = fx.analysis.advanceHome >= fx.analysis.advanceAway;
  const winner = homeWins ? fx.homeId : fx.awayId;
  const score =
    fx.analysis.topScores.find((s) => (homeWins ? s.h > s.a : s.a > s.h)) ??
    fx.analysis.topScores[0];
  return { winner, h: score.h, a: score.a };
}

export function roundLabel(round) {
  return { QF: "Quarterfinal", SF: "Semifinal", TP: "Bronze Final", F: "Final" }[round] ?? round;
}

/**
 * Score saved picks against recorded results.
 * Correct winner (incl. ET/pens): 3 pts. Exact 90' score: +2.
 */
export function scorePicks(picks, resolved) {
  let points = 0;
  const rows = [];
  for (const fx of resolved) {
    const p = picks[fx.id];
    if (!p || !fx.result) continue;
    const { homeGoals, awayGoals, winner } = fx.result;
    const realWinner =
      winner ?? (homeGoals > awayGoals ? fx.homeId : awayGoals > homeGoals ? fx.awayId : null);
    const winnerRight = p.winner === realWinner;
    let scoreRight;
    if (Array.isArray(p.pair)) {
      // Projected pick: exact-score bonus only if the projected pairing
      // matched reality; compare winner-first to ignore orientation.
      const pairMatches =
        new Set(p.pair).size === 2 &&
        p.pair.includes(fx.homeId) &&
        p.pair.includes(fx.awayId);
      const realHi = Math.max(homeGoals, awayGoals);
      const realLo = Math.min(homeGoals, awayGoals);
      const pickHi = Math.max(Number(p.h), Number(p.a));
      const pickLo = Math.min(Number(p.h), Number(p.a));
      scoreRight = pairMatches && winnerRight && realHi === pickHi && realLo === pickLo;
    } else {
      scoreRight = Number(p.h) === homeGoals && Number(p.a) === awayGoals;
    }
    const pts = (winnerRight ? 3 : 0) + (scoreRight ? 2 : 0);
    points += pts;
    rows.push({ id: fx.id, winnerRight, scoreRight, pts });
  }
  return { points, rows };
}

/** WhatsApp-ready summary of my picks vs the engine's. */
export function buildShareText(picks, resolved, teams) {
  const lines = ["⚽ GoalCast — my picks vs the engine"];
  for (const fx of resolved) {
    const p = picks[fx.id];
    if (!p || !p.winner || !fx.known) continue;
    const m = modelPick(fx);
    const name = (id) => teams[id]?.name ?? "—";
    lines.push(
      `${fx.id} ${name(fx.homeId)}–${name(fx.awayId)}: me ${p.h}-${p.a} (${name(p.winner)})` +
        (m ? ` · engine ${m.h}-${m.a} (${name(m.winner)})` : "")
    );
  }
  lines.push(`Think you can beat the AI? ${siteUrl()}`);
  return lines.join("\n");
}

/**
 * Benchmark picks per player. The engine's picks come from frozen
 * snapshots in data.json (locked pre-kickoff, committed to git);
 * for known fixtures without a snapshot yet, fall back to the live
 * model pick so upcoming rounds are never blank.
 */
export function getBenchmarkPicks(data, resolved) {
  const bm = data.benchmarks ?? { players: [], picks: {} };
  const out = {};
  for (const player of bm.players) {
    out[player.id] = { ...(bm.picks[player.id] ?? {}) };
  }
  if (out.engine) {
    for (const fx of resolved) {
      if (fx.known && !out.engine[fx.id]) {
        const m = modelPick(fx);
        if (m) out.engine[fx.id] = { ...m, live: true };
      }
    }
  }
  return out;
}

/** Parse our IST kickoff strings ("2026-07-11 00:30") into epoch ms. */
export function parseKickoffIST(s) {
  return new Date(s.replace(" ", "T") + ":00+05:30").getTime();
}

/** A fixture is locked once kickoff has passed — no pick changes after. */
export function isLocked(fx, now = Date.now()) {
  return parseKickoffIST(fx.kickoffIST) <= now;
}

/** Per-match share text: my call vs the engine's, for one fixture. */
export function buildMatchShareText(fx, pick, enginePick, teams) {
  const H = teams[fx.homeId];
  const A = teams[fx.awayId];
  const fmt = (p) =>
    p.h != null && p.a != null
      ? `${teams[p.winner].name} ${p.h}-${p.a}`
      : teams[p.winner].name;
  const lines = [`⚽ ${H.name} v ${A.name} — ${fx.kickoffIST} IST`, `My call: ${fmt(pick)}`];
  if (enginePick) lines.push(`🤖 Engine: ${fmt(enginePick)}`);
  lines.push(`Whose side are you on? ${siteUrl()}`);
  return lines.join("\n");
}

/**
 * Server-side validation for leaderboard submissions. Pure — used by the
 * Netlify function and by the CLI tests. Picks for locked (kicked-off)
 * fixtures are counted but never accepted.
 */
export function validateSubmission(data, body, now = Date.now(), existingPicks = {}) {
  if (!body || typeof body !== "object") return { ok: false, error: "bad payload" };
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 24) : "";
  if (id.length < 8 || id.length > 64) return { ok: false, error: "bad player id" };
  if (!name) return { ok: false, error: "nickname required" };
  if (name.includes("@")) return { ok: false, error: "use a nickname, not an email" };
  if (!/[\p{L}\p{N}]/u.test(name)) return { ok: false, error: "nickname needs letters or numbers" };

  const allowed = {};
  let rejectedLocked = 0;
  const src = body.picks && typeof body.picks === "object" ? body.picks : {};
  // Bracket order matters: an accepted SF pick projects the FINAL pairing.
  const working = { ...existingPicks };
  for (const f of data.fixtures) {
    const p = src[f.id];
    if (!p || typeof p !== "object") continue;
    const parts = projectParticipants(data, working)[f.id];
    if (!parts.homeId || !parts.awayId) continue; // pairing not derivable yet
    if (effectiveLock(data, f.id, working) <= now) {
      rejectedLocked++;
      continue;
    }
    const winner = p.winner === parts.homeId || p.winner === parts.awayId ? p.winner : null;
    if (!winner) continue;
    const clean = { winner };
    const h = Number(p.h);
    const a = Number(p.a);
    if (Number.isInteger(h) && Number.isInteger(a) && h >= 0 && h <= 9 && a >= 0 && a <= 9) {
      clean.h = h;
      clean.a = a;
    }
    if (!parts.real) clean.pair = [parts.homeId, parts.awayId];
    allowed[f.id] = clean;
    working[f.id] = clean;
  }
  return { ok: true, id, name, allowed, rejectedLocked };
}

/**
 * Public-board redaction: pick details stay hidden until the fixture's
 * effective lock passes — you can see THAT someone has picked, not what.
 */
export function redactPlayers(data, players, now = Date.now()) {
  return players.map((pl) => {
    const visiblePicks = {};
    const submittedFixtureIds = [];
    for (const [fid, pick] of Object.entries(pl.picks ?? {})) {
      submittedFixtureIds.push(fid);
      if (effectiveLock(data, fid, pl.picks) <= now) visiblePicks[fid] = pick;
    }
    return { name: pl.name, visiblePicks, submittedFixtureIds, updatedAt: pl.updatedAt };
  });
}

/**
 * Score-first picking: the winner follows from the scoreline. A level
 * score keeps a previously chosen advancing side if still valid,
 * otherwise leaves the tie undecided until the user picks who goes
 * through on ET/pens.
 */
export function deriveWinner(fx, h, a, currentWinner = null) {
  if (h > a) return fx.homeId;
  if (a > h) return fx.awayId;
  return currentWinner === fx.homeId || currentWinner === fx.awayId ? currentWinner : null;
}

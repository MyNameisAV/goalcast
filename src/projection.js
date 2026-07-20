// Bracket projection: participants for every fixture flow from actual
// results first, then from the given picks (user's or engine's).
// Pure functions — shared by the UI, the server validator, and tests.

import { parseKickoffIST } from "./logic.js";

/**
 * Walk fixtures in bracket order and derive each fixture's participants
 * from recorded results, falling back to the supplied picks.
 * Returns { [fixtureId]: { homeId, awayId, real } } where real=true means
 * both participants come from actual results.
 */
export function projectParticipants(data, picks = {}) {
  const winners = {}; // real winners from results
  const losers = {}; // real losers from results (for "homeFromLoser" slots)
  const projected = {}; // winner per fixture: real result ?? pick
  const out = {};
  for (const f of data.fixtures) {
    const homeReal = f.home ?? winners[f.homeFrom] ?? losers[f.homeFromLoser] ?? null;
    const awayReal = f.away ?? winners[f.awayFrom] ?? losers[f.awayFromLoser] ?? null;
    let homeId = homeReal ?? projected[f.homeFrom] ?? null;
    let awayId = awayReal ?? projected[f.awayFrom] ?? null;
    // A stored projected pick is self-describing: its pair was validated
    // when accepted. Trust it only when nothing fresher is known.
    const pr = picks[f.id]?.pair;
    if (!homeId && !awayId && Array.isArray(pr) && pr.length === 2) {
      [homeId, awayId] = pr;
    }
    out[f.id] = { homeId, awayId, real: Boolean(homeReal && awayReal) };

    if (f.result && homeReal && awayReal) {
      const { homeGoals, awayGoals, winner } = f.result;
      const w =
        winner ?? (homeGoals > awayGoals ? homeReal : awayGoals > homeGoals ? awayReal : null);
      winners[f.id] = w;
      losers[f.id] = w === homeReal ? awayReal : homeReal;
      projected[f.id] = w;
    } else {
      const p = picks[f.id];
      projected[f.id] =
        p?.winner && (p.winner === homeId || p.winner === awayId) ? p.winner : null;
    }
  }
  return out;
}

/**
 * When a fixture's picks lock. Real matchup: its own kickoff. Projected
 * matchup: the earliest kickoff of its direct qualifiers — once reality
 * starts overwriting your assumptions, the projection closes. When the
 * matchup later becomes real, its own kickoff governs again.
 */
export function effectiveLock(data, fixtureId, picks = {}) {
  const fx = data.fixtures.find((f) => f.id === fixtureId);
  if (!fx) return 0;
  const parts = projectParticipants(data, picks)[fixtureId];
  if (parts.real) return parseKickoffIST(fx.kickoffIST);
  const deps = [fx.homeFrom, fx.awayFrom, fx.homeFromLoser, fx.awayFromLoser]
    .map((id) => data.fixtures.find((f) => f.id === id))
    .filter(Boolean)
    .map((f) => parseKickoffIST(f.kickoffIST));
  return deps.length ? Math.min(...deps, parseKickoffIST(fx.kickoffIST)) : parseKickoffIST(fx.kickoffIST);
}

/**
 * After a pick changes, downstream picks whose winner is no longer in
 * their projected pairing are dropped (cascading, in bracket order).
 */
export function cascadeInvalidate(data, picks) {
  const next = { ...picks };
  for (const f of data.fixtures) {
    const p = next[f.id];
    if (!p?.winner) continue;
    const parts = projectParticipants(data, next)[f.id];
    if (p.winner !== parts.homeId && p.winner !== parts.awayId) {
      delete next[f.id];
    }
  }
  return next;
}

/** The engine's own full-bracket entry: SF picks chained into a final pick. */
export function engineBracket(data, resolved, modelPickFn, analyzeFn) {
  const picks = {};
  for (const f of data.fixtures) {
    const parts = projectParticipants(data, picks)[f.id];
    if (!parts.homeId || !parts.awayId) continue;
    const fx = resolved.find((r) => r.id === f.id);
    if (fx?.result) continue; // already played
    const enriched = {
      ...f,
      homeId: parts.homeId,
      awayId: parts.awayId,
      known: true,
      analysis: analyzeFn(parts.homeId, parts.awayId),
    };
    const m = modelPickFn(enriched);
    if (m) picks[f.id] = { ...m, pair: [parts.homeId, parts.awayId] };
  }
  return picks;
}

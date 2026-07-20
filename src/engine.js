// GoalCast prediction engine — Elo + Poisson + Monte Carlo
// Pure functions, zero dependencies. Runs in the browser (Vite) and Node >= 18.
// Everything is driven by data.json; no network calls, no keys.

// ---------------- core math ----------------

/** Classic Elo expectation: P(A beats B) given rating difference. */
export function eloExpected(eloA, eloB, scale = 400) {
  return 1 / (1 + Math.pow(10, -(eloA - eloB) / scale));
}

/**
 * Effective rating: base Elo plus any disclosed situational adjustment
 * (eloAdjust on the team, e.g. -35 for a suspended key player).
 * Rule of thumb: a side's best player is worth roughly 30-50 points.
 */
export function effElo(team) {
  return team.elo + (team.eloAdjust ?? 0);
}

const FACT = [1];
for (let i = 1; i <= 16; i++) FACT[i] = FACT[i - 1] * i;

/** Poisson probability mass: P(k goals | expected lambda). */
export function poissonPmf(k, lambda) {
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / FACT[k];
}

function clamp(x, lo, hi) {
  return Math.min(hi, Math.max(lo, x));
}

/**
 * Expected goals for each side, derived from the Elo gap.
 * Multiplicative tilt: favourite's lambda grows, underdog's shrinks,
 * total goals rise slightly for mismatches (realistic for knockouts).
 */
export function matchLambdas(eloHome, eloAway, cfg) {
  const factor = Math.pow(10, (eloHome - eloAway) / cfg.eloGoalScale);
  return [
    clamp(cfg.baseGoalsPerTeam * factor, 0.25, 4.0),
    clamp(cfg.baseGoalsPerTeam / factor, 0.25, 4.0),
  ];
}

/**
 * Full analysis of one knockout tie:
 * 90-minute win/draw/win, advance probability including ET/pens,
 * and the most likely scorelines. This is the "transparency page" payload.
 */
export function analyzeMatch(eloHome, eloAway, cfg) {
  const [lh, la] = matchLambdas(eloHome, eloAway, cfg);
  const n = cfg.maxGoals;
  let pHome = 0, pDraw = 0, pAway = 0;
  const scores = [];
  for (let h = 0; h <= n; h++) {
    const ph = poissonPmf(h, lh);
    for (let a = 0; a <= n; a++) {
      const p = ph * poissonPmf(a, la);
      scores.push({ h, a, p });
      if (h > a) pHome += p;
      else if (h === a) pDraw += p;
      else pAway += p;
    }
  }
  // Renormalise the truncated tail (goals > maxGoals).
  const total = pHome + pDraw + pAway;
  pHome /= total; pDraw /= total; pAway /= total;
  for (const s of scores) s.p /= total;
  scores.sort((x, y) => y.p - x.p);

  // If level after 90', a slightly softer Elo curve decides ET/pens.
  const pensHome = eloExpected(eloHome, eloAway, cfg.pensEloScale);
  return {
    lambdas: [lh, la],
    pHome, pDraw, pAway,
    pensHome,
    advanceHome: pHome + pDraw * pensHome,
    advanceAway: pAway + pDraw * (1 - pensHome),
    topScores: scores.slice(0, 6),
  };
}

// ---------------- Monte Carlo ----------------

/** Deterministic RNG so simulations are reproducible (fixed seed in data.json). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function samplePoisson(lambda, rng) {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rng(); } while (p > L);
  return k - 1;
}

/** Play one fixture: use the recorded result if present, otherwise sample. */
function playFixture(homeId, awayId, teams, cfg, rng, recorded) {
  if (recorded) {
    const { homeGoals, awayGoals } = recorded;
    let winner = recorded.winner
      ?? (homeGoals > awayGoals ? homeId : awayGoals > homeGoals ? awayId : null);
    if (!winner) {
      throw new Error(
        `Recorded draw needs an explicit "winner" (ET/pens): ${homeId} v ${awayId}`
      );
    }
    return { homeGoals, awayGoals, winner, pens: homeGoals === awayGoals };
  }
  const [lh, la] = matchLambdas(effElo(teams[homeId]), effElo(teams[awayId]), cfg);
  const hg = samplePoisson(lh, rng);
  const ag = samplePoisson(la, rng);
  if (hg !== ag) {
    return { homeGoals: hg, awayGoals: ag, winner: hg > ag ? homeId : awayId, pens: false };
  }
  const pensHome = eloExpected(effElo(teams[homeId]), effElo(teams[awayId]), cfg.pensEloScale);
  return { homeGoals: hg, awayGoals: ag, winner: rng() < pensHome ? homeId : awayId, pens: true };
}

/**
 * Simulate the remaining bracket `runs` times.
 * Recorded results in data.json are treated as fixed; only unplayed
 * fixtures are sampled — so the numbers sharpen as real results land.
 */
export function simulateTournament(data, runs = data.config.simRuns, seed = data.config.seed) {
  const { teams, config: cfg } = data;
  const rng = mulberry32(seed);

  const tally = {};
  for (const id of Object.keys(teams)) tally[id] = { reachFinal: 0, champion: 0 };
  const pairings = new Map();
  const finalScores = new Map();
  const finalResults = new Map();

  for (let r = 0; r < runs; r++) {
    const winners = {};
    const losers = {};
    for (const f of data.fixtures) {
      const home = f.home ?? winners[f.homeFrom] ?? losers[f.homeFromLoser];
      const away = f.away ?? winners[f.awayFrom] ?? losers[f.awayFromLoser];
      const res = playFixture(home, away, teams, cfg, rng, f.result);
      winners[f.id] = res.winner;
      losers[f.id] = res.winner === home ? away : home;

      if (f.id === "FINAL") {
        tally[home].reachFinal++;
        tally[away].reachFinal++;
        tally[res.winner].champion++;

        const key = [home, away].sort().join(" v ");
        pairings.set(key, (pairings.get(key) || 0) + 1);

        const wg = Math.max(res.homeGoals, res.awayGoals);
        const lg = Math.min(res.homeGoals, res.awayGoals);
        const sk = res.pens ? `${wg}-${lg} (pens)` : `${wg}-${lg}`;
        finalScores.set(sk, (finalScores.get(sk) || 0) + 1);
        const loser = res.winner === home ? away : home;
        const rk = `${res.winner}|${loser}|${wg}|${lg}|${res.pens ? 1 : 0}`;
        finalResults.set(rk, (finalResults.get(rk) || 0) + 1);
      }
    }
  }

  const sorted = (m) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([key, v]) => ({ key, p: v / runs }));

  return {
    runs,
    teams: Object.entries(tally)
      .map(([id, t]) => ({ id, reachFinal: t.reachFinal / runs, champion: t.champion / runs }))
      .sort((a, b) => b.champion - a.champion),
    finalPairings: sorted(pairings),
    finalScores: sorted(finalScores),
    finalResults: [...finalResults.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => {
        const [winner, loser, wg, lg, pens] = k.split("|");
        return { winner, loser, wg: +wg, lg: +lg, pens: pens === "1", p: v / runs };
      }),
  };
}

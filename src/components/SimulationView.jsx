import { useMemo } from "react";
import { simulateTournament } from "../engine.js";
import { pct } from "../logic.js";
import TeamMark from "./TeamMark.jsx";
import ScenarioLab from "./ScenarioLab.jsx";

function ProbRow({ label, team, value, max, red }) {
  return (
    <div className="flex items-center gap-3">
      <TeamMark team={team} />
      <span className="w-28 font-[family-name:var(--font-display)] uppercase tracking-wide">
        {label}
      </span>
      <div className="pitchbar pitchbar--nohalf flex-1">
        <div
          className={`pitchbar-fill ${red ? "pitchbar-fill--red" : ""}`}
          style={{ width: `${(100 * value) / max}%` }}
        />
      </div>
      <span className="w-16 text-right font-[family-name:var(--font-data)] text-sm">
        {pct(value)}
      </span>
    </div>
  );
}

export default function SimulationView({ data }) {
  const sim = useMemo(() => simulateTournament(data), [data]);
  const maxChamp = sim.teams[0].champion;

  const topFinalist = [...sim.teams].sort((a, b) => b.reachFinal - a.reachFinal)[0];
  const topChampion = sim.teams[0];
  const top = sim.finalResults[0];
  const headline = top
    ? ` The single most likely final: ${data.teams[top.winner].name} ${top.wg}-${top.lg} ${
        data.teams[top.loser].name
      }${top.pens ? " on penalties" : ""} (${pct(top.p)}).`
    : "";
  const condFinals = sim.finalPairings.slice(0, 2).map((pair) => {
    const [a, b] = pair.key.split(" v ");
    const rows = sim.finalResults.filter(
      (r) => (r.winner === a && r.loser === b) || (r.winner === b && r.loser === a)
    );
    const total = rows.reduce((t, r) => t + r.p, 0) || 1;
    const winA = rows.filter((r) => r.winner === a).reduce((t, r) => t + r.p, 0) / total;
    return { a, b, p: pair.p, winA, top: rows.slice(0, 3).map((r) => ({ ...r, cond: r.p / total })) };
  });

  const insight =
    (topFinalist.id !== topChampion.id
      ? `${data.teams[topFinalist.id].name} reach the final most often (${pct(
          topFinalist.reachFinal
        )}) — the softer path. But ${data.teams[topChampion.id].name} win the tournament more (${pct(
          topChampion.champion
        )}): when they get there, they win it. Path and strength are different things.`
      : `${data.teams[topChampion.id].name} lead both paths: most likely finalist and most likely champion.`) +
    headline;

  return (
    <div className="flex flex-col gap-6">
      <div className="card p-4">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold uppercase tracking-wide mb-3">
          Champion probability
        </h2>
        <div className="flex flex-col gap-2">
          {sim.teams.map((t) => (
            <ProbRow
              key={t.id}
              label={data.teams[t.id].name}
              team={data.teams[t.id]}
              value={t.champion}
              max={maxChamp}
            />
          ))}
        </div>
        <p className="mt-3 text-xs font-[family-name:var(--font-data)] opacity-70">
          {sim.runs.toLocaleString()} Monte Carlo runs · seeded and reproducible · recorded
          results locked in, unplayed matches simulated
        </p>
      </div>

      <div className="card p-4 border-l-4" style={{ borderLeftColor: "var(--color-gold)" }}>
        <p className="text-sm leading-relaxed">{insight}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="card p-4">
          <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold uppercase tracking-wide mb-3">
            Most likely finals
          </h3>
          <div className="flex flex-col gap-2">
            {sim.finalPairings.slice(0, 5).map((p) => (
              <div key={p.key} className="flex justify-between font-[family-name:var(--font-data)] text-sm">
                <span className="flex items-center gap-2 flex-wrap">
                  {p.key.split(" v ").map((id, i) => (
                    <span key={id} className="flex items-center gap-1">
                      {i > 0 && <span className="opacity-60 pr-1">v</span>}
                      <TeamMark team={data.teams[id]} /> {data.teams[id].name}
                    </span>
                  ))}
                </span>
                <span>{pct(p.p)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-4">
          <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold uppercase tracking-wide mb-3">
            If the final is…
          </h3>
          <div className="flex flex-col gap-5">
            {condFinals.map((cf) => (
              <div key={cf.a + cf.b} className="flex flex-col gap-2">
                <div className="flex items-center gap-2 flex-wrap text-sm">
                  <TeamMark team={data.teams[cf.a]} /> {data.teams[cf.a].name}
                  <span className="opacity-60">v</span>
                  {data.teams[cf.b].name} <TeamMark team={data.teams[cf.b]} />
                  <span className="ml-auto font-[family-name:var(--font-data)] opacity-70">
                    {pct(cf.p)} of simulations
                  </span>
                </div>
                <div className="pitchbar" title="Chalk line marks 50%">
                  <div className="pitchbar-fill" style={{ width: pct(cf.winA) }} />
                </div>
                <div className="flex justify-between font-[family-name:var(--font-data)] text-xs">
                  <span>
                    {data.teams[cf.a].code} lift it {pct(cf.winA)}
                  </span>
                  <span>
                    {data.teams[cf.b].code} lift it {pct(1 - cf.winA)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {cf.top.map((r) => (
                    <span key={`${r.winner}${r.wg}${r.lg}${r.pens}`} className="plate plate--outline text-xs">
                      <span>
                        {data.teams[r.winner].code} {r.wg}-{r.lg}
                        {r.pens ? " (pens)" : ""} · {pct(r.cond)}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs opacity-70">
            Scoreline chances shown within that matchup.{" "}
            <strong>Model insight:</strong> a one-goal margin decides{" "}
            {pct(sim.finalResults.filter((r) => !r.pens && r.wg - r.lg === 1).reduce((t, r) => t + r.p, 0))}{" "}
            of simulated finals, and{" "}
            {pct(sim.finalResults.filter((r) => r.pens).reduce((t, r) => t + r.p, 0))} are level
            after 90 minutes and go to penalties.
          </p>
        </div>
      </div>

      <ScenarioLab data={data} />
    </div>
  );
}

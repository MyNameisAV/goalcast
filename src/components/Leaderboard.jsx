import { useEffect, useMemo, useState } from "react";
import { getBenchmarkPicks, roundLabel, scorePicks } from "../logic.js";
import TeamMark from "./TeamMark.jsx";

const ICON = { ai: "🤖", human: "🧠", live: "⚽" };

function pickLabel(pick, teams) {
  if (!pick?.winner) return "—";
  const t = teams[pick.winner];
  return pick.h != null && pick.a != null
    ? `${t.code} ${pick.h}-${pick.a}`
    : `${t.code} (${t.name})`;
}

/** gold plate = exact score, outlined ✓ = winner, dim = miss, plain = pending */
function PickChip({ name, pick, row, teams }) {
  if (!pick) return null;
  const cls = row
    ? row.scoreRight
      ? "plate plate--gold"
      : row.winnerRight
        ? "plate plate--outline"
        : "plate plate--outline opacity-40"
    : "plate plate--outline";
  return (
    <span className={`${cls} text-xs`}>
      <span>
        {name}: {pickLabel(pick, teams)}
        {row ? (row.scoreRight ? " 🎯" : row.winnerRight ? " ✓" : " ✗") : ""}
      </span>
    </span>
  );
}

export default function Leaderboard({ data, resolved }) {
  const [live, setLive] = useState([]);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    fetch("/api/board")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j) => {
        setLive(Array.isArray(j.players) ? j.players : []);
        setStatus("ok");
      })
      .catch(() => setStatus("offline"));
  }, []);

  const benchPicks = useMemo(() => getBenchmarkPicks(data, resolved), [data, resolved]);

  const players = useMemo(() => {
    const curated = (data.benchmarks?.players ?? []).map((p) => ({
      key: p.id,
      name: p.name,
      kind: p.kind,
      picks: benchPicks[p.id] ?? {},
    }));
    const community = live.map((p, i) => ({
      key: `live-${i}`,
      name: p.name,
      kind: "live",
      picks: p.visiblePicks ?? p.picks ?? {},
      submitted: p.submittedFixtureIds ?? Object.keys(p.visiblePicks ?? p.picks ?? {}),
    }));
    const withSubmitted = curated.map((c) => ({ ...c, submitted: Object.keys(c.picks) }));
    return [...withSubmitted, ...community]
      .map((p) => {
        const s = scorePicks(p.picks, resolved);
        return { ...p, points: s.points, exact: s.rows.filter((r) => r.scoreRight).length, played: s.rows.length };
      })
      .sort((a, b) => b.points - a.points || b.exact - a.exact);
  }, [data, resolved, benchPicks, live]);

  const rows = resolved.filter(
    (fx) =>
      fx.known && players.some((p) => p.picks[fx.id] || p.submitted?.includes(fx.id))
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="card p-4">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-extrabold uppercase tracking-wide">
          Leaderboard
        </h2>
        <p className="text-sm opacity-80 mb-3 max-w-2xl">
          Humans vs the machine. Winner 3 points, exact 90-minute score adds 2. Frozen engine
          picks are committed before kickoff; community picks stay hidden until each match
          locks.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs uppercase tracking-widest opacity-60">
                <th className="py-1 pr-2">#</th>
                <th className="py-1 pr-2">Player</th>
                <th className="py-1 pr-2 text-right">Exact</th>
                <th className="py-1 pr-2 text-right">Matches</th>
                <th className="py-1 text-right">Points</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p, i) => (
                <tr
                  key={p.key}
                  className="border-t"
                  style={{
                    borderColor: "rgba(242,245,239,0.12)",
                    background: p.kind === "ai" ? "rgba(232,184,75,0.08)" : undefined,
                  }}
                >
                  <td className="py-2 pr-2 font-[family-name:var(--font-data)]">{i + 1}</td>
                  <td className="py-2 pr-2">
                    <span className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-wide">
                      {ICON[p.kind]} {p.name}
                    </span>
                  </td>
                  <td className="py-2 pr-2 text-right font-[family-name:var(--font-data)]">
                    {p.exact} 🎯
                  </td>
                  <td className="py-2 pr-2 text-right font-[family-name:var(--font-data)] opacity-70">
                    {p.played}
                  </td>
                  <td
                    className="py-2 text-right font-[family-name:var(--font-display)] text-2xl font-extrabold"
                    style={i === 0 && p.points > 0 ? { color: "var(--color-gold)" } : undefined}
                  >
                    {p.points}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data.benchmarks?.note && (
          <p className="mt-3 text-xs opacity-60 max-w-2xl">{data.benchmarks.note}</p>
        )}

        {status === "loading" && (
          <p className="mt-2 text-xs opacity-60 font-[family-name:var(--font-data)]">
            loading community picks…
          </p>
        )}
        {status === "offline" && (
          <p className="mt-2 text-xs opacity-60">
            Live board unreachable right now — showing benchmark players. Your picks still
            count once it's back.
          </p>
        )}
        {status === "ok" && live.length === 0 && (
          <p className="mt-2 text-sm opacity-80">
            Nobody has challenged the machine yet. Make your picks in{" "}
            <strong>Beat the AI</strong> and join the board — first in gets bragging rights.
          </p>
        )}
      </div>

      {rows.map((fx) => {
        const H = data.teams[fx.homeId];
        const A = data.teams[fx.awayId];
        return (
          <div key={fx.id} className="card p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 flex-wrap text-xs uppercase tracking-widest opacity-80">
              <span className="plate plate--outline text-[11px]">
                <span>{roundLabel(fx.round)}</span>
              </span>
              <span className="flex items-center gap-2 font-[family-name:var(--font-display)] text-base normal-case tracking-normal">
                <TeamMark team={H} /> {H.name} <span className="opacity-60">v</span> {A.name}{" "}
                <TeamMark team={A} />
              </span>
              {fx.result ? (
                <span className="plate ml-auto text-xs">
                  <span>
                    FT {fx.result.homeGoals}-{fx.result.awayGoals}
                    {fx.result.winner && fx.result.homeGoals === fx.result.awayGoals
                      ? ` · ${data.teams[fx.result.winner].name} on pens`
                      : ""}
                  </span>
                </span>
              ) : (
                <span className="font-[family-name:var(--font-data)] ml-auto normal-case">
                  {fx.kickoffIST} IST
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {players.map((p) => {
                const pick = p.picks[fx.id];
                const short = p.kind === "ai" ? "🤖" : p.name.split(" ")[0].slice(0, 12);
                if (!pick) {
                  return p.submitted?.includes(fx.id) ? (
                    <span key={p.key} className="plate plate--outline text-xs opacity-70">
                      <span>{short}: 🔒 in</span>
                    </span>
                  ) : null;
                }
                const row = fx.result ? scorePicks({ [fx.id]: pick }, [fx]).rows[0] : null;
                return <PickChip key={p.key} name={short} pick={pick} row={row} teams={data.teams} />;
              })}
            </div>
          </div>
        );
      })}

      <p className="text-xs opacity-60 max-w-2xl">
        Community picks stay hidden (🔒) until each match locks, then reveal — no copying. The
        engine&apos;s picks are public on purpose: locked ones are frozen in the repository
        before kickoff; provisional ones are labelled &quot;live model&quot;.
      </p>
    </div>
  );
}

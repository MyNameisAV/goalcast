import { useEffect, useMemo, useState } from "react";
import data from "./data.json";
import { getBenchmarkPicks, parseKickoffIST, resolveBracket, scorePicks } from "./logic.js";
import MatchCard from "./components/MatchCard.jsx";
import SimulationView from "./components/SimulationView.jsx";
import BeatTheAI from "./components/BeatTheAI.jsx";
import Leaderboard from "./components/Leaderboard.jsx";
import HowItWorks from "./components/HowItWorks.jsx";

function NextKickoff({ resolved }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, []);
  const next = resolved.find(
    (f) => f.known && !f.result && parseKickoffIST(f.kickoffIST) > Date.now()
  );
  if (!next) return null;
  const ms = parseKickoffIST(next.kickoffIST) - Date.now();
  const h = Math.floor(ms / 3.6e6);
  const m = Math.max(0, Math.floor((ms % 3.6e6) / 6e4));
  return (
    <span className="plate plate--gold text-xs self-center">
      <span>
        Next: {next.homeId} v {next.awayId} in {h}h {m}m
      </span>
    </span>
  );
}

const TABS = [
  { id: "matches", label: "Matches" },
  { id: "beat", label: "Beat the AI" },
  { id: "board", label: "Leaderboard" },
  { id: "simulation", label: "Simulation" },
  { id: "how", label: "How it works" },
];

export default function App() {
  const [tab, setTab] = useState("matches");
  const resolved = useMemo(() => resolveBracket(data), []);
  const record = useMemo(() => {
    const bp = getBenchmarkPicks(data, resolved);
    const s = scorePicks(bp.engine ?? {}, resolved);
    return {
      winners: s.rows.filter((r) => r.winnerRight).length,
      exact: s.rows.filter((r) => r.scoreRight).length,
      total: s.rows.length,
    };
  }, [resolved]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-6">
      <header className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <h1 className="font-[family-name:var(--font-display)] text-5xl font-extrabold uppercase tracking-tight leading-none">
          Goal<span style={{ color: "var(--color-gold)" }}>cast</span>
        </h1>
        <div className="flex flex-col pb-1">
          <span className="text-sm uppercase tracking-widest opacity-80">
            World Cup 2026 · knockout stage
          </span>
          <span className="font-[family-name:var(--font-data)] text-xs opacity-60">
            data updated {data.meta.updated} · Elo: eloratings.net
          </span>
        </div>
        <NextKickoff resolved={resolved} />
      </header>

      <nav className="flex flex-wrap gap-2" role="tablist" aria-label="Views">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className="tabbtn"
            onClick={() => setTab(t.id)}
          >
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      <main>
        {tab === "matches" && (
          <div
            className="card p-4 mb-4 flex flex-wrap items-center gap-3 border-l-4"
            style={{ borderLeftColor: "var(--color-gold)" }}
          >
            <p className="text-sm flex-1 min-w-48">
              The engine has locked its call on every match — think you can read the game
              better?
            </p>
            {record.total > 0 && (
              <span className="plate plate--gold text-xs">
                <span>
                  Engine record: {record.winners}/{record.total} winners
                  {record.exact > 0 ? ` · ${record.exact} exact` : ""}
                </span>
              </span>
            )}
            <button type="button" className="plate plate--gold text-sm" onClick={() => setTab("beat")}>
              <span>Beat the AI →</span>
            </button>
          </div>
        )}
        {tab === "matches" && (
          <div className="grid gap-4 md:grid-cols-2">
            {resolved.map((fx) => (
              <MatchCard key={fx.id} fx={fx} teams={data.teams} />
            ))}
          </div>
        )}
        {tab === "simulation" && <SimulationView data={data} />}
        {tab === "beat" && (
          <BeatTheAI data={data} resolved={resolved} onJoined={() => setTab("board")} />
        )}
        {tab === "board" && <Leaderboard data={data} resolved={resolved} />}
        {tab === "how" && <HowItWorks data={data} />}
      </main>

      <footer className="text-xs opacity-60 pt-4">
        Independent statistical model for a Philips-internal engagement challenge. No official
        tournament data, marks, or media are used.
      </footer>
    </div>
  );
}

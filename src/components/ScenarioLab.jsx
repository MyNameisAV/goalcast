import { useMemo, useState } from "react";
import { analyzeMatch, effElo } from "../engine.js";
import { pct, resolveBracket } from "../logic.js";
import TeamMark from "./TeamMark.jsx";

const PRESETS = [
  { label: "Key player out", value: -40 },
  { label: "Doubtful", value: -20 },
  { label: "Strong lineup", value: +25 },
];

function TeamControls({ team, adj, setAdj }) {
  return (
    <div className="flex flex-col gap-2 flex-1 min-w-56">
      <div className="flex items-center gap-2">
        <TeamMark team={team} size="md" />
        <span className="font-[family-name:var(--font-display)] uppercase tracking-wide font-semibold">
          {team.name}
        </span>
        <span className="ml-auto font-[family-name:var(--font-data)] text-sm">
          {adj > 0 ? `+${adj}` : adj} pts
        </span>
      </div>
      <input
        type="range"
        min={-75}
        max={75}
        step={5}
        value={adj}
        onChange={(e) => setAdj(Number(e.target.value))}
        aria-label={`${team.name} team-news adjustment`}
        style={{ accentColor: "var(--color-gold)" }}
      />
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            className="plate plate--outline text-[11px]"
            onClick={() => setAdj(p.value)}
          >
            <span>
              {p.label} {p.value > 0 ? `+${p.value}` : p.value}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ScenarioLab({ data }) {
  const upcoming = useMemo(
    () => resolveBracket(data).filter((f) => f.known && !f.result),
    [data]
  );
  const [fxId, setFxId] = useState(upcoming[0]?.id);
  const [adjH, setAdjH] = useState(0);
  const [adjA, setAdjA] = useState(0);
  const [note, setNote] = useState("");

  const fx = upcoming.find((f) => f.id === fxId) ?? upcoming[0];
  if (!fx) return null;

  const H = data.teams[fx.homeId];
  const A = data.teams[fx.awayId];
  const base = analyzeMatch(effElo(H), effElo(A), data.config);
  const scen = analyzeMatch(effElo(H) + adjH, effElo(A) + adjA, data.config);
  const delta = 100 * (scen.advanceHome - base.advanceHome);
  const flipped = base.advanceHome >= 0.5 !== scen.advanceHome >= 0.5;
  const topBase = base.topScores[0];
  const topScen = scen.topScores[0];
  const touched = adjH !== 0 || adjA !== 0;

  const selectFx = (id) => {
    setFxId(id);
    setAdjH(0);
    setAdjA(0);
  };

  return (
    <div className="card p-4 flex flex-col gap-4">
      <div>
        <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold uppercase tracking-wide">
          Team News Lab
        </h3>
        <p className="text-sm opacity-80 max-w-2xl">
          Suppose a key player is out — what does the model say? Set your own assumption
          (a side&apos;s best player is worth roughly 30–50 rating points) and watch it
          propagate through the same engine that makes every prediction on this site.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {upcoming.map((f) => (
          <button
            key={f.id}
            type="button"
            className="tabbtn text-xs"
            aria-selected={f.id === fx.id}
            onClick={() => selectFx(f.id)}
          >
            <span>
              {data.teams[f.homeId].code} v {data.teams[f.awayId].code}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-6">
        <TeamControls team={H} adj={adjH} setAdj={setAdjH} />
        <TeamControls team={A} adj={adjA} setAdj={setAdjA} />
      </div>

      <input
        value={note}
        maxLength={80}
        placeholder="Your assumption, e.g. 'star striker doubtful' (optional)"
        aria-label="Scenario assumption note"
        onChange={(e) => setNote(e.target.value)}
      />

      <div className="flex flex-col gap-2">
        <div className="flex justify-between font-[family-name:var(--font-data)] text-xs opacity-70">
          <span>Baseline: {H.code} advance {pct(base.advanceHome)}</span>
          <span>
            likely {topBase.h}-{topBase.a}
            {topBase.h === topBase.a ? ` (${base.pensHome >= 0.5 ? H.code : A.code} on pens)` : ""} · xG{" "}
            {base.lambdas[0].toFixed(2)}:{base.lambdas[1].toFixed(2)}
          </span>
        </div>
        <div className="pitchbar pitchbar--nohalf" style={{ height: "6px", opacity: 0.5 }}>
          <div className="pitchbar-fill" style={{ width: pct(base.advanceHome) }} />
        </div>
        <div className="pitchbar" title="Chalk line marks 50%">
          <div
            className={`pitchbar-fill ${scen.advanceHome < base.advanceHome ? "pitchbar-fill--red" : ""}`}
            style={{ width: pct(scen.advanceHome) }}
          />
        </div>
        <div className="flex justify-between font-[family-name:var(--font-data)] text-sm">
          <span>
            Scenario: {H.code} advance {pct(scen.advanceHome)}{" "}
            <strong>({delta >= 0 ? "+" : ""}{delta.toFixed(1)} pp)</strong>
          </span>
          <span>
            likely {topScen.h}-{topScen.a}
            {topScen.h === topScen.a ? ` (${scen.pensHome >= 0.5 ? H.code : A.code} on pens)` : ""} · xG{" "}
            {scen.lambdas[0].toFixed(2)}:{scen.lambdas[1].toFixed(2)}
          </span>
        </div>
      </div>

      {!touched && (
        <p className="text-sm opacity-80">
          Right now the model has {base.advanceHome >= 0.5 ? H.name : A.name} going through{" "}
          {`${(100 * Math.max(base.advanceHome, 1 - base.advanceHome)).toFixed(1)}%`} of the
          time. Tap <em>Key player out</em> under either side — or drag a slider — and watch
          that number, the expected goals, and the likely scoreline move through the live
          engine.
        </p>
      )}

      {touched && (
        <p className="text-sm">
          {note && <em>&quot;{note}&quot; — </em>}
          {flipped
            ? `That assumption flips the favourite: ${
                scen.advanceHome >= 0.5 ? H.name : A.name
              } now go through more often than not.`
            : `${Math.abs(delta) < 3 ? "Barely moves the needle" : Math.abs(delta) < 10 ? "A real shift" : "A major swing"} — ${
                H.name
              }'s chance moves ${delta >= 0 ? "up" : "down"} ${Math.abs(delta).toFixed(1)} points, and the most likely scoreline ${
                topBase.h === topScen.h && topBase.a === topScen.a ? "holds" : `shifts to ${topScen.h}-${topScen.a}`
              }.`}
        </p>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        {touched && (
          <button type="button" className="plate plate--outline text-xs" onClick={() => selectFx(fx.id)}>
            <span>Reset to baseline</span>
          </button>
        )}
        <p className="text-xs opacity-60">
          Exploration only — your assumption never changes the official model. Published
          adjustments live on the How-it-works page with their reasons.
        </p>
      </div>
    </div>
  );
}

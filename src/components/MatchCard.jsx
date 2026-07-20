import { isLocked, pct, roundLabel } from "../logic.js";
import { effElo } from "../engine.js";
import TeamMark from "./TeamMark.jsx";

function TeamRow({ team, goals, dim }) {
  return (
    <div className={`flex items-center gap-2 ${dim ? "opacity-60" : ""}`}>
      <TeamMark team={team} size="md" />
      <span className="font-[family-name:var(--font-display)] text-lg font-semibold uppercase tracking-wide">
        {team.name}
      </span>
      <span className="font-[family-name:var(--font-data)] text-xs opacity-60">
        {effElo(team)}
        {team.eloAdjust ? ` (${team.eloAdjust > 0 ? "+" : ""}${team.eloAdjust})` : ""}
      </span>
      {goals != null && (
        <span className="plate ml-auto text-base">
          <span>{goals}</span>
        </span>
      )}
    </div>
  );
}

export default function MatchCard({ fx, teams }) {
  const H = fx.homeId ? teams[fx.homeId] : null;
  const A = fx.awayId ? teams[fx.awayId] : null;
  const winnerId = fx.result
    ? fx.result.winner ??
      (fx.result.homeGoals > fx.result.awayGoals
        ? fx.homeId
        : fx.result.awayGoals > fx.result.homeGoals
          ? fx.awayId
          : null)
    : null;
  const decidedOnPens = Boolean(fx.result) && fx.result.homeGoals === fx.result.awayGoals;

  return (
    <div className="card p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest opacity-70">
        <span className="plate plate--outline text-[11px]">
          <span>{roundLabel(fx.round)}</span>
        </span>
        <span className="font-[family-name:var(--font-data)]">{fx.kickoffIST} IST</span>
        {fx.result && (
          <span className="plate plate--gold text-[11px] ml-auto">
            <span>full time</span>
          </span>
        )}
      </div>

      {!fx.known ? (
        <p className="text-sm opacity-70">
          Decided by {fx.homeFrom} and {fx.awayFrom}. The bracket fills in as results land.
        </p>
      ) : (
        <>
          <TeamRow
            team={H}
            goals={fx.result ? fx.result.homeGoals : null}
            dim={Boolean(winnerId) && winnerId !== fx.homeId}
          />
          <TeamRow
            team={A}
            goals={fx.result ? fx.result.awayGoals : null}
            dim={Boolean(winnerId) && winnerId !== fx.awayId}
          />

          {!fx.result && isLocked(fx) && (
            <p className="text-sm opacity-80">Kicked off — result pending.</p>
          )}

          {!fx.result && !isLocked(fx) && fx.analysis && (
            <>
              {/* Signature element: the chalk line is the 50% mark. */}
              <div>
                <div className="pitchbar" title="Chance to advance — chalk line marks 50%">
                  <div
                    className="pitchbar-fill"
                    style={{ width: pct(fx.analysis.advanceHome) }}
                  />
                </div>
                <div className="flex justify-between mt-1 font-[family-name:var(--font-data)] text-sm">
                  <span>
                    {H.name} {pct(fx.analysis.advanceHome)}
                  </span>
                  <span className="opacity-70">advance</span>
                  <span>
                    {A.name} {pct(fx.analysis.advanceAway)}
                  </span>
                </div>
              </div>

              <div className="text-xs font-[family-name:var(--font-data)] opacity-80">
                90&apos;: {H.name} {pct(fx.analysis.pHome)} · draw {pct(fx.analysis.pDraw)} ·{" "}
                {A.name} {pct(fx.analysis.pAway)} · xG {fx.analysis.lambdas[0].toFixed(2)}:
                {fx.analysis.lambdas[1].toFixed(2)}
              </div>

              <div className="flex flex-wrap gap-2">
                {fx.analysis.topScores.slice(0, 4).map((s) => (
                  <span key={`${s.h}-${s.a}`} className="plate plate--outline text-xs">
                    <span>
                      {s.h}-{s.a} · {pct(s.p)}
                    </span>
                  </span>
                ))}
              </div>
            </>
          )}

          {fx.result && (
            <p className="text-sm opacity-80">
              Advanced: {teams[winnerId].name}
              {decidedOnPens &&
                (fx.result.pens
                  ? ` ${fx.result.pens.home}-${fx.result.pens.away} on penalties`
                  : fx.result.aet
                    ? ` ${fx.result.aet.home}-${fx.result.aet.away} after extra time`
                    : " (after ET/pens)")}
            </p>
          )}
        </>
      )}
    </div>
  );
}

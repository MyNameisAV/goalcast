export default function HowItWorks({ data }) {
  const cfg = data.config;
  const adjusted = Object.values(data.teams).filter((t) => t.eloAdjust);
  return (
    <div className="card p-5 max-w-3xl flex flex-col gap-4 leading-relaxed text-sm">
      <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold uppercase tracking-wide">
        How the engine works
      </h2>

      <p>
        Every number on this site comes from three classic models chained together — no black
        box, no external service, and every input visible on this page.
      </p>

      <ol className="list-decimal ml-5 flex flex-col gap-3">
        <li>
          <strong>Elo win model.</strong> Each team carries a public Elo rating ({data.meta.eloSource}).
          The rating gap sets the head-to-head expectation on the standard 400-point logistic
          curve. Level games after 90 minutes are resolved on a softer curve
          (scale {cfg.pensEloScale}) — extra time and penalties are closer to a coin flip than
          the ratings suggest.
        </li>
        <li>
          <strong>Poisson goal model.</strong> The Elo gap is converted into expected goals for
          each side (base {cfg.baseGoalsPerTeam} goals per team, tilt scale {cfg.eloGoalScale}),
          and independent Poisson distributions produce the full scoreline matrix — that&apos;s
          where the &quot;likely scores&quot; chips come from.
        </li>
        <li>
          <strong>Monte Carlo.</strong> The remaining bracket is simulated{" "}
          {cfg.simRuns.toLocaleString()} times with a fixed seed, so every build reproduces the
          exact same numbers. Recorded results are locked in; only unplayed matches are
          simulated — the probabilities update as the tournament progresses.
        </li>
      </ol>

      <div>
        <p>
          <strong>Picks, locks and scoring.</strong> Correct winner scores 3 points; the exact
          90-minute score adds 2. Your semifinal winners build your projected final — and your
          champion pick keeps its 3 points even if you projected the wrong opponent; only the
          exact-score bonus requires your projected pairing to have been right (home/away order
          doesn&apos;t matter). Real matchups lock at kickoff; projected picks lock the moment
          their first qualifier kicks off. All locks are enforced on the server, and everyone&apos;s
          picks stay hidden from other players until they lock. The Team News Lab never touches
          any of this — only published adjustments, listed below with reasons when active, enter
          the official model.
        </p>
      </div>

      {adjusted.length > 0 && (
        <div className="border-l-4 pl-4" style={{ borderLeftColor: "var(--color-gold)" }}>
          <p>
            <strong>Active situational adjustments.</strong>{" "}
            {adjusted
              .map(
                (t) =>
                  `${t.name} ${t.eloAdjust > 0 ? "+" : ""}${t.eloAdjust}` +
                  (t.adjustReason ? ` (${t.adjustReason})` : "")
              )
              .join(" · ")}
            . A side's best player is worth roughly 30–50 points; every adjustment is
            published here with its reason.
          </p>
        </div>
      )}

      <div className="border-l-4 pl-4" style={{ borderLeftColor: "var(--color-kitred)" }}>
        <p>
          <strong>Model limitation.</strong> The engine relies on team-strength ratings and a
          goal-distribution model. It can underrepresent tactical matchups, late injuries and
          other real-world factors unless they are added as disclosed adjustments — every
          adjustment is published above with its reason.
        </p>
      </div>

      <p className="opacity-70">
        The prediction engine runs entirely in your browser. Draft picks stay on your device;
        if you join the leaderboard, your nickname and submitted picks are stored with the
        site&apos;s hosting so colleagues can see them — use a nickname, never an email or
        employee ID. You can remove your entry any time from the Beat the AI tab. No accounts,
        no paid services, no copyrighted assets. Model v{data.meta.model?.version} · built for
        the Philips IT MatchMind Challenge 2026.
      </p>
    </div>
  );
}

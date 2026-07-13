import { useEffect, useMemo, useState } from "react";
import { analyzeMatch, effElo } from "../engine.js";
import {
  buildMatchShareText,
  buildShareText,
  deriveWinner,
  modelPick,
  parseKickoffIST,
  pct,
  roundLabel,
  scorePicks,
  siteUrl,
} from "../logic.js";
import {
  cascadeInvalidate,
  effectiveLock,
  engineBracket,
  projectParticipants,
} from "../projection.js";
import TeamMark from "./TeamMark.jsx";
import LiveCountdown from "./LiveCountdown.jsx";
import WhatsAppShareButton from "./WhatsAppShareButton.jsx";

const STORAGE_KEY = "goalcast-picks-v1";
const GOALS = [0, 1, 2, 3, 4, 5, 6];

function playerId() {
  let id = localStorage.getItem("goalcast-player-id");
  if (!id) {
    id = crypto.randomUUID?.() ?? `${Math.random().toString(36).slice(2)}${Date.now()}`;
    localStorage.setItem("goalcast-player-id", id);
  }
  return id;
}

export default function BeatTheAI({ data, resolved, onJoined }) {
  const teams = data.teams;
  const [picks, setPicks] = useState(() => {
    let raw;
    try {
      raw = JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
    } catch {
      raw = {};
    }
    // Results may have overtaken projections since the last visit — drop
    // downstream picks whose winner is no longer in the real pairing.
    return cascadeInvalidate(data, raw);
  });
  const [copied, setCopied] = useState(null); // "all" | "official" | null
  const [name, setName] = useState(() => localStorage.getItem("goalcast-name") ?? "");
  const [joinState, setJoinState] = useState("idle");
  const [joinMsg, setJoinMsg] = useState("");
  const [, tick] = useState(0);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(picks));
  }, [picks]);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 60000);
    return () => clearInterval(t);
  }, []);

  const now = Date.now();
  const byId = useMemo(() => Object.fromEntries(resolved.map((f) => [f.id, f])), [resolved]);
  const participants = useMemo(() => projectParticipants(data, picks), [data, picks]);
  const enginePicks = useMemo(
    () =>
      engineBracket(data, resolved, modelPick, (h, a) =>
        analyzeMatch(effElo(teams[h]), effElo(teams[a]), data.config)
      ),
    [data, resolved, teams]
  );

  // Slot model for every unplayed fixture, in bracket order.
  const slots = data.fixtures
    .filter((f) => !byId[f.id]?.result)
    .map((f) => {
      const parts = participants[f.id];
      const ready = Boolean(parts.homeId && parts.awayId);
      const locked = ready && effectiveLock(data, f.id, picks) <= now;
      return { fx: f, parts, ready, locked };
    });

  const open = slots.filter((s) => s.ready && !s.locked);
  const done = open.filter((s) => picks[s.fx.id]?.winner);
  const scoring = useMemo(() => scorePicks(picks, resolved), [picks, resolved]);

  const officialIds = ["SF1", "SF2", "FINAL"];
  const officialComplete = officialIds.every((id) => picks[id]?.winner);

  const savePick = (fid, parts, patch) =>
    setPicks((prev) => {
      const cur = prev[fid] ?? {};
      const next = { ...cur, ...patch };
      const fakeFx = { homeId: parts.homeId, awayId: parts.awayId };
      next.winner =
        next.h != null && next.a != null
          ? deriveWinner(fakeFx, Number(next.h), Number(next.a), cur.winner)
          : (next.winner ?? null);
      if (!parts.real) next.pair = [parts.homeId, parts.awayId];
      else delete next.pair;
      return cascadeInvalidate(data, { ...prev, [fid]: next });
    });

  const shareVia = async (text) => {
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        /* sheet closed — fall through */
      }
    }
    window.location.href = `https://wa.me/?text=${encodeURIComponent(text)}`;
  };

  const officialText = () => {
    const line = (fid, label) => {
      const p = picks[fid];
      const pr = participants[fid];
      const e = enginePicks[fid];
      if (!p?.winner || !pr.homeId) return `${label}: —`;
      const score = p.h != null ? ` ${p.h}-${p.a}` : "";
      return (
        `${label}: ${teams[pr.homeId].name} v ${teams[pr.awayId].name} → ` +
        `${teams[p.winner].name}${score}` +
        (e ? `  (engine: ${teams[e.winner].name} ${e.h}-${e.a})` : "")
      );
    };
    return [
      "GoalCast — MatchMind Challenge official prediction",
      ...(name.trim() ? [`Predicted by: ${name.trim()}`] : []),
      line("SF1", "Semifinal 1"),
      line("SF2", "Semifinal 2 (projected)"),
      line("FINAL", "Final (projected)"),
      `Champion: ${picks.FINAL?.winner ? teams[picks.FINAL.winner].name : "—"}`,
      `Model ${data.meta.model?.version} · data ${data.meta.updated} · generated ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`,
      siteUrl(),
    ].join("\n");
  };

  const copyText = async (text, which) => {
    await navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
  };

  const join = async () => {
    const clean = name.trim();
    if (!clean || clean.includes("@")) {
      setJoinState("error");
      setJoinMsg(clean.includes("@") ? "Use a nickname, not an email address." : "Give yourself a nickname first.");
      return;
    }
    localStorage.setItem("goalcast-name", clean);
    setJoinState("busy");
    setJoinMsg("");
    try {
      const res = await fetch("/api/picks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: playerId(), name: clean, picks }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? res.status);
      setJoinState("idle");
      if (j.saved > 0) {
        setJoinMsg(`On the board with ${j.saved} pick${j.saved === 1 ? "" : "s"} ✓`);
        setTimeout(() => onJoined?.(), 700);
      } else {
        setJoinMsg(
          j.lockedIgnored > 0
            ? "Those picks are locked — kickoff has passed."
            : "Joined, but no picks were saved — set a score on at least one match."
        );
      }
    } catch (e) {
      setJoinState("error");
      setJoinMsg(`Couldn't save (${e.message}). Your drafts are safe in this browser — try again.`);
    }
  };

  const removeMe = async () => {
    try {
      await fetch("/api/picks", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: playerId() }),
      });
      setJoinMsg("Removed from the public board. Your local drafts remain.");
    } catch {
      setJoinMsg("Couldn't reach the board to remove you — try again later.");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm opacity-80 max-w-2xl">
        Call the score on every match — including the semifinals and <em>your projected
        final</em>, before they're played. The winner follows from your scoreline; level
        scores ask who goes through. Winner 3 points, exact 90-minute score adds 2.
      </p>

      <div
        className="card p-4 flex flex-col gap-2 border-l-4"
        style={{ borderLeftColor: "var(--color-gold)" }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="plate plate--outline text-xs">
            <span>
              Your picks: {done.length}/{open.length}
            </span>
          </span>
          <input
            value={name}
            maxLength={24}
            placeholder="Nickname"
            aria-label="Nickname for the public leaderboard"
            onChange={(e) => setName(e.target.value)}
          />
          <button
            type="button"
            className="plate plate--gold text-sm"
            onClick={join}
            disabled={joinState === "busy"}
          >
            <span>{joinState === "busy" ? "Saving…" : "Join the leaderboard"}</span>
          </button>
          {Object.keys(picks).length > 0 && (
            <button type="button" className="plate plate--outline text-xs ml-auto" onClick={() => setPicks({})}>
              <span>Clear local drafts</span>
            </button>
          )}
        </div>
        <p className="text-xs opacity-70">
          Nickname only — it and your submitted picks appear on the public board (hidden from
          others until each match locks). No emails or employee IDs.{" "}
          <button type="button" className="underline" onClick={removeMe}>
            Remove my board entry
          </button>
        </p>
        {joinMsg && (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs" style={joinState === "error" ? { color: "var(--color-kitred)" } : undefined}>
              {joinMsg}
            </p>
            {joinMsg.startsWith("On the board") && (
              <WhatsAppShareButton
                text={`🏆 I just locked my MatchMind bracket as '${name.trim()}'. Think you can beat it — and the AI? Pick yours before kickoff: ${siteUrl()}`}
              >
                Invite the group
              </WhatsAppShareButton>
            )}
          </div>
        )}
      </div>

      {officialComplete && (
        <div className="card p-4 flex flex-col gap-2 border-l-4" style={{ borderLeftColor: "var(--color-gold)" }}>
          <p className="text-sm">
            <strong>Your full bracket is complete</strong> — both semifinals, your projected
            final, and your champion.
          </p>
          <LiveCountdown
            targetMs={parseKickoffIST(data.meta.submissionDeadlineIST)}
            label="MatchMind entries close 14 Jul 5 PM IST"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="plate plate--gold text-sm" onClick={() => copyText(officialText(), "official")}>
              <span>{copied === "official" ? "Copied ✓" : "Copy submission summary"}</span>
            </button>
            <WhatsAppShareButton text={officialText()}>Share prediction</WhatsAppShareButton>
          </div>
        </div>
      )}

      {scoring.rows.length > 0 && (
        <div className="card p-4 border-l-4" style={{ borderLeftColor: "var(--color-gold)" }}>
          <span className="plate plate--gold">
            <span>You: {scoring.points} pts</span>
          </span>
          <span className="ml-3 text-sm opacity-80">
            across {scoring.rows.length} finished {scoring.rows.length === 1 ? "match" : "matches"}
          </span>
        </div>
      )}

      {slots.map(({ fx, parts, ready, locked }) => {
        if (!ready) {
          return (
            <div key={fx.id} className="card p-4 opacity-70 text-sm">
              {roundLabel(fx.round)} · shapes up once you've picked {fx.homeFrom} and {fx.awayFrom}
            </div>
          );
        }
        const H = teams[parts.homeId];
        const A = teams[parts.awayId];
        const p = picks[fx.id];
        const bothSet = p?.h != null && p?.a != null;
        const level = bothSet && Number(p.h) === Number(p.a);
        const e = enginePicks[fx.id];
        const enriched = byId[fx.id];
        const adv =
          parts.real && enriched?.analysis && e
            ? pct(e.winner === parts.homeId ? enriched.analysis.advanceHome : enriched.analysis.advanceAway)
            : null;

        if (locked) {
          return (
            <div key={fx.id} className="card p-4 flex flex-col gap-2 opacity-80">
              <div className="flex items-center gap-2 flex-wrap text-xs uppercase tracking-widest opacity-70">
                <span className="plate plate--outline text-[11px]">
                  <span>{roundLabel(fx.round)}</span>
                </span>
                <span className="font-[family-name:var(--font-data)]">{fx.kickoffIST} IST</span>
                <span className="plate ml-auto text-[11px]">
                  <span>{parts.real ? "Locked — awaiting result" : "Projection locked"}</span>
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <TeamMark team={H} /> {H.name} <span className="opacity-60">v</span> {A.name} <TeamMark team={A} />
                {p?.winner && (
                  <span className="plate plate--outline text-xs ml-auto">
                    <span>
                      Your call: {teams[p.winner].code}
                      {p.h != null ? ` ${p.h}-${p.a}` : ""}
                    </span>
                  </span>
                )}
              </div>
            </div>
          );
        }

        return (
          <div key={fx.id} className="card p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 flex-wrap text-xs uppercase tracking-widest opacity-70">
              <span className="plate plate--outline text-[11px]">
                <span>{roundLabel(fx.round)}</span>
              </span>
              {!parts.real && (
                <span className="plate plate--gold text-[11px]">
                  <span>projected from your picks</span>
                </span>
              )}
              <span className="font-[family-name:var(--font-data)]">{fx.kickoffIST} IST</span>
              {p?.winner ? (
                <span className="plate plate--gold text-[11px] ml-auto">
                  <span>
                    You: {teams[p.winner].code} {p.h != null ? `${p.h}-${p.a}` : ""}
                  </span>
                </span>
              ) : (
                <span className="plate plate--outline text-[11px] ml-auto opacity-70">
                  <span>not picked yet</span>
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-semibold uppercase tracking-wide">
                <TeamMark team={H} size="md" /> {H.name}
              </span>
              <label className="flex items-center gap-2">
                <select
                  value={p?.h ?? ""}
                  onChange={(ev) => savePick(fx.id, parts, { h: Number(ev.target.value) })}
                  aria-label={`${H.name} goals`}
                >
                  <option value="" disabled>
                    –
                  </option>
                  {GOALS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
                <span>–</span>
                <select
                  value={p?.a ?? ""}
                  onChange={(ev) => savePick(fx.id, parts, { a: Number(ev.target.value) })}
                  aria-label={`${A.name} goals`}
                >
                  <option value="" disabled>
                    –
                  </option>
                  {GOALS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </label>
              <span className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-semibold uppercase tracking-wide">
                {A.name} <TeamMark team={A} size="md" />
              </span>
            </div>

            {level && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm opacity-80">Level after 90&apos; — who goes through?</span>
                <button
                  type="button"
                  className="pickbtn"
                  aria-pressed={p.winner === parts.homeId}
                  onClick={() => savePick(fx.id, parts, { winner: parts.homeId })}
                >
                  {H.name}
                </button>
                <button
                  type="button"
                  className="pickbtn"
                  aria-pressed={p.winner === parts.awayId}
                  onClick={() => savePick(fx.id, parts, { winner: parts.awayId })}
                >
                  {A.name}
                </button>
              </div>
            )}

            <div className="flex items-center gap-3 flex-wrap">
              {e && (
                <p className="text-xs font-[family-name:var(--font-data)] opacity-80">
                  Engine says: {teams[e.winner].name} {e.h}-{e.a}
                  {adv ? ` · advance ${adv}` : !parts.real ? " · projected" : ""}
                </p>
              )}
              {p?.winner && parts.real && (
                <button
                  type="button"
                  className="plate plate--outline text-xs ml-auto"
                  onClick={() =>
                    shareVia(buildMatchShareText({ ...fx, homeId: parts.homeId, awayId: parts.awayId }, p, e, teams))
                  }
                >
                  <span>Share this pick</span>
                </button>
              )}
            </div>
          </div>
        );
      })}

      {done.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <WhatsAppShareButton text={buildShareText(picks, resolved, teams)}>
            Share all my picks
          </WhatsAppShareButton>
          <button
            type="button"
            className="plate plate--outline text-sm"
            onClick={() => copyText(buildShareText(picks, resolved, teams), "all")}
          >
            <span>{copied === "all" ? "Copied" : "Copy share text"}</span>
          </button>
        </div>
      )}
    </div>
  );
}

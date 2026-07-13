import { useEffect, useState } from "react";

/**
 * Broadcast-style live countdown to a fixed deadline (epoch ms).
 * Ticks every second; flips to a closed badge at zero.
 */
export default function LiveCountdown({ targetMs, label }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const ms = targetMs - now;
  if (ms <= 0) {
    return (
      <span className="plate text-sm" style={{ background: "var(--color-kitred)", color: "var(--color-chalk)" }}>
        <span>🔒 Submission closed</span>
      </span>
    );
  }
  const d = Math.floor(ms / 86.4e6);
  const h = Math.floor((ms % 86.4e6) / 3.6e6);
  const m = Math.floor((ms % 3.6e6) / 6e4);
  const s = Math.floor((ms % 6e4) / 1000);
  const pad = (n) => String(n).padStart(2, "0");
  const text = d > 0 ? `${d}d ${h}h ${pad(m)}m` : `${h}h ${pad(m)}m ${pad(s)}s`;

  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
        <span
          className="motion-reduce:hidden absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
          style={{ background: "var(--color-kitred)" }}
        />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-kitred)" }} />
      </span>
      <span className="text-xs uppercase tracking-widest opacity-80">{label}</span>
      <span className="font-[family-name:var(--font-data)] font-semibold tabular-nums">{text}</span>
    </span>
  );
}

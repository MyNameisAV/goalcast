/** Kit-colored TLA plate — renders identically on every OS, unlike flag emoji. */
export default function TeamMark({ team, size = "sm" }) {
  return (
    <span
      className={`teammark ${size === "md" ? "teammark--md" : ""}`}
      style={{ background: team.color, color: team.textColor }}
    >
      <span>{team.code}</span>
    </span>
  );
}

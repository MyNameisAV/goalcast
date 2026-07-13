// POST /api/picks — join or update the public leaderboard.
// DELETE /api/picks — remove the caller's own entry (by locally held id).
// Projection-aware: SF winners you submit derive your projected final;
// lock times are server-enforced.
import { getStore } from "@netlify/blobs";
import data from "../../src/data.json" with { type: "json" };
import { validateSubmission } from "../../src/logic.js";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export default async (req) => {
  if (req.method === "DELETE") {
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }
    const id = typeof body?.id === "string" ? body.id.trim() : "";
    if (id.length < 8 || id.length > 64) return json({ error: "bad player id" }, 400);
    const store = getStore("goalcast-picks");
    await store.delete(id);
    return json({ ok: true, removed: true });
  }

  if (req.method !== "POST") return json({ error: "POST or DELETE only" }, 405);

  const raw = await req.text();
  if (raw.length > 10_000) return json({ error: "payload too large" }, 413);
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }

  const store = getStore("goalcast-picks");
  let existing;
  try {
    existing = (await store.get(String(body?.id ?? ""), { type: "json" })) ?? { picks: {} };
  } catch {
    existing = { picks: {} };
  }

  const v = validateSubmission(data, body, Date.now(), existing.picks);
  if (!v.ok) return json({ error: v.error }, 400);

  const entry = {
    name: v.name,
    picks: { ...existing.picks, ...v.allowed },
    updatedAt: new Date().toISOString(),
  };
  await store.setJSON(v.id, entry);
  return json({ ok: true, saved: Object.keys(v.allowed).length, lockedIgnored: v.rejectedLocked });
};

export const config = { path: "/api/picks" };

// GET /api/board — everyone's picks, redacted until each fixture's
// effective lock time. Player ids are never exposed.
import { getStore } from "@netlify/blobs";
import data from "../../src/data.json" with { type: "json" };
import { redactPlayers } from "../../src/logic.js";

export default async () => {
  const store = getStore("goalcast-picks");
  let entries = [];
  try {
    const { blobs } = await store.list();
    for (const b of blobs.slice(0, 300)) {
      const e = await store.get(b.key, { type: "json" }).catch(() => null);
      if (e?.name) entries.push(e);
    }
  } catch {
    entries = [];
  }
  const players = redactPlayers(data, entries).sort((a, b) =>
    String(a.updatedAt).localeCompare(String(b.updatedAt))
  );
  return new Response(JSON.stringify({ players }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};

export const config = { path: "/api/board" };
